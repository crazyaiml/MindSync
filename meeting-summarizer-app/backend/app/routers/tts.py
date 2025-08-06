from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional
import tempfile
import os
import uuid
from app.services.tts_service import TTSService

router = APIRouter()
tts_service = TTSService()

class TTSRequest(BaseModel):
    text: str
    type: str = "summary"  # summary, keypoints, actionitems
    voice_model: str = "default"  # default, cloned

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any
import os
import logging
from ..services.tts_service import TTSService

logger = logging.getLogger(__name__)

router = APIRouter()
tts_service = TTSService()

class SpeakRequest(BaseModel):
    text: str
    voice_model: str = "default"
    speech_type: str = "summary"

class StreamSpeakRequest(BaseModel):
    text: str
    voice_model: str = "default"
    speech_type: str = "summary"
    chunk_size: int = 100  # Maximum characters per chunk

@router.post("/speak")
async def speak_text(request: SpeakRequest):
    """Generate speech from text"""
    try:
        logger.info(f"[TTS API] Speak request: {len(request.text)} chars, model: {request.voice_model}")
        
        # Generate speech
        audio_path = await tts_service.generate_speech(
            text=request.text,
            voice_model=request.voice_model,
            speech_type=request.speech_type
        )
        
        # Check if file exists and has content
        if not os.path.exists(audio_path):
            logger.error(f"[TTS API] Generated audio file does not exist: {audio_path}")
            raise HTTPException(status_code=500, detail="Audio file was not generated")
        
        file_size = os.path.getsize(audio_path)
        if file_size == 0:
            logger.error(f"[TTS API] Generated audio file is empty: {audio_path}")
            raise HTTPException(status_code=500, detail="Generated audio file is empty")
        
        logger.info(f"[TTS API] Returning audio file: {audio_path} ({file_size} bytes)")
        
        # Return the audio file with proper headers
        return FileResponse(
            path=audio_path,
            media_type="audio/wav",
            filename="speech.wav",
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Cache-Control": "no-cache",
                "Content-Length": str(file_size)
            }
        )
        
    except Exception as e:
        logger.error(f"[TTS API] Error in speak endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/speak-stream")
async def speak_text_stream(request: StreamSpeakRequest):
    """Generate speech from text using streaming (chunk-based approach)"""
    try:
        logger.info(f"[TTS API] Stream speak request: {len(request.text)} chars, model: {request.voice_model}")
        
        # Generate audio chunks
        audio_chunks = await tts_service.generate_speech_stream(
            text=request.text,
            voice_model=request.voice_model,
            speech_type=request.speech_type,
            chunk_size=request.chunk_size
        )
        
        # Return array of audio file URLs for streaming playback
        return {
            "chunks": audio_chunks,
            "total_chunks": len(audio_chunks),
            "voice_model": request.voice_model
        }
        
    except Exception as e:
        logger.error(f"[TTS API] Error in stream speak endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/chunk/{filename}")
@router.head("/chunk/{filename}")
async def get_audio_chunk(filename: str):
    """Serve individual audio chunk files"""
    try:
        import tempfile
        chunk_path = os.path.join(tempfile.gettempdir(), filename)
        
        if not os.path.exists(chunk_path):
            logger.error(f"[TTS API] Audio chunk not found: {chunk_path}")
            raise HTTPException(status_code=404, detail="Audio chunk not found")
        
        file_size = os.path.getsize(chunk_path)
        logger.info(f"[TTS API] Serving audio chunk: {filename} ({file_size} bytes)")
        
        return FileResponse(
            path=chunk_path,
            media_type="audio/wav",
            filename=filename,
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "*",
                "Cache-Control": "no-cache",
                "Content-Length": str(file_size)
            }
        )
        
    except Exception as e:
        logger.error(f"[TTS API] Error serving audio chunk: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/train-voice-profile")
async def train_voice_profile(
    voice_sample: UploadFile = File(...),
    profile_name: str = Form(...),
    sample_duration: int = Form(0)
):
    """Train a new voice profile with user's voice sample"""
    try:
        logger.info(f"[TTS API] Voice profile training request: {profile_name}")
        
        # Save uploaded file
        upload_path = f"/tmp/voice_sample_{voice_sample.filename}"
        
        with open(upload_path, "wb") as buffer:
            content = await voice_sample.read()
            buffer.write(content)
        
        logger.info(f"[TTS API] Saved voice sample: {upload_path} ({len(content)} bytes)")
        
        # Train the voice profile
        training_result = await tts_service.train_voice_profile(
            upload_path, 
            profile_name, 
            sample_duration
        )
        
        logger.info(f"[TTS API] Voice profile training completed: {training_result}")
        
        # Clean up uploaded file
        if os.path.exists(upload_path):
            os.remove(upload_path)
        
        return {
            "message": f"Voice profile '{profile_name}' trained successfully",
            "profile": training_result
        }
        
    except Exception as e:
        logger.error(f"[TTS API] Error in train-voice-profile endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/voice-profiles")
async def get_voice_profiles():
    """Get all voice profiles"""
    try:
        profiles = tts_service.get_voice_profiles()
        logger.info(f"[TTS API] Retrieved {len(profiles)} voice profiles")
        return {
            "profiles": profiles,
            "total": len(profiles)
        }
    except Exception as e:
        logger.error(f"[TTS API] Error getting voice profiles: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/voice-profiles/{profile_id}/sample")
async def get_voice_sample(profile_id: str):
    """Get voice sample for a specific profile"""
    try:
        profile = tts_service.get_voice_profile_by_id(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="Voice profile not found")
        
        file_path = profile["file_path"]
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Voice sample file not found")
        
        return FileResponse(
            path=file_path,
            media_type="audio/wav",
            filename=f"{profile['name']}_sample.wav"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TTS API] Error getting voice sample: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/voice-profiles/{profile_id}")
async def delete_voice_profile(profile_id: str):
    """Delete a voice profile"""
    try:
        success = tts_service.delete_voice_profile(profile_id)
        if not success:
            raise HTTPException(status_code=404, detail="Voice profile not found")
        
        return {"message": "Voice profile deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[TTS API] Error deleting voice profile: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/voice-status")
async def get_voice_status():
    """Get current voice model status"""
    try:
        status = tts_service.get_voice_status()
        logger.info(f"[TTS API] Voice status: {status}")
        return status
    except Exception as e:
        logger.error(f"[TTS API] Error getting voice status: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/train-voice")
async def train_voice_model(voice_sample: UploadFile = File(...)):
    """Train voice cloning model with user's voice sample"""
    try:
        print(f"[TTS] Training voice model with sample: {voice_sample.filename}")
        
        # Save uploaded voice sample
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_file:
            content = await voice_sample.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        print(f"[TTS] Saved voice sample to: {temp_path}")
        
        # Train the voice model
        model_info = await tts_service.train_voice_model(temp_path)
        
        # Clean up temp file
        os.unlink(temp_path)
        
        print(f"[TTS] Voice model training completed: {model_info}")
        
        return {
            "status": "success",
            "message": "Voice model trained successfully",
            "model_info": model_info
        }
        
    except Exception as e:
        print(f"[TTS] Error training voice model: {e}")
        raise HTTPException(status_code=500, detail=f"Voice training failed: {str(e)}")

@router.get("/voice-status")
async def get_voice_status():
    """Get current voice model status"""
    try:
        status = tts_service.get_voice_status()
        return status
        
    except Exception as e:
        print(f"[TTS] Error getting voice status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get voice status: {str(e)}")
