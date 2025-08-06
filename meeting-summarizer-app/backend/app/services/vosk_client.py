import json
import tempfile
import os
from typing import Dict, Optional
from pathlib import Path
import subprocess
import vosk
from config import settings

class VoskClient:
    def __init__(self):
        self.model = None
        self.rec = None
        self.load_model()
    
    def load_model(self):
        """Load VOSK model for real-time speech recognition"""
        try:
            # VOSK model path - we'll use a small English model for real-time performance
            model_path = os.path.join(os.path.dirname(__file__), "../../../vosk-model")
            
            # Check if model exists, if not download it
            if not os.path.exists(model_path):
                print("[VOSK] Model not found, downloading small English model...")
                self._download_model(model_path)
            
            print(f"[VOSK] Loading model from: {model_path}")
            self.model = vosk.Model(model_path)
            print("[VOSK] Model loaded successfully")
            
        except Exception as e:
            print(f"[VOSK] Error loading model: {e}")
            # Fall back to downloading if model loading fails
            try:
                model_path = os.path.join(os.path.dirname(__file__), "../../../vosk-model")
                self._download_model(model_path)
                self.model = vosk.Model(model_path)
                print("[VOSK] Model loaded successfully after download")
            except Exception as e2:
                print(f"[VOSK] Failed to load model even after download: {e2}")
                raise
    
    def _download_model(self, model_path: str):
        """Download VOSK small English model"""
        import urllib.request
        import tarfile
        
        # Small English model (about 50MB)
        model_url = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
        
        print(f"[VOSK] Downloading model from {model_url}")
        
        # Create directory
        os.makedirs(os.path.dirname(model_path), exist_ok=True)
        
        # Download and extract
        temp_file = f"{model_path}.zip"
        urllib.request.urlretrieve(model_url, temp_file)
        
        # Extract
        import zipfile
        with zipfile.ZipFile(temp_file, 'r') as zip_ref:
            zip_ref.extractall(os.path.dirname(model_path))
        
        # Rename extracted folder to our expected name
        extracted_folder = os.path.join(os.path.dirname(model_path), "vosk-model-small-en-us-0.15")
        if os.path.exists(extracted_folder):
            if os.path.exists(model_path):
                import shutil
                shutil.rmtree(model_path)
            os.rename(extracted_folder, model_path)
        
        # Clean up
        os.remove(temp_file)
        print(f"[VOSK] Model downloaded and extracted to: {model_path}")
    
    def create_recognizer(self, sample_rate: int = 16000) -> vosk.KaldiRecognizer:
        """Create a new recognizer instance for a session"""
        if not self.model:
            raise RuntimeError("VOSK model not loaded")
        
        print(f"[VOSK] Creating recognizer with sample rate: {sample_rate}")
        recognizer = vosk.KaldiRecognizer(self.model, sample_rate)
        
        # Configure recognizer for better real-time performance
        recognizer.SetWords(True)  # Enable word-level timestamps
        
        return recognizer
    
    def _convert_to_pcm(self, audio_data: bytes) -> bytes:
        """Convert WebM/MP4 audio to PCM format required by VOSK"""
        try:
            # Create temporary input file
            with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as temp_input:
                temp_input.write(audio_data)
                temp_input_path = temp_input.name
            
            # Create temporary output file for PCM
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_output:
                temp_output_path = temp_output.name
            
            # Use FFmpeg to convert to PCM format
            ffmpeg_cmd = [
                'ffmpeg', '-y',  # -y to overwrite output files
                '-i', temp_input_path,
                '-ar', '16000',  # Sample rate 16kHz
                '-ac', '1',      # Mono
                '-f', 'wav',     # WAV format
                temp_output_path
            ]
            
            result = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
            
            if result.returncode != 0:
                print(f"[VOSK] FFmpeg error: {result.stderr}")
                return b""
            
            # Read the converted PCM data
            with open(temp_output_path, 'rb') as f:
                wav_data = f.read()
            
            # Clean up temporary files
            os.unlink(temp_input_path)
            os.unlink(temp_output_path)
            
            # Extract raw PCM data (skip WAV header - typically 44 bytes)
            if len(wav_data) > 44:
                pcm_data = wav_data[44:]  # Skip WAV header
                print(f"[VOSK] Converted {len(audio_data)} bytes to {len(pcm_data)} bytes PCM")
                return pcm_data
            else:
                print(f"[VOSK] Converted file too small: {len(wav_data)} bytes")
                return b""
                
        except Exception as e:
            print(f"[VOSK] Error converting audio to PCM: {e}")
            return b""
    
    def transcribe_stream(self, recognizer, pcm_data: bytes) -> Dict:
        """Process PCM audio data with VOSK recognizer"""
        try:
            if not pcm_data:
                return {"text": "", "confidence": 0.0}
            
            # Feed data to recognizer in chunks
            chunk_size = 4000  # Process in 4KB chunks
            final_result = None
            
            for i in range(0, len(pcm_data), chunk_size):
                chunk = pcm_data[i:i + chunk_size]
                
                if recognizer.AcceptWaveform(chunk):
                    # Final result available
                    result = json.loads(recognizer.Result())
                    if result.get("text"):
                        final_result = result
                        print(f"[VOSK] Final result: {result}")
                else:
                    # Partial result
                    partial_result = json.loads(recognizer.PartialResult())
                    if partial_result.get("partial"):
                        print(f"[VOSK] Partial result: {partial_result['partial']}")
            
            # Get any remaining result
            if final_result is None:
                final_result = json.loads(recognizer.FinalResult())
                print(f"[VOSK] Final result from FinalResult(): {final_result}")
            
            # Extract text and confidence
            text = final_result.get("text", "").strip()
            confidence = final_result.get("conf", 0.8)  # VOSK sometimes provides confidence
            
            return {
                "text": text,
                "confidence": confidence,
                "engine": "vosk"
            }
            
        except Exception as e:
            print(f"[VOSK] Error in transcribe_stream: {e}")
            return {"text": "", "confidence": 0.0, "error": str(e)}
    
    def is_ready(self) -> bool:
        """Check if VOSK is ready"""
        return self.model is not None
