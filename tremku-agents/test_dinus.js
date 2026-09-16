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

    // Memuat skill tool (Function Calling)
    const logTripInsights = require('./skills/log_trip_insights.js');
    const tools = [{
        type: "function",
        function: {
            name: logTripInsights.name,
            description: logTripInsights.description,
            parameters: logTripInsights.parameters
        }
    }];

    // Simulasi input dari wisatawan (ditambah instruksi mencatat ke memori)
    const userMessage = "Halo DINUS, saya di depan kantor pos indonesia. Tolong ceritakan singkat sejarahnya! Oh ya, karena perjalanan kita sudah mau selesai, tolong catat juga ke dalam sistem bahwa saya sangat tertarik dengan arsitektur peninggalan VOC ini (trip_id: T-007).";
    console.log(`\nWisatawan : "${userMessage}"`);
    console.log("[3/3] DINUS sedang memikirkan jawaban dan mengevaluasi Tools...\n");

    try {
        let messages = [
            // Tambahkan instruksi ke SOUL agar ia tahu ada tool yang bisa dipakai
            { role: "system", content: dinusSoul + "\n\nTambahan Aturan: Jika pengguna meminta mencatat trip atau perjalanan selesai, kamu WAJIB memanggil fungsi log_trip_insights." },
            { role: "user", content: userMessage }
        ];

        // 1. Kirim pesan beserta daftar 'tools' yang tersedia
        const response = await openai.chat.completions.create({
            model: process.env.OPENCLAW_MODEL,
            messages: messages,
            tools: tools,
            tool_choice: "auto",
            max_tokens: 2048,
            temperature: 0.7
        });

        const responseMessage = response.choices[0].message;

        // 2. Periksa apakah model memutuskan untuk menggunakan tool
        if (responseMessage.tool_calls) {
            console.log(`[🤖 ACTION] DINUS memutuskan memanggil tool: ${responseMessage.tool_calls[0].function.name}`);
            messages.push(responseMessage); // Simpan riwayat panggilan fungsi

            // Eksekusi fungsi lokal berdasarkan permintaan AI
            for (const toolCall of responseMessage.tool_calls) {
                if (toolCall.function.name === logTripInsights.name) {
                    const args = JSON.parse(toolCall.function.arguments);
                    console.log(`[⚙️ SYSTEM] Mengeksekusi kode JS dengan Argumen:`, args);
                    
                    const functionResult = await logTripInsights.execute(args);
                    console.log(`[✅ SYSTEM] Hasil fungsi: ${functionResult}\n`);
                    
                    // Kembalikan hasil eksekusi ke model
                    messages.push({
                        tool_call_id: toolCall.id,
                        role: "tool",
                        name: logTripInsights.name,
                        content: functionResult
                    });
                }
            }

            // 3. Minta model merangkum jawaban akhirnya
            console.log("[🤖 ACTION] DINUS merangkum jawaban akhir berdasarkan hasil tool...");
            const finalResponse = await openai.chat.completions.create({
                model: process.env.OPENCLAW_MODEL,
                messages: messages,
                max_tokens: 2048,
                temperature: 0.7
            });
            console.log(`\nDINUS     : "${finalResponse.choices[0].message.content}"\n`);

        } else {
            console.log(`DINUS     : "${responseMessage.content}"\n`);
        }

        console.log("=== PENGUJIAN SUKSES ===");

    } catch (error) {
        console.error("=== PENGUJIAN GAGAL ===");
        console.error("Tidak dapat terhubung ke Qwen. Pastikan Docker container 'tremku_llm' sedang berjalan dan port 8001 tidak terblokir.");
        console.error("Detail error:", error.message);
    }
}

testDinus();