"""
Enhanced FastAPI Server with Multiplayer Features
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
import os
import logging
from pathlib import Path
from typing import List, Optional
from datetime import datetime, timedelta
import random
import socketio
import uuid

# Import models and auth
from models import *
from auth import (
    get_password_hash, 
    verify_password, 
    create_user_token, 
    get_current_user
)

# Load environment
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Lifespan: startup/shutdown (replaces deprecated on_event)
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app_instance):
    from socket_handlers import register_socket_events
    await register_socket_events(sio, db)
    logging.getLogger(__name__).info("Socket.IO handlers registered")
    yield
    # shutdown if needed
    pass

# Create FastAPI app
app = FastAPI(title="Tambola Multiplayer API", version="2.0.0", lifespan=lifespan)

# Create Socket.IO server
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=True,
    engineio_logger=True
)

# Wrap with ASGI app
socket_app = socketio.ASGIApp(sio, app)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Router
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ============= ROOT & HEALTH CHECK ROUTES =============
@app.get("/")
async def root():
    """Root endpoint - Health check"""
    return {
        "status": "ok",
        "message": "Tambola Multiplayer API is running",
        "version": "2.0.0",
        "endpoints": {
            "api": "/api",
            "docs": "/docs",
            "health": "/health"
        }
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    try:
        # Test MongoDB connection
        await db.command('ping')
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e),
            "timestamp": datetime.utcnow().isoformat()
        }


# ============= SERIALIZATION HELPER =============
from bson import ObjectId
from typing import Any

def serialize_doc(doc: Any) -> Any:
    """
    Recursively convert MongoDB document to JSON-serializable format.
    Converts ObjectId to string and handles nested structures.
    """
    if doc is None:
        return None
    
    if isinstance(doc, ObjectId):
        return str(doc)
    
    if isinstance(doc, dict):
        return {key: serialize_doc(value) for key, value in doc.items()}
    
    if isinstance(doc, list):
        return [serialize_doc(item) for item in doc]
    
    if isinstance(doc, datetime):
        return doc.isoformat()
    
    return doc


# ============= TICKET GENERATION (from original) =============
def generate_tambola_ticket(ticket_number: int):
    """Generate a valid Tambola ticket"""
    ticket = [[None for _ in range(9)] for _ in range(3)]
    
    column_ranges = [
        (1, 9), (10, 19), (20, 29), (30, 39), (40, 49),
        (50, 59), (60, 69), (70, 79), (80, 90)
    ]
    
    column_numbers = []
    for start, end in column_ranges:
        available = list(range(start, end + 1))
        random.shuffle(available)
        column_numbers.append(available)
    
    column_counts = []
    remaining = 15
    for i in range(9):
        if i == 8:
            column_counts.append(remaining)
        else:
            max_for_this = min(3, remaining - (8 - i))
            min_for_this = max(0, remaining - (8 - i) * 3)
            count = random.randint(min_for_this, max_for_this)
            column_counts.append(count)
            remaining -= count
    
    rows_distribution = [[] for _ in range(3)]
    for col_idx, count in enumerate(column_counts):
        if count == 0:
            continue
        available_rows = [0, 1, 2]
        random.shuffle(available_rows)
        selected_rows = available_rows[:count]
        for row_idx in selected_rows:
            rows_distribution[row_idx].append(col_idx)
    
    for row_idx in range(3):
        current_count = len(rows_distribution[row_idx])
        if current_count < 5:
            available_cols = [c for c in range(9) 
                            if c not in rows_distribution[row_idx] 
                            and column_counts[c] < 3]
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
            extra = current_count - 5
            random.shuffle(rows_distribution[row_idx])
            to_remove = rows_distribution[row_idx][:extra]
            for col in to_remove:
                rows_distribution[row_idx].remove(col)
                column_counts[col] -= 1
    
    for col_idx in range(9):
        rows_with_numbers = [r for r in range(3) if col_idx in rows_distribution[r]]
        rows_with_numbers.sort()
        for idx, row_idx in enumerate(rows_with_numbers):
            ticket[row_idx][col_idx] = column_numbers[col_idx][idx]
    
    numbers_list = []
    for row in ticket:
        for num in row:
            if num is not None:
                numbers_list.append(num)
    
    return {
        "ticket_number": ticket_number,
        "grid": ticket,
        "numbers": sorted(numbers_list)
    }


# ============= WIN VALIDATION =============
def validate_win(ticket: dict, called_numbers: List[int], prize_type: PrizeType) -> bool:
    """Validate if a ticket has won a specific prize"""
    grid = ticket["grid"]
    numbers = ticket["numbers"]
    
    # Check if all ticket numbers are in called numbers
    ticket_called = [n for n in numbers if n in called_numbers]
    
    if prize_type == PrizeType.EARLY_FIVE:
        # First 5 called numbers that match the ticket
        matching_numbers = [n for n in called_numbers if n in numbers]
        return len(matching_numbers) >= 5
    
    elif prize_type == PrizeType.TOP_LINE:
        top_line = [n for n in grid[0] if n is not None]
        return all(n in called_numbers for n in top_line)
    
    elif prize_type == PrizeType.MIDDLE_LINE:
        middle_line = [n for n in grid[1] if n is not None]
        return all(n in called_numbers for n in middle_line)
    
    elif prize_type == PrizeType.BOTTOM_LINE:
        bottom_line = [n for n in grid[2] if n is not None]
        return all(n in called_numbers for n in bottom_line)
    
    elif prize_type == PrizeType.FOUR_CORNERS:
        corners = []
        # Top-left corner
        for n in grid[0]:
            if n is not None:
                corners.append(n)
                break
        # Top-right corner
        for n in reversed(grid[0]):
            if n is not None:
                corners.append(n)
                break
        # Bottom-left corner
        for n in grid[2]:
            if n is not None:
                corners.append(n)
                break
        # Bottom-right corner
        for n in reversed(grid[2]):
            if n is not None:
                corners.append(n)
                break
        return len(corners) == 4 and all(n in called_numbers for n in corners)
    
    elif prize_type == PrizeType.FULL_HOUSE:
        return all(n in called_numbers for n in numbers)
    
    return False


# ============= AUTHENTICATION ROUTES =============
@api_router.post("/auth/signup", response_model=Token)
async def signup(user_data: UserCreate):
    """Register a new user"""
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Check mobile
    existing_mobile = await db.users.find_one({"mobile": user_data.mobile})
    if existing_mobile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Mobile number already registered"
        )
    
    # Create user
    user = User(
        name=user_data.name,
        email=user_data.email,
        mobile=user_data.mobile,
        password_hash=get_password_hash(user_data.password)
    )
    
    await db.users.insert_one(user.dict())
    
    # Create wallet with 50 points initial balance
    wallet_id = str(uuid.uuid4())
    wallet = {
        "id": wallet_id,
        "user_id": user.id,
        "balance": 50.0,  # 50 points initial balance
        "created_at": datetime.utcnow()
    }
    await db.wallets.insert_one(wallet)
    
    # Create initial transaction record
    transaction_id = str(uuid.uuid4())
    await db.transactions.insert_one({
        "id": transaction_id,
        "user_id": user.id,
        "type": "credit",
        "amount": 50.0,
        "description": "Welcome bonus - Initial 50 Points",
        "created_at": datetime.utcnow()
    })
    
    await db.users.update_one(
        {"id": user.id},
        {"$set": {"points_balance": 50.0}}
    )
    
    logger.info(f"Created new user {user.id} with 50 points welcome bonus")
    
    # Create token
    token = create_user_token(user.id, user.email)
    
    # Return user profile
    profile = UserProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        mobile=user.mobile,
        profile_pic=user.profile_pic,
        points_balance=user.points_balance,
        total_games=user.total_games,
        total_wins=user.total_wins,
        total_winnings=user.total_winnings,
        created_at=user.created_at
    )
    
    return Token(access_token=token, user=profile)


@api_router.post("/auth/login", response_model=Token)
async def login(credentials: UserLogin):
    """Login user"""
    user = await db.users.find_one({"email": credentials.email})
    
    if not user or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )
    
    if user.get("is_banned"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is banned"
        )
    
    # Update last login
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"last_login": datetime.utcnow()}}
    )
    
    # Create token
    token = create_user_token(user["id"], user["email"])
    
    # Return profile
    profile = UserProfile(
        id=user["id"],
        name=user["name"],
        email=user["email"],
        mobile=user["mobile"],
        profile_pic=user.get("profile_pic"),
        points_balance=user.get("points_balance", 0.0),
        total_games=user.get("total_games", 0),
        total_wins=user.get("total_wins", 0),
        total_winnings=user.get("total_winnings", 0.0),
        created_at=user["created_at"]
    )
    
    return Token(access_token=token, user=profile)


@api_router.get("/auth/profile", response_model=UserProfile)
async def get_profile(current_user: dict = Depends(get_current_user)):
    """Get current user profile"""
    return UserProfile(
        id=current_user["id"],
        name=current_user["name"],
        email=current_user["email"],
        mobile=current_user["mobile"],
        profile_pic=current_user.get("profile_pic"),
        points_balance=current_user.get("points_balance", 0.0),
        total_games=current_user.get("total_games", 0),
        total_wins=current_user.get("total_wins", 0),
        total_winnings=current_user.get("total_winnings", 0.0),
        created_at=current_user["created_at"]
    )


def generate_standard_prizes():
    """Generate standard prize configuration matching offline game"""
    return [
        {"prize_type": "early_five", "amount": 15, "percentage": 15},  # 15% of pool
        {"prize_type": "top_line", "amount": 15, "percentage": 15},    # 15% of pool
        {"prize_type": "middle_line", "amount": 15, "percentage": 15}, # 15% of pool
        {"prize_type": "bottom_line", "amount": 15, "percentage": 15}, # 15% of pool
        {"prize_type": "four_corners", "amount": 10, "percentage": 10}, # 10% of pool
        {"prize_type": "full_house", "amount": 30, "percentage": 30}   # 30% of pool
    ]


# ============= ROOM ROUTES =============
@api_router.get("/rooms", response_model=List[Room])
async def get_rooms(
    room_type: Optional[RoomType] = None,
    status: Optional[RoomStatus] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get list of available rooms"""
    query = {}
    if room_type:
        query["room_type"] = room_type
    if status:
        query["status"] = status
    else:
        query["status"] = {"$in": [RoomStatus.WAITING, RoomStatus.ACTIVE]}
    
    rooms = await db.rooms.find(query).sort("created_at", -1).limit(50).to_list(50)
    # Serialize to remove ObjectId
    serialized_rooms = [serialize_doc(room) for room in rooms]
    return [Room(**room) for room in serialized_rooms]


