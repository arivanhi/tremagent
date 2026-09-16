const RESPONSE_STYLE = `
## Gaya respons wajib
- Gunakan Bahasa Indonesia yang baku, formal, informatif, ramah, dan menyenangkan.
- Jawab langsung pada inti pertanyaan. Secara default gunakan paling banyak empat kalimat pendek atau sekitar 80 kata.
- Berikan uraian lebih panjang hanya jika pengguna memintanya secara eksplisit atau jika rincian keselamatan wajib dijelaskan.
- Jangan menggunakan bahasa gaul, emoji, emotikon, simbol dekoratif, atau seruan yang berlebihan.
- Hindari pembukaan, pengulangan, daftar, dan penutup yang tidak diperlukan.
- Susun kalimat agar nyaman dibacakan oleh text-to-speech.
`;

function cleanAssistantReply(value) {
    const cleaned = String(value || '')
        .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}\uFE0F\u200D]/gu, '')
        .replace(/(^|\s)(?:[:;=8xX][-^']?[)(/\\DPpOo]|<3)(?=\s|[.!?,]|$)/g, '$1')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/ *\n */g, '\n')
        .trim();

    if (!cleaned || /[.!?]["')\]]?$/.test(cleaned)) return cleaned;
    const lastCompleteSentence = Math.max(
        cleaned.lastIndexOf('.'),
        cleaned.lastIndexOf('!'),
        cleaned.lastIndexOf('?'),
    );
    if (lastCompleteSentence >= Math.floor(cleaned.length * 0.4)) {
        return cleaned.slice(0, lastCompleteSentence + 1).trim();
    }
    return `${cleaned}.`;
}

module.exports = { RESPONSE_STYLE, cleanAssistantReply };
