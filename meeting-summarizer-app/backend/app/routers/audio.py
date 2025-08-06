from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import JSONResponse, FileResponse
import aiofiles
import os
import uuid
from pathlib import Path
from config import settings
from app.models.meeting import TranscriptionResponse

router = APIRouter()

async def validate_audio_file(file: UploadFile) -> bool:
    """Validate uploaded audio file"""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")
    
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in settings.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400, 
            detail=f"File type {file_ext} not allowed. Allowed types: {settings.ALLOWED_EXTENSIONS}"
        )
    
    return True

@router.post("/upload", response_model=dict)
async def upload_audio(file: UploadFile = File(...)):
    """Upload audio file for processing"""
    await validate_audio_file(file)
    
    try:
        # Generate unique filename
        file_ext = Path(file.filename).suffix.lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
        
        # Save file
        async with aiofiles.open(file_path, 'wb') as buffer:
            content = await file.read()
            if len(content) > settings.MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large")
            await buffer.write(content)
        
        return {
            "message": "File uploaded successfully",
            "file_id": unique_filename,
            "file_path": file_path,
            "original_filename": file.filename
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading file: {str(e)}")

@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio_direct(file: UploadFile = File(...)):
    """Upload and transcribe audio file in one step"""
    await validate_audio_file(file)
    
    try:
        # Generate unique filename
        file_ext = Path(file.filename).suffix.lower()
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, unique_filename)
        
        # Save file temporarily
        async with aiofiles.open(file_path, 'wb') as buffer:
            content = await file.read()
            if len(content) > settings.MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large")
            await buffer.write(content)
        
        # Get file size
        file_size_mb = len(content) / (1024 * 1024)
        
        # Transcribe the file
        from app.services.whisper_client import WhisperClient
        whisper_client = WhisperClient()
        
        result = await whisper_client.transcribe(file_path)
        
        # Clean up temporary file
        try:
            os.remove(file_path)
        except:
            pass  # Don't fail if cleanup fails
        
        return TranscriptionResponse(
            text=result["text"],
            language=result.get("language"),
            duration=result.get("duration")
        )
    
    except Exception as e:
        # Clean up file if transcription fails
        try:
            if 'file_path' in locals() and os.path.exists(file_path):
                os.remove(file_path)
        except:
            pass
        raise HTTPException(status_code=500, detail=f"Error transcribing audio: {str(e)}")

@router.post("/transcribe/{file_id}", response_model=TranscriptionResponse)
async def transcribe_audio(file_id: str):
    """Transcribe uploaded audio file"""
    file_path = os.path.join(settings.UPLOAD_DIR, file_id)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        # This would be injected in a real app, but for now we'll import here
        from app.services.whisper_client import WhisperClient
        whisper_client = WhisperClient()
        
        result = await whisper_client.transcribe(file_path)
        
        return TranscriptionResponse(
            text=result["text"],
            language=result.get("language"),
            duration=None
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error transcribing audio: {str(e)}")

@router.delete("/file/{file_id}")
async def delete_audio_file(file_id: str):
    """Delete uploaded audio file"""
    file_path = os.path.join(settings.UPLOAD_DIR, file_id)
    
    try:
        if os.path.exists(file_path):
            os.remove(file_path)
            return {"message": "File deleted successfully"}
        else:
            raise HTTPException(status_code=404, detail="File not found")
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting file: {str(e)}")

@router.get("/file/{file_id}")
async def get_audio_file(file_id: str):
    """Serve audio file for playback"""
    file_path = os.path.join(settings.UPLOAD_DIR, file_id)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    # Determine media type based on file extension
    file_ext = Path(file_path).suffix.lower()
    media_type_map = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.aiff': 'audio/aiff',
        '.webm': 'audio/webm',
        '.wma': 'audio/x-ms-wma'
    }
    
    media_type = media_type_map.get(file_ext, 'audio/mpeg')
    
    return FileResponse(
        path=file_path,
        media_type=media_type,
        filename=file_id
    )
