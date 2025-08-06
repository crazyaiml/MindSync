from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List
import uuid
from datetime import datetime
from app.models.meeting import Meeting, MeetingCreate, SummaryResponse, MeetingCreateFromText, MeetingResponse, MeetingUpdate
from app.services.summarizer import MeetingSummarizer
from app.database import get_db, create_tables
from app.database import Meeting as DBMeeting

router = APIRouter()

# Create tables on startup
create_tables()

@router.post("/create", response_model=MeetingResponse)
async def create_meeting(meeting_data: MeetingCreate, db: Session = Depends(get_db)):
    """Create a new meeting and process audio"""
    try:
        # Generate unique meeting ID
        meeting_id = str(uuid.uuid4())
        
        # This would be injected in a real app
        from app.services.whisper_client import WhisperClient
        from app.services.ollama_client import OllamaClient
        
        whisper_client = WhisperClient()
        ollama_client = OllamaClient()
        summarizer = MeetingSummarizer(whisper_client, ollama_client)
        
        # Process the audio file
        result = await summarizer.process_complete_meeting(meeting_data.audio_file_path)
        
        # Create database meeting object
        db_meeting = DBMeeting(
            id=meeting_id,
            title=meeting_data.title,
            transcript=result["transcription"].text,
            summary=result["summary"].summary,
            key_points=result["summary"].key_points,
            action_items=result["summary"].action_items,
            created_at=datetime.utcnow(),
            duration=result["transcription"].duration,
            language=result["transcription"].language,
            file_name=meeting_data.audio_file_path.split('/')[-1] if '/' in meeting_data.audio_file_path else meeting_data.audio_file_path
        )
        
        # Save to database
        db.add(db_meeting)
        db.commit()
        db.refresh(db_meeting)
        
        # Add to vector store for future context
        try:
            from app.services.vector_store import vector_store
            vector_store.add_meeting(db_meeting)
        except Exception as e:
            print(f"Warning: Could not add meeting to vector store: {e}")
        
        return db_meeting
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating meeting: {str(e)}")

@router.post("/", response_model=MeetingResponse)
async def create_meeting_from_transcription(meeting_data: MeetingCreateFromText, db: Session = Depends(get_db)):
    """Create a new meeting from transcription text"""
    try:
        print(f"DEBUG: Creating meeting from transcription - Title: {meeting_data.title}")
        print(f"DEBUG: Transcription length: {len(meeting_data.transcription)}")
        
        # Generate unique meeting ID
        meeting_id = str(uuid.uuid4())
        print(f"DEBUG: Generated meeting ID: {meeting_id}")
        
        # This would be injected in a real app
        from app.services.ollama_client import OllamaClient
        
        ollama_client = OllamaClient()
        print("DEBUG: Created Ollama client")
        
        # Generate summary from transcription
        print("DEBUG: Starting summary generation...")
        summary = await ollama_client.generate_summary(meeting_data.transcription)
        print(f"DEBUG: Generated summary: {len(summary)} characters")
        
        print("DEBUG: Starting key points extraction...")
        key_points = await ollama_client.extract_key_points(meeting_data.transcription)
        print(f"DEBUG: Generated {len(key_points)} key points")
        
        print("DEBUG: Starting action items extraction...")
        action_items = await ollama_client.extract_action_items(meeting_data.transcription)
        print(f"DEBUG: Generated {len(action_items)} action items")
        
        # Create database meeting object
        print("DEBUG: Creating database meeting object...")
        db_meeting = DBMeeting(
            id=meeting_id,
            title=meeting_data.title,
            transcript=meeting_data.transcription,
            summary=summary,
            key_points=key_points,
            action_items=action_items,
            created_at=datetime.utcnow(),
            duration=meeting_data.duration,
            language=meeting_data.language,
            file_name=meeting_data.file_name  # Use the actual file ID, not the title
        )
        
        # Save to database
        db.add(db_meeting)
        db.commit()
        db.refresh(db_meeting)
        print("DEBUG: Successfully saved to database")
        
        # Add to vector store for future context
        try:
            from app.services.vector_store import vector_store
            vector_store.add_meeting(db_meeting)
            print("DEBUG: Added to vector store")
        except Exception as e:
            print(f"Warning: Could not add meeting to vector store: {e}")
        
        return db_meeting
    
    except Exception as e:
        print(f"DEBUG: Error in create_meeting_from_transcription: {str(e)}")
        print(f"DEBUG: Error type: {type(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating meeting from transcription: {str(e)}")

@router.get("/", response_model=List[MeetingResponse])
async def get_all_meetings(db: Session = Depends(get_db)):
    """Get all meetings"""
    meetings = db.query(DBMeeting).order_by(DBMeeting.created_at.desc()).all()
    return meetings

@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """Get a specific meeting by ID"""
    meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    return meeting

@router.post("/{meeting_id}/summarize", response_model=SummaryResponse)
async def regenerate_summary(meeting_id: str, db: Session = Depends(get_db)):
    """Regenerate summary for a meeting"""
    meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    try:
        # This would be injected in a real app
        from app.services.ollama_client import OllamaClient
        
        ollama_client = OllamaClient()
        
        # Generate new summary
        summary = await ollama_client.generate_summary(meeting.transcript)
        key_points = await ollama_client.extract_key_points(meeting.transcript)
        action_items = await ollama_client.extract_action_items(meeting.transcript)
        
        # Update meeting in database
        meeting.summary = summary
        meeting.key_points = key_points
        meeting.action_items = action_items
        
        db.commit()
        
        return SummaryResponse(
            summary=summary,
            key_points=key_points,
            action_items=action_items
        )
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error regenerating summary: {str(e)}")

@router.put("/{meeting_id}", response_model=MeetingResponse)
async def update_meeting(meeting_id: str, meeting_update: MeetingUpdate, db: Session = Depends(get_db)):
    """Update meeting title"""
    meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    try:
        # Update meeting title
        meeting.title = meeting_update.title
        
        db.commit()
        db.refresh(meeting)
        
        return meeting
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error updating meeting: {str(e)}")

@router.delete("/{meeting_id}")
async def delete_meeting(meeting_id: str, db: Session = Depends(get_db)):
    """Delete a meeting"""
    meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    try:
        db.delete(meeting)
        db.commit()
        return {"message": "Meeting deleted successfully"}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error deleting meeting: {str(e)}")
