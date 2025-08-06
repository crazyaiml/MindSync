# Meeting Summarizer Backend

A FastAPI-based backend for meeting transcription and summarization using Whisper and Ollama.

## Features

- Audio file upload and processing
- Speech-to-text transcription using OpenAI Whisper
- Meeting summarization using local Ollama LLM
- Key points and action items extraction
- RESTful API endpoints

## Requirements

- Python 3.8+
- Ollama installed and running locally
- FFmpeg (for audio processing)

## Installation

1. **Clone and navigate to the backend directory:**
   ```bash
   cd meeting-summarizer-app/backend
   ```

2. **Create a virtual environment:**
   ```bash
   python -m venv venv
   source venv/bin/activate  # On macOS/Linux
   ```

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env file with your configurations
   ```

5. **Install and start Ollama:**
   ```bash
   # Install Ollama (if not already installed)
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Pull a model (e.g., llama2)
   ollama pull llama2
   
   # Start Ollama service
   ollama serve
   ```

## Running the Application

1. **Start the FastAPI server:**
   ```bash
   python -m app.main
   ```
   
   Or using uvicorn directly:
   ```bash
   uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

2. **Access the API:**
   - API Documentation: http://localhost:8000/docs
   - Health Check: http://localhost:8000/health

## API Endpoints

### Audio Processing
- `POST /api/audio/upload` - Upload audio file
- `POST /api/audio/transcribe/{file_id}` - Transcribe audio
- `DELETE /api/audio/file/{file_id}` - Delete audio file

### Meeting Management
- `POST /api/meetings/create` - Create new meeting with audio
- `GET /api/meetings/` - Get all meetings
- `GET /api/meetings/{meeting_id}` - Get specific meeting
- `POST /api/meetings/{meeting_id}/summarize` - Regenerate summary
- `DELETE /api/meetings/{meeting_id}` - Delete meeting

## Configuration

### Whisper Models
Available models (in order of speed vs accuracy):
- `tiny` - Fastest, least accurate
- `base` - Default, good balance
- `small` - Better accuracy
- `medium` - Even better accuracy
- `large` - Best accuracy, slowest

### Ollama Models
Popular models for summarization:
- `llama2` - Good general purpose model
- `mistral` - Fast and efficient
- `codellama` - Good for technical content

## Supported Audio Formats

- `.wav`
- `.mp3`
- `.mp4`
- `.m4a`
- `.flac`

## Development

### Project Structure
```
backend/
├── app/
│   ├── main.py              # FastAPI application
│   ├── models/              # Pydantic models
│   ├── routers/             # API route handlers
│   ├── services/            # Business logic
│   └── utils/               # Utility functions
├── uploads/                 # Uploaded audio files
├── requirements.txt         # Python dependencies
└── config.py               # Configuration settings
```

### Running Tests
```bash
# Install test dependencies
pip install pytest pytest-asyncio

# Run tests
pytest
```

## Troubleshooting

1. **Ollama Connection Issues:**
   - Ensure Ollama is running: `ollama serve`
   - Check if model is available: `ollama list`

2. **Whisper Model Loading:**
   - Models are downloaded on first use
   - Ensure sufficient disk space for model files

3. **Audio Processing:**
   - Install FFmpeg if audio conversion fails
   - Check file format compatibility

## How to run 

Front end: (cd /Users/bhanu/MyCode/MindSync/MindSync2.0/meeting-summarizer-app/frontend && npm run dev)

Backend: 
PYTHONPATH=/Users/bhanu/MyCode/MindSync/MindSync2.0/meeting-summarizer-app/backend /Users/bhanu/MyCode/MindSync/MindSync2.0/meeting-summarizer-app/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

## Performance Tips

- Use smaller Whisper models for faster processing
- Consider quantized Ollama models for better performance
- Implement file cleanup for uploaded audio files
- Use background tasks for long-running operations

