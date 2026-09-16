const crypto = require('crypto');
const mqtt = require('mqtt');
const config = require('./services/config');

const TELEMETRY_TOPIC = 'tremku/telemetry/+';
const ACK_TOPIC = 'tremku/ack/+';
const COMMAND_TOPIC_PREFIX = 'tremku/command/';
const fleetState = new Map();
const pendingCommands = new Map();
let connected = false;
let lastError = null;

function sensorHealth(sensors = {}) {
    const entries = Object.entries(sensors);
    const degraded = entries.filter(([, sensor]) => sensor?.status && sensor.status !== 'ok').map(([name]) => name);
    return { status: degraded.length ? 'degraded' : 'ok', degraded_sensors: degraded };
}

function normalizeTelemetry(payload, topicTremId) {
    if (!payload || typeof payload !== 'object') throw new Error('Payload telemetri harus berupa object JSON.');
    const tremId = payload.trem_id || topicTremId;
    if (!tremId || tremId !== topicTremId) throw new Error('trem_id payload harus sama dengan trem_id pada topik MQTT.');

    const gps = payload.sensors?.gps || {};
    const vehicle = payload.vehicle || {};
    const navigation = payload.navigation || {};
    const safety = payload.safety || {};
    const trip = payload.trip || {};
    const obstacleInPath = Boolean(payload.sensors?.lidar?.obstacle_in_path);
    const inSafeStopZone = navigation.in_safe_stop_zone === true;
    const explicitSafeToStop = typeof safety.safe_to_stop === 'boolean' ? safety.safe_to_stop : null;

    return {
        trem_id: tremId,
        source_timestamp: payload.timestamp || null,
        received_at: new Date().toISOString(),
        location: {
            label: navigation.current_landmark || navigation.location_label || null,
            latitude: Number.isFinite(gps.latitude) ? gps.latitude : null,
            longitude: Number.isFinite(gps.longitude) ? gps.longitude : null,
            gps_status: gps.status || 'unknown',
            geofence_id: navigation.geofence_id || null,
        },
        vehicle: {
            battery_percent: Number.isFinite(vehicle.battery_percent) ? vehicle.battery_percent : null,
            speed_kmh: Number.isFinite(vehicle.speed_kmh) ? vehicle.speed_kmh : null,
            motor_temperature_c: Number.isFinite(vehicle.motor_temperature_c) ? vehicle.motor_temperature_c : null,
            occupancy: Number.isFinite(vehicle.occupancy) ? vehicle.occupancy : null,
        },
        navigation: {
            route_id: navigation.route_id || null,
            route_progress_percent: Number.isFinite(navigation.route_progress_percent) ? navigation.route_progress_percent : null,
            eta_minutes: Number.isFinite(navigation.eta_minutes) ? navigation.eta_minutes : null,
            in_safe_stop_zone: inSafeStopZone,
            next_safe_stop: navigation.next_safe_stop || null,
        },
        safety: {
            emergency: Boolean(safety.emergency),
            safe_to_stop: explicitSafeToStop ?? (inSafeStopZone && !obstacleInPath),
            reason: safety.reason || (obstacleInPath ? 'Rintangan terdeteksi pada jalur.' : null),
            active_events: Array.isArray(safety.active_events) ? safety.active_events : [],
        },
        sensor_health: sensorHealth(payload.sensors),
        trip: {
            trip_id: trip.trip_id || null,
            status: trip.status || null,
        },
        raw: payload,
    };
}

function isStale(state) {
    return Date.now() - Date.parse(state.received_at) > config.telemetryStaleSeconds * 1000;
}

console.log(`[MQTT] Menghubungkan ke ${config.mqttBrokerUrl}...`);
const client = mqtt.connect(config.mqttBrokerUrl, {
    clientId: `tremku_agent_${crypto.randomUUID().slice(0, 8)}`,
    username: config.mqttUsername || undefined,
    password: config.mqttPassword || undefined,
    clean: false,
    reconnectPeriod: 2000,
    connectTimeout: 10000,
});

client.on('connect', () => {
    connected = true;
    lastError = null;
    client.subscribe([TELEMETRY_TOPIC, ACK_TOPIC], { qos: 1 }, (error) => {
        if (error) console.error(`[MQTT] Subscribe gagal: ${error.message}`);
        else console.log(`[MQTT] Terhubung; subscribe ${TELEMETRY_TOPIC} dan ${ACK_TOPIC}.`);
    });
});

