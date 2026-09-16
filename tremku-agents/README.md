# TREM-KU Agents

Layanan multi-agent lokal untuk DINUS, NARA, KOMANDO, dan INGAT. Runtime menggunakan API Ollama yang kompatibel dengan OpenAI, sedangkan MQTT, Redis, dan Qdrant menyediakan telemetry, session memory, dan vector memory.

## Menjalankan melalui Docker

Metode yang direkomendasikan adalah menjalankan `docker compose up -d --build` dari repositori `D:\serverAI`. Compose akan membangun service ini sebagai `agent-api` dan menyediakan konfigurasi seluruh dependency.

## Menjalankan secara Lokal

Pastikan Ollama, Qdrant, Redis, dan EMQX sudah berjalan, kemudian:

```powershell
Set-Location D:\tremagent\tremku-agents
Copy-Item .env.example .env.local
# Isi semua konfigurasi pada .env.local.
npm ci
npm run validate:knowledge
npm run seed:knowledge
npm start
```

## Endpoint

- `GET /health`: status MQTT, Redis, Qdrant, dan Ollama.
- `POST /api/chat`: percakapan agent; memerlukan header `x-api-key`.
- `GET /api/fleet`: status armada; memerlukan header `x-api-key`.
- `GET /api/safety/:tremId`: keputusan keselamatan; memerlukan header `x-api-key`.
- `GET /dashboard`: dashboard operator.
- `GET /knowledge-admin`: form administrasi knowledge lokal.
- `GET/POST /api/knowledge-admin/records`: membaca dan menyimpan knowledge; memerlukan header `x-knowledge-admin-key`.
- `DELETE /api/knowledge-admin/records/:id`: menghapus knowledge web dan point Qdrant terkait.

Contoh request:

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "x-api-key" = "ISI_API_KEY"
}
$body = @{
  agent = "DINUS"
  message = "Apa sejarah Lawang Sewu?"
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3100/api/chat" -Headers $headers -Body $body
```

## Gaya Respons

Secara default agent menjawab paling banyak empat kalimat pendek atau sekitar 80 kata. Bahasa yang digunakan harus formal, informatif, ramah, mudah dibacakan TTS, serta tidak menggunakan emoji, emotikon, atau bahasa gaul.

## Pengujian

```powershell
npm test
```

Test mencakup parser telemetri nested, validasi ID armada, sanitasi PII, penghapusan emoji/emotikon, dan penanganan kalimat yang terpotong.

## Memperbarui RAG Lokal

Template tersedia di `knowledge/templates` untuk data destinasi, rute, dan kampus UDINUS. Salin template ke `knowledge/data`, lengkapi sumber dan metadata review, lalu jalankan:

```powershell
npm run validate:knowledge
npm run seed:knowledge
```

Hanya data dengan status yang dapat diindeks yang akan dimasukkan ke Qdrant. Panduan lengkap tersedia di `knowledge/README.md`.

Sebagai alternatif, buka `http://127.0.0.1:3100/knowledge-admin`. Form akan meminta `KNOWLEDGE_ADMIN_KEY`. Gunakan key terpisah dari `AGENT_API_KEY`, terutama jika Agent API diberikan kepada perangkat lain.

Jika `KNOWLEDGE_ADMIN_KEY` tidak tersedia, service membuat key acak 256-bit pada `data/knowledge_admin.key`. Key tetap tersedia setelah container dibuat ulang karena folder `data` dipasang sebagai volume persisten.

Penyimpanan dari web menggunakan `knowledge/data/web-entries.json`. Proses penyimpanan menaikkan versi record, memvalidasi koordinat dan sumber, lalu memperbarui Qdrant jika statusnya `approved`.
