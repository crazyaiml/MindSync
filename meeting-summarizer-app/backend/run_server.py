#!/Users/bhanu/MyCode/MindSync/MindSync2.0/meeting-summarizer-app/backend/venv311/bin/python
"""
Simple runner script for the FastAPI application.
Uses Python 3.11 for Coqui TTS compatibility.
"""
import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import and run the app
if __name__ == "__main__":
    import uvicorn
    
    # Load settings
    from config import settings
    
    print(f"Starting Meeting Summarizer API with Python {sys.version}")
    print(f"Whisper model: {settings.WHISPER_MODEL}")
    print(f"Ollama host: {settings.OLLAMA_HOST}")
    print(f"Ollama model: {settings.OLLAMA_MODEL}")
    
    # Run the server with proper import string to fix the warning
    uvicorn.run(
        "app.main:app",  # Use import string instead of importing the app directly
        host=settings.API_HOST, 
        port=settings.API_PORT,
        reload=True,
        reload_dirs=["app"]  # Only watch the app directory for changes
    )
