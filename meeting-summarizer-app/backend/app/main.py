from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import os
import sys
import aiofiles
from pathlib import Path

# Set environment variables to suppress warnings and improve performance
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["TRANSFORMERS_VERBOSITY"] = "error"
import warnings
warnings.filterwarnings("ignore", message="FP16 is not supported on CPU")
warnings.filterwarnings("ignore", message="The current process just got forked")

# Add the parent directory to Python path to allow imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.routers import audio, meetings, real_time, pronunciation, chat, tts
from app.services.whisper_client import WhisperClient
from app.services.ollama_client import OllamaClient
from app.services.summarizer import MeetingSummarizer
from config import settings

# Create upload directory
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="Meeting Summarizer API", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize services
whisper_client = WhisperClient()
ollama_client = OllamaClient()
summarizer = MeetingSummarizer(whisper_client, ollama_client)

# Include routers
app.include_router(audio.router, prefix="/api/audio", tags=["audio"])
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(real_time.router, prefix="/api/real-time", tags=["real-time"])
app.include_router(pronunciation.router, prefix="/api", tags=["pronunciation"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(tts.router, prefix="/api/tts", tags=["tts"])

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    try:
        from app.services.vector_store import vector_store
        from app.services.pronunciation_corrector import pronunciation_corrector
        from app.database import get_db
        
        # Get database session
        db = next(get_db())
        
        # Rebuild index if it's empty
        if len(vector_store.chunks) == 0:
            vector_store.rebuild_index(db)
        
        # Load pronunciation corrections
        pronunciation_corrector.load_corrections_from_db(db)
        
        print("Vector store and pronunciation corrector initialized successfully")
    except Exception as e:
        print(f"Warning: Could not initialize services: {e}")

@app.get("/")
async def root():
    return {"message": "Meeting Summarizer API", "status": "running"}

@app.get("/health")
async def health_check():
    return {"status": "healthy", "whisper": "ready", "ollama": "ready"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=settings.API_HOST, port=settings.API_PORT)
