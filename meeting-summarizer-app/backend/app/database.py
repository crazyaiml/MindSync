from sqlalchemy import create_engine, Column, String, Text, DateTime, Float, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import os
from config import settings

# Database URL
DATABASE_URL = f"sqlite:///{settings.UPLOAD_DIR}/meetings.db"

# Create engine
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

# Create session
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

class Meeting(Base):
    __tablename__ = "meetings"
    
    id = Column(String, primary_key=True, index=True)
    title = Column(String, nullable=False)
    transcript = Column(Text, nullable=False)
    summary = Column(Text, nullable=True)
    key_points = Column(JSON, nullable=True)
    action_items = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    duration = Column(Float, nullable=True)
    language = Column(String, nullable=True)
    file_name = Column(String, nullable=True)

class PronunciationCorrection(Base):
    __tablename__ = "pronunciation_corrections"
    
    id = Column(String, primary_key=True, index=True)
    incorrect_phrase = Column(String, nullable=False, index=True)
    correct_phrase = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    usage_count = Column(Float, default=0, nullable=False)

# Create tables
def create_tables():
    Base.metadata.create_all(bind=engine)

# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