@api_router.post("/rooms/create", response_model=Room)
async def create_room(
    room_data: RoomCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new game room"""
    
    # Use standard prizes if none provided or use provided prizes
    if not room_data.prizes or len(room_data.prizes) == 0:
        # Use standard prize configuration
        standard_prizes = generate_standard_prizes()
        fixed_prizes = []
        for prize_data in standard_prizes:
            fixed_prizes.append(PrizeConfig(
                prize_type=PrizeType(prize_data["prize_type"]),
                amount=prize_data["amount"],
                multiple_winners=False
            ))
    else:
        # FIX: Convert prize_type strings to enum
        # Frontend sends strings like "early_five", backend needs PrizeType enum
        fixed_prizes = []
        for prize in room_data.prizes:
            prize_dict = prize.dict() if hasattr(prize, 'dict') else prize
            
            # Convert string to enum if needed
            if isinstance(prize_dict.get('prize_type'), str):
                try:
                    prize_dict['prize_type'] = PrizeType(prize_dict['prize_type'])
                except ValueError:
                    # Try uppercase conversion
                    prize_dict['prize_type'] = PrizeType[prize_dict['prize_type'].upper()]
            
            fixed_prizes.append(PrizeConfig(**prize_dict))
    
    room = Room(
        name=room_data.name,
        host_id=current_user["id"],
        host_name=current_user["name"],
        room_type=room_data.room_type,
        ticket_price=room_data.ticket_price,
        max_players=room_data.max_players,
        min_players=room_data.min_players,
        auto_start=room_data.auto_start,
        prizes=fixed_prizes,  # Use fixed prizes with enum
        password=room_data.password
    )
    
    await db.rooms.insert_one(room.dict())
    
    logger.info(f"Room created: {room.id} by {current_user['name']}")
    
    # Broadcast new room to all connected clients
    serialized_room = serialize_doc(room.dict())
    await sio.emit('new_room', serialized_room)
    
    return room


@api_router.get("/rooms/{room_id}", response_model=Room)
async def get_room(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get room details"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    # Serialize to remove ObjectId
    serialized_room = serialize_doc(room)
    return Room(**serialized_room)


@api_router.delete("/rooms/{room_id}", response_model=MessageResponse)
async def delete_room(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a room (host only)"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Check if user is the host
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can delete the room")
    
    # Check if game is active - prevent deletion during active game
    if room.get("status") == RoomStatus.ACTIVE:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete room while game is active. Please end the game first."
        )
    
    # Delete associated data
    # 1. Delete all tickets for this room
    tickets_result = await db.tickets.delete_many({"room_id": room_id})
    
    # 2. Delete all winners for this room
    winners_result = await db.winners.delete_many({"room_id": room_id})
    
    # 3. Delete all transactions related to this room (optional - keep for audit trail)
    # transactions_result = await db.transactions.delete_many({"room_id": room_id})
    
    # 4. Delete the room itself
    await db.rooms.delete_one({"id": room_id})
    
    # Broadcast room deletion to all connected clients
    await sio.emit('room_deleted', {
        "room_id": room_id,
        "deleted_by": current_user["id"]
    })
    
    logger.info(f"Room {room_id} deleted by host {current_user['id']} - {tickets_result.deleted_count} tickets, {winners_result.deleted_count} winners removed")
    
    return MessageResponse(
        message="Room deleted successfully",
        data={
            "room_id": room_id,
            "tickets_deleted": tickets_result.deleted_count,
            "winners_deleted": winners_result.deleted_count
        }
    )


@api_router.get("/rooms/{room_id}/tickets", response_model=List[Ticket])
async def get_room_tickets(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get all tickets in a room (host only) - for admin winner selection"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can list room tickets")
    tickets = await db.tickets.find({"room_id": room_id}).to_list(500)

    # Some older tickets may not have user_name populated; enrich them on the fly
    enriched: List[Ticket] = []
    for t in tickets:
        if not t.get("user_name") and t.get("user_id"):
            try:
                user = await db.users.find_one({"id": t["user_id"]})
                if user:
                    t["user_name"] = user.get("name", "")
            except Exception as e:
                logger.error(f"Failed to enrich ticket user_name for ticket {t.get('id')}: {e}")
        enriched.append(Ticket(**t))

    return enriched


@api_router.put("/rooms/{room_id}/admin-ticket", response_model=MessageResponse)
async def set_room_admin_ticket(
    room_id: str,
    ticket_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Set the winning ticket for this room (host only)"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can set winning ticket")
    ticket = await db.tickets.find_one({"id": ticket_id, "room_id": room_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found in this room")
    await db.rooms.update_one(
        {"id": room_id},
        {"$set": {"admin_selected_ticket": ticket_id}}
    )
    return MessageResponse(message="Winning ticket set", data={"ticket_id": ticket_id})


@api_router.post("/rooms/{room_id}/join", response_model=MessageResponse)
async def join_room(
    room_id: str,
    join_data: RoomJoin,
    current_user: dict = Depends(get_current_user)
):
    """Join a game room"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Check if room is full
    if room["current_players"] >= room["max_players"]:
        raise HTTPException(status_code=400, detail="Room is full")
    
    # Check if already joined
    player_ids = [p["id"] for p in room.get("players", [])]
    if current_user["id"] in player_ids:
        # Return success if already in room (idempotent)
        return MessageResponse(message="Already in room", data={"room_id": room_id})
    
    # Check password for private rooms
    if room["room_type"] == RoomType.PRIVATE and room.get("password"):
        if not join_data.password or join_data.password != room["password"]:
            raise HTTPException(status_code=403, detail="Invalid room password")
    
    # Add player to room
    player = {
        "id": current_user["id"],
        "name": current_user["name"],
        "profile_pic": current_user.get("profile_pic"),
        "joined_at": datetime.utcnow()
    }
    
    await db.rooms.update_one(
        {"id": room_id},
        {
            "$push": {"players": player},
            "$inc": {"current_players": 1}
        }
    )
    
    # Serialize player for socket emission (convert datetime to string)
    serialized_player = serialize_doc(player)
    
    # Broadcast player joined
    await sio.emit('player_joined', {
        "room_id": room_id,
        "player": serialized_player
    }, room=room_id)
    
    return MessageResponse(message="Joined room successfully", data={"room_id": room_id})


@api_router.delete("/rooms/{room_id}", response_model=MessageResponse)
async def delete_room(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete a room (host only)"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    # Check if user is host
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can delete the room")
    
    # Check if game is active
    if room["status"] == RoomStatus.ACTIVE:
        raise HTTPException(
            status_code=400, 
            detail="Cannot delete room while game is active. Please end the game first."
        )
    
    # Delete all tickets associated with this room
    tickets_result = await db.tickets.delete_many({"room_id": room_id})
    
    # Delete all winners associated with this room
    winners_result = await db.winners.delete_many({"room_id": room_id})
    
    # Refund players who bought tickets (if game hasn't started)
    if room["status"] == RoomStatus.WAITING:
        # Get all tickets that were purchased
        ticket_price = room.get("ticket_price", 0)
        
        # Group tickets by user to calculate refunds
        tickets = await db.tickets.find({"room_id": room_id}).to_list(1000)
        user_ticket_counts = {}
        for ticket in tickets:
            user_id = ticket.get("user_id")
            if user_id:
                user_ticket_counts[user_id] = user_ticket_counts.get(user_id, 0) + 1
        
        # Refund each user
        for user_id, ticket_count in user_ticket_counts.items():
            refund_amount = ticket_price * ticket_count
            
            # Credit back to user
            await db.users.update_one(
                {"id": user_id},
                {"$inc": {"points_balance": refund_amount}}
            )
            
            # Create refund transaction
            transaction = Transaction(
                user_id=user_id,
                amount=refund_amount,
                type=TransactionType.CREDIT,
                description=f"Refund for room deletion: {room['name']}",
                balance_after=0,  # Will be updated by actual balance
                room_id=room_id
            )
            await db.transactions.insert_one(transaction.dict())
            
            logger.info(f"Refunded {refund_amount} points to user {user_id} for room {room_id}")
    
    # Delete the room
    await db.rooms.delete_one({"id": room_id})
    
    # Broadcast room deleted via socket
    await sio.emit('room_deleted', {
        "room_id": room_id,
        "message": "Room has been deleted by the host"
    }, room=room_id)
    
    logger.info(f"Room {room_id} deleted by host {current_user['id']}")
    
    return MessageResponse(
        message="Room deleted successfully",
        data={
            "room_id": room_id,
            "tickets_deleted": tickets_result.deleted_count,
            "winners_deleted": winners_result.deleted_count
        }
    )


# ============= TICKET ROUTES =============
@api_router.post("/tickets/buy", response_model=MessageResponse)
async def buy_tickets(
    purchase: TicketPurchase,
    current_user: dict = Depends(get_current_user)
):
    """Purchase tickets for a room"""
    room = await db.rooms.find_one({"id": purchase.room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["status"] != RoomStatus.WAITING:
        raise HTTPException(status_code=400, detail="Cannot buy tickets after game starts")
    
    # Calculate total cost
    total_cost = room["ticket_price"] * purchase.quantity
    
    # Check wallet balance
    if current_user["points_balance"] < total_cost:
        raise HTTPException(status_code=400, detail="Insufficient points balance")
    
    # Generate tickets
    tickets = []
    current_ticket_count = await db.tickets.count_documents({"room_id": purchase.room_id})
    
    for i in range(purchase.quantity):
        ticket_number = current_ticket_count + i + 1
        ticket_data = generate_tambola_ticket(ticket_number)
        
        ticket = Ticket(
            ticket_number=ticket_number,
            user_id=current_user["id"],
            user_name=current_user["name"],
            room_id=purchase.room_id,
            grid=ticket_data["grid"],
            numbers=ticket_data["numbers"]
        )
        tickets.append(ticket.dict())
    
    # Insert tickets
    await db.tickets.insert_many(tickets)
    
    # Deduct from wallet
    new_balance = current_user["points_balance"] - total_cost
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"points_balance": new_balance}}
    )
    
    # Create transaction
    transaction = Transaction(
        user_id=current_user["id"],
        amount=total_cost,
        type=TransactionType.DEBIT,
        description=f"Purchased {purchase.quantity} ticket(s) for {room['name']}",
        balance_after=new_balance,
        room_id=purchase.room_id
    )
    await db.transactions.insert_one(transaction.dict())
    
    # Update room with dynamic prize pool
    # Update tickets sold count first
    await db.rooms.update_one(
        {"id": purchase.room_id},
        {"$inc": {"tickets_sold": purchase.quantity}}
    )

    # Recalculate prize pool based on TOTAL tickets sold * ticket price
    updated_room = await db.rooms.find_one({"id": purchase.room_id})
    if updated_room:
        current_tickets_sold = updated_room.get("tickets_sold", 0)
        ticket_price = updated_room.get("ticket_price", 0)
        
        # Prize pool = Total Tickets Sold * Ticket Price
        # (Winning distribution calculated at game start or end)
        new_prize_pool = current_tickets_sold * ticket_price
        
        await db.rooms.update_one(
            {"id": purchase.room_id},
            {"$set": {"prize_pool": new_prize_pool}}
        )
    
    logger.info(f"User {current_user['id']} bought {purchase.quantity} tickets for room {purchase.room_id}")
    
    return MessageResponse(
        message=f"Successfully purchased {purchase.quantity} ticket(s)",
        data={"tickets": tickets, "new_balance": new_balance}
    )


# ============= WALLET ROUTES =============
@api_router.get("/wallet/balance")
async def get_wallet_balance(current_user: dict = Depends(get_current_user)):
    """Get points balance"""
    return {"balance": current_user.get("points_balance", 0.0)}


@api_router.post("/wallet/add-money", response_model=MessageResponse)
async def add_money(
    wallet_data: WalletAddMoney,
    current_user: dict = Depends(get_current_user)
):
    """Add money to wallet (payment gateway integration needed)"""
    # TODO: Integrate with Razorpay or other payment gateway
    # For now, just add money directly (for testing)
    
    new_balance = current_user.get("points_balance", 0.0) + wallet_data.amount
    
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"points_balance": new_balance}}
    )
    
    # Create transaction
    transaction = Transaction(
        user_id=current_user["id"],
        amount=wallet_data.amount,
        type=TransactionType.CREDIT,
        description=f"Added money via {wallet_data.payment_method}",
        balance_after=new_balance
    )
    await db.transactions.insert_one(transaction.dict())
    
    logger.info(f"User {current_user['id']} added ₹{wallet_data.amount} to wallet")
    
    return MessageResponse(
        message=f"Successfully added ₹{wallet_data.amount}",
        data={"new_balance": new_balance}
    )


