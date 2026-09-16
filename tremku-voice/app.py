import os
import json
import requests
import tempfile
import base64
import warnings
import torch
import scipy.io.wavfile
import wikipedia
import random
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from faster_whisper import WhisperModel
import edge_tts

warnings.filterwarnings("ignore")

# Patch PyTorch 2.6+
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

app = FastAPI()

print("[1/2] Memuat Faster-Whisper (STT)...")
stt_model = WhisperModel("small", device="cpu", compute_type="int8")

print("[2/2] Menggunakan Edge TTS (GadisNeural)...")

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), "../tremku-agents/.env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v
load_env()
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen3")

VLLM_URL = "http://localhost:11434/v1/chat/completions"

chat_histories = {}

# Konfigurasi Qdrant
QDRANT_URL = "http://localhost:6333"
try:
    qdrant = QdrantClient(url=QDRANT_URL)
    collections = qdrant.get_collections().collections
    if not any(c.name == "dinus_memory" for c in collections):
        qdrant.create_collection(
            collection_name="dinus_memory",
            vectors_config=VectorParams(size=768, distance=Distance.COSINE),
        )
        print("Qdrant: Collection 'dinus_memory' dibuat.")
except Exception as e:
    print(f"Qdrant Init Error: {e}")
    qdrant = None

def get_embedding(text):
    try:
        url = "http://localhost:11434/api/embeddings"
        res = requests.post(url, json={"model": "nomic-embed-text", "prompt": text}, timeout=10)
        return res.json().get("embedding")
    except:
        return None

# Konfigurasi Wikipedia RAG
wikipedia.set_lang("id")

def get_rag_context(query):
    try:
        # Hapus tahun dari query jika ada agar pencarian wiki lebih akurat
        import re
        search_query = re.sub(r'\b20\d{2}\b', '', query).strip()
        
        results = wikipedia.search(search_query, results=1)
        if not results:
            print("RAG: Tidak ada hasil ditemukan di Wikipedia.")
            return ""
            
        page_title = results[0]
        print(f"RAG: Mendapatkan data dari Wikipedia '{page_title}'")
        summary = wikipedia.summary(page_title, sentences=3)
        return f"- {page_title}: {summary}"
    except Exception as e:
        print(f"RAG Error: {e}")
        return ""

