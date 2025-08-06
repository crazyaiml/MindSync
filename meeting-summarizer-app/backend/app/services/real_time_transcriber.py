import asyncio
import websockets
import json
import tempfile
import os
from typing import Dict, List
from app.services.whisper_client import WhisperClient
from app.services.vosk_client import VoskClient
from app.services.ollama_client import OllamaClient
from app.services.vector_store import vector_store
from app.services.pronunciation_corrector import pronunciation_corrector
from app.database import get_db
from datetime import datetime

class RealTimeTranscriber:
    def __init__(self):
        self.whisper_client = WhisperClient()
        self.vosk_client = VoskClient()
        self.ollama_client = OllamaClient()
        self.active_sessions: Dict[str, Dict] = {}
        self.last_suggestion_time = {}  # Rate limiting for suggestions
        self.audio_buffers = {}  # Buffer audio chunks before transcription
        self.vosk_recognizers = {}  # Store VOSK recognizers per session
        self.min_confidence = 0.6  # Increased confidence threshold for better quality
        self.use_vosk = True  # Use VOSK for real-time transcription by default
    
    def start_vosk_session(self, session_id: str):
        """Initialize VOSK recognizer for a session"""
        try:
            if self.vosk_client.is_ready():
                recognizer = self.vosk_client.create_recognizer()
                self.vosk_recognizers[session_id] = recognizer
                print(f"[TRANSCRIBER] VOSK recognizer created for session {session_id}")
                return True
            else:
                print(f"[TRANSCRIBER] VOSK not ready, falling back to Whisper for session {session_id}")
                return False
        except Exception as e:
            print(f"[TRANSCRIBER] Error creating VOSK recognizer: {e}")
            return False
    
    def end_vosk_session(self, session_id: str):
        """Clean up VOSK recognizer for a session"""
        if session_id in self.vosk_recognizers:
            del self.vosk_recognizers[session_id]
            print(f"[TRANSCRIBER] VOSK recognizer cleaned up for session {session_id}")
    
    async def process_audio_chunk(self, session_id: str, audio_data: bytes, use_vosk: bool = True) -> Dict:
        """Process audio chunk and return transcription with enhanced validation"""
        try:
            print(f"[TRANSCRIBER] Processing chunk for session {session_id}, size: {len(audio_data)} bytes, using VOSK: {use_vosk}")
            
            # Initialize session if not exists
            if session_id not in self.active_sessions:
                self.active_sessions[session_id] = {
                    'full_transcript': '',
                    'last_update': datetime.now(),
                    'suggestions': []
                }
            
            # Use VOSK for real-time transcription (AI Assistant mode)
            if use_vosk and self.vosk_client.is_ready():
                # Ensure VOSK recognizer exists for this session
                if session_id not in self.vosk_recognizers:
                    if not self.start_vosk_session(session_id):
                        # Fall back to Whisper if VOSK fails
                        return await self._process_with_whisper(session_id, audio_data)
                
                recognizer = self.vosk_recognizers[session_id]
                
                # Convert WebM to PCM for VOSK
                pcm_data = self.vosk_client._convert_to_pcm(audio_data)
                if not pcm_data:
                    print("[TRANSCRIBER] Failed to convert audio to PCM")
                    return await self._build_response(session_id, "", 0.0, False, "Audio conversion failed")
                
                # Process with VOSK stream
                result = self.vosk_client.transcribe_stream(recognizer, pcm_data)
                
                if result and result.get("text"):
                    text = result["text"].strip()
                    confidence = result.get("confidence", 0.8)  # VOSK typically has good confidence
                    
                    # Basic validation for VOSK results
                    if len(text) < 2 or self._is_garbled_text(text):
                        return await self._build_response(session_id, "", 0.0, False, "Low quality VOSK transcription")
                    
                    # Update session with new text
                    session = self.active_sessions[session_id]
                    if text not in session['full_transcript']:  # Avoid duplicates
                        session['full_transcript'] += f" {text}"
                        session['last_update'] = datetime.now()
                    
                    return await self._build_response(session_id, text, confidence, True, engine="vosk")
                else:
                    # No speech detected or empty result
                    return await self._build_response(session_id, "", 0.0, False, engine="vosk")
            
            # Use Whisper for standard mode or fallback
            else:
                return await self._process_with_whisper(session_id, audio_data)
        
        except Exception as e:
            print(f"[TRANSCRIBER] Error processing audio chunk: {e}")
            return await self._build_response(session_id, "", 0.0, False, str(e))
    
    async def _build_response(self, session_id: str, transcription: str, confidence: float, is_final: bool, error: str = None, engine: str = "unknown") -> Dict:
        """Build standardized response format"""
        session = self.active_sessions.get(session_id, {})
        full_transcript = session.get('full_transcript', '').strip()
        
        response = {
            "transcription": transcription,
            "full_transcript": full_transcript,
            "confidence": confidence,
            "is_final": is_final,
            "language": "en",
            "engine": engine,
            "timestamp": datetime.now().isoformat(),
            "suggestions": []
        }
        
        if error:
            response["error"] = error
        
        # Generate suggestions if we have meaningful transcription
        if transcription and len(transcription.strip()) > 5 and confidence > 0.5:
            print(f"[TRANSCRIBER] Generating suggestions for: '{transcription[:50]}...'")
            try:
                suggestions = await self.get_suggestions(transcription, full_transcript)
                response["suggestions"] = suggestions
                print(f"[TRANSCRIBER] Generated {len(suggestions)} suggestions")
            except Exception as e:
                print(f"[TRANSCRIBER] Error generating suggestions: {e}")
                response["suggestions"] = []
        
        return response
    
    async def _process_with_whisper(self, session_id: str, audio_data: bytes) -> Dict:
        """Process audio with Whisper (for standard mode or fallback)"""
        try:
            # Save audio temporarily
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            temp_audio_path = f"/tmp/audio_chunk_{session_id}_{timestamp}.webm"
            
            with open(temp_audio_path, "wb") as f:
                f.write(audio_data)
            
            print(f"[TRANSCRIBER] Processing with Whisper for session {session_id}")
            
            # Process with Whisper
            result = self.whisper_client.transcribe(temp_audio_path)
            
            # Clean up temporary file
            os.unlink(temp_audio_path)
            
            # Validate transcription quality
            text = result.get("text", "").strip()
            if self._is_garbled_text(text):
                print(f"[TRANSCRIBER] Detected garbled text: '{text}'")
                return await self._build_response(session_id, "", 0.0, False, "Low quality transcription detected", "whisper")
            
            # Check confidence
            avg_confidence = result.get("avg_confidence", 0.0)
            if avg_confidence < 0.3:
                print(f"[TRANSCRIBER] Low confidence: {avg_confidence}")
                return await self._build_response(session_id, "", avg_confidence, False, "Low confidence transcription", "whisper")
            
            # Update session with new text
            if session_id not in self.active_sessions:
                self.active_sessions[session_id] = {
                    'full_transcript': '',
                    'last_update': datetime.now(),
                    'suggestions': []
                }
            
            session = self.active_sessions[session_id]
            if text and text not in session['full_transcript']:  # Avoid duplicates
                session['full_transcript'] += f" {text}"
                session['last_update'] = datetime.now()
            
            return await self._build_response(session_id, text, avg_confidence, True, engine="whisper")
        
        except Exception as e:
            print(f"[TRANSCRIBER] Error in Whisper processing: {e}")
            return await self._build_response(session_id, "", 0.0, False, str(e), "whisper")
    
    async def get_suggestions(self, current_sentence: str, full_context: str) -> List[Dict]:
        """Get context-aware suggestions based on current conversation"""
        try:
            print(f"[SUGGESTIONS] Starting suggestion generation for: '{current_sentence[:100]}...'")
            
            # Rate limiting: only generate suggestions every 5 seconds to avoid overload (reduced from 10)
            session_key = f"{current_sentence[:50]}"  # Use first 50 chars as key
            current_time = datetime.now().timestamp()
            
            if session_key in self.last_suggestion_time:
                time_since_last = current_time - self.last_suggestion_time[session_key]
                if time_since_last < 5:  # Reduced from 10 to 5 seconds
                    print(f"[SUGGESTIONS] Rate limited: {time_since_last:.1f}s since last, need 5s")
                    return []  # Skip if too recent
            
            self.last_suggestion_time[session_key] = current_time
            print(f"[SUGGESTIONS] Rate limit passed, generating suggestions...")
            
            # Search for similar content in previous meetings
            print(f"[SUGGESTIONS] Searching vector store for similar content...")
            similar_chunks = vector_store.search_similar(current_sentence, top_k=3)
            print(f"[SUGGESTIONS] Found {len(similar_chunks)} similar chunks")
            
            if not similar_chunks:
                print(f"[SUGGESTIONS] No similar chunks found, returning empty suggestions")
                return []
            
            # Generate contextual suggestions using LLM
            context_text = "\n".join([chunk['text'] for chunk in similar_chunks])
            print(f"[SUGGESTIONS] Building LLM prompt with context from {len(similar_chunks)} chunks")
            
            prompt = f"""
            Based on the current conversation context and previous meeting history, provide helpful suggestions.
            
            Current sentence: "{current_sentence}"
            Current conversation context: "{full_context[-500:]}"  # Last 500 chars
            
            Relevant previous information:
            {context_text}
            
            Please provide 2-3 brief, actionable suggestions that could help in this conversation.
            Format as a JSON array of objects with 'type' and 'suggestion' fields.
            Types can be: 'reminder', 'context', 'action', 'question'
            
            Example:
            [
                {{"type": "reminder", "suggestion": "Last meeting you mentioned working on project X"}},
                {{"type": "context", "suggestion": "This relates to the Q2 goals discussed in March"}}
            ]
            """
            
            print(f"[SUGGESTIONS] Calling LLM for suggestion generation...")
            response = await asyncio.get_event_loop().run_in_executor(
                None, 
                lambda: self.ollama_client.client.generate(
                    model=self.ollama_client.model,
                    prompt=prompt
                )
            )
            
            # Parse LLM response
            try:
                suggestions_text = response['response'].strip()
                print(f"[SUGGESTIONS] LLM response received: {suggestions_text[:200]}...")
                
                # Extract JSON array from response
                import re
                json_match = re.search(r'\[.*\]', suggestions_text, re.DOTALL)
                if json_match:
                    print(f"[SUGGESTIONS] Found JSON match, parsing...")
                    suggestions = json.loads(json_match.group())
                    print(f"[SUGGESTIONS] Successfully parsed {len(suggestions)} suggestions")
                    
                    # Add metadata
                    for suggestion in suggestions:
                        suggestion['timestamp'] = datetime.now().isoformat()
                        suggestion['source_meetings'] = [
                            {'title': chunk['meeting_title'], 'id': chunk['meeting_id']}
                            for chunk in similar_chunks
                        ]
                    
                    print(f"[SUGGESTIONS] Returning suggestions: {suggestions}")
                    return suggestions
                else:
                    print(f"[SUGGESTIONS] No JSON array found in LLM response")
                
            except (json.JSONDecodeError, AttributeError) as e:
                print(f"[SUGGESTIONS] Error parsing LLM suggestions: {e}")
                print(f"[SUGGESTIONS] Raw response was: {response.get('response', 'No response')}")
                
                # Fallback: simple context suggestions
                print(f"[SUGGESTIONS] Using fallback suggestion...")
                return [{
                    'type': 'context',
                    'suggestion': f"Related to previous meeting: {similar_chunks[0]['meeting_title']}",
                    'timestamp': datetime.now().isoformat(),
                    'source_meetings': [{'title': similar_chunks[0]['meeting_title'], 'id': similar_chunks[0]['meeting_id']}]
                }]
            
            print(f"[SUGGESTIONS] No suggestions generated, returning empty list")
            return []
            
        except Exception as e:
            print(f"[SUGGESTIONS] Error generating suggestions: {e}")
            import traceback
            print(f"[SUGGESTIONS] Full traceback: {traceback.format_exc()}")
            return []
    
    def _is_valid_transcription(self, text: str) -> bool:
        """Validate transcription quality to filter out garbled text"""
        print(f"[VALIDATION] Checking transcription: '{text}'")
        
        if not text or len(text.strip()) < 3:  # Increased minimum length
            print(f"[VALIDATION] REJECTED: Text too short or empty")
            return False
        
        # Check for common Whisper hallucinations and artifacts
        whisper_hallucinations = [
            r'\bthanks\s+for\s+watching\b',  # Common Whisper hallucination
            r'\bsubscribe\b',  # YouTube-related hallucination
            r'\blike\s+and\s+subscribe\b',
            r'\bdon\'t\s+forget\s+to\b',
            r'\bplease\s+subscribe\b',
            r'\bcheck\s+out\s+my\b',
            r'\bvisit\s+my\s+website\b',
        ]
        
        # Check for garbled or incoherent speech patterns
        garbled_patterns = [
            # Look for random word combinations that don't make sense
            r'\bpink\s+tape\s+final\b',  # Specific pattern you mentioned
            r'\bmexicans\s+different\s+that\'s\s+where\s+my\s+racing\b',  # Another specific pattern
            # Check for mixing of unrelated topics in short phrases
            r'\btape\s+.*\bmexicans\b',  # tape and mexicans don't typically go together
            r'\bracing\s+.*\bhear\b.*\?$',  # "racing ... hear?" pattern
            # Common audio corruption indicators
            r'\b\d+\.\d+\s+when\s+it\'s\s+about\b',  # "2.4 When it's about" pattern
            # Short fragments with random words
            r'^\w{1,5}\s+\w{1,5}\s+\w{1,5}\s+\d+\.\d+',  # Very short words followed by decimals
        ]
        
        import re
        for pattern in garbled_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                print(f"[VALIDATION] REJECTED: Garbled speech pattern '{pattern}' found in: {text[:100]}")
                return False
        
        # Check for repetitive single words (like "you you", "the the", etc.)
        words = text.lower().split()
        if len(words) <= 3:  # For very short transcriptions
            # Check if it's just repeated words
            unique_words = set(words)
            if len(unique_words) < len(words) / 2:  # More than half are duplicates
                print(f"[VALIDATION] REJECTED: Repetitive words: {text[:100]}")
                return False
            
            # Check for single character or very short words repeated
            for word in unique_words:
                if len(word) <= 2 and words.count(word) >= 2:
                    print(f"[VALIDATION] REJECTED: Short word '{word}' repeated: {text[:100]}")
                    return False
        
        # Check for coherence - look for nonsensical word combinations
        if len(words) >= 4:
            # Simple coherence check: if more than 50% of words are uncommon/random
            common_words = {
                'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
                'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
                'above', 'below', 'between', 'among', 'this', 'that', 'these', 'those',
                'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
                'my', 'your', 'his', 'hers', 'its', 'our', 'their', 'mine', 'yours', 'ours',
                'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
                'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
                'can', 'shall', 'go', 'come', 'see', 'know', 'get', 'make', 'take', 'give',
                'think', 'say', 'tell', 'ask', 'work', 'seem', 'feel', 'try', 'leave', 'call',
                'good', 'new', 'first', 'last', 'long', 'great', 'little', 'own', 'other',
                'old', 'right', 'big', 'high', 'different', 'small', 'large', 'next', 'early',
                'young', 'important', 'few', 'public', 'bad', 'same', 'able', 'meeting',
                'discussion', 'project', 'team', 'work', 'business', 'company', 'time',
                'today', 'tomorrow', 'yesterday', 'now', 'here', 'there', 'where', 'when',
                'what', 'how', 'why', 'who', 'which', 'okay', 'yes', 'no', 'please', 'thank',
                'thanks', 'hello', 'hi', 'bye', 'goodbye', 'sorry', 'excuse', 'sure'
            }
            
            common_count = sum(1 for word in words if word.lower().strip('.,!?;:') in common_words)
            coherence_ratio = common_count / len(words)
            
            if coherence_ratio < 0.3:  # Less than 30% common words
                print(f"[VALIDATION] REJECTED: Low coherence ratio {coherence_ratio:.2f}: {text[:100]}")
                return False
        
        for pattern in whisper_hallucinations:
            if re.search(pattern, text, re.IGNORECASE):
                print(f"[VALIDATION] REJECTED: Whisper hallucination pattern '{pattern}' found in: {text[:100]}")
                return False
        
        # Check for nonsense words (words with unusual character patterns)
        words = text.split()
        for word in words:
            # Remove punctuation for analysis
            clean_word = re.sub(r'[^\w]', '', word.lower())
            if len(clean_word) > 3:
                # Check for unusual consonant clusters that don't exist in English
                consonant_clusters = re.findall(r'[bcdfghjklmnpqrstvwxyz]{4,}', clean_word)
                if consonant_clusters:
                    print(f"[VALIDATION] REJECTED: Unusual consonant cluster in word '{word}': {consonant_clusters}")
                    return False
                
                # Check for words with mixed scripts or unusual characters
                if re.search(r'[^\x00-\x7F]', clean_word):  # Non-ASCII characters
                    print(f"[VALIDATION] REJECTED: Non-ASCII characters in word '{word}'")
                    return False
        
        # Check for suspicious patterns that indicate corrupted audio/transcription
        suspicious_patterns = [
            # Multiple random characters/symbols
            r'[^\w\s]{3,}',  # 3+ consecutive non-word characters
            # Mixed scripts (e.g., Latin + Cyrillic + Asian)
            r'[а-я].*[ㄱ-ㅎ가-힣]',  # Cyrillic + Korean
            r'[a-z].*[а-я].*[ㄱ-ㅎ가-힣]',  # Latin + Cyrillic + Korean
            # URLs or email patterns in speech (unlikely in normal conversation)
            r'www\.|\.com|\.co\.|http|@.*\.',
            # Excessive repeated characters
            r'(.)\1{4,}',  # Same character repeated 5+ times
            # Random number/letter combinations
            r'\b[a-z]{1,2}\d{3,}\b',  # Short letters followed by many digits
        ]
        
        for pattern in suspicious_patterns:
            if re.search(pattern, text, re.IGNORECASE):
                print(f"[VALIDATION] REJECTED: Suspicious pattern '{pattern}' found in: {text[:100]}")
                return False
        
        # Check character diversity (too many unique Unicode blocks might indicate corruption)
        unique_scripts = set()
        for char in text:
            if ord(char) > 127:  # Non-ASCII
                if ord(char) >= 0x0400 and ord(char) <= 0x04FF:  # Cyrillic
                    unique_scripts.add('cyrillic')
                elif ord(char) >= 0xAC00 and ord(char) <= 0xD7AF:  # Korean
                    unique_scripts.add('korean')
                elif ord(char) >= 0x4E00 and ord(char) <= 0x9FFF:  # Chinese
                    unique_scripts.add('chinese')
                elif ord(char) >= 0x3040 and ord(char) <= 0x309F:  # Hiragana
                    unique_scripts.add('japanese')
        
        # Reject if too many different scripts (likely corruption)
        if len(unique_scripts) > 2:
            print(f"[VALIDATION] REJECTED: Mixed scripts {unique_scripts} in: {text[:100]}")
            return False
        
        print(f"[VALIDATION] PASSED: Text is valid")
        return True
    
    def get_session(self, session_id: str) -> Dict:
        """Get current session data"""
        return self.active_sessions.get(session_id, {})
    
    def end_session(self, session_id: str) -> Dict:
        """End a session and return final transcript"""
        if session_id in self.active_sessions:
            session = self.active_sessions.pop(session_id)
            
            # Clean up audio buffer for this session
            if session_id in self.audio_buffers:
                del self.audio_buffers[session_id]
                print(f"[TRANSCRIBER] Cleaned up audio buffer for session {session_id}")
            
            return {
                'session_id': session_id,
                'final_transcript': session.get('full_transcript', ''),
                'total_sentences': len(session.get('sentences', [])),
                'total_suggestions': len(session.get('suggestions', [])),
                'duration': (datetime.now() - session.get('start_time', datetime.now())).total_seconds()
            }
        return {}
    
    def clear_all_sessions(self) -> Dict:
        """Clear all active sessions (useful for cleaning up corrupted data)"""
        cleared_count = len(self.active_sessions)
        self.active_sessions.clear()
        
        # Clear all audio buffers
        buffer_count = len(self.audio_buffers)
        self.audio_buffers.clear()
        
        return {
            'message': f'Cleared {cleared_count} active sessions and {buffer_count} audio buffers',
            'cleared_sessions': cleared_count,
            'cleared_buffers': buffer_count
        }
    
    def _is_garbled_text(self, text: str) -> bool:
        """Check if transcribed text appears to be garbled or nonsensical"""
        if not text or len(text.strip()) < 2:
            return True
        
        # Remove common punctuation and whitespace
        clean_text = text.strip().lower()
        
        # Check for common garbled patterns
        garbled_patterns = [
            # Too many repeated characters (like "aaaaaaa" or "mmmmmmm")
            lambda t: any(char * 4 in t for char in 'abcdefghijklmnopqrstuvwxyz'),
            # Too many random single characters separated by spaces
            lambda t: len([word for word in t.split() if len(word) == 1]) > len(t.split()) * 0.5,
            # Random character sequences (more than 60% non-alphabetic characters)
            lambda t: sum(1 for char in t if not char.isalpha() and char != ' ') > len(t) * 0.6,
            # Very long "words" (likely encoding artifacts)
            lambda t: any(len(word) > 30 for word in t.split()),
            # Common transcription artifacts from speech recognition
            lambda t: any(artifact in t for artifact in ['unk', 'unintelligible', 'inaudible', '###']),
        ]
        
        # If any pattern matches, consider it garbled
        return any(pattern(clean_text) for pattern in garbled_patterns)

# Global instance
real_time_transcriber = RealTimeTranscriber()
