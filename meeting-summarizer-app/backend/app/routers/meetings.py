from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Optional
import uuid
from datetime import datetime
from app.models.meeting import (
    Meeting, MeetingCreate, SummaryResponse, MeetingCreateFromText, 
    MeetingResponse, MeetingUpdate, MeetingCreateEmpty, MeetingStartRecording,
    MeetingStopRecording, MeetingStatus
)
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
            updated_at=datetime.utcnow(),
            duration=result["transcription"].duration,
            language=result["transcription"].language,
            file_name=meeting_data.audio_file_path.split('/')[-1] if '/' in meeting_data.audio_file_path else meeting_data.audio_file_path,
            status=MeetingStatus.COMPLETED.value
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
            description=meeting_data.description,
            transcript=meeting_data.transcription,
            summary=summary,
            key_points=key_points,
            action_items=action_items,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            duration=meeting_data.duration,
            language=meeting_data.language,
            file_name=meeting_data.file_name,  # Use the actual file ID, not the title
            status=MeetingStatus.COMPLETED.value
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

@router.post("/empty", response_model=MeetingResponse)
async def create_empty_meeting(meeting_data: MeetingCreateEmpty, db: Session = Depends(get_db)):
    """Create an empty meeting that can be recorded later"""
    try:
        print(f"DEBUG: Creating empty meeting - Title: {meeting_data.title}")
        
        # Generate unique meeting ID
        meeting_id = str(uuid.uuid4())
        print(f"DEBUG: Generated meeting ID: {meeting_id}")
        
        # Create database meeting object with minimal data
        db_meeting = DBMeeting(
            id=meeting_id,
            title=meeting_data.title,
            description=meeting_data.description,
            transcript=None,  # Empty meeting starts with no transcript
            summary=None,
            key_points=None,
            action_items=None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
            duration=None,
            language=None,
            file_name=None,
            status=MeetingStatus.DRAFT.value
        )
        
        # Save to database
        db.add(db_meeting)
        db.commit()
        db.refresh(db_meeting)
        print("DEBUG: Successfully created empty meeting")
        
        return db_meeting
    
    except Exception as e:
        print(f"DEBUG: Error in create_empty_meeting: {str(e)}")
        import traceback
        print(f"DEBUG: Traceback: {traceback.format_exc()}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error creating empty meeting: {str(e)}")

@router.post("/{meeting_id}/start-recording", response_model=MeetingResponse)
async def start_recording(meeting_id: str, db: Session = Depends(get_db)):
    """Start recording for an existing meeting"""
    try:
        print(f"DEBUG: Starting recording for meeting: {meeting_id}")
        
        # Find the meeting
        meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Check if meeting can be recorded
        if meeting.status not in [MeetingStatus.DRAFT.value, MeetingStatus.COMPLETED.value]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot start recording for meeting in {meeting.status} status"
            )
        
        # Update meeting status
        meeting.status = MeetingStatus.RECORDING.value
        meeting.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(meeting)
        print(f"DEBUG: Successfully started recording for meeting {meeting_id}")
        
        return meeting
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Error in start_recording: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error starting recording: {str(e)}")

@router.post("/{meeting_id}/stop-recording", response_model=MeetingResponse)
async def stop_recording(meeting_id: str, recording_data: MeetingStopRecording, db: Session = Depends(get_db)):
    """Stop recording and optionally process audio for an existing meeting"""
    try:
        print(f"DEBUG: Stopping recording for meeting: {meeting_id}")
        
        # Find the meeting
        meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Check if meeting is currently recording
        if meeting.status != MeetingStatus.RECORDING.value:
            raise HTTPException(
                status_code=400, 
                detail=f"Meeting is not currently recording (status: {meeting.status})"
            )
        
        # If audio file is provided, process it
        if recording_data.audio_file_path:
            print(f"DEBUG: Processing audio file: {recording_data.audio_file_path}")
            meeting.status = MeetingStatus.PROCESSING.value
            meeting.updated_at = datetime.utcnow()
            db.commit()
            
            try:
                # Process the audio file
                from app.services.whisper_client import WhisperClient
                from app.services.ollama_client import OllamaClient
                from app.services.summarizer import MeetingSummarizer
                
                whisper_client = WhisperClient()
                ollama_client = OllamaClient()
                summarizer = MeetingSummarizer(whisper_client, ollama_client)
                
                # Process the audio file
                result = await summarizer.process_complete_meeting(recording_data.audio_file_path)
                
                # Update meeting with results
                meeting.transcript = result["transcription"].text
                meeting.summary = result["summary"].summary
                meeting.key_points = result["summary"].key_points
                meeting.action_items = result["summary"].action_items
                meeting.duration = result["transcription"].duration
                meeting.language = result["transcription"].language
                meeting.file_name = recording_data.audio_file_path.split('/')[-1] if '/' in recording_data.audio_file_path else recording_data.audio_file_path
                meeting.status = MeetingStatus.COMPLETED.value
                meeting.updated_at = datetime.utcnow()
                
                # Add to vector store for future context
                try:
                    from app.services.vector_store import vector_store
                    vector_store.add_meeting(meeting)
                except Exception as e:
                    print(f"Warning: Could not add meeting to vector store: {e}")
                    
            except Exception as e:
                print(f"DEBUG: Error processing audio: {str(e)}")
                meeting.status = MeetingStatus.DRAFT.value  # Revert to draft on error
                meeting.updated_at = datetime.utcnow()
                db.commit()
                raise HTTPException(status_code=500, detail=f"Error processing audio: {str(e)}")
        else:
            # Just stop recording without processing
            meeting.status = MeetingStatus.DRAFT.value
            meeting.updated_at = datetime.utcnow()
        
        db.commit()
        db.refresh(meeting)
        print(f"DEBUG: Successfully stopped recording for meeting {meeting_id}")
        
        return meeting
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Error in stop_recording: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error stopping recording: {str(e)}")