client.on('close', () => { connected = false; });
client.on('error', (error) => {
    lastError = error.message;
    console.error(`[MQTT] ${error.message}`);
});

client.on('message', (topic, message) => {
    const parts = topic.split('/');
    const tremId = parts[2];
    try {
        const payload = JSON.parse(message.toString());
        if (parts[1] === 'telemetry') {
            fleetState.set(tremId, normalizeTelemetry(payload, tremId));
        } else if (parts[1] === 'ack' && payload.correlation_id) {
            const pending = pendingCommands.get(payload.correlation_id);
            if (pending && pending.tremId === tremId) {
                pendingCommands.delete(payload.correlation_id);
                clearTimeout(pending.timer);
                pending.resolve({ status: 'acknowledged', trem_id: tremId, acknowledgment: payload });
            }
        }
    } catch (error) {
        console.error(`[MQTT] Payload tidak valid pada ${topic}: ${error.message}`);
    }
});

function getLocation(tremId) {
    const state = fleetState.get(tremId);
    if (!state) return { status: 'unknown', message: `Telemetri ${tremId} belum tersedia.` };
    if (isStale(state)) return { status: 'stale', trem_id: tremId, location: state.location, last_updated: state.received_at };
    return { status: 'success', trem_id: tremId, ...state.location, last_updated: state.received_at };
}

function getFleetStatus() {
    const data = [...fleetState.values()].map((state) => ({
        trem_id: state.trem_id,
        stale: isStale(state),
        location: state.location,
        battery_percent: state.vehicle.battery_percent,
        speed_kmh: state.vehicle.speed_kmh,
        occupancy: state.vehicle.occupancy,
        route: state.navigation,
        sensor_health: state.sensor_health,
        safety: state.safety,
        trip: state.trip,
        last_updated: state.received_at,
    }));
    return data.length ? { status: 'success', data } : { status: 'empty', message: 'Belum ada armada yang mengirimkan telemetri.' };
}

function getSafetyStatus(tremId) {
    const state = fleetState.get(tremId);
    if (!state) return { status: 'unknown', safe_to_stop: false, reason: 'Telemetri kendaraan belum tersedia.' };
    if (isStale(state)) return { status: 'stale', safe_to_stop: false, reason: 'Telemetri kendaraan sudah kedaluwarsa.' };
    if (state.safety.emergency) return { status: 'unsafe', safe_to_stop: false, reason: state.safety.reason || 'Kendaraan dalam kondisi emergency.' };
    return {
        status: state.safety.safe_to_stop ? 'safe' : 'unsafe',
        safe_to_stop: state.safety.safe_to_stop,
        reason: state.safety.reason || (state.safety.safe_to_stop ? 'Kendaraan berada di zona berhenti aman.' : 'Kendaraan tidak berada di zona berhenti aman.'),
        next_safe_stop: state.navigation.next_safe_stop,
        last_updated: state.received_at,
    };
}

function publishSlowdown(tremId, reason) {
    if (!connected) return Promise.resolve({ status: 'error', message: 'Broker MQTT tidak terhubung.' });
    const correlationId = crypto.randomUUID();
    const topic = `${COMMAND_TOPIC_PREFIX}${tremId}`;
    const payload = {
        command: 'SLOWDOWN',
        reason,
        correlation_id: correlationId,
        timestamp: new Date().toISOString(),
        requires_ack: true,
    };

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            pendingCommands.delete(correlationId);
            resolve({
                status: 'pending_ack',
                trem_id: tremId,
                correlation_id: correlationId,
                message: 'Perintah diterima broker, tetapi belum dikonfirmasi kendaraan.',
            });
        }, config.commandAckTimeoutMs);
        pendingCommands.set(correlationId, { tremId, resolve, timer });
        client.publish(topic, JSON.stringify(payload), { qos: 1 }, (error) => {
            if (!error) return;
            pendingCommands.delete(correlationId);
            clearTimeout(timer);
            resolve({ status: 'error', message: `Publish perintah gagal: ${error.message}` });
        });
    });
}

module.exports = {
    normalizeTelemetry,
    getLocation,
    getFleetStatus,
    getSafetyStatus,
    publishSlowdown,
    getServiceStatus: () => ({ connected, broker: config.mqttBrokerUrl, fleet_size: fleetState.size, last_error: lastError }),
    close: () => client.end(true),
};
