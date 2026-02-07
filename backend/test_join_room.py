"""
Quick test script to verify room joining works
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

async def test_connection():
    """Test MongoDB connection"""
    try:
        mongo_url = os.environ.get('MONGO_URL')
        if not mongo_url:
            print("❌ MONGO_URL not found in .env")
            return False
        
        print(f"✓ Connecting to MongoDB...")
        client = AsyncIOMotorClient(mongo_url)
        db = client[os.environ['DB_NAME']]
        
        # Test connection
        await db.command('ping')
        print("✓ MongoDB connection successful")
        
        # Check collections
        rooms_count = await db.rooms.count_documents({})
        users_count = await db.users.count_documents({})
        
        print(f"✓ Rooms in database: {rooms_count}")
        print(f"✓ Users in database: {users_count}")
        
        return True
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return False

if __name__ == "__main__":
    asyncio.run(test_connection())
