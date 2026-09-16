const mqttService = require('../mqtt_service.js');

module.exports = {
    name: "get_current_location",
    description: "Menarik data GPS/Geofence trem saat ini dari topik MQTT.",
    parameters: {
        type: "object",
        properties: {
            trem_id: { type: "string", description: "ID armada TREM-KU (misal: TRM-01)" }
        },
        required: ["trem_id"]
    },
    execute: async (args) => {
        // Menarik data real-time langsung dari caching MQTT di memori
        const result = mqttService.getLocation(args.trem_id);
        return JSON.stringify(result);
    }
};
