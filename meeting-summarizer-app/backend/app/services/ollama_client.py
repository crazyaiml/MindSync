import ollama
from typing import List
from config import settings
import asyncio

class OllamaClient:
    def __init__(self):
        self.client = ollama.Client(host=settings.OLLAMA_HOST)
        self.model = settings.OLLAMA_MODEL
    
    async def generate_summary(self, text: str) -> str:
        """Generate a summary of the meeting transcript"""
        prompt = f"""
        Please provide a concise summary of the following meeting transcript:

        {text}

        Focus on the main topics discussed, decisions made, and overall outcomes.
        """
        
        try:
            # Run the synchronous call in a thread pool
            response = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.client.generate(model=self.model, prompt=prompt)
            )
            return response['response'].strip()
        except Exception as e:
            print(f"Error generating summary: {e}")
            raise
    
    async def extract_key_points(self, text: str) -> List[str]:
        """Extract key points from the meeting transcript"""
        prompt = f"""
        Extract the key points from this meeting transcript. Return them as a numbered list:

        {text}

        Focus on important decisions, agreements, and main discussion points.
        """
        
        try:
            # Run the synchronous call in a thread pool
            response = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.client.generate(model=self.model, prompt=prompt)
            )
            # Parse the response into a list
            points = response['response'].strip().split('\n')
            return [point.strip() for point in points if point.strip()]
        except Exception as e:
            print(f"Error extracting key points: {e}")
            raise
    
    async def extract_action_items(self, text: str) -> List[str]:
        """Extract action items from the meeting transcript"""
        prompt = f"""
        Extract action items and tasks from this meeting transcript. Return them as a numbered list:

        {text}

        Focus on specific tasks, assignments, deadlines, and follow-up actions.
        """
        
        try:
            # Run the synchronous call in a thread pool
            response = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.client.generate(model=self.model, prompt=prompt)
            )
            # Parse the response into a list
            items = response['response'].strip().split('\n')
            return [item.strip() for item in items if item.strip()]
        except Exception as e:
            print(f"Error extracting action items: {e}")
            raise
    
    def is_ready(self) -> bool:
        """Check if Ollama is ready"""
        try:
            self.client.list()
            return True
        except:
            return False
