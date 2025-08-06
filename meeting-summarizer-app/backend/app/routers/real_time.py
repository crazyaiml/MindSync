from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.orm import Session
import json
import uuid
from app.services.real_time_transcriber import real_time_transcriber
from app.services.vector_store import vector_store
from app.database import get_db

router = APIRouter()

@router.websocket("/ws/real-time-transcribe")
async def websocket_real_time_transcribe(websocket: WebSocket):
    """WebSocket endpoint for real-time transcription and suggestions"""
    await websocket.accept()
    print("INFO:     connection open")
    session_id = str(uuid.uuid4())
    use_vosk = True  # Default to VOSK for real-time (AI Assistant mode)
    
    try:
        while True:
            # Receive audio data
            try:
                data = await websocket.receive()
            except WebSocketDisconnect:
                print(f"[WEBSOCKET] WebSocket disconnected for session: {session_id}")
                break
            except Exception as receive_error:
                print(f"[WEBSOCKET] Error receiving data: {receive_error}")
                break
            
            if data["type"] == "websocket.receive":
                if "bytes" in data:
                    # Process audio chunk
                    print(f"[WEBSOCKET] Processing audio chunk of {len(data['bytes'])} bytes for session {session_id} (VOSK: {use_vosk})")
                    result = await real_time_transcriber.process_audio_chunk(
                        session_id, data["bytes"], use_vosk=use_vosk
                    )
                    
                    print(f"[WEBSOCKET] Transcriber result: {result}")
                    
                    # Ensure we always send a response with the expected format
                    response = {
                        "type": "transcription_update",
                        "session_id": session_id,
                        "transcription": result.get("transcription", ""),
                        "full_transcript": result.get("full_transcript", ""),
                        "suggestions": result.get("suggestions", []),
                        "timestamp": result.get("timestamp", "")
                    }
                    
                    if result.get("error"):
                        response["error"] = result["error"]
                    
                    print(f"[WEBSOCKET] Sending response: {response}")
                    # Send result back to client
                    await websocket.send_text(json.dumps(response))
                
                elif "text" in data:
                    # Handle text commands
                    message = json.loads(data["text"])
                    command = message.get("command")
                    print(f"[WEBSOCKET] Received command: {command}")
                    
                    if command == "start_session":
                        # Handle mode configuration
                        mode = message.get("mode", "ai_assistant")  # Default to AI Assistant
                        if mode == "standard":
                            use_vosk = False  # Use Whisper for standard mode
                        else:
                            use_vosk = True   # Use VOSK for AI Assistant mode
                            # Initialize VOSK session
                            real_time_transcriber.start_vosk_session(session_id)
                        
                        await websocket.send_text(json.dumps({
                            "type": "session_started",
                            "session_id": session_id,
                            "status": "ready",
                            "mode": mode,
                            "engine": "vosk" if use_vosk else "whisper"
                        }))
                        print(f"[WEBSOCKET] Session started: {session_id}, mode: {mode}, engine: {'VOSK' if use_vosk else 'Whisper'}")
                    
                    elif command == "end_session":
                        # Clean up VOSK session if needed
                        real_time_transcriber.end_vosk_session(session_id)
                        result = real_time_transcriber.end_session(session_id)
                        await websocket.send_text(json.dumps({
                            "type": "session_ended",
                            "session_id": session_id,
                            **result
                        }))
                        print(f"[WEBSOCKET] Session ended: {session_id}")
                        break
                    
                    elif command == "get_session":
                        session_data = real_time_transcriber.get_session(session_id)
                        await websocket.send_text(json.dumps({
                            "type": "session_data",
                            "session_id": session_id,
                            **session_data
                        }))
    
    except WebSocketDisconnect:
        # Clean up sessions on disconnect
        print(f"[WEBSOCKET] WebSocket disconnected for session: {session_id}")
        real_time_transcriber.end_vosk_session(session_id)
        real_time_transcriber.end_session(session_id)
    
    except Exception as e:
        print(f"[WEBSOCKET] Unexpected error: {e}")
        import traceback
        print(f"[WEBSOCKET] Full traceback: {traceback.format_exc()}")
        # Clean up sessions on error
        real_time_transcriber.end_vosk_session(session_id)
        real_time_transcriber.end_session(session_id)
        try:
            if websocket.client_state.value != 3:  # Not DISCONNECTED
                await websocket.send_text(json.dumps({
                    "type": "error",
                    "session_id": session_id,
                    "error": str(e)
                }))
        except:
            pass  # Connection might be closed
    
    finally:
        # Final cleanup
        print(f"[WEBSOCKET] Final cleanup for session: {session_id}")
        real_time_transcriber.end_vosk_session(session_id)
        real_time_transcriber.end_session(session_id)
        print("INFO:     connection closed")

@router.post("/clear-sessions")
async def clear_sessions():
    """Clear all active real-time sessions (useful for cleaning up corrupted data)"""
    result = real_time_transcriber.clear_all_sessions()
    return result

@router.post("/rebuild-index")
async def rebuild_vector_index(db: Session = Depends(get_db)):
    """Rebuild the vector search index from all meetings"""
    try:
        vector_store.rebuild_index(db)
        return {"message": "Vector index rebuilt successfully", "chunks": len(vector_store.chunks)}
    except Exception as e:
        return {"error": str(e)}

@router.get("/search-meetings")
async def search_meetings(query: str, top_k: int = 5):
    """Search for similar content in previous meetings"""
    try:
        results = vector_store.search_similar(query, top_k)
        return {"results": results}
    except Exception as e:
        return {"error": str(e)}
