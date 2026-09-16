const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');
const config = require('./services/config');
const mqttService = require('./mqtt_service');
const redisService = require('./services/redis');
const qdrantService = require('./services/qdrant');
const ollamaService = require('./services/ollama');
const heartbeat = require('./services/heartbeat');
const { RESPONSE_STYLE, cleanAssistantReply } = require('./services/response_style');
const knowledgeStore = require('./services/knowledge_store');

const app = express();
app.disable('x-powered-by');
app.use(cors({
    origin(origin, callback) {
        if (!origin || config.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error('Origin tidak diizinkan.'));
    },
}));
app.use(express.json({ limit: '256kb' }));

// Inisialisasi koneksi ke Ollama/vLLM lokal
const openai = new OpenAI({
    baseURL: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
});

// Mapping Agent ke daftar skill yang diizinkan sesuai PDF
const agentSkillsMap = {
    "DINUS": ["get_current_location", "search_heritage_knowledge", "check_safety_status", "update_passenger_preference"],
    "KOMANDO": ["get_fleet_telemetry", "trigger_remote_slowdown"],
    "INGAT": ["log_trip_insights"],
    "NARA": []
};

const requestCounters = new Map();
function rateLimit(req, res, next) {
    const now = Date.now();
    const key = req.ip;
    const record = requestCounters.get(key) || { start: now, count: 0 };
    if (now - record.start > 60_000) {
        record.start = now;
        record.count = 0;
    }
    record.count += 1;
    requestCounters.set(key, record);
    if (record.count > 60) return res.status(429).json({ error: 'Terlalu banyak permintaan.' });
    next();
}

function requireApiKey(req, res, next) {
    if (!config.apiKey) return res.status(503).json({ error: 'AGENT_API_KEY belum dikonfigurasi.' });
    const provided = req.get('x-api-key') || String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (provided !== config.apiKey) return res.status(401).json({ error: 'API key tidak valid.' });
    next();
}

