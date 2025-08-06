import os
import subprocess
from pathlib import Path
from typing import Optional

def get_audio_duration(file_path: str) -> Optional[float]:
    """Get audio file duration in seconds using ffprobe"""
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-show_entries', 
            'format=duration', '-of', 'csv=p=0', file_path
        ], capture_output=True, text=True)
        
        if result.returncode == 0:
            return float(result.stdout.strip())
        return None
    except Exception:
        return None

def validate_audio_format(file_path: str) -> bool:
    """Validate if file is a supported audio format"""
    try:
        result = subprocess.run([
            'ffprobe', '-v', 'quiet', '-show_entries', 
            'stream=codec_type', '-of', 'csv=p=0', file_path
        ], capture_output=True, text=True)
        
        return result.returncode == 0 and 'audio' in result.stdout
    except Exception:
        return False

def convert_to_wav(input_path: str, output_path: str) -> bool:
    """Convert audio file to WAV format using ffmpeg"""
    try:
        result = subprocess.run([
            'ffmpeg', '-i', input_path, '-ar', '16000', 
            '-ac', '1', '-c:a', 'pcm_s16le', output_path, '-y'
        ], capture_output=True, text=True)
        
        return result.returncode == 0
    except Exception:
        return False

def cleanup_temp_files(directory: str, max_age_hours: int = 24):
    """Clean up temporary files older than specified hours"""
    import time
    
    current_time = time.time()
    cutoff_time = current_time - (max_age_hours * 3600)
    
    for file_path in Path(directory).iterdir():
        if file_path.is_file() and file_path.stat().st_mtime < cutoff_time:
            try:
                file_path.unlink()
                print(f"Deleted old file: {file_path}")
            except Exception as e:
                print(f"Error deleting {file_path}: {e}")
