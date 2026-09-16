function sanitizeText(value) {
    return String(value || '')
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL-DIHAPUS]')
        .replace(/(?:\+62|62|0)8\d{7,12}/g, '[TELEPON-DIHAPUS]')
        .replace(/\b\d{16}\b/g, '[IDENTITAS-DIHAPUS]')
        .replace(/\b(?:\d[ -]*?){13,19}\b/g, '[NOMOR-DIHAPUS]')
        .replace(/\s{3,}/g, ' ')
        .trim()
        .slice(0, 12000);
}

module.exports = { sanitizeText };
