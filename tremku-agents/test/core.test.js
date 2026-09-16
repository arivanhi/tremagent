const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeText } = require('../services/sanitize');
const { cleanAssistantReply } = require('../services/response_style');
const { buildEmbeddingText, validateKnowledgeRecord } = require('../services/knowledge');
const { buildKnowledgeRecord } = require('../services/knowledge_store');

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

test('validates and builds embedding text for route knowledge', () => {
    const record = {
        id: 'route-test-kota-lama',
        document_type: 'route',
        name: 'Rute Uji Kota Lama',
        content: 'Rute uji ini menghubungkan titik awal dan tujuan melalui satu pemberhentian yang telah ditetapkan.',
        route: { origin: 'Titik A', destination: 'Titik B', stops: [{ name: 'Halte Uji' }] },
        source: [{ title: 'Dokumen pengujian' }],
        review_status: 'approved_for_demo',
        version: 1,
        updated_at: '2026-09-16',
    };
    assert.deepEqual(validateKnowledgeRecord(record), []);
    assert.match(buildEmbeddingText(record), /Halte Uji/);
});

test('rejects unfilled knowledge placeholders', () => {
    const errors = validateKnowledgeRecord({
        id: 'destination-test',
        document_type: 'destination',
        name: 'GANTI Nama',
        content: 'GANTI Narasi destinasi yang masih belum selesai dan belum dapat digunakan sebagai sumber pengetahuan.',
        source: 'GANTI sumber',
        review_status: 'draft',
    });
    assert.ok(errors.some((error) => error.includes('placeholder')));
});

test('builds approved destination knowledge with required coordinates', () => {
    const record = buildKnowledgeRecord({
        document_type: 'destination',
        topic: 'Destinasi Uji',
        category: 'sejarah',
        content: 'Destinasi uji memiliki narasi faktual yang cukup panjang untuk memeriksa proses validasi knowledge web.',
        source_title: 'Sumber resmi pengujian',
        review_status: 'approved',
        reviewed_by: 'Tim Penguji',
        destination: { area: 'Semarang', latitude: -6.98, longitude: 110.41 },
    });
    assert.equal(record.location.latitude, -6.98);
    assert.equal(record.review_status, 'approved');
});

test('requires at least two coordinate points for route knowledge', () => {
    assert.throws(() => buildKnowledgeRecord({
        document_type: 'route',
        topic: 'Rute Tidak Lengkap',
        content: 'Rute ini sengaja dibuat tidak lengkap untuk memastikan validasi titik koordinat bekerja dengan benar.',
        source_title: 'Sumber resmi pengujian',
        review_status: 'draft',
        route: { points: [{ name: 'Titik Tunggal', latitude: -6.98, longitude: 110.41 }] },
    }), /minimal dua titik/);
});
