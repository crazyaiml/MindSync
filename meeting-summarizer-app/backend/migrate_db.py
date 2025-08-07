"""
Database migration script to add new columns to existing meetings table
"""
import sqlite3
import os
from config import settings

def migrate_database():
    """Add new columns to existing meetings table"""
    db_path = f"{settings.UPLOAD_DIR}/meetings.db"
    
    if not os.path.exists(db_path):
        print("Database file doesn't exist. No migration needed.")
        return
    
    print(f"Migrating database: {db_path}")
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Check if columns already exist
        cursor.execute("PRAGMA table_info(meetings)")
        columns = [column[1] for column in cursor.fetchall()]
        print(f"Existing columns: {columns}")
        
        # Add missing columns
        migrations = []
        
        if 'description' not in columns:
            migrations.append("ALTER TABLE meetings ADD COLUMN description TEXT")
            print("Will add 'description' column")
        
        if 'updated_at' not in columns:
            migrations.append("ALTER TABLE meetings ADD COLUMN updated_at DATETIME")
            print("Will add 'updated_at' column")
        
        if 'status' not in columns:
            migrations.append("ALTER TABLE meetings ADD COLUMN status TEXT DEFAULT 'completed'")
            print("Will add 'status' column")
        
        # Execute migrations
        for migration in migrations:
            print(f"Executing: {migration}")
            cursor.execute(migration)
        
        # Update existing meetings to have updated_at = created_at if updated_at is null
        if 'updated_at' not in columns:
            cursor.execute("UPDATE meetings SET updated_at = created_at WHERE updated_at IS NULL")
            print("Updated existing meetings with updated_at timestamps")
        
        # Update existing meetings to have status = 'completed' if they have transcript
        if 'status' not in columns:
            cursor.execute("UPDATE meetings SET status = 'completed' WHERE transcript IS NOT NULL AND transcript != ''")
            cursor.execute("UPDATE meetings SET status = 'draft' WHERE transcript IS NULL OR transcript = ''")
            print("Updated existing meetings with appropriate status")
        
        conn.commit()
        print("Migration completed successfully!")
        
        # Verify the changes
        cursor.execute("PRAGMA table_info(meetings)")
        new_columns = [column[1] for column in cursor.fetchall()]
        print(f"New columns: {new_columns}")
        
    except Exception as e:
        print(f"Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    migrate_database()
