const path = require('path');
const { readKnowledgeRecords, validateKnowledgeRecord } = require('../services/knowledge');

function main() {
    const entries = readKnowledgeRecords();
    const seen = new Map();
    const failures = [];

    for (const { record, file } of entries) {
        const label = `${path.basename(file)}:${record?.id || '<tanpa-id>'}`;
        const errors = validateKnowledgeRecord(record);
        if (record?.id && seen.has(record.id)) errors.push(`id duplikat; sebelumnya digunakan pada ${seen.get(record.id)}.`);
        if (record?.id) seen.set(record.id, label);
        for (const error of errors) failures.push(`${label} - ${error}`);
    }

    if (failures.length) {
        console.error('Validasi knowledge gagal:');
        failures.forEach((failure) => console.error(`- ${failure}`));
        process.exitCode = 1;
        return;
    }
    console.log(`Validasi berhasil: ${entries.length} record dari ${new Set(entries.map((entry) => entry.file)).size} file.`);
}

if (require.main === module) main();

module.exports = { main };
