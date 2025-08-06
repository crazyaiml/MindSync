# MindSync 2.0 🧠✨

**Real-time AI-powered meeting transcription and smart assistance platform**

MindSync 2.0 is an intelligent meeting assistant that provides real-time transcription, smart suggestions, and comprehensive meeting management with voice cloning capabilities.

## 🚀 Features

### Core Capabilities
- **Real-time Transcription**: Live audio-to-text using VOSK and Whisper AI
- **AI Assistant Mode**: Intelligent suggestions and responses during meetings
- **Voice Cloning**: Personalized TTS with voice synthesis
- **Meeting Management**: Complete CRUD operations for meeting records
- **Chat Interface**: Interactive AI-powered conversation
- **Multi-format Audio**: Support for various audio formats and real-time streaming

### Technical Highlights
- **Dual Transcription Engine**: VOSK for real-time + Whisper for accuracy
- **WebSocket Communication**: Real-time bidirectional data flow
- **Vector Search**: Semantic search across meeting content
- **Pronunciation Training**: Interactive pronunciation coaching
- **REST API**: Comprehensive backend API with FastAPI
- **Modern Frontend**: React with TypeScript and Vite

## 📋 Prerequisites

### System Requirements
- **Python**: 3.11+ (for backend)
- **Node.js**: 18+ (for frontend)
- **FFmpeg**: For audio processing
- **Ollama**: For local LLM support (optional)

### Platform Support
- macOS (tested)
- Linux (Docker recommended)
- Windows (Docker recommended)

## 🛠️ Quick Start

### Option 1: One-Command Deployment (Recommended)
```bash
# Clone the repository
git clone <repository-url>
cd MindSync2.0

# Make scripts executable
chmod +x start.sh stop.sh dev.sh

# Start everything in background
./start.sh
```

### Option 2: Docker Deployment
```bash
# Using Docker Compose
docker-compose up -d

# Check status
docker-compose ps
```

### Option 3: Manual Development Setup
```bash
# Backend setup
cd meeting-summarizer-app/backend
python -m venv venv311
source venv311/bin/activate  # On Windows: venv311\Scripts\activate
pip install -r requirements.txt

# Frontend setup
cd ../frontend
npm install

# Run backend (Terminal 1)
cd meeting-summarizer-app/backend
python run_server.py

# Run frontend (Terminal 2)
cd meeting-summarizer-app/frontend
npm run dev
```

## 🎯 Usage

### Accessing the Application
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs

### Key Features Walkthrough

#### 1. Real-time Transcription
1. Click "Start Recording" on the main interface
2. Speak into your microphone
3. See live transcription appear in real-time
4. AI suggestions will appear automatically

#### 2. Meeting Management
- **Create**: Upload audio files or start live recording
- **View**: Browse all meetings with search and filters
- **Edit**: Update meeting details and transcriptions
- **Delete**: Remove meetings and associated data

#### 3. Voice Cloning
1. Navigate to TTS section
2. Upload reference audio (your voice)
3. Enter text to synthesize
4. Generate personalized speech

#### 4. Chat Interface
- Ask questions about meeting content
- Get AI-powered insights and summaries
- Interactive conversation with context awareness

## 🔧 Management Commands

### Service Management
```bash
# Start services in background
./start.sh

# Stop all services
./stop.sh

# Development toolkit
./dev.sh status    # Check service status
./dev.sh logs      # View real-time logs
./dev.sh test      # Test API endpoints
./dev.sh clean     # Clean up logs and PIDs
```

### Docker Management
```bash
# Start with Docker
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild containers
docker-compose up --build -d
```

### Production Deployment
```bash
# Install as system service (Linux/macOS)
sudo cp mindsync.service /etc/systemd/system/
sudo systemctl enable mindsync
sudo systemctl start mindsync

# Check service status
sudo systemctl status mindsync
```

## 📁 Project Structure

