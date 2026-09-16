const { embed } = require('../services/ollama');
const qdrant = require('../services/qdrant');

module.exports = {
    name: "search_heritage_knowledge",
    description: "Mencari fakta sejarah dan landmark dari Qdrant Vector DB.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Topik sejarah atau bangunan yang ingin dicari (misal: Gereja Blenduk)" },
            location_context: { type: "string", description: "Konteks lokasi saat ini untuk pencarian yang lebih akurat" }
        },
        required: ["query", "location_context"]
    },
    execute: async (args) => {
        const vector = await embed(`${args.query}\nLokasi: ${args.location_context}`);
        const hits = await qdrant.search('heritage_knowledge', vector, 4, 0.2);
        if (!hits.length) {
            return JSON.stringify({ status: 'not_found', message: 'Belum ada fakta terkurasi yang relevan dalam knowledge base.' });
        }
        return JSON.stringify({
            status: 'success',
            results: hits.map((hit) => ({ score: hit.score, ...hit.payload })),
        });
    },
};
