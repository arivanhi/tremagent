# TREM-KU Voice Service

Layanan suara DINUS dengan alur browser microphone, Faster Whisper, TREM-KU Agent API, lalu Edge TTS Bahasa Indonesia. Respons dibersihkan dari emoji dan emotikon sebelum ditampilkan serta dibacakan.

## Menjalankan melalui Docker

Metode yang direkomendasikan:

```powershell
Set-Location D:\serverAI
docker compose up -d --build voice
docker compose logs -f voice
```

Antarmuka tersedia di `http://127.0.0.1:8000`.

Model Whisper disimpan secara persisten di `D:\tremku_models\huggingface`. Unduhan pertama dapat dipersiapkan dengan:

```powershell
docker compose exec -T voice python -c "import asyncio, service; asyncio.run(service.get_stt_model())"
```

## Menjalankan secara Lokal

```powershell
Set-Location D:\tremagent\tremku-voice
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
$env:AGENT_API_URL = "http://127.0.0.1:3100"
$env:AGENT_API_KEY = "ISI_API_KEY_AGENT"
python -m uvicorn service:app --host 0.0.0.0 --port 8000
```

## Konfigurasi

- `AGENT_API_URL`: alamat Agent API.
- `AGENT_API_KEY`: API key yang sama dengan `AGENT_API_KEY` pada server.
- `WHISPER_MODEL`: model Faster Whisper; default `small`.
- `VOICE_AGENT`: agent yang menerima percakapan; default `DINUS`.
- `HF_HOME`: lokasi cache model Hugging Face.

## Endpoint

- `GET /`: antarmuka rekam suara.
- `GET /health`: status konfigurasi voice service.
- `WS /ws/talk`: WebSocket untuk audio percakapan.
