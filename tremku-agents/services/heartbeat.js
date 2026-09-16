const fs = require('fs');
const path = require('path');
const config = require('./config');

function briefing(fleet) {
    if (!fleet.data?.length) return 'Belum ada armada yang mengirim telemetri.';
    return fleet.data.map((item) =>
        `${item.trem_id}: battery=${item.battery_percent ?? '-'}%, speed=${item.speed_kmh ?? '-'} km/h, route=${item.route?.route_id ?? '-'}, safety=${item.safety?.emergency ? 'EMERGENCY' : 'normal'}, stale=${item.stale}`
    ).join('\n');
}

function startHeartbeat(getFleetStatus) {
    let lastSentDate = '';
    const timer = setInterval(async () => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
            timeZone: config.heartbeatTimezone,
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
        }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
        const date = `${parts.year}-${parts.month}-${parts.day}`;
        if (Number(parts.hour) === config.heartbeatHour && Number(parts.minute) < 5 && lastSentDate !== date) {
            lastSentDate = date;
            const directory = path.join(__dirname, '..', 'data');
            await fs.promises.mkdir(directory, { recursive: true });
            const content = `\n## Morning Briefing ${date}\n${briefing(getFleetStatus())}\n`;
            await fs.promises.appendFile(path.join(directory, 'morning_briefing.md'), content, 'utf8');
        }
    }, 60_000);
    timer.unref();
}

module.exports = { briefing, startHeartbeat };
