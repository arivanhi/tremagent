import asyncio
import base64
import json
import logging
import os
import re
import tempfile
from pathlib import Path

import edge_tts
import requests
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from faster_whisper import WhisperModel

AGENT_API_URL = os.environ.get("AGENT_API_URL", "http://127.0.0.1:3100").rstrip("/")
AGENT_API_KEY = os.environ.get("AGENT_API_KEY", "")
WHISPER_MODEL_NAME = os.environ.get("WHISPER_MODEL", "small")
VOICE_AGENT = os.environ.get("VOICE_AGENT", "DINUS")
MAX_AUDIO_BYTES = 10 * 1024 * 1024

logger = logging.getLogger("tremku.voice")

EMOJI_PATTERN = re.compile(
    "["
    "\U0001F1E6-\U0001F1FF"
    "\U0001F300-\U0001FAFF"
    "\U00002600-\U000027BF"
    "\U0000FE0F\U0000200D"
    "]+"
)
EMOTICON_PATTERN = re.compile(r"(^|\s)(?:[:;=8xX][-^']?[)(/\\DPpOo]|<3)(?=\s|[.!?,]|$)")

app = FastAPI(title="TREM-KU Voice", version="2.0.0")
_stt_model = None
_stt_lock = asyncio.Lock()


async def get_stt_model():
    global _stt_model
    if _stt_model is not None:
        return _stt_model
    async with _stt_lock:
        if _stt_model is None:
            _stt_model = await asyncio.to_thread(
                WhisperModel,
                WHISPER_MODEL_NAME,
                device="cpu",
                compute_type="int8",
            )
    return _stt_model


def transcribe(path: str) -> str:
    segments, _ = _stt_model.transcribe(path, language="id", beam_size=5)
    return " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()


def clean_for_speech(text: str) -> str:
    value = EMOJI_PATTERN.sub("", str(text or ""))
    value = EMOTICON_PATTERN.sub(r"\1", value)
    value = re.sub(r"[ \t]{2,}", " ", value)
    return value.strip()


def ask_agent(message: str, history: list[dict]) -> dict:
    if not AGENT_API_KEY:
        raise RuntimeError("AGENT_API_KEY belum dikonfigurasi pada voice service.")
    response = requests.post(
        f"{AGENT_API_URL}/api/chat",
        headers={"x-api-key": AGENT_API_KEY},
        json={"agent": VOICE_AGENT, "message": message, "history": history[-20:]},
        timeout=180,
    )
    response.raise_for_status()
    return response.json()


async def synthesize(text: str) -> bytes:
    fd, output_path = tempfile.mkstemp(suffix=".mp3")
    os.close(fd)
    try:
        await edge_tts.Communicate(text, "id-ID-GadisNeural", rate="+10%").save(output_path)
        return await asyncio.to_thread(Path(output_path).read_bytes)
    finally:
        Path(output_path).unlink(missing_ok=True)


