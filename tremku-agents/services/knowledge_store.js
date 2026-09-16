const fs = require('fs');
const path = require('path');
const { embed } = require('./ollama');
const qdrant = require('./qdrant');
const { buildEmbeddingText, normalizeKnowledgeRecord, validateKnowledgeRecord } = require('./knowledge');

const COLLECTION = 'heritage_knowledge';
const STORE_PATH = path.join(__dirname, '..', 'knowledge', 'data', 'web-entries.json');
let writeQueue = Promise.resolve();

function text(value, label, maxLength = 8000) {
    const result = String(value || '').trim();
    if (!result) throw new Error(`${label} wajib diisi.`);
    if (result.length > maxLength) throw new Error(`${label} terlalu panjang.`);
    return result;
}

function optionalText(value, maxLength = 2000) {
    const result = String(value || '').trim();
    if (result.length > maxLength) throw new Error('Salah satu field teks terlalu panjang.');
    return result || null;
}

function coordinate(value, label, minimum, maximum) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
        throw new Error(`${label} harus berupa angka antara ${minimum} dan ${maximum}.`);
    }
    return number;
}

function slugify(value) {
    return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 80);
}

function parseTags(value) {
    const source = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(source.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

function validateSourceUrl(value) {
    const sourceUrl = optionalText(value, 1000);
    if (!sourceUrl) return null;
    let parsed;
    try {
        parsed = new URL(sourceUrl);
    } catch {
        throw new Error('URL sumber tidak valid.');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('URL sumber harus menggunakan HTTP atau HTTPS.');
    return sourceUrl;
}

function pointFromInput(point, index) {
    return {
        sequence: index + 1,
        stop_id: optionalText(point.stop_id, 100) || `POINT-${index + 1}`,
        name: text(point.name, `Nama titik rute ${index + 1}`, 200),
        latitude: coordinate(point.latitude, `Latitude titik ${index + 1}`, -90, 90),
        longitude: coordinate(point.longitude, `Longitude titik ${index + 1}`, -180, 180),
        safe_stop_zone: point.safe_stop_zone === true,
        narration_hint: optionalText(point.narration_hint, 500),
    };
}

function buildKnowledgeRecord(input, previous = null) {
    const documentType = String(input.document_type || '');
    if (!['destination', 'route', 'campus'].includes(documentType)) throw new Error('Jenis knowledge tidak valid.');
    const name = text(input.topic, 'Topik knowledge', 200);
    const requestedId = optionalText(input.id, 120);
    const id = requestedId || `${documentType}-${slugify(name)}`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('ID record tidak valid.');
    const content = text(input.content, 'Isi knowledge', 12000);
    if (content.length < 40) throw new Error('Isi knowledge minimal 40 karakter.');
    const reviewStatus = ['draft', 'approved', 'archived'].includes(input.review_status) ? input.review_status : 'draft';
    const reviewedBy = optionalText(input.reviewed_by, 200);
    if (reviewStatus === 'approved' && !reviewedBy) throw new Error('Nama reviewer wajib diisi untuk status disetujui.');

    const record = {
        id,
        document_type: documentType,
        name,
        aliases: [],
        category: optionalText(input.category, 100) || documentType,
        summary: optionalText(input.summary, 600) || content.slice(0, 300),
        content,
        tags: parseTags(input.tags),
        source: [{
            title: text(input.source_title, 'Sumber informasi', 300),
            publisher: optionalText(input.source_publisher, 300),
            url: validateSourceUrl(input.source_url),
            accessed_at: new Date().toISOString().slice(0, 10),
        }],
        review_status: reviewStatus,
        reviewed_by: reviewedBy,
        version: previous ? Number(previous.version || 1) + 1 : 1,
        updated_at: new Date().toISOString().slice(0, 10),
        valid_from: optionalText(input.valid_from, 10) || new Date().toISOString().slice(0, 10),
        valid_until: optionalText(input.valid_until, 10),
    };

    if (documentType === 'destination') {
        record.location = {
            area: optionalText(input.destination?.area, 300),
            address: optionalText(input.destination?.address, 500),
            latitude: coordinate(input.destination?.latitude, 'Latitude destinasi', -90, 90),
            longitude: coordinate(input.destination?.longitude, 'Longitude destinasi', -180, 180),
        };
        record.visitor_information = {
            opening_hours: optionalText(input.destination?.opening_hours, 500),
            visitor_guidance: parseTags(input.destination?.visitor_guidance),
        };
    } else if (documentType === 'route') {
        if (!Array.isArray(input.route?.points) || input.route.points.length < 2) {
            throw new Error('Rute wajib memiliki minimal dua titik koordinat.');
        }
        const points = input.route.points.slice(0, 30).map(pointFromInput);
        record.location = { area: optionalText(input.route.area, 300), city: 'Semarang' };
        record.route = {
            route_id: optionalText(input.route.route_id, 100) || id.toUpperCase(),
            origin: points[0].name,
            destination: points.at(-1).name,
            estimated_duration_minutes: input.route.estimated_duration_minutes
                ? coordinate(input.route.estimated_duration_minutes, 'Estimasi durasi', 1, 1440)
                : null,
            operation_schedule: optionalText(input.route.operation_schedule, 500),
            stops: points,
            safety_notes: parseTags(input.route.safety_notes),
        };
    } else {
        const latitudeProvided = input.campus?.latitude !== '' && input.campus?.latitude !== null && input.campus?.latitude !== undefined;
        const longitudeProvided = input.campus?.longitude !== '' && input.campus?.longitude !== null && input.campus?.longitude !== undefined;
        if (latitudeProvided !== longitudeProvided) throw new Error('Latitude dan longitude kampus harus diisi bersama.');
        record.location = {
            campus: 'Universitas Dian Nuswantoro',
            building: optionalText(input.campus?.building, 200),
            floor: optionalText(input.campus?.floor, 50),
            address: optionalText(input.campus?.address, 500),
            latitude: latitudeProvided ? coordinate(input.campus.latitude, 'Latitude kampus', -90, 90) : null,
            longitude: longitudeProvided ? coordinate(input.campus.longitude, 'Longitude kampus', -180, 180) : null,
        };
        record.campus = {
            unit_type: optionalText(input.campus?.unit_type, 200) || 'campus-information',
            service_hours: optionalText(input.campus?.service_hours, 500),
            services: parseTags(input.campus?.services),
            visitor_guidance: parseTags(input.campus?.visitor_guidance),
        };
    }

    const errors = validateKnowledgeRecord(record);
    if (errors.length) throw new Error(errors.join(' '));
    return normalizeKnowledgeRecord(record);
}

function readWebRecords() {
    if (!fs.existsSync(STORE_PATH)) return [];
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Penyimpanan knowledge web tidak valid.');
    return parsed;
}

function writeWebRecords(records) {
    const operation = writeQueue.then(async () => {
        await fs.promises.mkdir(path.dirname(STORE_PATH), { recursive: true });
        await fs.promises.writeFile(STORE_PATH, `${JSON.stringify(records, null, 2)}\n`, 'utf8');
    });
    writeQueue = operation.catch(() => {});
    return operation;
}

async function saveKnowledge(input) {
    const records = readWebRecords();
    const index = input.id ? records.findIndex((record) => record.id === input.id) : -1;
    const previous = index >= 0 ? records[index] : null;
    let record;
    try {
        record = buildKnowledgeRecord(input, previous);
    } catch (error) {
        error.statusCode = 400;
        throw error;
    }
    if (index >= 0) records[index] = record;
    else records.push(record);
    await writeWebRecords(records);

    try {
        if (record.review_status === 'approved') {
            const vector = await embed(buildEmbeddingText(record));
            await qdrant.upsert(COLLECTION, vector, record, record.id);
            return { record, indexed: true };
        }
        await qdrant.remove(COLLECTION, record.id);
        return { record, indexed: false };
    } catch (error) {
        error.statusCode = 502;
        error.publicMessage = 'Data tersimpan, tetapi indeks RAG gagal diperbarui.';
        throw error;
    }
}

async function deleteKnowledge(id) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(id || ''))) throw new Error('ID record tidak valid.');
    const records = readWebRecords();
    const filtered = records.filter((record) => record.id !== id);
    if (filtered.length === records.length) return false;
    await writeWebRecords(filtered);
    await qdrant.remove(COLLECTION, id);
    return true;
}

module.exports = { buildKnowledgeRecord, deleteKnowledge, readWebRecords, saveKnowledge };
