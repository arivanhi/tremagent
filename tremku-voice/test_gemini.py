import os
import requests
import json

GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
VLLM_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:streamGenerateContent?alt=sse&key={GEMINI_API_KEY}"

stream_payload = {
    "contents": [{"role": "user", "parts": [{"text": "Halo"}]}],
    "systemInstruction": {
        "parts": [{"text": "Kamu adalah DINUS"}]
    },
    "tools": [{"googleSearch": {}}]
}
print("POSTing to", VLLM_URL.split("key=")[0]+"key=***")
resp = requests.post(VLLM_URL, json=stream_payload)
print("Status:", resp.status_code)
print("Body:", resp.text[:500])
