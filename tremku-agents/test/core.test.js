const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeText } = require('../services/sanitize');
const { cleanAssistantReply } = require('../services/response_style');

process.env.MQTT_BROKER_URL = 'mqtt://127.0.0.1:1';
const mqttService = require('../mqtt_service');

test.after(() => mqttService.close());

test('normalizes current nested vehicle telemetry schema', () => {
    const normalized = mqttService.normalizeTelemetry({
        trem_id: 'TRM-01',
        sensors: {
            gps: { status: 'ok', latitude: -6.968123, longitude: 110.427456 },
            lidar: { status: 'ok', obstacle_in_path: false },
        },
        vehicle: { battery_percent: 0, speed_kmh: 0, occupancy: 4 },
        navigation: { route_id: 'KL-01', in_safe_stop_zone: true, next_safe_stop: 'STOP-02' },
        safety: { safe_to_stop: true, active_events: [] },
    }, 'TRM-01');
    assert.equal(normalized.vehicle.battery_percent, 0);
    assert.equal(normalized.vehicle.speed_kmh, 0);
    assert.equal(normalized.location.latitude, -6.968123);
    assert.equal(normalized.safety.safe_to_stop, true);
});

test('rejects topic and payload trem id mismatch', () => {
    assert.throws(() => mqttService.normalizeTelemetry({ trem_id: 'TRM-02' }, 'TRM-01'), /harus sama/);
});

test('sanitizes common passenger PII', () => {
    const value = sanitizeText('Email saya user@example.com, telepon 081234567890, NIK 3374010101010001.');
    assert.doesNotMatch(value, /user@example.com/);
    assert.doesNotMatch(value, /081234567890/);
    assert.doesNotMatch(value, /3374010101010001/);
});

test('removes emoji and text emoticons from assistant replies', () => {
    const value = cleanAssistantReply('Selamat datang 😊 :) Informasi siap disampaikan.');
    assert.equal(value, 'Selamat datang Informasi siap disampaikan.');
});

test('drops an incomplete trailing clause from assistant replies', () => {
    const value = cleanAssistantReply('Informasi utama sudah lengkap. Jika Anda ingin, saya dapat');
    assert.equal(value, 'Informasi utama sudah lengkap.');
});
