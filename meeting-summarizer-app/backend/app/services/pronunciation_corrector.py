import re
from typing import Dict, List
from sqlalchemy.orm import Session
from app.database import PronunciationCorrection
import uuid

class PronunciationCorrector:
    def __init__(self):
        self.corrections_cache: Dict[str, str] = {}
        self.case_insensitive_patterns: Dict[str, str] = {}
    
    def load_corrections_from_db(self, db: Session):
        """Load pronunciation corrections from database into memory"""
        corrections = db.query(PronunciationCorrection).all()
        self.corrections_cache.clear()
        self.case_insensitive_patterns.clear()
        
        for correction in corrections:
            # Store exact matches
            self.corrections_cache[correction.incorrect_phrase.lower()] = correction.correct_phrase
            
            # Create regex patterns for word boundary matching
            incorrect_lower = correction.incorrect_phrase.lower()
            pattern = r'\b' + re.escape(incorrect_lower) + r'\b'
            self.case_insensitive_patterns[pattern] = correction.correct_phrase
        
        print(f"Loaded {len(corrections)} pronunciation corrections")
    
    def apply_corrections(self, text: str, db: Session = None) -> str:
        """Apply pronunciation corrections to transcribed text"""
        if not text:
            return text
        
        corrected_text = text
        corrections_applied = []
        
        # Apply case-insensitive word boundary replacements
        for pattern, correct_phrase in self.case_insensitive_patterns.items():
            def replace_func(match):
                # Preserve the case of the first letter
                matched_text = match.group()
                if matched_text[0].isupper():
                    return correct_phrase.capitalize()
                return correct_phrase
            
            before_text = corrected_text
            corrected_text = re.sub(pattern, replace_func, corrected_text, flags=re.IGNORECASE)
            
            if before_text != corrected_text:
                corrections_applied.append(correct_phrase)
        
        # Update usage counts in database if corrections were applied
        if corrections_applied and db:
            for correct_phrase in corrections_applied:
                correction = db.query(PronunciationCorrection).filter(
                    PronunciationCorrection.correct_phrase == correct_phrase
                ).first()
                if correction:
                    correction.usage_count += 1
            try:
                db.commit()
            except:
                db.rollback()
        
        return corrected_text
    
    def add_correction(self, incorrect: str, correct: str, db: Session) -> PronunciationCorrection:
        """Add a new pronunciation correction"""
        # Check if correction already exists
        existing = db.query(PronunciationCorrection).filter(
            PronunciationCorrection.incorrect_phrase.ilike(incorrect.strip())
        ).first()
        
        if existing:
            # Update existing correction
            existing.correct_phrase = correct.strip()
            db.commit()
            db.refresh(existing)
            self.load_corrections_from_db(db)  # Refresh cache
            return existing
        
        # Create new correction
        correction = PronunciationCorrection(
            id=str(uuid.uuid4()),
            incorrect_phrase=incorrect.strip(),
            correct_phrase=correct.strip(),
            usage_count=0
        )
        
        db.add(correction)
        db.commit()
        db.refresh(correction)
        
        # Refresh cache
        self.load_corrections_from_db(db)
        
        return correction
    
    def remove_correction(self, correction_id: str, db: Session) -> bool:
        """Remove a pronunciation correction"""
        correction = db.query(PronunciationCorrection).filter(
            PronunciationCorrection.id == correction_id
        ).first()
        
        if correction:
            db.delete(correction)
            db.commit()
            self.load_corrections_from_db(db)  # Refresh cache
            return True
        
        return False
    
    def get_all_corrections(self, db: Session) -> List[PronunciationCorrection]:
        """Get all pronunciation corrections"""
        return db.query(PronunciationCorrection).order_by(
            PronunciationCorrection.usage_count.desc(),
            PronunciationCorrection.created_at.desc()
        ).all()

# Global instance
pronunciation_corrector = PronunciationCorrector()
