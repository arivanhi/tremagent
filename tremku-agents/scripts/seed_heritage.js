const fs = require('fs');
const path = require('path');
const { embed } = require('../services/ollama');
const qdrant = require('../services/qdrant');

async function main() {
    const source = path.join(__dirname, '..', 'knowledge', 'heritage.json');
    const records = JSON.parse(fs.readFileSync(source, 'utf8'));
    for (const record of records) {
        const vector = await embed(`${record.name}\n${record.location}\n${record.content}`);
        await qdrant.upsert('heritage_knowledge', vector, record, record.id);
        console.log(`Seeded ${record.id}`);
    }
    console.log(`Seeded ${records.length} heritage records.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
