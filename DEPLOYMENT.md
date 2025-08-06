# MindSync 2.0 - Deployment Guide

> 📖 **For complete setup instructions and usage guide, see the main [README.md](README.md)**

This document provides detailed deployment configurations and advanced deployment scenarios for MindSync 2.0.

## Quick Start

```bash
# One-command deployment
chmod +x start.sh stop.sh dev.sh
./start.sh
```

### Access Points
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs

## Deployment Options

### 3. Stop Services
```bash
# Stop all services
./stop.sh

# Stop and clean logs
./stop.sh --clean-logs
```

## Docker Deployment

### Build and Run with Docker Compose (Recommended)
```bash
# Build and start services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Build and Run with Docker
```bash
# Build the image
docker build -t mindsync-app .

# Run the container
docker run -d \
  --name mindsync \
  -p 8000:8000 \
  -p 5173:5173 \
  -v $(pwd)/uploads:/app/uploads \
  -v $(pwd)/logs:/app/logs \
  -v $(pwd)/vosk-model:/app/vosk-model \
  mindsync-app
```

## Systemd Service (Production)

### Create systemd service file
```bash
sudo cp mindsync.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mindsync
sudo systemctl start mindsync
```

### Manage the service
```bash
# Start service
sudo systemctl start mindsync

# Stop service
sudo systemctl stop mindsync

# Check status
sudo systemctl status mindsync

# View logs
journalctl -u mindsync -f
```

## Environment Variables

You can customize the deployment with these environment variables:

```bash
# Backend Configuration
BACKEND_HOST=127.0.0.1
BACKEND_PORT=8000
PYTHONPATH=/path/to/backend

# Frontend Configuration
FRONTEND_HOST=localhost
FRONTEND_PORT=5173

# External Services
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama2:latest
```

## File Structure

```
MindSync2.0/
├── start.sh                 # Start script for local development
├── stop.sh                  # Stop script for local development
├── Dockerfile               # Docker container configuration
├── docker-compose.yml       # Docker Compose configuration
├── mindsync.service         # Systemd service file
├── logs/                    # Application logs (created automatically)
│   ├── backend.log
│   ├── frontend.log
│   ├── backend.pid
│   ├── frontend.pid
│   └── startup_info.txt
└── meeting-summarizer-app/
    ├── backend/
    └── frontend/
```

## Troubleshooting

### Common Issues

1. **Port already in use**
   ```bash
   ./start.sh --kill-existing
   ```

2. **Python virtual environment not found**
   ```bash
   cd meeting-summarizer-app/backend
   python3 -m venv venv311
   source venv311/bin/activate
   pip install -r requirements.txt
   ```

3. **Node modules not installed**
   ```bash
   cd meeting-summarizer-app/frontend
   npm install
   ```

4. **VOSK model not found**
   - Download the VOSK model and place it in the `vosk-model/` directory
   - Ensure the model path is correctly configured in the backend

### View Logs
```bash
# Backend logs
tail -f logs/backend.log

# Frontend logs
tail -f logs/frontend.log

# Both logs simultaneously
tail -f logs/*.log
```

### Check Running Processes
```bash
# Check if services are running
ps aux | grep -E "(python.*run_server|npm.*dev)"

# Check port usage
lsof -i :8000  # Backend
lsof -i :5173  # Frontend
```

## Production Deployment Notes

1. **Security**: Configure firewall rules and reverse proxy (nginx/Apache)
2. **SSL/TLS**: Use HTTPS in production with proper certificates
3. **Database**: Consider using PostgreSQL instead of SQLite for production
4. **Monitoring**: Set up monitoring and alerting for the services
5. **Backups**: Implement regular backups of the database and uploaded files
6. **Performance**: Consider using a production WSGI server like Gunicorn for the backend

## Updates and Maintenance

### Update the application
```bash
# Stop services
./stop.sh

# Pull latest changes
git pull

# Restart services
./start.sh
```

### Clean up
```bash
# Remove old logs
./stop.sh --clean-logs

# Clean Docker images (if using Docker)
docker system prune -a
```
