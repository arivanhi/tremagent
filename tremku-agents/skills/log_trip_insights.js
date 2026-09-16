const fs = require('fs');
const path = require('path');
const { sanitizeText } = require('../services/sanitize');
const { embed } = require('../services/ollama');
const qdrant = require('../services/qdrant');

module.exports = {
    name: "log_trip_insights",
    description: "Mengekstrak POI populer dan pertanyaan wisatawan di akhir trip.",
    parameters: {
        type: "object",
        properties: {
            trip_id: { type: "string", description: "ID perjalanan trem." },
            conversation_log: { type: "string", description: "Ringkasan interaksi dan pertanyaan." }
        },
        required: ["trip_id", "conversation_log"]
    },
    execute: async function (args) {
        const dataDirectory = path.join(__dirname, '../data');
        fs.mkdirSync(dataDirectory, { recursive: true });
        const memoryFilePath = path.join(dataDirectory, 'log_ingat.md');
        const date = new Date().toLocaleString('id-ID');
        const sanitized = sanitizeText(args.conversation_log);
        const safeTripId = String(args.trip_id).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        const logEntry = `\n### Trip ID: ${safeTripId}\n- **Waktu:** ${date}\n- **Insight tersanitasi:**\n${sanitized}\n\n---\n`;
        await fs.promises.appendFile(memoryFilePath, logEntry, 'utf8');

        const vector = await embed(sanitized);
        const pointId = await qdrant.upsert('trip_memory', vector, {
            trip_id: safeTripId,
            insight: sanitized,
            recorded_at: new Date().toISOString(),
            pii_sanitized: true,
        });
        return JSON.stringify({ status: 'success', trip_id: safeTripId, qdrant_point_id: pointId, pii_sanitized: true });
    }
};
