# TREM-KU Agent Repository

Implementasi Agentic AI untuk sistem trem wisata Kota Lama Semarang. Skema telemetri yang berlaku berada di `tremku-agents/design_telemetry.md` dan menjadi acuan utama menggantikan contoh payload lama.

## Komponen

- `tremku-agents`: Agent API untuk DINUS, NARA, KOMANDO, dan INGAT; tool-calling; MQTT; Redis; Qdrant; serta dashboard operator.
- `tremku-voice`: layanan suara berbasis FastAPI, Faster Whisper, Agent API, dan Edge TTS.
- `serverAI`: repositori terpisah yang menjalankan seluruh komponen melalui Docker Desktop di Windows 11.

## Menjalankan dengan Docker

Letakkan kedua repositori sebagai folder sejajar:

```text
D:\tremagent
D:\serverAI
```

Kemudian jalankan dari PowerShell:

```powershell
Set-Location D:\serverAI
Copy-Item .env.example .env
Copy-Item emqx_bootstrap_users.example.csv emqx_bootstrap_users.csv
# Isi secret pada .env dan samakan password MQTT pada kedua file.
docker compose up -d --build
docker compose exec -T ollama ollama pull qwen3.8:27b
docker compose exec -T ollama ollama pull nomic-embed-text
docker compose exec -T agent-api npm run seed:heritage
docker compose ps
```

Panduan lengkap tersedia di `D:\serverAI\README.md`.

## Endpoint

- Agent API lokal: `http://127.0.0.1:3100`
- Voice DINUS: `http://127.0.0.1:8000`
- Dashboard KOMANDO: `http://127.0.0.1:3100/dashboard`
- Agent API publik: `https://aiapi.elektrodinus.id/api/chat`

Endpoint `/api/chat` memerlukan `x-api-key`. Jika diakses melalui Cloudflare Access, klien juga harus mengirim `CF-Access-Client-Id` dan `CF-Access-Client-Secret`.

## Pengujian

```powershell
Set-Location D:\tremagent\tremku-agents
npm ci
npm test
```

## Keamanan

- Jangan commit `.env`, `.env.local`, bootstrap user lokal, atau token Cloudflare.
- Jangan mengekspos port Ollama `11434`, Redis `6379`, Qdrant `6333`, atau MQTT `1883` langsung ke internet.
- Gunakan API key Agent API dan Cloudflare Access Service Token untuk akses antarmesin.
- Rotasi secret yang pernah tersimpan di riwayat Git atau dikirim melalui kanal yang tidak aman.

## Changelog

### 2026-09-16

- Menambahkan Agent API terautentikasi untuk DINUS, NARA, KOMANDO, dan INGAT.
- Mengintegrasikan Ollama/Qwen, embedding lokal, Qdrant, Redis, dan EMQX.
- Mengadopsi skema telemetri nested terbaru, validasi identitas armada, deteksi data kedaluwarsa, serta fail-safe keselamatan.
- Menambahkan korelasi perintah MQTT dan acknowledgment kendaraan untuk perintah perlambatan.
- Menambahkan dashboard armada, pencarian pengetahuan heritage, memori preferensi, dan pencatatan insight yang disanitasi.
- Menambahkan voice service FastAPI dengan Faster Whisper dan Edge TTS.
- Menetapkan gaya respons ringkas, formal, informatif, menyenangkan, serta bebas emoji dan emotikon.
- Menambahkan filter emoji sebelum TTS dan pengaman agar respons berakhir pada kalimat lengkap.
- Menghapus secret aktif dari repository dan menyediakan `.env.example`.
- Menambahkan Dockerfile, health check, unit test, serta dokumentasi deployment Windows 11 dan Cloudflare Access.
