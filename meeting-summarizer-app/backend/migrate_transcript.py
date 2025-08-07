"""
Database migration script to fix transcript column constraint
"""
import sqlite3
import os
from config import settings

def migrate_transcript_nullable():
    """Recreate meetings table with transcript as nullable"""
    db_path = f"{settings.UPLOAD_DIR}/meetings.db"
    
    if not os.path.exists(db_path):
        print("Database file doesn't exist. No migration needed.")
        return
    
    print(f"Migrating database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        print("Creating backup of existing data...")
        # Create a backup table with existing data
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS meetings_backup AS 
            SELECT * FROM meetings
        """)
        
        print("Dropping existing meetings table...")
        cursor.execute("DROP TABLE meetings")
        
        print("Creating new meetings table with correct schema...")
        cursor.execute("""
            CREATE TABLE meetings (
                id VARCHAR PRIMARY KEY,
                title VARCHAR NOT NULL,
                description TEXT,
                transcript TEXT,  -- Now nullable
                summary TEXT,
                key_points JSON,
                action_items JSON,
                created_at DATETIME NOT NULL,
                updated_at DATETIME,
                duration FLOAT,
                language VARCHAR,
                file_name VARCHAR,
                status VARCHAR DEFAULT 'draft' NOT NULL
            )
        """)
        
        print("Restoring data from backup...")
        cursor.execute("""
            INSERT INTO meetings 
            (id, title, description, transcript, summary, key_points, action_items, 
             created_at, updated_at, duration, language, file_name, status)
            SELECT 
                id, title, description, transcript, summary, key_points, action_items,
                created_at, updated_at, duration, language, file_name, 
                COALESCE(status, 'completed') as status
            FROM meetings_backup
        """)
        
        print("Dropping backup table...")
        cursor.execute("DROP TABLE meetings_backup")
        
        conn.commit()
        print("Migration completed successfully!")
        
        # Verify the changes
        cursor.execute("PRAGMA table_info(meetings)")
        columns = cursor.fetchall()
        print("\nNew table schema:")
        for col in columns:
            nullable = "nullable" if not col[3] else "NOT NULL"
            print(f"  {col[1]}: {col[2]} ({nullable})")
        
        # Check data count
        cursor.execute("SELECT COUNT(*) FROM meetings")
        count = cursor.fetchone()[0]
        print(f"\nRestored {count} meetings")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_transcript_nullable()
