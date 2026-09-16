module.exports = {
    name: "search_heritage_knowledge",
    description: "Mencari fakta sejarah dan landmark dari Qdrant Vector DB.",
    parameters: {
        type: "object",
        properties: {
            query: { type: "string", description: "Topik sejarah atau bangunan yang ingin dicari (misal: Gereja Blenduk)" },
            location_context: { type: "string", description: "Konteks lokasi saat ini untuk pencarian yang lebih akurat" }
        },
        required: ["query"]
    },
    execute: async (args) => {
        // TODO: Implementasi koneksi ke Qdrant Vector DB
        return JSON.stringify({
            status: "success",
            query: args.query,
            fact: `Gereja Blenduk (GPIB Immanuel) dibangun pada 1753, merupakan gereja tertua di Jawa Tengah dengan arsitektur neo-klasik dan kubah tembaga besar.`
        });
    }
};
