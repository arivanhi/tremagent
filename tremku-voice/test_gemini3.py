import requests
import json
GEMINI_API_KEY = "AQ.Ab8RN6Jhuhr7lGQyWfxVUQu9nTPeWG0pX5HpeSqogrip9gqCow"
VLLM_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"
stream_payload = {
    "contents": [{"role": "user", "parts": [{"text": "Halo, siapa presiden indonesia?"}]}],
    "systemInstruction": {"parts": [{"text": "Kamu adalah DINUS"}]},
    "tools": [{"googleSearch": {}}]
}
resp = requests.post(VLLM_URL, json=stream_payload, timeout=10)
print("Status:", resp.status_code)
print("Body:", resp.text[:500])
