require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { OpenAI } = require('openai');

// Mulai layanan MQTT di background
require('./mqtt_service.js');

const app = express();
app.use(cors());
app.use(express.json());

// Inisialisasi koneksi ke Ollama/vLLM lokal
const openai = new OpenAI({
    baseURL: process.env.OPENAI_API_BASE || 'http://localhost:8001/v1',
    apiKey: process.env.OPENAI_API_KEY || 'local-key',
});

// Mapping Agent ke daftar skill yang diizinkan sesuai PDF
const agentSkillsMap = {
    "DINUS": ["get_current_location", "search_heritage_knowledge", "check_safety_status", "update_passenger_preference"],
    "KOMANDO": ["get_fleet_telemetry", "trigger_remote_slowdown"],
    "INGAT": ["log_trip_insights"],
    "NARA": [] // NARA murni agentic reasoning tanpa call external function
};

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
app.post('/api/chat', async (req, res) => {
    try {
        const { agent, message, history = [] } = req.body;

        if (!agent || !message) {
            return res.status(400).json({ error: "Parameter 'agent' dan 'message' wajib diisi." });
        }

        const agentName = agent.toUpperCase();
        const soulFilePath = path.join(__dirname, `SOUL-${agentName}.md`);

        if (!fs.existsSync(soulFilePath)) {
            return res.status(404).json({ error: `Karakter agen '${agentName}' tidak ditemukan.` });
        }

        const agentSoul = fs.readFileSync(soulFilePath, 'utf-8');
        const { tools, functionRefs } = getToolsForAgent(agentName);

        // Menyusun prompt
        let messages = [
            { role: "system", content: agentSoul },
            ...history,
            { role: "user", content: message }
        ];

        console.log(`\n[API] Memproses permintaan untuk agen: ${agentName}`);
        
        let apiPayload = {
            model: process.env.OPENCLAW_MODEL || 'qwen',
            messages: messages,
            max_tokens: 2048,
            temperature: 0.7
        };

        if (tools.length > 0) {
            apiPayload.tools = tools;
            apiPayload.tool_choice = "auto";
        }

        // 1. Kirim pesan ke LLM
        const response = await openai.chat.completions.create(apiPayload);
        const responseMessage = response.choices[0].message;

        // 2. Periksa apakah agen memutuskan untuk menggunakan tool
        if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
            console.log(`[🤖 ACTION] Agen ${agentName} memanggil ${responseMessage.tool_calls.length} tool(s).`);
            messages.push(responseMessage); // Simpan riwayat panggilan fungsi

            // Eksekusi fungsi lokal
            for (const toolCall of responseMessage.tool_calls) {
                const funcName = toolCall.function.name;
                if (functionRefs[funcName]) {
                    const args = JSON.parse(toolCall.function.arguments || "{}");
                    console.log(`[⚙️ SYSTEM] Mengeksekusi ${funcName} dengan argumen:`, args);
                    
                    const functionResult = await functionRefs[funcName](args);
                    console.log(`[✅ SYSTEM] Hasil fungsi ${funcName}: ${functionResult}`);
                    
                    messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: funcName,
                        content: functionResult
                    });
                }
            }

            // 3. Minta agen merangkum jawaban akhirnya
            console.log(`[🤖 ACTION] Agen ${agentName} merangkum jawaban akhir berdasarkan hasil tool...`);
            const finalResponse = await openai.chat.completions.create({
                model: process.env.OPENCLAW_MODEL || 'qwen',
                messages: messages,
                max_tokens: 2048,
                temperature: 0.7
            });

            return res.json({ 
                agent: agentName, 
                reply: finalResponse.choices[0].message.content,
                tool_used: true
            });

        } else {
            // Agen membalas secara langsung tanpa tools
            return res.json({ 
                agent: agentName, 
                reply: responseMessage.content,
                tool_used: false
            });
        }

    } catch (error) {
        console.error("[ERROR] Terjadi kesalahan:", error.message);
        res.status(500).json({ error: "Terjadi kesalahan internal server.", details: error.message });
    }
});

// Menjalankan server
const PORT = process.env.PORT || 3100;
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 TREM-KU Agent REST API (OpenClaw Blueprint) Berjalan!`);
    console.log(`📡 Port: ${PORT}`);
    console.log(`🌐 Endpoint: POST http://localhost:${PORT}/api/chat`);
    console.log(`========================================`);
});
