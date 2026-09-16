const mqtt = require('mqtt');

// Konfigurasi koneksi ke EMQX lokal
const MQTT_BROKER_URL = 'mqtt://localhost:1883';
const TELEMETRY_TOPIC = 'tremku/telemetry/+'; // Menerima data dari semua trem
const COMMAND_TOPIC_PREFIX = 'tremku/command/';

// Simpan state terakhir setiap armada di memori
const fleetState = {};

console.log(`[MQTT] Menghubungkan ke broker EMQX di ${MQTT_BROKER_URL}...`);
const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `tremku_api_server_${Math.random().toString(16).substr(2, 8)}`
});

client.on('connect', () => {
    console.log('[MQTT] Berhasil terhubung ke EMQX Broker.');
    client.subscribe(TELEMETRY_TOPIC, (err) => {
        if (!err) {
            console.log(`[MQTT] Subscribed ke topik: ${TELEMETRY_TOPIC}`);
        } else {
            console.error('[MQTT] Gagal subscribe:', err);
        }
    });
});

client.on('message', (topic, message) => {
    // Contoh topik: tremku/telemetry/TRM-01
    const parts = topic.split('/');
    if (parts.length === 3 && parts[1] === 'telemetry') {
        const trem_id = parts[2];
        try {
            const data = JSON.parse(message.toString());
            // Menyimpan state terbaru untuk armada tersebut
            fleetState[trem_id] = {
                ...data,
                last_updated: new Date().toISOString()
            };
        } catch (e) {
            console.error(`[MQTT] Gagal parsing payload dari ${topic}:`, message.toString());
        }
    }
});

client.on('error', (err) => {
    console.error('[MQTT] Connection error:', err.message);
});

module.exports = {
    // Fungsi untuk Agent DINUS
    getLocation: (trem_id) => {
        const state = fleetState[trem_id];
        if (state && state.location) {
            return {
                status: "success",
                trem_id: trem_id,
                location: state.location,
                coordinates: state.coordinates || null,
                last_updated: state.last_updated
            };
        }
        return {
            status: "unknown",
            message: `Data lokasi untuk armada ${trem_id} belum tersedia dari MQTT.`
        };
    },

    // Fungsi untuk Agent KOMANDO
    getFleetStatus: () => {
        const data = Object.keys(fleetState).map(trem_id => {
            const state = fleetState[trem_id];
            return {
                trem_id: trem_id,
                soc: state.soc || "Unknown",
                speed: state.speed || "0 km/h",
                route: state.route || "Unknown",
                safety_events: state.safety_events || 0,
                last_updated: state.last_updated
            };
        });

        // Fallback jika belum ada data sama sekali yang masuk
        if (data.length === 0) {
             return { status: "empty", message: "Belum ada armada yang mengirimkan telemetri." };
        }

        return { status: "success", data: data };
    },

    // Fungsi untuk Agent KOMANDO (Trigger remote command)
    publishSlowdown: (trem_id, reason) => {
        return new Promise((resolve) => {
            const topic = `${COMMAND_TOPIC_PREFIX}${trem_id}`;
            const payload = JSON.stringify({
                command: "SLOWDOWN",
                reason: reason,
                timestamp: new Date().toISOString()
            });

            client.publish(topic, payload, { qos: 1 }, (err) => {
                if (err) {
                    console.error('[MQTT] Publish error:', err);
                    resolve({ status: "error", message: `Gagal mengirim instruksi ke ${trem_id}.` });
                } else {
                    console.log(`[MQTT] Publish to ${topic}: ${payload}`);
                    resolve({ status: "success", message: `Instruksi SLOWDOWN terkirim ke ${trem_id}.` });
                }
            });
        });
    }
};
