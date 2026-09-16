const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'knowledge');
const DATA_DIR = path.join(KNOWLEDGE_DIR, 'data');
const DOCUMENT_TYPES = new Set(['destination', 'route', 'campus']);
const REVIEW_STATUSES = new Set([
    'draft',
    'needs_review',
    'needs_curator_review',
    'approved',
    'approved_for_demo',
    'archived',
]);
const INDEXABLE_STATUSES = new Set(['needs_curator_review', 'approved', 'approved_for_demo']);
const PLACEHOLDER_PATTERN = /\bGANTI\b|YYYY-MM-DD|contoh\.invalid/i;

function listKnowledgeFiles() {
    const files = [path.join(KNOWLEDGE_DIR, 'heritage.json')];
    if (fs.existsSync(DATA_DIR)) {
        files.push(...fs.readdirSync(DATA_DIR)
            .filter((name) => name.toLowerCase().endsWith('.json'))
            .sort()
            .map((name) => path.join(DATA_DIR, name)));
    }
    return files.filter((file) => fs.existsSync(file));
}

function readKnowledgeRecords() {
    const records = [];
    for (const file of listKnowledgeFiles()) {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!Array.isArray(parsed)) throw new Error(`${file} harus berisi array JSON.`);
        for (const record of parsed) records.push({ record, file });
    }
    return records;
}

function inferredDocumentType(record) {
    if (record.document_type) return record.document_type;
    return record.category === 'route' ? 'route' : 'destination';
}

function validateKnowledgeRecord(record) {
    const errors = [];
    if (!record || typeof record !== 'object' || Array.isArray(record)) return ['Record harus berupa object.'];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id || '')) errors.push('id wajib berupa slug unik dengan huruf kecil, angka, dan tanda hubung.');
    if (typeof record.name !== 'string' || record.name.trim().length < 3) errors.push('name wajib diisi.');
    if (!DOCUMENT_TYPES.has(inferredDocumentType(record))) errors.push('document_type harus destination, route, atau campus.');
    if (typeof record.content !== 'string' || record.content.trim().length < 40) errors.push('content wajib berupa narasi faktual minimal 40 karakter.');
    if (!REVIEW_STATUSES.has(record.review_status)) errors.push('review_status tidak valid.');
    if (!(typeof record.source === 'string' || (Array.isArray(record.source) && record.source.length))) errors.push('source wajib berupa teks atau array sumber.');
    if (record.version !== undefined && (!Number.isInteger(record.version) || record.version < 1)) errors.push('version harus berupa bilangan bulat positif.');
    if (record.updated_at && !/^\d{4}-\d{2}-\d{2}$/.test(record.updated_at)) errors.push('updated_at harus menggunakan format YYYY-MM-DD.');
    if (PLACEHOLDER_PATTERN.test(JSON.stringify(record))) errors.push('Masih terdapat placeholder GANTI, YYYY-MM-DD, atau contoh.invalid.');
    return errors;
}

function flattenSearchableText(value, output = []) {
    if (value === null || value === undefined) return output;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        output.push(String(value));
    } else if (Array.isArray(value)) {
        for (const item of value) flattenSearchableText(item, output);
    } else if (typeof value === 'object') {
        for (const [key, item] of Object.entries(value)) {
            if (!['id', 'source', 'reviewed_by'].includes(key)) flattenSearchableText(item, output);
        }
    }
    return output;
}

function buildEmbeddingText(record) {
    return [...new Set(flattenSearchableText({
        document_type: inferredDocumentType(record),
        name: record.name,
        aliases: record.aliases,
        category: record.category,
        location: record.location,
        summary: record.summary,
        content: record.content,
        facts: record.facts,
        visitor_information: record.visitor_information,
        route: record.route,
        campus: record.campus,
        tags: record.tags,
    }).map((item) => item.trim()).filter(Boolean))].join('\n');
}

function normalizeKnowledgeRecord(record) {
    return {
        document_type: inferredDocumentType(record),
        version: record.version || 1,
        ...record,
    };
}

module.exports = {
    INDEXABLE_STATUSES,
    buildEmbeddingText,
    listKnowledgeFiles,
    normalizeKnowledgeRecord,
    readKnowledgeRecords,
    validateKnowledgeRecord,
};
