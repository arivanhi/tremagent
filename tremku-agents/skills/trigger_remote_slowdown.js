const mqttService = require('../mqtt_service.js');

module.exports = {
    name: "trigger_remote_slowdown",
    description: "Mengirimkan instruksi darurat ke NARA untuk melambat.",
    parameters: {
        type: "object",
        properties: {
            trem_id: { type: "string", description: "ID armada TREM-KU yang akan diperlambat" },
            reason: { type: "string", description: "Alasan darurat dilakukannya perlambatan" }
        },
        required: ["trem_id", "reason"]
    },
    execute: async (args) => {
        // Mempublikasikan instruksi darurat ke EMQX
        const result = await mqttService.publishSlowdown(args.trem_id, args.reason);
        return JSON.stringify(result);
    }
};
