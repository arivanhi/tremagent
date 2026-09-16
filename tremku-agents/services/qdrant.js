const crypto = require('crypto');
const config = require('./config');

async function request(path, options = {}) {
    const response = await fetch(`${config.qdrantUrl}${path}`, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        signal: options.signal || AbortSignal.timeout(10000),
    });
    if (!response.ok) {
        throw new Error(`Qdrant ${options.method || 'GET'} ${path} gagal (${response.status}): ${await response.text()}`);
    }
    return response.json();
}

async function collectionExists(name) {
    const response = await fetch(`${config.qdrantUrl}/collections/${encodeURIComponent(name)}`, {
        signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404) return false;
    if (!response.ok) throw new Error(`Qdrant collection check gagal: ${response.status}`);
    return true;
}

async function ensureCollection(name, vectorSize) {
    if (await collectionExists(name)) return;
    await request(`/collections/${encodeURIComponent(name)}`, {
        method: 'PUT',
        body: JSON.stringify({ vectors: { size: vectorSize, distance: 'Cosine' } }),
    });
}

function pointId(value) {
    if (!value) return crypto.randomUUID();
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return value;
    const hex = crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function upsert(name, vector, payload, id = crypto.randomUUID()) {
    await ensureCollection(name, vector.length);
    await request(`/collections/${encodeURIComponent(name)}/points?wait=true`, {
        method: 'PUT',
        body: JSON.stringify({ points: [{ id: pointId(id), vector, payload }] }),
    });
    return pointId(id);
}

async function search(name, vector, limit = 4, scoreThreshold = 0.25) {
    if (!(await collectionExists(name))) return [];
    const result = await request(`/collections/${encodeURIComponent(name)}/points/query`, {
        method: 'POST',
        body: JSON.stringify({
            query: vector,
            limit,
            score_threshold: scoreThreshold,
            with_payload: true,
        }),
    });
    return result.result?.points || [];
}

async function status() {
    try {
        const result = await request('/collections');
        return { ok: true, collections: (result.result?.collections || []).map((item) => item.name) };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

module.exports = { ensureCollection, upsert, search, status };
