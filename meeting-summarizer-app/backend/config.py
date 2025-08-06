import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    # API Settings
    API_HOST = os.getenv("API_HOST", "127.0.0.1")
    API_PORT = int(os.getenv("API_PORT", 8000))
    
    # Whisper Settings
    WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small.en")  # Use English-specific small model for better accuracy
    
    # Ollama Settings
    OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama2:latest")
    
    # File Upload Settings
    UPLOAD_DIR = "/Users/bhanu/MyCode/MindSync/MindSync2.0/uploads"
    MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB
    ALLOWED_EXTENSIONS = {".wav", ".mp3", ".mp4", ".m4a", ".flac", ".aiff", ".webm", ".ogg"}

settings = Settings()