@api_router.get("/wallet/transactions", response_model=List[Transaction])
async def get_transactions(
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """Get transaction history"""
    transactions = await db.transactions.find({
        "user_id": current_user["id"]
    }).sort("created_at", -1).limit(limit).to_list(limit)
    
    return [Transaction(**txn) for txn in transactions]


# ============= ADS ROUTES =============
@api_router.post("/ads/ping")
async def ads_ping():
    """Simple ping endpoint to test ads route"""
    return {"message": "Ads endpoint is working", "timestamp": datetime.utcnow().isoformat()}

@api_router.post("/ads/test")
async def ads_test(current_user: dict = Depends(get_current_user)):
    """Test endpoint to debug ads issues"""
    try:
        logger.info(f"Test endpoint called by user: {current_user}")
        return {
            "message": "Test successful",
            "user_id": current_user.get("id"),
            "user_data": {
                "name": current_user.get("name"),
                "email": current_user.get("email"),
                "points_balance": current_user.get("points_balance", "NOT_SET"),
                "has_points_balance": "points_balance" in current_user
            }
        }
    except Exception as e:
        logger.error(f"Test endpoint error: {e}")
        return {"error": str(e)}

@api_router.post("/ads/rewarded")
async def ads_rewarded(current_user: dict = Depends(get_current_user)):
    """Reward user for watching an ad"""
    try:
        logger.info(f"Ads endpoint called by user: {current_user.get('id', 'unknown')}")
        
        reward_points = 10.0
        
        # Get current balance safely
        current_balance = float(current_user.get("points_balance", 0.0))
        new_balance = current_balance + reward_points
        
        logger.info(f"Current balance: {current_balance}, New balance: {new_balance}")
        
        # Validate balance values
        if current_balance < 0:
            current_balance = 0.0
            new_balance = reward_points
        
        # Update user balance
        update_result = await db.users.update_one(
            {"id": current_user["id"]},
            {"$set": {"points_balance": new_balance}}
        )
        
        logger.info(f"User balance update result: {update_result.modified_count} documents modified")
        
        # Create transaction record
        transaction_data = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "amount": reward_points,
            "type": "credit",  # Use string instead of enum
            "description": "Ad Reward - Watched Video Ad",
            "balance_after": new_balance,
            "created_at": datetime.utcnow()
        }
        
        insert_result = await db.transactions.insert_one(transaction_data)
        logger.info(f"Transaction created with ID: {insert_result.inserted_id}")
        
        logger.info(f"User {current_user['id']} rewarded {reward_points} points for ad")
        
        # Return simple dict instead of MessageResponse model
        return {
            "message": "Ad reward credited successfully",
            "data": {"new_balance": new_balance, "reward": reward_points}
        }
        
    except Exception as e:
        logger.error(f"Error in ads_rewarded: {e}")
        import traceback
        logger.error(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Failed to credit ad reward: {str(e)}")


# ============= ROOM CLEANUP & COMPLETED GAMES =============
@api_router.get("/rooms/cleanup", response_model=MessageResponse)
async def cleanup_rooms():
    """Cleanup old empty rooms (auto-called or manual)"""
    # Find rooms created > 1 hour ago AND (no players OR status is cancelled)
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)
    
    result = await db.rooms.delete_many({
        "$or": [
            {"created_at": {"$lt": one_hour_ago}, "current_players": 0},
            {"status": RoomStatus.CANCELLED, "created_at": {"$lt": one_hour_ago}}
        ]
    })
    
    return MessageResponse(
        message=f"Cleanup completed. Removed {result.deleted_count} rooms."
    )

