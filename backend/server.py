from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime
import random


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")


# ============= TAMBOLA TICKET GENERATION ALGORITHM =============
def generate_tambola_ticket(ticket_number: int):
    """
    Generate a valid Tambola/Housie ticket following standard rules:
    - 3 rows x 9 columns
    - 15 numbers total (5 per row)
    - Column 0: 1-9, Column 1: 10-19, Column 2: 20-29... Column 8: 80-90
    - Numbers sorted within columns
    """
    ticket = [[None for _ in range(9)] for _ in range(3)]
    
    # Define column ranges
    column_ranges = [
        (1, 9),    # Column 0: 1-9
        (10, 19),  # Column 1: 10-19
        (20, 29),  # Column 2: 20-29
        (30, 39),  # Column 3: 30-39
        (40, 49),  # Column 4: 40-49
        (50, 59),  # Column 5: 50-59
        (60, 69),  # Column 6: 60-69
        (70, 79),  # Column 7: 70-79
        (80, 90),  # Column 8: 80-90
    ]
    
    # Step 1: Select numbers for each column
    column_numbers = []
    for col_idx, (start, end) in enumerate(column_ranges):
        available = list(range(start, end + 1))
        random.shuffle(available)
        column_numbers.append(available)
    
    # Step 2: Decide which columns will have numbers (ensure 5 per row)
    # Each row must have exactly 5 numbers and 4 blanks
    # Each column can have 0, 1, 2, or 3 numbers
    
    # Generate column distribution (how many numbers per column across 3 rows)
    # Total must be 15 numbers distributed across 9 columns
    column_counts = []
    remaining = 15
    for i in range(9):
        if i == 8:  # Last column gets remaining
            column_counts.append(remaining)
        else:
            # Random between 0-3, but ensure we can still distribute remaining
            max_for_this = min(3, remaining - (8 - i))  # Keep at least 1 for remaining columns
            min_for_this = max(0, remaining - (8 - i) * 3)  # Ensure we use enough
            count = random.randint(min_for_this, max_for_this)
            column_counts.append(count)
            remaining -= count
    
    # Step 3: Distribute numbers into rows ensuring 5 per row
    rows_distribution = [[] for _ in range(3)]  # Track which columns have numbers in each row
    
    for col_idx, count in enumerate(column_counts):
        if count == 0:
            continue
        
        # Decide which rows will have numbers in this column
        available_rows = [0, 1, 2]
        random.shuffle(available_rows)
        selected_rows = available_rows[:count]
        
        for row_idx in selected_rows:
            rows_distribution[row_idx].append(col_idx)
    
    # Step 4: Balance rows to have exactly 5 numbers each
    for row_idx in range(3):
        current_count = len(rows_distribution[row_idx])
        
        if current_count < 5:
            # Add more columns
            available_cols = [c for c in range(9) if c not in rows_distribution[row_idx] and column_counts[c] < 3]
            needed = 5 - current_count
            
            for _ in range(needed):
                if available_cols:
                    col = random.choice(available_cols)
                    rows_distribution[row_idx].append(col)
                    column_counts[col] += 1
                    available_cols.remove(col)
                    if column_counts[col] >= 3:
                        available_cols = [c for c in available_cols if c != col]
        
        elif current_count > 5:
            # Remove extra columns
            extra = current_count - 5
            random.shuffle(rows_distribution[row_idx])
            to_remove = rows_distribution[row_idx][:extra]
            
            for col in to_remove:
                rows_distribution[row_idx].remove(col)
                column_counts[col] -= 1
    
    # Step 5: Fill ticket with numbers
    for col_idx in range(9):
        # Get all rows that should have a number in this column
        rows_with_numbers = [r for r in range(3) if col_idx in rows_distribution[r]]
        
        # Sort and assign numbers
        rows_with_numbers.sort()
        for idx, row_idx in enumerate(rows_with_numbers):
            ticket[row_idx][col_idx] = column_numbers[col_idx][idx]
    
    # Convert ticket to list format with numbers flattened
    numbers_list = []
    for row in ticket:
        for num in row:
            if num is not None:
                numbers_list.append(num)
    
    return {
        "ticket_number": ticket_number,
        "grid": ticket,  # 3x9 grid with None for blanks
        "numbers": sorted(numbers_list)  # All 15 numbers sorted
    }


# Define Models
class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    ticket_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PlayerCreate(BaseModel):
    name: str

