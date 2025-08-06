from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models.pronunciation import PronunciationCorrectionCreate, PronunciationCorrectionUpdate, PronunciationCorrectionResponse
from app.services.pronunciation_corrector import pronunciation_corrector

router = APIRouter(prefix="/pronunciation", tags=["pronunciation"])

@router.get("/corrections", response_model=List[PronunciationCorrectionResponse])
async def get_all_corrections(db: Session = Depends(get_db)):
    """Get all pronunciation corrections"""
    corrections = pronunciation_corrector.get_all_corrections(db)
    return corrections

@router.post("/corrections", response_model=PronunciationCorrectionResponse)
async def create_correction(
    correction: PronunciationCorrectionCreate,
    db: Session = Depends(get_db)
):
    """Create a new pronunciation correction"""
    try:
        new_correction = pronunciation_corrector.add_correction(
            incorrect=correction.incorrect_phrase,
            correct=correction.correct_phrase,
            db=db
        )
        return new_correction
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create correction: {str(e)}")

@router.put("/corrections/{correction_id}", response_model=PronunciationCorrectionResponse)
async def update_correction(
    correction_id: str,
    correction: PronunciationCorrectionUpdate,
    db: Session = Depends(get_db)
):
    """Update an existing pronunciation correction"""
    from app.database import PronunciationCorrection
    
    existing = db.query(PronunciationCorrection).filter(
        PronunciationCorrection.id == correction_id
    ).first()
    
    if not existing:
        raise HTTPException(status_code=404, detail="Correction not found")
    
    if correction.incorrect_phrase is not None:
        existing.incorrect_phrase = correction.incorrect_phrase.strip()
    if correction.correct_phrase is not None:
        existing.correct_phrase = correction.correct_phrase.strip()
    
    try:
        db.commit()
        db.refresh(existing)
        pronunciation_corrector.load_corrections_from_db(db)  # Refresh cache
        return existing
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to update correction: {str(e)}")

@router.delete("/corrections/{correction_id}")
async def delete_correction(
    correction_id: str,
    db: Session = Depends(get_db)
):
    """Delete a pronunciation correction"""
    success = pronunciation_corrector.remove_correction(correction_id, db)
    
    if not success:
        raise HTTPException(status_code=404, detail="Correction not found")
    
    return {"message": "Correction deleted successfully"}

@router.post("/test-correction")
async def test_correction(
    text: str,
    db: Session = Depends(get_db)
):
    """Test pronunciation corrections on sample text"""
    corrected_text = pronunciation_corrector.apply_corrections(text, db)
    return {
        "original": text,
        "corrected": corrected_text,
        "changes_made": text != corrected_text
    }
