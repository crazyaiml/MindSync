from typing import Dict, List
from app.services.whisper_client import WhisperClient
from app.services.ollama_client import OllamaClient
from app.models.meeting import TranscriptionResponse, SummaryResponse

class MeetingSummarizer:
    def __init__(self, whisper_client: WhisperClient, ollama_client: OllamaClient):
        self.whisper = whisper_client
        self.ollama = ollama_client
    
    async def process_audio(self, audio_file_path: str) -> TranscriptionResponse:
        """Transcribe audio file using Whisper"""
        result = await self.whisper.transcribe(audio_file_path)
        
        return TranscriptionResponse(
            text=result["text"],
            language=result.get("language"),
            duration=None  # You can calculate this from segments if needed
        )
    
    async def generate_meeting_summary(self, transcript: str) -> SummaryResponse:
        """Generate comprehensive meeting summary using Ollama"""
        summary = await self.ollama.generate_summary(transcript)
        key_points = await self.ollama.extract_key_points(transcript)
        action_items = await self.ollama.extract_action_items(transcript)
        
        return SummaryResponse(
            summary=summary,
            key_points=key_points,
            action_items=action_items
        )
    
    async def process_complete_meeting(self, audio_file_path: str) -> Dict:
        """Process complete meeting: transcription + summarization"""
        # Transcribe audio
        transcription = await self.process_audio(audio_file_path)
        
        # Generate summary
        summary = await self.generate_meeting_summary(transcription.text)
        
        return {
            "transcription": transcription,
            "summary": summary
        }
