import os
import tempfile
import subprocess
import asyncio
import json
import time
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime
from pathlib import Path
import logging

logger = logging.getLogger(__name__)

# Try to import Coqui TTS for voice cloning
try:
    from TTS.api import TTS
    COQUI_AVAILABLE = True
    logger.info("Coqui TTS loaded successfully")
except ImportError:
    COQUI_AVAILABLE = False
    logger.warning("Coqui TTS not available. Voice cloning features will be disabled.")

class TTSService:
    def __init__(self):
        self.voice_models_dir = "/tmp/voice_models"
        self.voice_profiles_file = os.path.join(self.voice_models_dir, "voice_profiles.json")
        self.temp_dir = tempfile.gettempdir()
        
        # Create voice models directory
        os.makedirs(self.voice_models_dir, exist_ok=True)
        
        # Load existing voice profiles on startup
        self.voice_profiles = self._load_voice_profiles()
        
        # Get available system voices for better voice mapping
        self.available_voices = self._get_available_system_voices()
        
        # Initialize Coqui TTS if available
        if COQUI_AVAILABLE:
            try:
                # Initialize XTTS v2 model for voice cloning
                self.tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
                logger.info("XTTS v2 model initialized for voice cloning")
            except Exception as e:
                logger.error(f"Failed to initialize Coqui TTS: {e}")
                self.tts_model = None
        else:
            self.tts_model = None
        
        logger.info(f"[TTS] Initialized TTS Service - {len(self.voice_profiles)} voice profiles loaded, {len(self.available_voices)} system voices available")
        
    def _get_available_system_voices(self) -> List[Dict[str, str]]:
        """Get list of available system voices"""
        try:
            # Run 'say -v ?' to get available voices
            process = subprocess.run(['say', '-v', '?'], capture_output=True, text=True)
            if process.returncode == 0:
                voices = []
                for line in process.stdout.strip().split('\n'):
                    if line.strip():
                        # Parse voice info: "VoiceName    language    # description"
                        parts = line.split(None, 2)
                        if len(parts) >= 2:
                            voice_name = parts[0]
                            language = parts[1]
                            description = parts[2] if len(parts) > 2 else ""
                            voices.append({
                                "name": voice_name,
                                "language": language, 
                                "description": description
                            })
                logger.info(f"[TTS] Found {len(voices)} system voices")
                return voices
            else:
                logger.warning("[TTS] Failed to get system voices")
                return []
        except Exception as e:
            logger.error(f"[TTS] Error getting system voices: {e}")
            return []
        
    def _load_voice_profiles(self) -> List[Dict[str, Any]]:
        """Load voice profiles from persistent storage"""
        try:
            if os.path.exists(self.voice_profiles_file):
                with open(self.voice_profiles_file, 'r') as f:
                    profiles = json.load(f)
                    # Verify profile files still exist
                    valid_profiles = []
                    for profile in profiles:
                        if os.path.exists(profile.get('file_path', '')):
                            valid_profiles.append(profile)
                        else:
                            logger.warning(f"[TTS] Voice profile file not found: {profile.get('name', 'Unknown')}")
                    return valid_profiles
            else:
                logger.info("[TTS] No existing voice profiles found")
                return []
        except Exception as e:
            logger.error(f"[TTS] Error loading voice profiles: {e}")
            return []
    
    def _save_voice_profiles(self):
        """Save voice profiles to persistent storage"""
        try:
            with open(self.voice_profiles_file, 'w') as f:
                json.dump(self.voice_profiles, f, indent=2)
            logger.info(f"[TTS] Voice profiles saved to {self.voice_profiles_file}")
        except Exception as e:
            logger.error(f"[TTS] Error saving voice profiles: {e}")
        
    async def generate_speech(self, text: str, voice_model: str = "default", speech_type: str = "summary") -> str:
        """Generate speech from text using voice cloning"""
        try:
            print(f"[TTS] Generate speech called with voice_model: '{voice_model}'")
            logger.info(f"[TTS] Generating speech: {len(text)} characters")
            logger.info(f"[TTS] Type: {speech_type}, Voice model: '{voice_model}'")
            
            # Create output filename
            output_filename = f"speech_{uuid.uuid4().hex}.wav"
            output_path = os.path.join(self.temp_dir, output_filename)
            
            if voice_model != "default":
                # Find the voice profile
                profile = self.get_voice_profile_by_id(voice_model)
                
                if profile and os.path.exists(profile.get('file_path', '')):
                    # Use custom voice model (enhanced system voice for now)
                    print(f"[TTS] Using custom voice profile: {profile['name']}")
                    logger.info(f"[TTS] Using custom voice profile: {profile['name']}")
                    audio_path = await self._generate_with_enhanced_voice(text, output_path, profile['name'])
                else:
                    print(f"[TTS] Voice profile not found, falling back to default")
                    logger.warning(f"[TTS] Voice profile not found or file missing: {voice_model}, falling back to default")
                    audio_path = await self._generate_system_speech(text, output_path)
            else:
                # Use system TTS as default
                print("[TTS] Using default system voice")
                logger.info("[TTS] Using default system voice")
                audio_path = await self._generate_system_speech(text, output_path)
            
            return audio_path
            
        except Exception as e:
            logger.error(f"[TTS] Error in generate_speech: {e}")
            raise e
    
    async def generate_speech_stream(self, text: str, voice_model: str = "default", speech_type: str = "summary", chunk_size: int = 100) -> List[Dict[str, str]]:
        """Generate speech from text using streaming approach with smaller chunks"""
        try:
            logger.info(f"[TTS] Streaming speech generation: {len(text)} characters, chunk_size: {chunk_size}")
            
            # Split text into smaller chunks
            text_chunks = self._split_text_into_chunks(text, chunk_size)
            logger.info(f"[TTS] Split into {len(text_chunks)} chunks")
            
            audio_chunks = []
            
            for i, chunk_text in enumerate(text_chunks):
                if not chunk_text.strip():  # Skip empty chunks
                    continue
                    
                logger.info(f"[TTS] Processing chunk {i+1}/{len(text_chunks)}: {chunk_text[:50]}...")
                
                # Generate filename for this chunk
                chunk_filename = f"speech_chunk_{uuid.uuid4().hex}_{i}.wav"
                chunk_output_path = os.path.join(self.temp_dir, chunk_filename)
                
                try:
                    # Generate audio for this chunk
                    if voice_model != "default":
                        # Find the voice profile
                        profile = self.get_voice_profile_by_id(voice_model)
                        
                        if profile and os.path.exists(profile.get('file_path', '')):
                            # Use custom voice model
                            logger.info(f"[TTS] Using custom voice profile for chunk {i+1}: {profile['name']}")
                            audio_path = await self._generate_with_enhanced_voice(chunk_text, chunk_output_path, profile['name'])
                        else:
                            logger.warning(f"[TTS] Voice profile not found for chunk {i+1}, using default")
                            audio_path = await self._generate_system_speech(chunk_text, chunk_output_path)
                    else:
                        # Use system TTS as default
                        audio_path = await self._generate_system_speech(chunk_text, chunk_output_path)
                    
                    # Verify chunk was created successfully
                    if os.path.exists(audio_path) and os.path.getsize(audio_path) > 0:
                        audio_chunks.append({
                            "chunk_id": i,
                            "text": chunk_text,
                            "audio_path": audio_path,
                            "filename": chunk_filename,
                            "url": f"/api/tts/chunk/{chunk_filename}"
                        })
                        logger.info(f"[TTS] Successfully generated chunk {i+1} ({os.path.getsize(audio_path)} bytes)")
                    else:
                        logger.error(f"[TTS] Failed to generate chunk {i+1}")
                        
                except Exception as chunk_error:
                    logger.error(f"[TTS] Error generating chunk {i+1}: {chunk_error}")
                    # Continue with other chunks even if one fails
                    continue
            
            logger.info(f"[TTS] Stream generation complete: {len(audio_chunks)} successful chunks")
            return audio_chunks
            
        except Exception as e:
            logger.error(f"[TTS] Error in generate_speech_stream: {e}")
            raise e
    
    def _split_text_into_chunks(self, text: str, max_chunk_size: int = 100) -> List[str]:
        """Split text into smaller chunks based on sentences and size limits"""
        try:
            # First, split by sentences
            import re
            sentence_endings = r'[.!?]+\s+'
            sentences = re.split(sentence_endings, text.strip())
            
            chunks = []
            current_chunk = ""
            
            for sentence in sentences:
                sentence = sentence.strip()
                if not sentence:
                    continue
                
                # If adding this sentence would exceed chunk size, start new chunk
                if len(current_chunk) + len(sentence) + 2 > max_chunk_size and current_chunk:
                    chunks.append(current_chunk.strip())
                    current_chunk = sentence
                else:
                    if current_chunk:
                        current_chunk += ". " + sentence
                    else:
                        current_chunk = sentence
            
            # Add the last chunk
            if current_chunk.strip():
                chunks.append(current_chunk.strip())
            
            # If no sentence-based splitting worked, fall back to character-based splitting
            if not chunks and text.strip():
                words = text.split()
                current_chunk = ""
                
                for word in words:
                    if len(current_chunk) + len(word) + 1 > max_chunk_size and current_chunk:
                        chunks.append(current_chunk.strip())
                        current_chunk = word
                    else:
                        if current_chunk:
                            current_chunk += " " + word
                        else:
                            current_chunk = word
                
                if current_chunk.strip():
                    chunks.append(current_chunk.strip())
            
            logger.info(f"[TTS] Text split into {len(chunks)} chunks")
            return chunks
            
        except Exception as e:
            logger.error(f"[TTS] Error splitting text: {e}")
            # Fallback: return original text as single chunk
            return [text] if text.strip() else []
    
    async def _generate_with_enhanced_voice(self, text: str, output_path: str, profile_name: str = None) -> str:
        """Generate speech using enhanced voice settings or voice cloning for custom voice profile"""
        try:
            logger.info(f"[TTS] Using enhanced voice profile for: {profile_name}")
            
            # Find the voice profile
            profile = None
            for p in self.voice_profiles:
                if p['name'] == profile_name:
                    profile = p
                    break
            
            if profile and os.path.exists(profile.get('file_path', '')):
                # Try voice cloning first if Coqui TTS is available
                if COQUI_AVAILABLE and self.tts_model is not None:
                    try:
                        logger.info(f"[TTS] Attempting voice cloning for {profile_name}")
                        return await self._generate_with_voice_cloning(text, output_path, profile['file_path'])
                    except Exception as e:
                        logger.warning(f"[TTS] Voice cloning failed, falling back to enhanced system voice: {e}")
                
                # Fallback to enhanced system voice selection
                logger.info(f"[TTS] Using enhanced system voice selection for {profile_name}")
                
                # Analyze the voice sample to determine characteristics
                voice_characteristics = await self._analyze_voice_sample(profile['file_path'])
                print(f"[TTS] Voice analysis for {profile_name}: {voice_characteristics}")
                
                # Select the best matching system voice based on analysis
                selected_voice = self._select_best_system_voice(profile_name, voice_characteristics)
                
                # Generate speech with the selected voice
                return await self._generate_system_speech(text, output_path, enhanced=True, 
                                                        profile_name=profile_name, 
                                                        custom_voice=selected_voice)
            
            # Fallback to default enhanced system TTS
            return await self._generate_system_speech(text, output_path, enhanced=True, profile_name=profile_name)
            
        except Exception as e:
            logger.error(f"[TTS] Enhanced voice generation failed: {e}")
            raise e
    
    async def _generate_with_voice_cloning(self, text: str, output_path: str, voice_sample_path: str) -> str:
        """Generate speech using Coqui TTS voice cloning"""
        try:
            logger.info(f"[TTS] Starting voice cloning with sample: {voice_sample_path}")
            
            # Run voice cloning in a separate thread to avoid blocking
            def clone_voice():
                self.tts_model.tts_to_file(
                    text=text,
                    speaker_wav=voice_sample_path,
                    file_path=output_path,
                    language="en"
                )
                return output_path
            
            # Run in thread pool to avoid blocking the event loop
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(clone_voice)
                result = await asyncio.get_event_loop().run_in_executor(None, future.result)
                
            logger.info(f"[TTS] Voice cloning completed: {output_path}")
            return output_path
            
        except Exception as e:
            logger.error(f"[TTS] Voice cloning failed: {e}")
            raise e
    
    async def _analyze_voice_sample(self, voice_sample_path: str) -> Dict[str, Any]:
        """Analyze voice sample to determine characteristics"""
        try:
            # Use ffprobe to get audio characteristics
            probe_command = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams',
                voice_sample_path
            ]
            
            process = await asyncio.create_subprocess_exec(
                *probe_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                probe_data = json.loads(stdout.decode())
                audio_stream = None
                
                # Find audio stream
                for stream in probe_data.get('streams', []):
                    if stream.get('codec_type') == 'audio':
                        audio_stream = stream
                        break
                
                if audio_stream:
                    # Extract characteristics
                    sample_rate = int(audio_stream.get('sample_rate', 0))
                    duration = float(audio_stream.get('duration', 0))
                    
                    # Estimate voice characteristics based on audio properties
                    characteristics = {
                        "sample_rate": sample_rate,
                        "duration": duration,
                        "estimated_gender": self._estimate_gender_from_sample_rate(sample_rate),
                        "estimated_age_group": self._estimate_age_from_duration(duration),
                        "quality": "high" if sample_rate >= 22050 else "standard"
                    }
                    
                    return characteristics
            
            # Fallback characteristics
            return {
                "estimated_gender": "unknown",
                "estimated_age_group": "adult",
                "quality": "standard"
            }
            
        except Exception as e:
            logger.warning(f"[TTS] Voice analysis failed: {e}")
            return {
                "estimated_gender": "unknown", 
                "estimated_age_group": "adult",
                "quality": "standard"
            }
    
    def _estimate_gender_from_sample_rate(self, sample_rate: int) -> str:
        """Simple heuristic to estimate gender based on sample characteristics"""
        # This is a very basic heuristic - in reality you'd need pitch analysis
        if sample_rate >= 44100:
            return "unknown"  # High quality, could be either
        elif sample_rate >= 22050:
            return "male"     # Medium quality, often male voices
        else:
            return "female"   # Lower sample rate, often higher pitch (female)
    
    def _estimate_age_from_duration(self, duration: float) -> str:
        """Estimate age group from recording characteristics"""
        if duration < 3:
            return "young"
        elif duration < 8:
            return "adult"
        else:
            return "mature"
    
    def _select_best_system_voice(self, profile_name: str, characteristics: Dict[str, Any]) -> str:
        """Select the best matching system voice based on profile characteristics"""
        try:
            estimated_gender = characteristics.get("estimated_gender", "unknown")
            estimated_age = characteristics.get("estimated_age_group", "adult")
            
            print(f"[TTS] Selecting voice for {profile_name}: gender={estimated_gender}, age={estimated_age}")
            
            # Voice mapping based on name and characteristics
            if "Bhanu" in profile_name or "bhanu" in profile_name.lower():
                # For Bhanu specifically, use a distinctive male voice
                candidates = ["Daniel", "Alex", "Fred", "Tom"]
            elif estimated_gender == "male":
                candidates = ["Alex", "Daniel", "Fred", "Tom", "Ralph"]
            elif estimated_gender == "female":
                candidates = ["Samantha", "Victoria", "Karen", "Kate", "Susan"]
            else:
                # Default based on name patterns
                if any(name in profile_name.lower() for name in ["john", "mike", "david", "james", "robert"]):
                    candidates = ["Alex", "Daniel", "Fred"]
                elif any(name in profile_name.lower() for name in ["sarah", "emily", "lisa", "karen", "susan"]):
                    candidates = ["Samantha", "Victoria", "Kate"]
                else:
                    candidates = ["Alex", "Samantha"]  # Default fallback
            
            # Check which voices are actually available
            available_voice_names = [v["name"] for v in self.available_voices]
            
            for candidate in candidates:
                if candidate in available_voice_names:
                    print(f"[TTS] Selected system voice: {candidate} for {profile_name}")
                    return candidate
            
            # Ultimate fallback
            return "Alex" if "Alex" in available_voice_names else available_voice_names[0] if available_voice_names else "Alex"
            
        except Exception as e:
            logger.warning(f"[TTS] Voice selection failed: {e}")
            return "Alex"
    
    async def _generate_system_speech(self, text: str, output_path: str, enhanced: bool = False, profile_name: str = None, custom_voice: str = None) -> str:
        """Generate speech using system TTS with proper audio format"""
        try:
            logger.info(f"[TTS] Using system TTS for: {text[:100]}...")
            
            # Clean text for better TTS
            clean_text = self._clean_text_for_tts(text)
            
            # Use different voice settings for enhanced mode
            if enhanced and custom_voice:
                voice_name = custom_voice
                rate = "175"  # Slightly slower for better clarity
                print(f"[TTS] Using custom selected voice: {voice_name} for {profile_name}")
            elif enhanced:
                # Choose voice based on profile name
                if profile_name and "Bhanu" in profile_name:
                    voice_name = "Daniel"  # More distinctive male voice for Bhanu
                    rate = "180"  # Slightly slower pace
                    print(f"[TTS] Using Daniel voice for {profile_name}")
                else:
                    voice_name = "Karen"  # Australian female voice - more distinctive
                    rate = "170"  # Slower pace
            else:
                voice_name = "Alex"  # Default male voice
                rate = "200"  # Normal speed
            
            # Generate speech directly to WAV format using say command
            say_command = [
                'say',
                '-v', voice_name,
                '-r', rate,
                '-o', output_path,
                '--data-format=LEF32@22050',  # 32-bit float, 22kHz
                clean_text
            ]
            
            logger.info(f"[TTS] Running command: {' '.join(say_command[:6])}...")
            
            process = await asyncio.create_subprocess_exec(
                *say_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                logger.error(f"[TTS] Say command failed: {stderr.decode()}")
                raise Exception(f"TTS generation failed: {stderr.decode()}")
            
            # Verify the file was created and has content
            if not os.path.exists(output_path):
                raise Exception("TTS output file was not created")
            
            file_size = os.path.getsize(output_path)
            if file_size == 0:
                raise Exception("TTS output file is empty")
            
            logger.info(f"[TTS] Generated system speech: {output_path} ({file_size} bytes)")
            return output_path
            
        except Exception as e:
            logger.error(f"[TTS] System TTS generation failed: {e}")
            raise e
    
    def _clean_text_for_tts(self, text: str) -> str:
        """Clean text for better TTS pronunciation"""
        # Remove excessive whitespace
        clean_text = ' '.join(text.split())
        
        # Add pauses for better speech flow
        clean_text = clean_text.replace('.', '... ')
        clean_text = clean_text.replace(',', ', ')
        clean_text = clean_text.replace(';', '; ')
        clean_text = clean_text.replace(':', ': ')
        clean_text = clean_text.replace('\n', ' ')
        clean_text = clean_text.replace('  ', ' ')
        
        # Limit length to avoid very long speech
        if len(clean_text) > 2000:
            clean_text = clean_text[:2000] + "... and more."
        
        # Fix common pronunciation issues
        clean_text = clean_text.replace('API', 'A P I')
        clean_text = clean_text.replace('UI', 'U I')
        clean_text = clean_text.replace('URL', 'U R L')
        clean_text = clean_text.replace('JSON', 'Jason')
        clean_text = clean_text.replace('HTTP', 'H T T P')
        
        return clean_text
    
    async def train_voice_profile(self, voice_sample_path: str, profile_name: str, sample_duration: int = 0) -> Dict[str, Any]:
        """Train a new voice profile with user's voice sample"""
        try:
            logger.info(f"[TTS] Training voice profile '{profile_name}' with sample: {voice_sample_path}")
            
            # Generate unique profile ID
            profile_id = str(uuid.uuid4())
            
            # Create permanent filename for the voice sample
            permanent_voice_path = os.path.join(self.voice_models_dir, f"voice_profile_{profile_id}.wav")
            
            # Convert WebM to WAV for training using ffmpeg
            convert_command = [
                'ffmpeg', '-y', '-i', voice_sample_path, 
                '-acodec', 'pcm_s16le', '-ar', '22050', '-ac', '1',
                permanent_voice_path
            ]
            
            process = await asyncio.create_subprocess_exec(
                *convert_command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode != 0:
                logger.error(f"[TTS] Audio conversion failed: {stderr.decode()}")
                raise Exception(f"Audio conversion failed: {stderr.decode()}")
            
            # Verify the converted file exists and has content
            if not os.path.exists(permanent_voice_path):
                raise Exception("Voice training failed: converted file was not created")
            
            file_size = os.path.getsize(permanent_voice_path)
            if file_size == 0:
                raise Exception("Voice training failed: converted file is empty")
            
            # Create voice profile
            voice_profile = {
                "id": profile_id,
                "name": profile_name,
                "file_path": permanent_voice_path,
                "created_at": datetime.now().isoformat(),
                "sample_duration": sample_duration,
                "file_size": file_size
            }
            
            # Add to profiles list
            self.voice_profiles.append(voice_profile)
            
            # Save profiles to persistent storage
            self._save_voice_profiles()
            
            logger.info(f"[TTS] Voice profile '{profile_name}' trained and saved: {permanent_voice_path} ({file_size} bytes)")
            
            return {
                "profile_id": profile_id,
                "name": profile_name,
                "file_path": permanent_voice_path,
                "created_at": voice_profile["created_at"],
                "status": "ready",
                "persistent": True,
                "file_size": file_size
            }
            
        except Exception as e:
            logger.error(f"[TTS] Voice profile training failed: {e}")
            raise e
    
    def get_voice_profiles(self) -> List[Dict[str, Any]]:
        """Get all voice profiles"""
        return self.voice_profiles
    
    def get_voice_profile_by_id(self, profile_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific voice profile by ID"""
        for profile in self.voice_profiles:
            if profile["id"] == profile_id:
                return profile
        return None
    
    def delete_voice_profile(self, profile_id: str) -> bool:
        """Delete a voice profile"""
        try:
            profile = self.get_voice_profile_by_id(profile_id)
            if not profile:
                return False
            
            # Remove the voice sample file
            if os.path.exists(profile["file_path"]):
                os.remove(profile["file_path"])
                logger.info(f"[TTS] Removed voice profile file: {profile['file_path']}")
            
            # Remove from profiles list
            self.voice_profiles = [p for p in self.voice_profiles if p["id"] != profile_id]
            
            # Save updated profiles
            self._save_voice_profiles()
            
            logger.info(f"[TTS] Voice profile '{profile['name']}' deleted successfully")
            return True
            
        except Exception as e:
            logger.error(f"[TTS] Error deleting voice profile: {e}")
            return False
    
    def get_voice_status(self) -> Dict[str, Any]:
        """Get current voice model status"""
        return {
            "total_profiles": len(self.voice_profiles),
            "voice_profiles": [
                {
                    "id": profile["id"],
                    "name": profile["name"],
                    "created_at": profile["created_at"],
                    "sample_duration": profile.get("sample_duration", 0)
                }
                for profile in self.voice_profiles
            ],
            "default_voice_available": True,
            "profiles_file_exists": os.path.exists(self.voice_profiles_file)
        }