HTML_PAGE = """
<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TREM-KU DINUS Voice</title>
  <style>
    body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;background:#f3f6f8;color:#17202a}
    main{background:#fff;border-radius:16px;padding:24px;box-shadow:0 8px 30px #0001}
    button{width:100%;padding:16px;border:0;border-radius:10px;background:#d33;color:#fff;font-size:18px;font-weight:700;cursor:pointer}
    button.active{background:#1769aa}.label{font-weight:700;color:#0d4d78;margin-top:18px}.text{white-space:pre-wrap;min-height:24px}
    #status{margin:16px 0;text-align:center;color:#4a5568}
  </style>
</head>
<body><main>
  <h1>TREM-KU — DINUS</h1>
  <button id="record">Mulai Rekam</button>
  <div id="status">Menghubungkan...</div>
  <div class="label">Penumpang</div><div id="user" class="text">-</div>
  <div class="label">DINUS</div><div id="agent" class="text">-</div>
  <audio id="audio"></audio>
</main>
<script>
const statusEl=document.querySelector('#status'),button=document.querySelector('#record'),audio=document.querySelector('#audio');
let ws,recorder,chunks=[],recording=false;
function connect(){const p=location.protocol==='https:'?'wss':'ws';ws=new WebSocket(`${p}://${location.host}/ws/talk`);ws.onopen=()=>statusEl.textContent='Siap';ws.onclose=()=>{statusEl.textContent='Terputus, mencoba kembali...';setTimeout(connect,2000)};ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.type==='stt')document.querySelector('#user').textContent=d.text;if(d.type==='reply')document.querySelector('#agent').textContent=d.text;if(d.type==='audio'){audio.src='data:audio/mpeg;base64,'+d.data;audio.play().catch(()=>{})}if(d.type==='error')statusEl.textContent=d.message;if(d.type==='done')statusEl.textContent='Siap';};}
connect();
button.onclick=async()=>{if(!recorder){const stream=await navigator.mediaDevices.getUserMedia({audio:true});recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>chunks.push(e.data);recorder.onstop=()=>{if(ws.readyState===1)ws.send(new Blob(chunks,{type:recorder.mimeType}));};}if(!recording){chunks=[];recorder.start();recording=true;button.textContent='Hentikan & Kirim';button.classList.add('active');statusEl.textContent='Merekam...';audio.pause();}else{recorder.stop();recording=false;button.textContent='Mulai Rekam';button.classList.remove('active');statusEl.textContent='Memproses...';}};
</script></body></html>
"""


@app.get("/")
def home():
    return HTMLResponse(HTML_PAGE)


@app.get("/health")
def health():
    return {
        "status": "ok",
        "agent_api": AGENT_API_URL,
        "agent_api_key_configured": bool(AGENT_API_KEY),
        "whisper_model": WHISPER_MODEL_NAME,
        "stt_loaded": _stt_model is not None,
    }


@app.websocket("/ws/talk")
async def talk(websocket: WebSocket):
    await websocket.accept()
    history = []
    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            if not audio_bytes or len(audio_bytes) > MAX_AUDIO_BYTES:
                await websocket.send_text(json.dumps({"type": "error", "message": "Audio kosong atau terlalu besar."}))
                continue

            suffix = ".webm"
            fd, input_path = tempfile.mkstemp(suffix=suffix)
            os.close(fd)
            try:
                await asyncio.to_thread(Path(input_path).write_bytes, audio_bytes)
                await get_stt_model()
                user_text = await asyncio.to_thread(transcribe, input_path)
            finally:
                Path(input_path).unlink(missing_ok=True)

            if not user_text:
                await websocket.send_text(json.dumps({"type": "error", "message": "Ucapan tidak terdeteksi."}))
                continue
            await websocket.send_text(json.dumps({"type": "stt", "text": user_text}, ensure_ascii=False))

            result = await asyncio.to_thread(ask_agent, user_text, history)
            reply = clean_for_speech(result.get("reply") or "Maaf, saya belum dapat menjawab.")
            history.extend([
                {"role": "user", "content": user_text},
                {"role": "assistant", "content": reply},
            ])
            history = history[-20:]
            await websocket.send_text(json.dumps({"type": "reply", "text": reply}, ensure_ascii=False))
            try:
                audio_reply = await synthesize(reply)
                await websocket.send_text(json.dumps({"type": "audio", "data": base64.b64encode(audio_reply).decode("ascii")}))
            except Exception:
                logger.exception("Sintesis suara gagal")
                await websocket.send_text(json.dumps({"type": "error", "message": "TTS sedang tidak tersedia."}, ensure_ascii=False))
            await websocket.send_text(json.dumps({"type": "done"}))
    except WebSocketDisconnect:
        return
    except Exception:
        logger.exception("Sesi voice gagal")
        await websocket.send_text(json.dumps({"type": "error", "message": "Pemrosesan suara gagal. Silakan coba lagi."}, ensure_ascii=False))
        await websocket.close(code=1011)
