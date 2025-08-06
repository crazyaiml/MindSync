#!/bin/bash

# MindSync Meeting Summarizer - Development Monitor
# This script monitors the services and provides useful development commands

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
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

print_header() {
    echo -e "${CYAN}$1${NC}"
}

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
LOGS_DIR="$PROJECT_ROOT/logs"

show_help() {
    print_header "MindSync Meeting Summarizer - Development Monitor"
    echo ""
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  status      Show status of backend and frontend services"
    echo "  logs        Show recent logs from both services"
    echo "  tail        Follow logs in real-time"
    echo "  restart     Restart both services"
    echo "  test        Run basic connectivity tests"
    echo "  clean       Clean logs and temporary files"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 logs"
    echo "  $0 tail"
    echo "  $0 restart"
}

show_status() {
    print_header "🔍 Service Status"
    echo ""
    
    # Check backend
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_success "✅ Backend is running on port 8000"
        if [ -f "$LOGS_DIR/backend.pid" ]; then
            local pid=$(cat "$LOGS_DIR/backend.pid")
            echo "   PID: $pid"
        fi
    else
        print_error "❌ Backend is not running on port 8000"
    fi
    
    # Check frontend
    if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_success "✅ Frontend is running on port 5173"
        if [ -f "$LOGS_DIR/frontend.pid" ]; then
            local pid=$(cat "$LOGS_DIR/frontend.pid")
            echo "   PID: $pid"
        fi
    else
        print_error "❌ Frontend is not running on port 5173"
    fi
    
    echo ""
    print_header "🌐 URLs"
    echo "Frontend UI: http://localhost:5173"
    echo "Backend API: http://127.0.0.1:8000"
    echo "API Docs:    http://127.0.0.1:8000/docs"
    
    # Show startup info if available
    if [ -f "$LOGS_DIR/startup_info.txt" ]; then
        echo ""
        print_header "📋 Last Startup"
        head -2 "$LOGS_DIR/startup_info.txt"
    fi
}

show_logs() {
    print_header "📝 Recent Logs"
    echo ""
    
    if [ -f "$LOGS_DIR/backend.log" ]; then
        print_status "Backend logs (last 20 lines):"
        tail -20 "$LOGS_DIR/backend.log"
        echo ""
    else
        print_warning "Backend log file not found"
    fi
    
    if [ -f "$LOGS_DIR/frontend.log" ]; then
        print_status "Frontend logs (last 20 lines):"
        tail -20 "$LOGS_DIR/frontend.log"
        echo ""
    else
        print_warning "Frontend log file not found"
    fi
}

tail_logs() {
    print_header "📡 Following Logs (Press Ctrl+C to stop)"
    echo ""
    
    if [ -f "$LOGS_DIR/backend.log" ] && [ -f "$LOGS_DIR/frontend.log" ]; then
        tail -f "$LOGS_DIR/backend.log" "$LOGS_DIR/frontend.log"
    elif [ -f "$LOGS_DIR/backend.log" ]; then
        print_warning "Frontend log not found, showing backend only"
        tail -f "$LOGS_DIR/backend.log"
    elif [ -f "$LOGS_DIR/frontend.log" ]; then
        print_warning "Backend log not found, showing frontend only"
        tail -f "$LOGS_DIR/frontend.log"
    else
        print_error "No log files found"
    fi
}

restart_services() {
    print_header "🔄 Restarting Services"
    echo ""
    
    print_status "Stopping services..."
    "$PROJECT_ROOT/stop.sh"
    
    sleep 2
    
    print_status "Starting services..."
    "$PROJECT_ROOT/start.sh"
}

run_tests() {
    print_header "🧪 Running Connectivity Tests"
    echo ""
    
    # Test backend
    print_status "Testing backend API..."
    if curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/docs | grep -q "200"; then
        print_success "✅ Backend API is responding"
    else
        print_error "❌ Backend API is not responding"
    fi
    
    # Test frontend
    print_status "Testing frontend..."
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 | grep -q "200"; then
        print_success "✅ Frontend is responding"
    else
        print_error "❌ Frontend is not responding"
    fi
    
    # Test specific backend endpoints
    print_status "Testing specific endpoints..."
    
    # Voice status
    if curl -s http://127.0.0.1:8000/api/tts/voice-status >/dev/null 2>&1; then
        print_success "✅ Voice TTS endpoint is working"
    else
        print_warning "⚠️  Voice TTS endpoint may have issues"
    fi
    
    # Meetings endpoint
    if curl -s http://127.0.0.1:8000/api/meetings/ >/dev/null 2>&1; then
        print_success "✅ Meetings endpoint is working"
    else
        print_warning "⚠️  Meetings endpoint may have issues"
    fi
}

clean_files() {
    print_header "🧹 Cleaning Files"
    echo ""
    
    if [ -d "$LOGS_DIR" ]; then
        print_status "Cleaning log files..."
        rm -rf "$LOGS_DIR"
        print_success "Log files cleaned"
    fi
    
    # Clean Python cache
    print_status "Cleaning Python cache..."
    find "$PROJECT_ROOT" -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
    find "$PROJECT_ROOT" -name "*.pyc" -delete 2>/dev/null || true
    print_success "Python cache cleaned"
    
    # Clean Node.js cache (optional)
    if [ -d "$PROJECT_ROOT/meeting-summarizer-app/frontend/node_modules/.cache" ]; then
        print_status "Cleaning Node.js cache..."
        rm -rf "$PROJECT_ROOT/meeting-summarizer-app/frontend/node_modules/.cache"
        print_success "Node.js cache cleaned"
    fi
}

# Main script logic
case "${1:-help}" in
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "tail")
        tail_logs
        ;;
    "restart")
        restart_services
        ;;
    "test")
        run_tests
        ;;
    "clean")
        clean_files
        ;;
    "help"|"--help"|"-h")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
