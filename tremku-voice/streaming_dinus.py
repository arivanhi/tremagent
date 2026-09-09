import os
import json
import requests
import subprocess
import threading
import torch
import torchaudio
from faster_whisper import WhisperModel
from TTS.api import TTS

# Patch PyTorch
_original_torch_load = torch.load
def _patched_torch_load(*args, **kwargs):
    if 'weights_only' not in kwargs:
        kwargs['weights_only'] = False
    return _original_torch_load(*args, **kwargs)
torch.load = _patched_torch_load

print("[1/2] Memuat STT (CPU)...")
stt_model = WhisperModel("small", device="cpu", compute_type="int8")

print("[2/2] Memuat TTS (CPU)...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to("cpu")
REFERENCE_VOICE = "sample_semarang.wav"
VLLM_URL = "http://localhost:8001/v1/chat/completions"

# Fungsi untuk memutar audio secara asinkron (tidak memblokir LLM)
def play_audio(file_path):
    subprocess.Popen(
        ["ffplay", "-nodisp", "-autoexit", file_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

def run_streaming_conversation(audio_input_path):
    print("\n[Mendengarkan...]")
    segments, _ = stt_model.transcribe(audio_input_path, language="id")
    user_text = " ".join([segment.text for segment in segments])
    print(f"🗣️ Penumpang: {user_text}")

    payload = {
        "model": "Qwen/Qwen2.5-14B-Instruct-GPTQ-Int4",
        "messages": [
            {"role": "system", "content": "Kamu adalah DINUS, AI pariwisata di TREM-KU. Jawab singkat dan ramah."},
            {"role": "user", "content": user_text}
        ],
        "max_tokens": 150,
        "stream": True # INI KUNCI RAHASIANYA: STREAMING AKTIF!
    }

    print("\n🤖 DINUS:")
    response = requests.post(VLLM_URL, json=payload, stream=True)
    
    sentence_buffer = ""
    chunk_index = 0

    for line in response.iter_lines():
        if line:
            decoded_line = line.decode('utf-8')
            if decoded_line.startswith("data: "):
                data_str = decoded_line[6:]
                if data_str == "[DONE]":
                    break
                
                try:
                    data_json = json.loads(data_str)
                    token = data_json["choices"][0]["delta"].get("content", "")
                    sentence_buffer += token
                    print(token, end="", flush=True)

                    # Jika menemukan tanda baca pemotong kalimat
                    if any(p in token for p in ['.', '!', '?']):
                        chunk_text = sentence_buffer.strip()
                        sentence_buffer = "" # Kosongkan buffer untuk kalimat berikutnya
                        
                        if len(chunk_text) > 2:
                            # Proses TTS dan mainkan HANYA potongan kalimat ini
                            output_file = f"chunk_{chunk_index}.wav"
                            tts.tts_to_file(
                                text=chunk_text,
                                speaker_wav=REFERENCE_VOICE,
                                language="es",
                                file_path=output_file,
                                verbose=False
                            )
                            # Putar suara di thread terpisah agar LLM tetap lanjut jalan!
                            threading.Thread(target=play_audio, args=(output_file,)).start()
                            chunk_index += 1

                except Exception as e:
                    pass

    print("\n[Selesai]")

# Jalankan Uji Coba (Pastikan file pertanyaan.wav ada)
if __name__ == "__main__":
    if os.path.exists("pertanyaan.wav"):
        run_streaming_conversation("pertanyaan.wav")
    else:
        print("File pertanyaan.wav tidak ditemukan!")