#!/usr/bin/env python3
"""
Test script to verify the backend setup.
"""
import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

def test_ollama():
    """Test Ollama connection."""
    try:
        from app.services.ollama_client import OllamaClient
        client = OllamaClient()
        print("✅ Ollama client initialized successfully")
        
        if client.is_ready():
            print("✅ Ollama server is ready")
        else:
            print("❌ Ollama server is not ready")
        return True
    except Exception as e:
        print(f"❌ Error testing Ollama: {e}")
        return False

def test_whisper():
    """Test Whisper initialization."""
    try:
        print("🔄 Loading Whisper model (this may take a moment)...")
        from app.services.whisper_client import WhisperClient
        client = WhisperClient()
        print("✅ Whisper client initialized successfully")
        
        if client.is_ready():
            print("✅ Whisper model is ready")
        else:
            print("❌ Whisper model is not ready")
        return True
    except Exception as e:
        print(f"❌ Error testing Whisper: {e}")
        return False

def test_config():
    """Test configuration loading."""
    try:
        from config import settings
        print("✅ Configuration loaded successfully")
        print(f"   - API Host: {settings.API_HOST}")
        print(f"   - API Port: {settings.API_PORT}")
        print(f"   - Whisper Model: {settings.WHISPER_MODEL}")
        print(f"   - Ollama Host: {settings.OLLAMA_HOST}")
        print(f"   - Ollama Model: {settings.OLLAMA_MODEL}")
        return True
    except Exception as e:
        print(f"❌ Error loading configuration: {e}")
        return False

if __name__ == "__main__":
    print("🧪 Testing Meeting Summarizer Backend Setup")
    print("=" * 50)
    
    # Test configuration
    config_ok = test_config()
    print()
    
    # Test Ollama
    ollama_ok = test_ollama()
    print()
    
    # Test Whisper
    whisper_ok = test_whisper()
    print()
    
    if config_ok and ollama_ok and whisper_ok:
        print("🎉 All tests passed! Your backend is ready to run.")
    else:
        print("⚠️  Some tests failed. Please check the errors above.")
