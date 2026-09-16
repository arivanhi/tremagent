const mqttService = require('../mqtt_service.js');

module.exports = {
    name: "get_fleet_telemetry",
    description: "Mengambil status baterai (SOC), kecepatan, dan rute semua trem (Fleet Telemetry).",
    parameters: {
        type: "object",
        properties: {},
        required: []
    },
    execute: async (args) => {
        // Menarik semua data fleet yang dikumpulkan oleh MQTT
        const result = mqttService.getFleetStatus();
        return JSON.stringify(result);
    }
};
