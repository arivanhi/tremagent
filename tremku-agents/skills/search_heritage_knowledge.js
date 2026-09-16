const { embed } = require('../services/ollama');
const qdrant = require('../services/qdrant');

module.exports = {
    name: "search_heritage_knowledge",
    description: "Mencari informasi terkurasi tentang destinasi wisata, rute, dan kampus UDINUS dari knowledge base lokal.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Pertanyaan tentang destinasi, rute perjalanan, atau kampus UDINUS" },
            location_context: { type: "string", description: "Konteks lokasi saat ini jika tersedia" }
        },
        required: ["query"]
    },
    execute: async (args) => {
        const vector = await embed(`${args.query}\nLokasi: ${args.location_context || 'tidak disebutkan'}`);
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