@router.post("/{meeting_id}/add-transcript", response_model=MeetingResponse)
async def add_transcript_to_meeting(meeting_id: str, transcript_data: MeetingCreateFromText, db: Session = Depends(get_db)):
    """Add transcript to an existing meeting and generate summary"""
    try:
        print(f"DEBUG: Adding transcript to meeting: {meeting_id}")
        
        # Find the meeting
        meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        # Update meeting status to processing
        meeting.status = MeetingStatus.PROCESSING.value
        meeting.updated_at = datetime.utcnow()
        db.commit()
        
        try:
            # Generate summary from transcription
            from app.services.ollama_client import OllamaClient
            ollama_client = OllamaClient()
            
            print("DEBUG: Starting summary generation...")
            summary = await ollama_client.generate_summary(transcript_data.transcription)
            print("DEBUG: Starting key points extraction...")
            key_points = await ollama_client.extract_key_points(transcript_data.transcription)
            print("DEBUG: Starting action items extraction...")
            action_items = await ollama_client.extract_action_items(transcript_data.transcription)
            
            # Update meeting with transcript and analysis
            meeting.transcript = transcript_data.transcription
            meeting.summary = summary
            meeting.key_points = key_points
            meeting.action_items = action_items
            meeting.duration = transcript_data.duration
            meeting.language = transcript_data.language
            meeting.file_name = transcript_data.file_name
            meeting.status = MeetingStatus.COMPLETED.value
            meeting.updated_at = datetime.utcnow()
            
            # Add to vector store for future context
            try:
                from app.services.vector_store import vector_store
                vector_store.add_meeting(meeting)
                print("DEBUG: Added to vector store")
            except Exception as e:
                print(f"Warning: Could not add meeting to vector store: {e}")
            
            db.commit()
            db.refresh(meeting)
            print("DEBUG: Successfully added transcript and generated summary")
            
            return meeting
            
        except Exception as e:
            print(f"DEBUG: Error processing transcript: {str(e)}")
            meeting.status = MeetingStatus.DRAFT.value  # Revert to draft on error
            meeting.updated_at = datetime.utcnow()
            db.commit()
            raise HTTPException(status_code=500, detail=f"Error processing transcript: {str(e)}")
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"DEBUG: Error in add_transcript_to_meeting: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error adding transcript to meeting: {str(e)}")

@router.get("/", response_model=List[MeetingResponse])
async def get_all_meetings(status: Optional[str] = None, db: Session = Depends(get_db)):
    """Get all meetings, optionally filtered by status"""
    query = db.query(DBMeeting)
    
    if status:
        # Validate status
        try:
            MeetingStatus(status)
            query = query.filter(DBMeeting.status == status)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status: {status}")
    
    meetings = query.order_by(DBMeeting.created_at.desc()).all()
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
        meeting.updated_at = datetime.utcnow()
        
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
    """Update meeting details"""
    meeting = db.query(DBMeeting).filter(DBMeeting.id == meeting_id).first()
    if not meeting:
        raise HTTPException(status_code=404, detail="Meeting not found")
    
    try:
        # Update fields if provided
        if meeting_update.title is not None:
            meeting.title = meeting_update.title
        if meeting_update.description is not None:
            meeting.description = meeting_update.description
        if meeting_update.status is not None:
            meeting.status = meeting_update.status.value
        
        meeting.updated_at = datetime.utcnow()
        
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
