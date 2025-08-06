from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.chat import ChatQueryRequest, ChatResponse
from app.services.meeting_chat import meeting_chat_service

router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("/query", response_model=ChatResponse)
async def query_meetings(
    request: ChatQueryRequest,
    db: Session = Depends(get_db)
):
    """Ask questions about your meetings using natural language"""
    try:
        if not request.query or not request.query.strip():
            raise HTTPException(status_code=400, detail="Query cannot be empty")
        
        # Process the query
        result = await meeting_chat_service.process_query(request.query.strip(), db)
        
        return ChatResponse(**result)
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process query: {str(e)}")

@router.get("/suggestions")
async def get_query_suggestions():
    """Get sample queries users can ask"""
    suggestions = [
        {
            "category": "Action Items",
            "examples": [
                "What are my todos from meetings?",
                "Show me all action items from this week",
                "What tasks do I need to follow up on?",
                "List all my pending assignments"
            ]
        },
        {
            "category": "Meeting Summaries",
            "examples": [
                "Summarize my recent meetings",
                "What were the main points from yesterday's meeting?",
                "Give me an overview of this week's discussions",
                "What happened in my last project meeting?"
            ]
        },
        {
            "category": "Decisions & Outcomes",
            "examples": [
                "What decisions were made in recent meetings?",
                "Show me the outcomes from the strategy meeting",
                "What was concluded about the new feature?",
                "What did we agree on regarding the budget?"
            ]
        },
        {
            "category": "Search & Find",
            "examples": [
                "Find meetings about machine learning",
                "Show discussions about the new project",
                "What meetings mentioned John Smith?",
                "Find talks about quarterly planning"
            ]
        },
        {
            "category": "People & Participants",
            "examples": [
                "Who attended the team meeting?",
                "What did Sarah say about the proposal?",
                "Which meetings did the CEO attend?",
                "Show me meetings with the engineering team"
            ]
        }
    ]
    
    return {"suggestions": suggestions}

@router.get("/health")
async def chat_health_check():
    """Check if chat service is working"""
    return {"status": "healthy", "service": "meeting_chat"}