```
MindSync2.0/
├── README.md                          # This file
├── DEPLOYMENT.md                      # Detailed deployment guide
├── docker-compose.yml                # Docker orchestration
├── Dockerfile                        # Container definition
├── start.sh                         # Main startup script
├── stop.sh                          # Shutdown script
├── dev.sh                           # Development toolkit
├── mindsync.service                 # Systemd service
├── meeting-summarizer-app/
│   ├── backend/                     # FastAPI backend
│   │   ├── app/
│   │   │   ├── main.py             # FastAPI application
│   │   │   ├── models/             # Database models
│   │   │   ├── routers/            # API endpoints
│   │   │   ├── services/           # Business logic
│   │   │   └── utils/              # Utility functions
│   │   ├── config.py               # Configuration
│   │   ├── requirements.txt        # Python dependencies
│   │   └── run_server.py           # Server entry point
│   ├── frontend/                   # React frontend
│   │   ├── src/
│   │   │   ├── App.tsx            # Main application
│   │   │   ├── components/        # React components
│   │   │   └── assets/           # Static assets
│   │   ├── package.json           # Node dependencies
│   │   └── vite.config.ts         # Vite configuration
│   └── vosk-model/                # Speech recognition model
└── uploads/                       # User uploaded files
```

## 🔌 API Endpoints

### Core Endpoints
- `GET /docs` - API documentation
- `POST /upload-audio` - Upload audio for transcription
- `GET /meetings` - List all meetings
- `POST /meetings` - Create new meeting
- `WebSocket /ws/real-time-transcribe` - Real-time transcription

### Specialized Endpoints
- `POST /chat` - AI chat interface
- `POST /tts/synthesize` - Text-to-speech synthesis
- `POST /pronunciation/score` - Pronunciation scoring
- `GET /audio/{filename}` - Serve audio files

## 🛡️ Configuration

### Environment Variables
```bash
# Backend Configuration
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
DATABASE_URL=sqlite:///uploads/meetings.db

# Frontend Configuration
FRONTEND_HOST=localhost
FRONTEND_PORT=3000

# AI Configuration
OLLAMA_BASE_URL=http://localhost:11434
LLM_MODEL=llama3.2:latest
```

### Audio Configuration
- **Sample Rate**: 16kHz (VOSK), 16kHz (Whisper)
- **Channels**: Mono
- **Format**: PCM, WAV, MP3, WebM supported
- **Chunk Size**: 1024 bytes for real-time processing

## 🐛 Troubleshooting

### Common Issues

#### Services Won't Start
```bash
# Check port availability
./dev.sh test

# View detailed logs
./dev.sh logs

# Clean up and restart
./dev.sh clean
./start.sh
```

#### Audio Issues
- Ensure microphone permissions are granted
- Check browser audio settings
- Verify FFmpeg installation: `ffmpeg -version`

#### Docker Issues
```bash
# Rebuild containers
docker-compose down
docker-compose up --build -d

# Check container logs
docker-compose logs backend
docker-compose logs frontend
```

#### WebSocket Connection Problems
- Check firewall settings
- Verify backend is running on port 8000
- Test with: `curl http://localhost:8000/docs`

### Performance Optimization
- Use Docker for consistent performance
- Ensure adequate RAM (4GB+ recommended)
- SSD storage recommended for large audio files
- Close unnecessary browser tabs during recording

## 🤝 Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make changes and test thoroughly
4. Run the test suite: `./dev.sh test`
5. Submit a pull request

### Code Standards
- Python: Follow PEP 8, use type hints
- TypeScript: Use strict mode, proper typing
- Git: Conventional commit messages
- Testing: Maintain test coverage > 80%

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **VOSK**: Open-source speech recognition
- **OpenAI Whisper**: Advanced transcription accuracy
- **FastAPI**: Modern Python web framework
- **React**: Frontend user interface
- **TTS (Text-to-Speech)**: Voice synthesis capabilities

## 📞 Support

### Documentation
- **Deployment Guide**: See `DEPLOYMENT.md`
- **API Reference**: http://localhost:8000/docs
- **Development Tools**: Use `./dev.sh` for common tasks

### Getting Help
1. Check the troubleshooting section above
2. Review logs with `./dev.sh logs`
3. Test connectivity with `./dev.sh test`
4. Create an issue with detailed error information

---

**Built with ❤️ for seamless meeting experiences**
