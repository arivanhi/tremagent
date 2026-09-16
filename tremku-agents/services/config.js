const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const intValue = (name, fallback) => {
    const parsed = Number.parseInt(process.env[name] || '', 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

function knowledgeAdminSecret() {
    const configured = String(process.env.KNOWLEDGE_ADMIN_KEY || '').trim();
    if (configured) return { value: configured, source: 'environment' };

    const directory = path.join(__dirname, '..', 'data');
    const secretPath = path.join(directory, 'knowledge_admin.key');
    fs.mkdirSync(directory, { recursive: true });
    try {
        const existing = fs.readFileSync(secretPath, 'utf8').trim();
        if (existing) return { value: existing, source: 'generated_file' };
    } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }

    const generated = crypto.randomBytes(32).toString('hex');
    try {
        fs.writeFileSync(secretPath, `${generated}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        return { value: generated, source: 'generated_file' };
    } catch (error) {
        if (['EACCES', 'EPERM'].includes(error.code)) return { value: generated, source: 'ephemeral' };
        if (error.code !== 'EEXIST') throw error;
        return { value: fs.readFileSync(secretPath, 'utf8').trim(), source: 'generated_file' };
    }
}

const adminSecret = knowledgeAdminSecret();

module.exports = {
    port: intValue('PORT', 3100),
    apiKey: process.env.AGENT_API_KEY || '',
    knowledgeAdminKey: adminSecret.value,
    knowledgeAdminKeySource: adminSecret.source,
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:8000,http://127.0.0.1:8000')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    openaiBaseUrl: process.env.OPENAI_API_BASE || 'http://localhost:11434/v1',
    openaiApiKey: process.env.OPENAI_API_KEY || 'local-ollama',
    chatModel: process.env.OPENCLAW_MODEL || process.env.OLLAMA_MODEL || 'qwen3.8:27b',
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    embeddingModel: process.env.EMBEDDING_MODEL || 'nomic-embed-text',
    qdrantUrl: process.env.QDRANT_URL || 'http://localhost:6333',
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
    redisPassword: process.env.REDIS_PASSWORD || '',
    mqttBrokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    mqttUsername: process.env.MQTT_USERNAME || '',
    mqttPassword: process.env.MQTT_PASSWORD || '',
    telemetryStaleSeconds: intValue('TELEMETRY_STALE_SECONDS', 10),
    commandAckTimeoutMs: intValue('COMMAND_ACK_TIMEOUT_MS', 3000),
    heartbeatTimezone: process.env.HEARTBEAT_TIMEZONE || 'Asia/Bangkok',
    heartbeatHour: intValue('HEARTBEAT_HOUR', 6),
};
