require('dotenv').config();
const fs = require('fs');
// Menggunakan library bawaan OpenAI API (karena vLLM sepenuhnya kompatibel dengan OpenAI)
// OpenClaw biasanya membungkus koneksi ini di belakang layar.
const { OpenAI } = require('openai');

async function testDinus() {
    console.log("[1/3] Menyiapkan koneksi ke Qwen 14B (Port 8001)...");

    // Inisialisasi koneksi ke vLLM lokal
    const openai = new OpenAI({
        baseURL: process.env.OPENAI_API_BASE, // http://localhost:8001/v1
        apiKey: process.env.OPENAI_API_KEY,   // local-key-not-needed
    });

    console.log("[2/3] Membaca identitas agen (SOUL-DINUS)...");
    let dinusSoul = "";
    try {
        dinusSoul = fs.readFileSync('SOUL-DINUS.md', 'utf-8');
    } catch (err) {
        console.error("Gagal membaca SOUL-DINUS.md. Pastikan file ada di direktori ini.");
        return;
    }

    // Simulasi input dari wisatawan
    const userMessage = "Halo DINUS, saya sedang berada di depan kantor pos indonesia. Tolong ceritakan sejarahnya secara singkat!";
    console.log(`\nWisatawan : "${userMessage}"`);
    console.log("[3/3] DINUS sedang memikirkan jawaban...\n");

    try {
        // Mengirimkan instruksi sistem (SOUL) dan pertanyaan user ke model
        const response = await openai.chat.completions.create({
            model: process.env.OPENCLAW_MODEL, // Qwen/Qwen2.5-14B-Instruct-GPTQ-Int4
            messages: [
                { role: "system", content: dinusSoul },
                { role: "user", content: userMessage }
            ],
            max_tokens: 200,
            temperature: 0.7 // Agar jawaban lebih luwes dan natural
        });

        // Menampilkan hasil jawaban
        const dinusReply = response.choices[0].message.content;
        console.log(`DINUS     : "${dinusReply}"\n`);
        console.log("=== PENGUJIAN SUKSES ===");

    } catch (error) {
        console.error("=== PENGUJIAN GAGAL ===");
        console.error("Tidak dapat terhubung ke Qwen. Pastikan Docker container 'tremku_llm' sedang berjalan dan port 8001 tidak terblokir.");
        console.error("Detail error:", error.message);
    }
}

testDinus();