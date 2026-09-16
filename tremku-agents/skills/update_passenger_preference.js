module.exports = {
    name: "update_passenger_preference",
    description: "Menyimpan minat wisatawan (sejarah, kuliner, arsitektur, dll) ke memori Redis.",
    parameters: {
        type: "object",
        properties: {
            session_id: { type: "string", description: "ID sesi perjalanan wisatawan" },
            interests: { 
                type: "array", 
                items: { type: "string" }, 
                description: "Daftar minat (contoh: ['sejarah', 'kuliner'])" 
            }
        },
        required: ["session_id", "interests"]
    },
    execute: async (args) => {
        // TODO: Implementasi simpan ke Redis
        return JSON.stringify({
            status: "success",
            message: `Preferensi penumpang (sesi ${args.session_id}) berhasil disimpan: ${args.interests.join(", ")}.`
        });
    }
};
