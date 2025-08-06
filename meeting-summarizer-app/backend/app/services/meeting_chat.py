from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.database import Meeting
from app.services.vector_store import vector_store
from app.services.ollama_client import OllamaClient
import json
import re

class MeetingChatService:
    def __init__(self):
        self.ollama_client = OllamaClient()
    
    async def process_query(self, query: str, db: Session) -> Dict[str, Any]:
        """Process a natural language query about meetings"""
        try:
            # Determine query type and extract relevant meetings
            query_analysis = await self._analyze_query(query)
            relevant_meetings = await self._get_relevant_meetings(query, query_analysis, db)
            
            # Generate response based on query type
            response = await self._generate_response(query, query_analysis, relevant_meetings)
            
            return {
                "query": query,
                "response": response,
                "query_type": query_analysis.get("type", "general"),
                "meetings_found": len(relevant_meetings),
                "relevant_meetings": [
                    {
                        "id": meeting.id,
                        "title": meeting.title,
                        "created_at": meeting.created_at.isoformat(),
                        "relevance_score": meeting.relevance_score if hasattr(meeting, 'relevance_score') else 0
                    } for meeting in relevant_meetings[:5]  # Top 5 most relevant
                ]
            }
        except Exception as e:
            return {
                "query": query,
                "response": f"I'm sorry, I encountered an error while processing your query: {str(e)}",
                "query_type": "error",
                "meetings_found": 0,
                "relevant_meetings": []
            }
    
    async def _analyze_query(self, query: str) -> Dict[str, Any]:
        """Analyze the query to determine intent and type"""
        query_lower = query.lower()
        
        # Define query patterns
        patterns = {
            "action_items": [
                "todo", "task", "action", "follow up", "assignment", "need to do",
                "action item", "to-do", "deliverable", "responsibility"
            ],
            "summary": [
                "summary", "summarize", "overview", "recap", "main points",
                "what happened", "brief", "gist"
            ],
            "decisions": [
                "decision", "decided", "conclusion", "resolution", "agreed",
                "outcome", "result", "verdict"
            ],
            "search": [
                "about", "regarding", "mentioned", "discussed", "talked about",
                "find", "search", "look for", "contains"
            ],
            "people": [
                "who", "person", "people", "participant", "attendee", "speaker"
            ],
            "timeline": [
                "when", "date", "time", "recent", "last week", "yesterday",
                "this month", "latest", "schedule"
            ]
        }
        
        # Determine query type
        query_type = "general"
        confidence = 0
        
        for qtype, keywords in patterns.items():
            matches = sum(1 for keyword in keywords if keyword in query_lower)
            if matches > confidence:
                confidence = matches
                query_type = qtype
        
        # Extract entities (people, dates, topics)
        entities = self._extract_entities(query)
        
        return {
            "type": query_type,
            "confidence": confidence,
            "entities": entities,
            "original_query": query
        }
    
    def _extract_entities(self, query: str) -> Dict[str, List[str]]:
        """Extract entities like people, dates, and topics from query"""
        entities = {
            "people": [],
            "dates": [],
            "topics": []
        }
        
        # Simple entity extraction (can be enhanced with NLP libraries)
        # Extract potential names (capitalized words)
        name_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b'
        potential_names = re.findall(name_pattern, query)
        entities["people"] = [name for name in potential_names if len(name.split()) <= 3]
        
        # Extract date-like terms
        date_terms = ["today", "yesterday", "last week", "this week", "last month", "this month"]
        for term in date_terms:
            if term in query.lower():
                entities["dates"].append(term)
        
        return entities
    
    async def _get_relevant_meetings(self, query: str, analysis: Dict, db: Session) -> List[Meeting]:
        """Get meetings relevant to the query"""
        # Use vector search to find semantically similar content
        similar_chunks = vector_store.search_similar(query, top_k=10)
        
        if not similar_chunks:
            # Fallback: get recent meetings
            meetings = db.query(Meeting).order_by(Meeting.created_at.desc()).limit(5).all()
            return meetings
        
        # Get unique meeting IDs from similar chunks
        meeting_ids = list(set(chunk['meeting_id'] for chunk in similar_chunks))
        
        # Fetch meetings and add relevance scores
        meetings = []
        for meeting_id in meeting_ids:
            meeting = db.query(Meeting).filter(Meeting.id == meeting_id).first()
            if meeting:
                # Calculate relevance score based on chunk similarities
                relevance_score = max(
                    chunk['similarity'] for chunk in similar_chunks 
                    if chunk['meeting_id'] == meeting_id
                )
                meeting.relevance_score = relevance_score
                meetings.append(meeting)
        
        # Sort by relevance
        meetings.sort(key=lambda m: m.relevance_score, reverse=True)
        return meetings
    
    async def _generate_response(self, query: str, analysis: Dict, meetings: List[Meeting]) -> str:
        """Generate AI response based on query and relevant meetings"""
        if not meetings:
            return "I couldn't find any relevant meetings for your query. Please try a different question or check if you have any meetings recorded."
        
        # Prepare context from meetings
        context = self._prepare_meeting_context(meetings, analysis["type"])
        
        # Create prompt based on query type
        prompt = self._create_prompt(query, analysis, context)
        
        # Generate response using Ollama
        try:
            response = self.ollama_client.client.generate(model=self.ollama_client.model, prompt=prompt)
            return response['response'].strip()
        except Exception as e:
            return f"I found relevant meetings but had trouble generating a response. Error: {str(e)}"
    
    def _prepare_meeting_context(self, meetings: List[Meeting], query_type: str) -> str:
        """Prepare meeting context based on query type"""
        context_parts = []
        
        for i, meeting in enumerate(meetings[:5], 1):  # Top 5 meetings
            meeting_info = [
                f"Meeting {i}: {meeting.title}",
                f"Date: {meeting.created_at.strftime('%Y-%m-%d %H:%M')}",
                f"Summary: {meeting.summary or 'No summary available'}"
            ]
            
            # Add specific content based on query type
            if query_type == "action_items" and meeting.action_items:
                action_items = meeting.action_items if isinstance(meeting.action_items, list) else []
                if action_items:
                    meeting_info.append(f"Action Items: {', '.join(action_items)}")
            
            elif query_type == "summary" and meeting.key_points:
                key_points = meeting.key_points if isinstance(meeting.key_points, list) else []
                if key_points:
                    meeting_info.append(f"Key Points: {', '.join(key_points)}")
            
            # Add transcript excerpt for context
            if meeting.transcript:
                transcript_excerpt = meeting.transcript[:500]  # First 500 chars
                meeting_info.append(f"Transcript Excerpt: {transcript_excerpt}...")
            
            context_parts.append("\n".join(meeting_info))
        
        return "\n\n".join(context_parts)
    
    def _create_prompt(self, query: str, analysis: Dict, context: str) -> str:
        """Create AI prompt based on query type and context"""
        base_prompt = f"""
You are a helpful meeting assistant. Answer the user's question based on the meeting information provided.

User Question: {query}
Query Type: {analysis['type']}

Meeting Information:
{context}

Instructions:
- Provide a direct, helpful answer to the user's question
- Use specific information from the meetings when possible
- If asking about action items/todos, list them clearly
- If asking for summaries, provide concise overviews
- If the information isn't available in the meetings, say so
- Be conversational and friendly
- Format your response clearly with bullet points or numbered lists when appropriate

Answer:"""

        return base_prompt

# Global instance
meeting_chat_service = MeetingChatService()
