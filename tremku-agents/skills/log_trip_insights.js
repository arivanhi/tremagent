const fs = require('fs');
const path = require('path');

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
        // Menunjuk langsung ke file log_ingat.md di direktori utama
        const memoryFilePath = path.join(__dirname, '../log_ingat.md');
        const date = new Date().toLocaleString('id-ID');
        const logEntry = `\n### Trip ID: ${args.trip_id}\n- **Waktu:** ${date}\n- **Insight:**\n${args.conversation_log}\n\n---\n`;

        return new Promise((resolve) => {
            fs.appendFile(memoryFilePath, logEntry, (err) => {
                if (err) resolve(JSON.stringify({ status: "error", message: err.message }));
                else resolve(JSON.stringify({ status: "success", message: "Memori intelijen wisata disimpan permanen." }));
            });
        });
    }
};