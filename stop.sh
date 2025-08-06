#!/bin/bash

# MindSync Meeting Summarizer - Stop Script
# This script stops both backend and frontend services

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
LOGS_DIR="$PROJECT_ROOT/logs"

print_status "Stopping MindSync Meeting Summarizer..."

# Function to stop a service by PID
stop_service() {
    local service_name=$1
    local pid_file="$LOGS_DIR/${service_name}.pid"
    
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if ps -p $pid > /dev/null 2>&1; then
            print_status "Stopping $service_name (PID: $pid)..."
            kill -TERM $pid
            
            # Wait for graceful shutdown
            for i in {1..10}; do
                if ! ps -p $pid > /dev/null 2>&1; then
                    print_success "$service_name stopped gracefully"
                    rm -f "$pid_file"
                    return 0
                fi
                sleep 1
            done
            
            # Force kill if still running
            print_warning "Force killing $service_name..."
            kill -9 $pid 2>/dev/null || true
            rm -f "$pid_file"
            print_success "$service_name force stopped"
        else
            print_warning "$service_name PID file exists but process not running"
            rm -f "$pid_file"
        fi
    else
        print_warning "No PID file found for $service_name"
    fi
}

# Function to kill processes on specific ports
kill_port_processes() {
    local port=$1
    local service_name=$2
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ ! -z "$pids" ]; then
        print_status "Killing processes on port $port ($service_name)..."
        echo $pids | xargs kill -9 2>/dev/null || true
        print_success "Processes on port $port killed"
    fi
}

# Stop services by PID files first
stop_service "backend"
stop_service "frontend"

# Also kill any remaining processes on the ports
kill_port_processes 8000 "backend"
kill_port_processes 5173 "frontend"

# Clean up logs if requested
if [ "$1" = "--clean-logs" ] || [ "$1" = "-c" ]; then
    print_status "Cleaning up log files..."
    rm -rf "$LOGS_DIR"
    print_success "Log files cleaned"
fi

print_success "🛑 MindSync Meeting Summarizer stopped successfully!"

# Show final status
if command -v lsof &> /dev/null; then
    if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 8000 still in use"
    fi
    if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null 2>&1; then
        print_warning "Port 5173 still in use"
    fi
fi
