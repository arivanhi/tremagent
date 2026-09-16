const mqttService = require('../mqtt_service');

module.exports = {
    name: "check_safety_status",
    description: "Bertanya kepada sistem NARA apakah kondisi aman untuk berhenti.",
    parameters: {
        type: "object",
        properties: {
            trem_id: { type: "string", description: "ID armada TREM-KU (misal: TRM-01)" }
        },
        required: ["trem_id"]
    },
    execute: async (args) => JSON.stringify(mqttService.getSafetyStatus(args.trem_id)),
};