@api_router.get("/rooms/completed/history", response_model=List[Room])
async def get_completed_rooms(limit: int = 10):
    """Get recently completed rooms with winners"""
    rooms = await db.rooms.find({
        "status": RoomStatus.COMPLETED
    }).sort("completed_at", -1).limit(limit).to_list(limit)
    
    # Serialize to remove ObjectId
    serialized_rooms = [serialize_doc(room) for room in rooms]
    return [Room(**room) for room in serialized_rooms]


# ============= GAME CONTROL ROUTES =============
@api_router.post("/game/{room_id}/start", response_model=MessageResponse)
async def start_game(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Start the game (host only)"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can start the game")
    
    if room["status"] != RoomStatus.WAITING:
        raise HTTPException(status_code=400, detail="Game already started or completed")
    
    # Check minimum players
    if room["current_players"] < room["min_players"]:
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {room['min_players']} players to start"
        )
    
    # Update room status
    await db.rooms.update_one(
        {"id": room_id},
        {
            "$set": {
                "status": RoomStatus.ACTIVE,
                "started_at": datetime.utcnow()
            }
        }
    )
    
    # Broadcast via socket
    await sio.emit('game_started', {
        "room_id": room_id,
        "started_at": datetime.utcnow().isoformat()
    }, room=room_id)
    
    logger.info(f"Game started in room {room_id}")
    
    return MessageResponse(message="Game started successfully")


