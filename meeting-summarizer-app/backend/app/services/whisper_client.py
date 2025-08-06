import whisper
import torch
from typing import Optional
from pathlib import Path
from config import settings

class WhisperClient:
    def __init__(self):
        self.model = None
        self.load_model()
    
    def load_model(self):
        """Load Whisper model optimized for M1 Mac"""
        try:
            # Use CPU for now due to MPS compatibility issues
            device = "cpu"
            self.model = whisper.load_model(settings.WHISPER_MODEL, device=device)
            print(f"Whisper model loaded on {device}")
        except Exception as e:
            print(f"Error loading Whisper model: {e}")
            raise
    
    async def transcribe(self, audio_file_path: str) -> dict:
        """Transcribe audio file to text"""
        try:
            print(f"[WHISPER] Starting transcription of: {audio_file_path}")
            
            if not Path(audio_file_path).exists():
                print(f"[WHISPER] ERROR: Audio file not found: {audio_file_path}")
                raise FileNotFoundError(f"Audio file not found: {audio_file_path}")
            
            file_size = Path(audio_file_path).stat().st_size
            print(f"[WHISPER] Audio file size: {file_size} bytes")
            
            # Enhanced transcription parameters for better quality
            result = self.model.transcribe(
                audio_file_path,
                language="en",  # Force English for better accuracy
                word_timestamps=True,  # Enable word-level timestamps
                temperature=0.0,  # Use deterministic decoding for consistency
                condition_on_previous_text=False,  # Don't bias based on previous text in real-time
                compression_ratio_threshold=2.4,  # Detect hallucinations
                logprob_threshold=-1.0,  # Reject low-confidence transcriptions
                no_speech_threshold=0.6,  # Stricter silence detection
                initial_prompt="This is a business meeting or conversation in English."  # Context hint
            )
            
            print(f"[WHISPER] Transcription completed")
            print(f"[WHISPER] Result text: '{result['text'].strip()}'")
            print(f"[WHISPER] Detected language: {result.get('language')}")
            print(f"[WHISPER] Number of segments: {len(result.get('segments', []))}")
            
            # Log segment details for debugging
            for i, segment in enumerate(result.get('segments', [])[:3]):  # First 3 segments
                print(f"[WHISPER] Segment {i}: '{segment.get('text', '').strip()}' (no_speech_prob: {segment.get('no_speech_prob', 'N/A'):.3f})")
            
            return {
                "text": result["text"].strip(),
                "language": result.get("language"),
                "segments": result.get("segments", [])
            }
        except Exception as e:
            print(f"[WHISPER] ERROR transcribing audio: {e}")
            import traceback
            print(f"[WHISPER] Full traceback: {traceback.format_exc()}")
            raise
    
    def is_ready(self) -> bool:
        """Check if Whisper model is loaded and ready"""
        return self.model is not None
