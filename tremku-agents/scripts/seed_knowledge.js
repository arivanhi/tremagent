const path = require('path');
const { embed } = require('../services/ollama');
const qdrant = require('../services/qdrant');
const {
    INDEXABLE_STATUSES,
    buildEmbeddingText,
    normalizeKnowledgeRecord,
    readKnowledgeRecords,
    validateKnowledgeRecord,
} = require('../services/knowledge');

const COLLECTION = 'heritage_knowledge';

async function main() {
    const entries = readKnowledgeRecords();
    const seen = new Set();
    let seeded = 0;
    let skipped = 0;

    for (const { record: rawRecord, file } of entries) {
        const errors = validateKnowledgeRecord(rawRecord);
        if (errors.length) throw new Error(`${path.basename(file)}:${rawRecord?.id || '<tanpa-id>'} - ${errors.join(' ')}`);
        if (seen.has(rawRecord.id)) throw new Error(`ID knowledge duplikat: ${rawRecord.id}`);
        seen.add(rawRecord.id);

        const record = normalizeKnowledgeRecord(rawRecord);
        if (!INDEXABLE_STATUSES.has(record.review_status)) {
            await qdrant.remove(COLLECTION, record.id);
            console.log(`Skipped ${record.id} (${record.review_status}); point lama dihapus jika ada.`);
            skipped += 1;
            continue;
        }
        if (record.review_status === 'needs_curator_review') {
            console.warn(`WARNING: ${record.id} masih memerlukan review kurator dan hanya layak untuk data demo.`);
        }
        const vector = await embed(buildEmbeddingText(record));
        await qdrant.upsert(COLLECTION, vector, record, record.id);
        console.log(`Seeded ${record.id} (${record.document_type})`);
        seeded += 1;
    }
    console.log(`Selesai: ${seeded} record diindeks, ${skipped} record dilewati.`);
}

if (require.main === module) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}

module.exports = { main };