# ==========================================
# FRONTEND WEB UI
# ==========================================
HTML_PAGE = """
<!DOCTYPE html>
<html>
<head>
    <title>TREM-KU: Agent (Smart VAD)</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: sans-serif; padding: 20px; max-width: 600px; margin: auto; background: #f0f2f5; }
        h2 { color: #333; text-align: center; }
        .btn-container { text-align: center; margin-bottom: 20px; }
        button { padding: 15px 20px; font-size: 16px; margin: 5px; cursor: pointer; border: none; border-radius: 8px; color: white; font-weight: bold; }
        #recordBtn { background-color: #ef4444; width: 100%; padding: 20px; font-size: 18px; transition: background-color 0.3s; }
        .chat-box { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-bottom: 20px; }
        .role { font-weight: bold; color: #0066cc; margin-top: 10px; }
        .text { margin-bottom: 15px; font-size: 16px; color: #333; white-space: pre-wrap; min-height: 20px;}
        #status { text-align: center; font-weight: bold; color: #555; margin-bottom: 15px; font-size: 1.1em; }
        #status { text-align: center; font-weight: bold; color: #555; margin-bottom: 15px; font-size: 1.1em; }
    </style>
</head>
<body>
    <h2>🚄 TREM-KU Agent (Hands-Free)</h2>
    
    <div class="btn-container" id="controlPanel">
        <button id="recordBtn">Mulai Rekam 🔴</button>
        <p style="font-size: 12px; color: #666;">Tekan untuk mulai merekam, lalu tekan lagi untuk mengirim pertanyaan.</p>
    </div>

    <div id="status">Status: Menunggu aktivasi...</div>

    <div class="chat-box">
        <div class="role">🗣️ Penumpang:</div>
        <div class="text" id="userText">-</div>
        <div class="role">🤖 DINUS:</div>
        <div class="text" id="dinusText">-</div>
    </div>
    
    <audio id="audioPlayer" style="display: none;"></audio>

    <script>
        let ws;
        let audioQueue = []; 
        let isAIPlaying = false;
        const audioPlayer = document.getElementById('audioPlayer');

        // Variabel WebAudio
        let mediaRecorder;
        let audioChunks = [];
        let isUserSpeaking = false;

        // Logika Antrean Audio AI
        function playNextAudio() {
            if (audioQueue.length === 0) { isAIPlaying = false; return; }
            isAIPlaying = true;
            let audioSrc = audioQueue.shift();
            audioPlayer.src = audioSrc;
            audioPlayer.play().catch(e => console.log("Autoplay dicegah browser"));
            audioPlayer.onended = playNextAudio;
        }

        function connectWebSocket() {
            const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            ws = new WebSocket(`${wsProtocol}//${location.host}/ws/talk`);
            ws.onopen = () => document.getElementById('status').innerText = "Status: Server Terhubung! 🟢";
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "stt") {
                    document.getElementById('userText').innerText = data.text;
                    document.getElementById('dinusText').innerText = "";
                    document.getElementById('status').innerText = "Status: DINUS Berpikir... 🤔";
                } else if (data.type === "token") {
                    document.getElementById('dinusText').textContent += data.text;
                    document.getElementById('status').innerText = "Status: DINUS Berbicara... 🔊";
                } else if (data.type === "audio") {
                    audioQueue.push("data:audio/mpeg;base64," + data.data);
                    if (!isAIPlaying && !isUserSpeaking) playNextAudio(); // Jangan putar jika user sedang motong pembicaraan
                } else if (data.type === "done") {
                    if(!isUserSpeaking) document.getElementById('status').innerText = "Status: Menunggu pertanyaan... 🎧";
                }
            };
            ws.onclose = () => setTimeout(connectWebSocket, 2000);
        }

        // Setup Mikrofon (Push to Talk)
        document.getElementById('recordBtn').onclick = async () => {
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                connectWebSocket();
            }

            if (!mediaRecorder) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
                mediaRecorder.onstop = () => {
                    if (audioChunks.length > 0) {
                        ws.send(new Blob(audioChunks, { type: 'audio/wav' }));
                        document.getElementById('status').innerText = "Status: Mengirim & Menganalisa suara... 🚀";
                    }
                };
            }

            if (!isUserSpeaking) {
                // Mulai rekam
                audioChunks = [];
                mediaRecorder.start();
                isUserSpeaking = true;
                
                document.getElementById('recordBtn').innerText = "Hentikan & Kirim 📤";
                document.getElementById('recordBtn').style.backgroundColor = "#3b82f6";
                document.getElementById('status').innerText = "Status: Merekam pertanyaan Anda... 🔴";
                
                if (isAIPlaying) {
                    audioPlayer.pause();
                    audioQueue = [];
                    isAIPlaying = false;
                    document.getElementById('dinusText').innerText += " [TERPOTONG]";
                }
            } else {
                // Berhenti dan kirim
                mediaRecorder.stop();
                isUserSpeaking = false;
                
                document.getElementById('recordBtn').innerText = "Mulai Rekam 🔴";
                document.getElementById('recordBtn').style.backgroundColor = "#ef4444";
            }
        };
    </script>
</body>
</html>
"""

@app.get("/")
def get_homepage():
    return HTMLResponse(content=HTML_PAGE)

