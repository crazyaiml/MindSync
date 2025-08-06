# Use official Python runtime as base image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (for building frontend)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# Copy the entire project
COPY . .

# Install Python dependencies
WORKDIR /app/meeting-summarizer-app/backend
RUN pip install --no-cache-dir -r requirements.txt

# Build frontend
WORKDIR /app/meeting-summarizer-app/frontend
RUN npm ci --only=production && npm run build

# Create a startup script
WORKDIR /app
RUN echo '#!/bin/bash\n\
# Start backend in background\n\
cd /app/meeting-summarizer-app/backend\n\
python run_server.py &\n\
BACKEND_PID=$!\n\
echo "Backend started with PID: $BACKEND_PID"\n\
\n\
# Start frontend\n\
cd /app/meeting-summarizer-app/frontend\n\
npm run preview -- --host 0.0.0.0 --port 5173 &\n\
FRONTEND_PID=$!\n\
echo "Frontend started with PID: $FRONTEND_PID"\n\
\n\
# Wait for both processes\n\
wait $BACKEND_PID $FRONTEND_PID\n\
' > start_services.sh && chmod +x start_services.sh

# Expose ports
EXPOSE 8000 5173

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/docs || exit 1

# Start services
CMD ["./start_services.sh"]
