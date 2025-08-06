#!/bin/bash

# MindSync Meeting Summarizer - Startup Script
# This script starts both backend and frontend services

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
BACKEND_DIR="$PROJECT_ROOT/meeting-summarizer-app/backend"
FRONTEND_DIR="$PROJECT_ROOT/meeting-summarizer-app/frontend"

print_status "Starting MindSync Meeting Summarizer..."
print_status "Project root: $PROJECT_ROOT"

# Create logs directory
LOGS_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOGS_DIR"

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null ; then
        return 0  # Port is in use
    else
        return 1  # Port is free
    fi
}

# Function to kill processes on specific ports
kill_port_processes() {
    local port=$1
    local pids=$(lsof -ti:$port)
    if [ ! -z "$pids" ]; then
        print_warning "Killing existing processes on port $port"
        kill -9 $pids 2>/dev/null || true
        sleep 2
    fi
}

# Check if we should kill existing processes
if [ "$1" = "--kill-existing" ] || [ "$1" = "-k" ]; then
    print_warning "Killing existing processes on ports 8000 and 5173..."
    kill_port_processes 8000
    kill_port_processes 5173
fi

# Check if required directories exist
if [ ! -d "$BACKEND_DIR" ]; then
    print_error "Backend directory not found: $BACKEND_DIR"
    exit 1
fi

if [ ! -d "$FRONTEND_DIR" ]; then
    print_error "Frontend directory not found: $FRONTEND_DIR"
    exit 1
fi

# Check for Python virtual environment
PYTHON_VENV="$BACKEND_DIR/venv311"
if [ ! -d "$PYTHON_VENV" ]; then
    print_error "Python virtual environment not found: $PYTHON_VENV"
    print_error "Please create a virtual environment first:"
    print_error "cd $BACKEND_DIR && python3 -m venv venv311"
    exit 1
fi

# Check for Node.js
if ! command -v npm &> /dev/null; then
    print_error "npm is not installed. Please install Node.js and npm."
    exit 1
fi

# Start Backend
print_status "Starting backend server..."
if check_port 8000; then
    print_warning "Port 8000 is already in use. Backend might already be running."
    print_warning "Use --kill-existing flag to force restart"
else
    cd "$BACKEND_DIR"
    
    # Activate virtual environment and start server in background
    nohup "$PYTHON_VENV/bin/python" run_server.py > "$LOGS_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$LOGS_DIR/backend.pid"
    
    print_success "Backend started with PID: $BACKEND_PID"
    print_status "Backend logs: $LOGS_DIR/backend.log"
    
    # Wait a moment for backend to start
    sleep 3
    
    # Verify backend is running
    if ps -p $BACKEND_PID > /dev/null; then
        print_success "Backend is running on http://127.0.0.1:8000"
    else
        print_error "Backend failed to start. Check logs: $LOGS_DIR/backend.log"
        exit 1
    fi
fi

# Start Frontend
print_status "Starting frontend server..."
if check_port 5173; then
    print_warning "Port 5173 is already in use. Frontend might already be running."
    print_warning "Use --kill-existing flag to force restart"
else
    cd "$FRONTEND_DIR"
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
    fi
    
    # Start frontend in background
    nohup npm run dev > "$LOGS_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    echo $FRONTEND_PID > "$LOGS_DIR/frontend.pid"
    
    print_success "Frontend started with PID: $FRONTEND_PID"
    print_status "Frontend logs: $LOGS_DIR/frontend.log"
    
    # Wait a moment for frontend to start
    sleep 5
    
    # Verify frontend is running
    if ps -p $FRONTEND_PID > /dev/null; then
        print_success "Frontend is running on http://localhost:5173"
    else
        print_error "Frontend failed to start. Check logs: $LOGS_DIR/frontend.log"
        exit 1
    fi
fi

# Save startup info
cat > "$LOGS_DIR/startup_info.txt" << EOF
MindSync Meeting Summarizer - Startup Information
Started at: $(date)

Backend:
  URL: http://127.0.0.1:8000
  PID: $(cat $LOGS_DIR/backend.pid 2>/dev/null || echo "N/A")
  Logs: $LOGS_DIR/backend.log

Frontend:
  URL: http://localhost:5173
  PID: $(cat $LOGS_DIR/frontend.pid 2>/dev/null || echo "N/A")
  Logs: $LOGS_DIR/frontend.log

To stop services, run: ./stop.sh
To view logs: tail -f $LOGS_DIR/backend.log
              tail -f $LOGS_DIR/frontend.log
EOF

print_success "🚀 MindSync Meeting Summarizer is now running!"
echo ""
print_status "📊 Backend API: http://127.0.0.1:8000"
print_status "🌐 Frontend UI: http://localhost:5173"
echo ""
print_status "📝 Logs directory: $LOGS_DIR"
print_status "🛑 To stop services: ./stop.sh"
print_status "📋 Startup info: $LOGS_DIR/startup_info.txt"
echo ""
print_status "You can now close this terminal. Services will continue running in the background."
