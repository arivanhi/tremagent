const { getClient } = require('../services/redis');

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
        const interests = [...new Set(args.interests.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 10);
        const redis = await getClient();
        const key = `tremku:session:${args.session_id}:preferences`;
        await redis.set(key, JSON.stringify({ interests, updated_at: new Date().toISOString() }), { EX: 60 * 60 * 12 });
        return JSON.stringify({ status: 'success', session_id: args.session_id, interests, expires_in_seconds: 43200 });
    },
};
