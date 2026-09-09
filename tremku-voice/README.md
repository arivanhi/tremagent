# Tremku Voice

Tremku Voice is a voice application integrating various language and speech models.

## Technologies Used
- **FastAPI**: For handling web endpoints and websockets.
- **Faster Whisper**: For fast speech-to-text processing.
- **Transformers (VitsModel)**: For text-to-speech generation.
- **Qdrant**: For vector search capabilities.

## Setup

1. Create a virtual environment.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the application:
   ```bash
   uvicorn app:app --host 0.0.0.0 --port 8000
   ```