@api_router.post("/game/{room_id}/call-number", response_model=MessageResponse)
async def call_number_api(
    room_id: str,
    call_data: CallNumber,
    current_user: dict = Depends(get_current_user)
):
    """Call a number (host only)"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can call numbers")
    
    if room["status"] != RoomStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Game not active")
    
    called_numbers = room.get("called_numbers", [])
    
    # Generate or validate number
    if call_data.number is None:
        # Auto-generate
        available = [n for n in range(1, 91) if n not in called_numbers]
        if not available:
            raise HTTPException(status_code=400, detail="All numbers have been called")
        number = random.choice(available)
    else:
        number = call_data.number
        if number in called_numbers:
            raise HTTPException(status_code=400, detail="Number already called")
        if number < 1 or number > 90:
            raise HTTPException(status_code=400, detail="Invalid number (must be 1-90)")
    
    # Update room
    called_numbers.append(number)
    await db.rooms.update_one(
        {"id": room_id},
        {
            "$set": {
                "current_number": number,
                "called_numbers": called_numbers
            }
        }
    )
    
    # Broadcast via socket
    await sio.emit('number_called', {
        "number": number,
        "called_numbers": called_numbers,
        "remaining": 90 - len(called_numbers)
    }, room=room_id)
    
    logger.info(f"Number {number} called in room {room_id}")
    
    return MessageResponse(
        message=f"Number {number} called",
        data={"number": number, "remaining": 90 - len(called_numbers)}
    )


@api_router.post("/game/{room_id}/claim", response_model=MessageResponse)
async def claim_prize_api(
    room_id: str,
    claim: ClaimPrize,
    current_user: dict = Depends(get_current_user)
):
    """Claim a prize with server-side validation"""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if room["status"] != RoomStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Game not active")
    
    # Get ticket
    ticket = await db.tickets.find_one({"id": claim.ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    
    if ticket["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your ticket")
    
    # Check if prize already claimed
    existing_winner = await db.winners.find_one({
        "room_id": room_id,
        "prize_type": claim.prize_type
    })
    
    prize_config = next((p for p in room["prizes"] if p["prize_type"] == claim.prize_type), None)
    if not prize_config:
        raise HTTPException(status_code=400, detail="Prize not configured")
    
    if existing_winner and not prize_config.get("multiple_winners", False):
        raise HTTPException(status_code=400, detail="Prize already claimed")
    
    # Validate win
    called_numbers = room.get("called_numbers", [])
    is_valid = validate_win(ticket, called_numbers, claim.prize_type)
    
    if not is_valid:
        raise HTTPException(status_code=400, detail="Invalid claim - winning condition not met")
    
    # Get prize amount
    prize_amount = prize_config["amount"]
    
    # Create winner record
    winner = Winner(
        user_id=current_user["id"],
        user_name=current_user["name"],
        room_id=room_id,
        ticket_id=claim.ticket_id,
        ticket_number=ticket["ticket_number"],
        prize_type=claim.prize_type,
        amount=prize_amount,
        verified=True,
        verified_at=datetime.utcnow()
    )
    await db.winners.insert_one(winner.dict())
    
    # Credit wallet
    new_balance = current_user.get("wallet_balance", 0.0) + prize_amount
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {"wallet_balance": new_balance},
            "$inc": {
                "total_wins": 1,
                "total_winnings": prize_amount
            }
        }
    )
    
    # Create transaction
    transaction = Transaction(
        user_id=current_user["id"],
        amount=prize_amount,
        type=TransactionType.CREDIT,
        description=f"Won {claim.prize_type.value} in {room['name']}",
        balance_after=new_balance,
        room_id=room_id,
        ticket_id=claim.ticket_id
    )
    await db.transactions.insert_one(transaction.dict())
    
    # Update room winners
    await db.rooms.update_one(
        {"id": room_id},
        {"$push": {"winners": winner.dict()}}
    )
    
    # Broadcast via socket
    await sio.emit('prize_won', {
        "winner": winner.dict(),
        "room_id": room_id
    }, room=room_id)
    
    logger.info(f"User {current_user['id']} won {claim.prize_type} in room {room_id}")
    
    return MessageResponse(
        message=f"Congratulations! You won {claim.prize_type.value}",
        data={"winner": winner.dict(), "new_balance": new_balance}
    )


@api_router.get("/game/{room_id}/winners", response_model=List[Winner])
async def get_winners(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get winners for a room"""
    winners = await db.winners.find({"room_id": room_id}).to_list(100)
    return [Winner(**winner) for winner in winners]