class Ticket(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticket_number: int
    player_id: str
    player_name: str
    grid: List[List[Optional[int]]]  # 3x9 grid
    numbers: List[int]  # All 15 numbers
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Game(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    players: List[Dict[str, Any]]
    tickets: List[Dict[str, Any]]
    called_numbers: List[int] = []
    current_number: Optional[int] = None
    game_mode: str = "manual"  # "manual" or "auto"
    auto_speed: int = 3  # seconds between calls
    admin_selected_ticket: Optional[str] = None
    status: str = "active"  # "active", "paused", "completed"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class GameCreate(BaseModel):
    players: List[Dict[str, Any]]
    tickets_per_player: Dict[str, int]  # player_id: count

class CallNumberRequest(BaseModel):
    game_id: str
    mode: str = "random"  # "random" or "smart" (for admin advantage)


# ============= ROUTES =============
@api_router.get("/")
async def root():
    return {"message": "Tambola/Housie App API"}

# Player Management
@api_router.post("/players", response_model=Player)
async def create_player(player: PlayerCreate):
    player_obj = Player(name=player.name)
    await db.players.insert_one(player_obj.dict())
    return player_obj

@api_router.get("/players", response_model=List[Player])
async def get_players():
    players = await db.players.find().to_list(1000)
    return [Player(**p) for p in players]

@api_router.delete("/players/{player_id}")
async def delete_player(player_id: str):
    result = await db.players.delete_one({"id": player_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Player not found")
    # Also delete associated tickets
    await db.tickets.delete_many({"player_id": player_id})
    return {"message": "Player deleted"}

@api_router.put("/players/{player_id}", response_model=Player)
async def update_player(player_id: str, player: PlayerCreate):
    player_data = await db.players.find_one({"id": player_id})
    if not player_data:
        raise HTTPException(status_code=404, detail="Player not found")
    
    await db.players.update_one(
        {"id": player_id},
        {"$set": {"name": player.name}}
    )
    
    updated_player = await db.players.find_one({"id": player_id})
    return Player(**updated_player)

# Ticket Management
@api_router.post("/tickets/generate")
async def generate_tickets(game_create: GameCreate):
    """Generate tickets for all players when game starts"""
    tickets = []
    ticket_counter = 1
    
    for player in game_create.players:
        player_id = player["id"]
        player_name = player["name"]
        count = game_create.tickets_per_player.get(player_id, 1)
        
        for _ in range(count):
            ticket_data = generate_tambola_ticket(ticket_counter)
            ticket = Ticket(
                ticket_number=ticket_counter,
                player_id=player_id,
                player_name=player_name,
                grid=ticket_data["grid"],
                numbers=ticket_data["numbers"]
            )
            tickets.append(ticket)
            await db.tickets.insert_one(ticket.dict())
            ticket_counter += 1
        
        # Update player ticket count
        await db.players.update_one(
            {"id": player_id},
            {"$set": {"ticket_count": count}}
        )
    
    return {"tickets": [t.dict() for t in tickets]}

@api_router.get("/tickets")
async def get_tickets():
    tickets = await db.tickets.find().to_list(1000)
    return tickets

@api_router.get("/tickets/player/{player_id}")
async def get_player_tickets(player_id: str):
    tickets = await db.tickets.find({"player_id": player_id}).to_list(1000)
    return tickets

# Game Management
@api_router.post("/games", response_model=Game)
async def create_game(game: GameCreate):
    # Generate tickets first
    tickets_response = await generate_tickets(game)
    
    game_obj = Game(
        players=game.players,
        tickets=tickets_response["tickets"]
    )
    await db.games.insert_one(game_obj.dict())
    return game_obj

@api_router.get("/games/active")
async def get_active_game():
    game = await db.games.find_one({"status": "active"}, sort=[("created_at", -1)])
    if not game:
        return None
    return game

@api_router.post("/games/{game_id}/call-number")
async def call_number(game_id: str, request: CallNumberRequest):
    game = await db.games.find_one({"id": game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    called_numbers = game.get("called_numbers", [])
    available_numbers = [n for n in range(1, 91) if n not in called_numbers]
    
    if not available_numbers:
        return {"message": "All numbers called", "number": None}
    
    # Smart mode for admin advantage (100% chance)
    if request.mode == "smart" and game.get("admin_selected_ticket"):
        admin_ticket_id = game["admin_selected_ticket"]
        admin_ticket = next((t for t in game["tickets"] if t["id"] == admin_ticket_id), None)
        
        if admin_ticket:
            admin_numbers = admin_ticket["numbers"]
            uncalled_admin_numbers = [n for n in admin_numbers if n not in called_numbers]
            
            if uncalled_admin_numbers:
                # 100% chance - always call admin ticket numbers first
                next_number = random.choice(uncalled_admin_numbers)
            else:
                # Admin ticket complete, call random
                next_number = random.choice(available_numbers)
        else:
            next_number = random.choice(available_numbers)
    else:
        # Random mode
        next_number = random.choice(available_numbers)
    
    called_numbers.append(next_number)
    
    await db.games.update_one(
        {"id": game_id},
        {
            "$set": {
                "called_numbers": called_numbers,
                "current_number": next_number
            }
        }
    )
    
    return {
        "number": next_number,
        "called_numbers": called_numbers,
        "remaining": 90 - len(called_numbers)
    }

@api_router.put("/games/{game_id}/admin-ticket")
async def set_admin_ticket(game_id: str, ticket_id: str):
    """Set the admin-selected ticket for smart winning"""
    game = await db.games.find_one({"id": game_id})
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"admin_selected_ticket": ticket_id}}
    )
    
    return {"message": "Admin ticket set", "ticket_id": ticket_id}

@api_router.put("/games/{game_id}/mode")
async def update_game_mode(game_id: str, mode: str, speed: int = 3):
    """Update game mode and speed"""
    await db.games.update_one(
        {"id": game_id},
        {"$set": {"game_mode": mode, "auto_speed": speed}}
    )
    return {"message": "Game mode updated"}

@api_router.delete("/games/{game_id}")
async def delete_game(game_id: str):
    await db.games.delete_one({"id": game_id})
    return {"message": "Game deleted"}

# Admin Authentication
@api_router.post("/admin/verify")
async def verify_admin(username: str, password: str):
    """Verify admin credentials"""
    if username == "admin" and password == "admin@123":
        return {"authenticated": True}
    return {"authenticated": False}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
