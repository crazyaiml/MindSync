import os
import pickle
import numpy as np
from typing import List, Dict, Tuple
from sentence_transformers import SentenceTransformer
import faiss
from sqlalchemy.orm import Session
from app.database import get_db, Meeting as DBMeeting

class VectorStore:
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        self.model = SentenceTransformer(model_name)
        self.dimension = self.model.get_sentence_embedding_dimension()
        self.index = faiss.IndexFlatIP(self.dimension)  # Inner Product for cosine similarity
        self.chunks = []  # Store text chunks with metadata
        self.index_file = "meeting_index.faiss"
        self.chunks_file = "meeting_chunks.pkl"
        self.load_index()
    
    def load_index(self):
        """Load existing index and chunks if they exist"""
        try:
            if os.path.exists(self.index_file) and os.path.exists(self.chunks_file):
                self.index = faiss.read_index(self.index_file)
                with open(self.chunks_file, 'rb') as f:
                    self.chunks = pickle.load(f)
                print(f"Loaded vector index with {len(self.chunks)} chunks")
        except Exception as e:
            print(f"Error loading index: {e}")
            self.index = faiss.IndexFlatIP(self.dimension)
            self.chunks = []
    
    def save_index(self):
        """Save index and chunks to disk"""
        try:
            faiss.write_index(self.index, self.index_file)
            with open(self.chunks_file, 'wb') as f:
                pickle.dump(self.chunks, f)
            print(f"Saved vector index with {len(self.chunks)} chunks")
        except Exception as e:
            print(f"Error saving index: {e}")
    
    def chunk_text(self, text: str, chunk_size: int = 200, overlap: int = 50) -> List[str]:
        """Split text into overlapping chunks"""
        words = text.split()
        chunks = []
        
        for i in range(0, len(words), chunk_size - overlap):
            chunk = ' '.join(words[i:i + chunk_size])
            if len(chunk.strip()) > 20:  # Only add meaningful chunks
                chunks.append(chunk)
        
        return chunks
    
    def add_meeting(self, meeting: DBMeeting):
        """Add a meeting to the vector store"""
        # Create chunks from transcript
        text_chunks = self.chunk_text(meeting.transcript)
        
        # Add summary and key points as separate chunks
        if meeting.summary:
            text_chunks.append(f"Summary: {meeting.summary}")
        
        if meeting.key_points:
            for point in meeting.key_points:
                text_chunks.append(f"Key Point: {point}")
        
        if meeting.action_items:
            for item in meeting.action_items:
                text_chunks.append(f"Action Item: {item}")
        
        # Generate embeddings
        embeddings = self.model.encode(text_chunks, normalize_embeddings=True)
        
        # Add to index
        self.index.add(embeddings.astype(np.float32))
        
        # Store metadata
        for i, chunk in enumerate(text_chunks):
            self.chunks.append({
                'text': chunk,
                'meeting_id': meeting.id,
                'meeting_title': meeting.title,
                'created_at': meeting.created_at.isoformat(),
                'chunk_index': i
            })
        
        self.save_index()
        print(f"Added {len(text_chunks)} chunks from meeting: {meeting.title}")
    
    def search_similar(self, query: str, top_k: int = 5) -> List[Dict]:
        """Search for similar text chunks"""
        if len(self.chunks) == 0:
            return []
        
        # Generate query embedding
        query_embedding = self.model.encode([query], normalize_embeddings=True)
        
        # Search
        scores, indices = self.index.search(query_embedding.astype(np.float32), min(top_k, len(self.chunks)))
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx >= 0 and score > 0.3:  # Similarity threshold
                chunk_data = self.chunks[idx].copy()
                chunk_data['similarity'] = float(score)
                results.append(chunk_data)
        
        return results
    
    def rebuild_index(self, db: Session):
        """Rebuild the entire index from database"""
        print("Rebuilding vector index from database...")
        
        # Clear existing index
        self.index = faiss.IndexFlatIP(self.dimension)
        self.chunks = []
        
        # Get all meetings
        meetings = db.query(DBMeeting).all()
        
        for meeting in meetings:
            self.add_meeting(meeting)
        
        print(f"Rebuilt index with {len(self.chunks)} chunks from {len(meetings)} meetings")

# Global instance
vector_store = VectorStore()
