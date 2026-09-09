import os
import requests
import json

GEMINI_API_KEY = "AQ.Ab8RN6Jhuhr7lGQyWfxVUQu9nTPeWG0pX5HpeSqogrip9gqCow"
VLLM_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key={GEMINI_API_KEY}"

stream_payload = {
    "contents": [{"role": "user", "parts": [{"text": "Halo"}]}],
    "systemInstruction": {
        "parts": [{"text": "Kamu adalah DINUS"}]
    },
    "tools": [{"googleSearch": {}}]
}
resp = requests.post(VLLM_URL, json=stream_payload)
print("Status:", resp.status_code)
print("Body:", resp.text[:500])
