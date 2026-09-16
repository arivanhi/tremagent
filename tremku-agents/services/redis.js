const { createClient } = require('redis');
const config = require('./config');

let client;

async function getClient() {
    if (!client) {
        client = createClient({
            url: config.redisUrl,
            password: config.redisPassword || undefined,
            socket: { reconnectStrategy: (retries) => Math.min(retries * 100, 3000) },
        });
        client.on('error', (error) => console.error(`[REDIS] ${error.message}`));
    }
    if (!client.isOpen) await client.connect();
    return client;
}

async function status() {
    try {
        const redis = await getClient();
        return { ok: (await redis.ping()) === 'PONG' };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

module.exports = { getClient, status };
