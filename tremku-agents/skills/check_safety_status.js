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
    execute: async (args) => {
        // TODO: Implementasi call internal ke agen NARA atau check safety logic
        return JSON.stringify({
            status: "unsafe",
            reason: "bukan zona drop-off yang diizinkan (red-zone pedestrian)."
        });
    }
};