# ============= TICKET API =============
@api_router.get("/tickets/my-tickets/{room_id}")
async def get_my_tickets(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get user's tickets for a specific room"""
    try:
        tickets = await db.tickets.find({
            "room_id": room_id,
            "user_id": current_user["id"]
        }).to_list(100)
        
        logger.info(f"Found {len(tickets)} raw tickets for user {current_user['id']} in room {room_id}")
        
        # Enrich and serialize tickets
        enriched_tickets = []
        for idx, ticket in enumerate(tickets):
            try:
                # Remove MongoDB _id field FIRST
                if "_id" in ticket:
                    del ticket["_id"]
                
                # Log ticket structure for debugging
                logger.info(f"Processing ticket {idx}: id={ticket.get('id')}, has_grid={('grid' in ticket)}, grid_type={type(ticket.get('grid'))}")
                
                # Add user_name if missing
                if "user_name" not in ticket or not ticket.get("user_name"):
                    ticket["user_name"] = current_user.get("name", "")
                
                # Validate and fix grid
                if "grid" not in ticket or ticket["grid"] is None:
                    logger.warning(f"Ticket {ticket.get('id')} has no grid, regenerating")
                    # Generate a new grid for this ticket
                    ticket_data = generate_tambola_ticket(ticket.get("ticket_number", idx + 1))
                    ticket["grid"] = ticket_data["grid"]
                    ticket["numbers"] = ticket_data["numbers"]
                
                # Ensure grid is a list
                grid = ticket["grid"]
                if not isinstance(grid, list):
                    logger.error(f"Grid is not a list for ticket {ticket.get('id')}: {type(grid)}, regenerating")
                    ticket_data = generate_tambola_ticket(ticket.get("ticket_number", idx + 1))
                    ticket["grid"] = ticket_data["grid"]
                    ticket["numbers"] = ticket_data["numbers"]
                    grid = ticket["grid"]
                
                # Ensure grid has 3 rows
                if len(grid) != 3:
                    logger.error(f"Grid doesn't have 3 rows for ticket {ticket.get('id')}: {len(grid)}, regenerating")
                    ticket_data = generate_tambola_ticket(ticket.get("ticket_number", idx + 1))
                    ticket["grid"] = ticket_data["grid"]
                    ticket["numbers"] = ticket_data["numbers"]
                    grid = ticket["grid"]
                
                # Validate each row has 9 columns
                for row_idx, row in enumerate(grid):
                    if not isinstance(row, list) or len(row) != 9:
                        logger.error(f"Row {row_idx} invalid for ticket {ticket.get('id')}, regenerating")
                        ticket_data = generate_tambola_ticket(ticket.get("ticket_number", idx + 1))
                        ticket["grid"] = ticket_data["grid"]
                        ticket["numbers"] = ticket_data["numbers"]
                        break
                
                # Extract numbers if missing
                if "numbers" not in ticket or not ticket.get("numbers"):
                    numbers = []
                    for row in ticket["grid"]:
                        if isinstance(row, list):
                            for num in row:
                                if num is not None and num != 0:
                                    try:
                                        numbers.append(int(num))
                                    except (ValueError, TypeError):
                                        logger.warning(f"Invalid number in grid: {num}")
                    ticket["numbers"] = sorted(numbers)
                
                # Ensure marked_numbers exists
                if "marked_numbers" not in ticket:
                    ticket["marked_numbers"] = []
                
                # Ensure all required fields exist
                if "id" not in ticket:
                    ticket["id"] = str(uuid.uuid4())
                if "ticket_number" not in ticket:
                    ticket["ticket_number"] = idx + 1
                if "room_id" not in ticket:
                    ticket["room_id"] = room_id
                if "user_id" not in ticket:
                    ticket["user_id"] = current_user["id"]
                
                # Serialize to convert datetime to ISO string
                serialized = serialize_doc(ticket)
                enriched_tickets.append(serialized)
                logger.info(f"Successfully processed ticket {ticket.get('id')}")
                
            except Exception as e:
                logger.error(f"Error processing ticket {ticket.get('id', idx)}: {e}")
                import traceback
                logger.error(traceback.format_exc())
                # Don't skip - try to create a minimal valid ticket
                try:
                    ticket_data = generate_tambola_ticket(idx + 1)
                    minimal_ticket = {
                        "id": ticket.get("id", str(uuid.uuid4())),
                        "ticket_number": ticket.get("ticket_number", idx + 1),
                        "user_id": current_user["id"],
                        "user_name": current_user.get("name", ""),
                        "room_id": room_id,
                        "grid": ticket_data["grid"],
                        "numbers": ticket_data["numbers"],
                        "marked_numbers": []
                    }
                    enriched_tickets.append(serialize_doc(minimal_ticket))
                    logger.info(f"Created minimal ticket for index {idx}")
                except Exception as e2:
                    logger.error(f"Failed to create minimal ticket: {e2}")
                    continue
        
        logger.info(f"Returning {len(enriched_tickets)} valid tickets")
        return enriched_tickets
    except Exception as e:
        logger.error(f"Error fetching tickets: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Return empty array instead of error
        return []


@api_router.post("/tickets/buy")
async def buy_tickets(
    room_id: str,
    quantity: int,
    current_user: dict = Depends(get_current_user)
):
    """Buy tickets for a room"""
    try:
        # Validate quantity
        if quantity < 1 or quantity > 10:
            raise HTTPException(status_code=400, detail="Quantity must be between 1 and 10")
        
        # Get room
        room = await db.rooms.find_one({"id": room_id})
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        
        # Check if room is still waiting
        if room.get("status") != "waiting":
            raise HTTPException(status_code=400, detail="Cannot buy tickets for a room that has started")
        
        # Calculate total cost
        total_cost = room["ticket_price"] * quantity
        
        # Get user's wallet balance
        wallet = await db.wallets.find_one({"user_id": current_user["id"]})
        if not wallet:
            raise HTTPException(status_code=400, detail="Wallet not found")
        
        balance = wallet.get("balance", 0)
        if balance < total_cost:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Need ₹{total_cost}, have ₹{balance}"
            )
        
        # Deduct from wallet
        new_balance = balance - total_cost
        await db.wallets.update_one(
            {"user_id": current_user["id"]},
            {"$set": {"balance": new_balance}}
        )
        
        # Record transaction
        transaction_id = str(uuid.uuid4())
        await db.transactions.insert_one({
            "id": transaction_id,
            "user_id": current_user["id"],
            "type": "debit",
            "amount": total_cost,
            "description": f"Bought {quantity} ticket(s) for room {room['name']}",
            "created_at": datetime.utcnow()
        })
        
        # Generate tickets
        tickets_created = []
        for i in range(quantity):
            ticket_id = str(uuid.uuid4())
            ticket_number = await db.tickets.count_documents({"room_id": room_id}) + 1
            ticket_grid = generate_tambola_ticket(ticket_number)
            
            new_ticket = {
                "id": ticket_id,
                "room_id": room_id,
                "user_id": current_user["id"],
                "user_name": current_user["name"],  # Add user_name field
                "ticket_number": ticket_number,
                "grid": ticket_grid["grid"],  # Extract grid from result
                "numbers": ticket_grid["numbers"],  # Extract numbers from result
                "marked_numbers": [],
                "created_at": datetime.utcnow()
            }
            
            await db.tickets.insert_one(new_ticket)
            # Serialize to remove ObjectId and convert datetime
            tickets_created.append(serialize_doc(new_ticket))
        
        logger.info(f"User {current_user['id']} bought {quantity} tickets for room {room_id}")
        
        return {
            "message": f"Successfully purchased {quantity} ticket(s)",
            "tickets": tickets_created,
            "new_balance": new_balance
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error buying tickets: {e}")
        raise HTTPException(status_code=500, detail="Failed to purchase tickets")


# Include router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    # Use import string for reload; socket_app is the ASGI app
    # Changed port to 8001 to avoid conflict with port 8000
    uvicorn.run("server_multiplayer:socket_app", host="0.0.0.0", port=8001, reload=True)
