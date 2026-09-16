const config = require('./config');

async function embed(text) {
    const response = await fetch(`${config.ollamaBaseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: config.embeddingModel, input: text }),
        signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
        throw new Error(`Ollama embedding gagal (${response.status}): ${await response.text()}`);
    }
    const payload = await response.json();
    const vector = payload.embeddings?.[0];
    if (!Array.isArray(vector) || vector.length === 0) {
        throw new Error('Ollama tidak mengembalikan embedding yang valid.');
    }
    return vector;
}

async function status() {
    try {
        const response = await fetch(`${config.ollamaBaseUrl}/api/tags`, {
            signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) return { ok: false, status: response.status };
        const payload = await response.json();
        const models = (payload.models || []).map((model) => model.name);
        return {
            ok: true,
            chat_model_available: models.includes(config.chatModel),
            embedding_model_available: models.includes(config.embeddingModel),
            models,
        };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

module.exports = { embed, status };