function secretMatches(provided, expected) {
    const left = Buffer.from(String(provided || ''));
    const right = Buffer.from(String(expected || ''));
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

function requireKnowledgeAdminKey(req, res, next) {
    if (!config.knowledgeAdminKey) return res.status(503).json({ error: 'KNOWLEDGE_ADMIN_KEY belum dikonfigurasi.' });
    if (!secretMatches(req.get('x-knowledge-admin-key'), config.knowledgeAdminKey)) {
        return res.status(401).json({ error: 'Knowledge admin key tidak valid.' });
    }
    next();
}

app.use(rateLimit);

app.get('/health', async (_req, res) => {
    const [redis, qdrant, ollama] = await Promise.all([
        redisService.status(),
        qdrantService.status(),
        ollamaService.status(),
    ]);
    const mqtt = mqttService.getServiceStatus();
    const healthy = redis.ok && qdrant.ok && ollama.ok && mqtt.connected;
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', services: { mqtt, redis, qdrant, ollama } });
});

app.get('/', (_req, res) => res.redirect('/knowledge-admin'));
app.get('/dashboard', (_req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/knowledge-admin', (_req, res) => res.sendFile(path.join(__dirname, 'knowledge-admin.html')));
app.get('/api/fleet', requireApiKey, (_req, res) => res.json(mqttService.getFleetStatus()));
app.get('/api/safety/:tremId', requireApiKey, (req, res) => res.json(mqttService.getSafetyStatus(req.params.tremId)));
app.get('/api/knowledge-admin/records', requireKnowledgeAdminKey, (_req, res) => {
    try {
        res.json({ records: knowledgeStore.readWebRecords() });
    } catch (error) {
        console.error(`[KNOWLEDGE] Gagal membaca data: ${error.message}`);
        res.status(500).json({ error: 'Data knowledge tidak dapat dibaca.' });
    }
});
app.post('/api/knowledge-admin/records', requireKnowledgeAdminKey, async (req, res) => {
    try {
        const result = await knowledgeStore.saveKnowledge(req.body || {});
        res.status(200).json(result);
    } catch (error) {
        console.error(`[KNOWLEDGE] Gagal menyimpan data: ${error.message}`);
        res.status(error.statusCode || 500).json({
            error: error.publicMessage || (error.statusCode === 400 ? error.message : 'Data knowledge tidak dapat disimpan.'),
        });
    }
});
app.delete('/api/knowledge-admin/records/:id', requireKnowledgeAdminKey, async (req, res) => {
    try {
        const deleted = await knowledgeStore.deleteKnowledge(req.params.id);
        res.status(deleted ? 200 : 404).json(deleted ? { status: 'deleted' } : { error: 'Data tidak ditemukan.' });
    } catch (error) {
        console.error(`[KNOWLEDGE] Gagal menghapus data: ${error.message}`);
        res.status(400).json({ error: error.message });
    }
});

// Fungsi helper untuk memuat fungsi dari folder skills
function getToolsForAgent(agentName) {
    const allowedSkills = agentSkillsMap[agentName] || [];
    const tools = [];
    const functionRefs = {};

    for (const skill of allowedSkills) {
        try {
            const skillModule = require(`./skills/${skill}.js`);
            tools.push({
                type: "function",
                function: {
                    name: skillModule.name,
                    description: skillModule.description,
                    parameters: skillModule.parameters
                }
            });
            functionRefs[skillModule.name] = skillModule.execute;
        } catch (e) {
            console.error(`[WARNING] Gagal memuat skill ${skill} untuk agen ${agentName}: ${e.message}`);
        }
    }
    return { tools, functionRefs };
}

// Endpoint utama untuk mengobrol dengan Agen
app.post('/api/chat', requireApiKey, async (req, res) => {
    try {
        const { agent, message, history = [] } = req.body || {};

        if (!agent || !message) {
            return res.status(400).json({ error: "Parameter 'agent' dan 'message' wajib diisi." });
        }

        if (typeof agent !== 'string' || typeof message !== 'string' || message.length > 8000 || !Array.isArray(history)) {
            return res.status(400).json({ error: 'Format request tidak valid.' });
        }

        const agentName = agent.toUpperCase();
        const soulFilePath = path.join(__dirname, `SOUL-${agentName}.md`);

        if (!fs.existsSync(soulFilePath)) {
            return res.status(404).json({ error: `Karakter agen '${agentName}' tidak ditemukan.` });
        }

        const agentSoul = fs.readFileSync(soulFilePath, 'utf-8');
        const { tools, functionRefs } = getToolsForAgent(agentName);

        const safeHistory = history
            .filter((item) => item && ['user', 'assistant'].includes(item.role) && typeof item.content === 'string')
            .slice(-20)
            .map((item) => ({ role: item.role, content: item.content.slice(0, 8000) }));
        const messages = [
            { role: "system", content: `${agentSoul}\n\n${RESPONSE_STYLE}` },
            ...safeHistory,
            { role: "user", content: message }
        ];
        let toolUsed = false;
        for (let round = 0; round < 4; round += 1) {
            const payload = {
                model: config.chatModel,
                messages,
                max_tokens: 800,
                temperature: agentName === 'NARA' ? 0.1 : 0.5,
            };
            if (tools.length) {
                payload.tools = tools;
                payload.tool_choice = 'auto';
            }
            const response = await openai.chat.completions.create(payload);
            const responseMessage = response.choices?.[0]?.message;
            if (!responseMessage) throw new Error('LLM tidak mengembalikan pesan.');
            if (!responseMessage.tool_calls?.length) {
                return res.json({
                    agent: agentName,
                    reply: cleanAssistantReply(responseMessage.content),
                    tool_used: toolUsed,
                });
            }

            toolUsed = true;
            messages.push(responseMessage);
            for (const toolCall of responseMessage.tool_calls) {
                const funcName = toolCall.function.name;
                let content;
                try {
                    const args = JSON.parse(toolCall.function.arguments || '{}');
                    content = functionRefs[funcName]
                        ? await functionRefs[funcName](args)
                        : JSON.stringify({ status: 'error', message: `Tool ${funcName} tidak diizinkan.` });
                } catch (error) {
                    content = JSON.stringify({ status: 'error', message: error.message });
                }
                messages.push({ tool_call_id: toolCall.id, role: 'tool', name: funcName, content });
            }
        }
        return res.status(422).json({ error: 'Batas putaran tool tercapai tanpa jawaban akhir.' });

    } catch (error) {
        console.error("[ERROR] Terjadi kesalahan:", error.message);
        res.status(500).json({ error: "Terjadi kesalahan internal server.", request_id: req.get('x-request-id') || null });
    }
});

// Menjalankan server
app.listen(config.port, '0.0.0.0', () => {
    console.log(`[API] TREM-KU Agent API aktif pada port ${config.port}.`);
    if (config.knowledgeAdminKeySource === 'generated_file') {
        console.warn('[SECURITY] Knowledge admin key dibaca dari volume persisten data/knowledge_admin.key.');
    } else if (config.knowledgeAdminKeySource === 'ephemeral') {
        console.warn('[SECURITY] Folder data tidak dapat ditulis; knowledge admin key hanya berlaku sampai service restart.');
    }
});

heartbeat.startHeartbeat(mqttService.getFleetStatus);