# ==========================================
# WEBSOCKET STREAMING + MMS-TTS
# ==========================================
@app.websocket("/ws/talk")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            
            with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as tmp_in:
                tmp_in.write(audio_bytes)
                input_audio_path = tmp_in.name

            # Transkripsi STT (Faster-Whisper)
            segments, _ = stt_model.transcribe(input_audio_path, language="id", beam_size=5)
            user_text = " ".join([segment.text for segment in segments])
            os.remove(input_audio_path)
            await websocket.send_text(json.dumps({"type": "stt", "text": user_text}))

            import datetime
            import asyncio
            current_year = datetime.datetime.now().year
            query_with_year = f"{user_text} {current_year}"
            
            # --- GENERATE & KIRIM SUARA TUNGGU (FILLER) ---
            fillers = [
                "Hmm, sebentar ya, saya cari informasinya.",
                "Tunggu sebentar ya Pak, saya cek dulu.",
                "Beri saya waktu sejenak untuk memastikannya.",
                "Baik, mari saya periksa informasinya sebentar."
            ]
            filler_text = random.choice(fillers)
            try:
                fd_filler, filler_path = tempfile.mkstemp(suffix=".mp3")
                os.close(fd_filler)
                communicate = edge_tts.Communicate(filler_text, "id-ID-GadisNeural")
                await communicate.save(filler_path)
                with open(filler_path, "rb") as f:
                    encoded_filler = base64.b64encode(f.read()).decode('utf-8')
                await websocket.send_text(json.dumps({"type": "audio", "data": encoded_filler}))
                os.remove(filler_path)
            except Exception as e:
                print(f"Gagal generate filler: {e}")
            # ----------------------------------------------

            print(f"Mencari konteks RAG untuk: {query_with_year}")
            
            try:
                print("Menunggu respons dari Wikipedia (Tidak ada batas waktu)...")
                rag_context = await asyncio.to_thread(get_rag_context, query_with_year)
            except Exception as e:
                print(f"RAG Error: {e}")
                rag_context = ""

            base_system_prompt = (
                "Kamu adalah DINUS, asisten AI pariwisata di TREM-KU (Trem Kota Lama Semarang). "
                "Jawab singkat maksimal 2 kalimat. Gunakan bahasa Indonesia baku dan ramah. "
                "ATURAN MUTLAK: Kamu HANYA BOLEH menjawab pertanyaan seputar Kota Lama Semarang, Semarang, wisata Trem, atau UDINUS. "
                "Jika pengguna bertanya di luar topik tersebut, tolak dengan sopan dan ingatkan bahwa kamu hanya asisten wisata Trem Kota Lama."
            )
            
            # --- QDRANT MEMORY RETRIEVAL ---
            qdrant_context = ""
            if qdrant:
                try:
                    user_emb = get_embedding(user_text)
                    if user_emb:
                        search_res = qdrant.query_points(
                            collection_name="dinus_memory",
                            query=user_emb,
                            limit=3
                        ).points
                        memories = [f"- {hit.payload['text']}" for hit in search_res if hit.score > 0.5]
                        if memories:
                            qdrant_context = "Memori percakapan sebelumnya (Konteks jangka panjang):\n" + "\n".join(memories)
                            print("Qdrant: Memori historis ditemukan.")
                except Exception as e:
                    print(f"Qdrant Search Error: {e}")
            # -------------------------------

            if rag_context or qdrant_context:
                system_prompt = f"{base_system_prompt}\n\nBerikut adalah info konteks tambahan:\n{rag_context}\n\n{qdrant_context}\n\nGunakan informasi di atas jika relevan untuk menjawab."
            else:
                system_prompt = base_system_prompt
            
            client_id = id(websocket)
            if client_id not in chat_histories:
                chat_histories[client_id] = []
            
            chat_histories[client_id].append({"role": "user", "content": user_text})
            
            # Batasi history maksimal 10 interaksi (20 pesan)
            if len(chat_histories[client_id]) > 20:
                chat_histories[client_id] = chat_histories[client_id][-20:]
            
            messages = [{"role": "system", "content": system_prompt}] + chat_histories[client_id]

            # 2. Minta Jawaban dari Ollama (Streaming)
            stream_payload = {
                "model": OLLAMA_MODEL,
                "messages": messages,
                "stream": True
            }

            print(f"Mengirim request ke Ollama (Model: {OLLAMA_MODEL})... (Ini mungkin memakan waktu ~1 menit jika model baru pertama kali dimuat ke VRAM)")
            try:
                stream_response = requests.post(VLLM_URL, json=stream_payload, stream=True, timeout=120)
                print(f"Koneksi Ollama berhasil! Status: {stream_response.status_code}")
            except Exception as e:
                print(f"Ollama Request Error: {e}")
                await websocket.send_text(json.dumps({"type": "token", "text": "Maaf, Ollama tidak merespons atau sedang memuat model. Harap tunggu dan coba lagi."}))
                await websocket.send_text(json.dumps({"type": "done"}))
                return
            sentence_buffer = ""
            full_assistant_reply = ""
            chunk_index = 0
            
            if stream_response.status_code != 200:
                print(f"Error Gemini API ({stream_response.status_code}): {stream_response.text}")
                error_msg = f"Maaf, sepertinya ada masalah pada API Gemini. Kode error: {stream_response.status_code}."
                if stream_response.status_code == 429:
                    error_msg = "Maaf, API Key Gemini Anda telah melebihi batas kuota. Silakan periksa tagihan Anda atau gunakan model lokal kembali."
                
                await websocket.send_text(json.dumps({"type": "token", "text": error_msg}))
                # putar TTS error
                output_file = f"edge_chunk_error.mp3"
                communicate = edge_tts.Communicate(error_msg, "id-ID-GadisNeural")
                await communicate.save(output_file)
                with open(output_file, "rb") as f:
                    encoded_audio = base64.b64encode(f.read()).decode('utf-8')
                await websocket.send_text(json.dumps({"type": "audio", "data": encoded_audio}))
                os.remove(output_file)
                await websocket.send_text(json.dumps({"type": "done"}))
                return

            # 3. Tangkap per Kalimat dan Generate Audio dengan MMS-TTS
            for line in stream_response.iter_lines():
                if line:
                    decoded_line = line.decode('utf-8')
                    if decoded_line.startswith("data: ") and "[DONE]" not in decoded_line:
                        try:
                            data_json = json.loads(decoded_line[6:])
                            if "choices" in data_json and len(data_json["choices"]) > 0:
                                token = data_json["choices"][0].get("delta", {}).get("content", "")
                                if token:
                                    sentence_buffer += token
                                    full_assistant_reply += token
                                    await websocket.send_text(json.dumps({"type": "token", "text": token}))

                            # Deteksi akhir kalimat untuk langsung disuarakan
                            if any(p in token for p in ['.', '!', '?', '\n']):
                                chunk_text = sentence_buffer.strip()
                                sentence_buffer = ""
                                
                                if len(chunk_text) > 2:
                                    print(f"-> Memproses Edge TTS: {chunk_text}")
                                    
                                    # Eksekusi Edge TTS
                                    output_file = f"edge_chunk_{chunk_index}.mp3"
                                    communicate = edge_tts.Communicate(chunk_text, "id-ID-GadisNeural", rate="+15%")
                                    await communicate.save(output_file)
                                    
                                    # Kirim Audio ke Web
                                    with open(output_file, "rb") as f:
                                        encoded_audio = base64.b64encode(f.read()).decode('utf-8')
                                    await websocket.send_text(json.dumps({"type": "audio", "data": encoded_audio}))
                                    
                                    os.remove(output_file)
                                    chunk_index += 1
                        except Exception as e:
                            pass
            
            # Sisa kalimat yang tidak memiliki tanda baca di akhir
            if len(sentence_buffer.strip()) > 2:
                chunk_text = sentence_buffer.strip()
                output_file = f"edge_chunk_{chunk_index}.mp3"
                communicate = edge_tts.Communicate(chunk_text, "id-ID-GadisNeural", rate="+15%")
                await communicate.save(output_file)
                with open(output_file, "rb") as f:
                    encoded_audio = base64.b64encode(f.read()).decode('utf-8')
                await websocket.send_text(json.dumps({"type": "audio", "data": encoded_audio}))
                os.remove(output_file)

            if full_assistant_reply.strip():
                chat_histories[client_id].append({"role": "assistant", "content": full_assistant_reply.strip()})
                
                # --- SIMPAN KE QDRANT ---
                if qdrant:
                    try:
                        interaction = f"User: {user_text}\nDINUS: {full_assistant_reply.strip()}"
                        emb = get_embedding(interaction)
                        if emb:
                            qdrant.upsert(
                                collection_name="dinus_memory",
                                points=[PointStruct(id=str(uuid.uuid4()), vector=emb, payload={"text": interaction})]
                            )
                            print("Qdrant: Memori baru berhasil disimpan.")
                    except Exception as e:
                        print(f"Qdrant Save Error: {e}")
                # ------------------------

            await websocket.send_text(json.dumps({"type": "done"}))

    except WebSocketDisconnect:
        pass