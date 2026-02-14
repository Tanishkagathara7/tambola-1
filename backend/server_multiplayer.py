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

# Import models, auth, and game services
from models import *
from auth import (
    get_password_hash,
    verify_password,
    create_user_token,
    get_current_user,
)
from game_services import credit_points, debit_points, compute_prize_distribution

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
    
    # Set initial points balance (no wallet collection)
    initial_points = 50.0
    user_dict = user.dict()
    user_dict["points_balance"] = initial_points
    await db.users.insert_one(user_dict)

    # Create initial points transaction
    await db.transactions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user.id,
        "type": "credit",
        "currency": "points",
        "amount": initial_points,
        "description": "Welcome bonus - Initial 50 Points",
        "balance_after": initial_points,
        "created_at": datetime.utcnow(),
    })

    logger.info(f"Created new user {user.id} with {initial_points} points welcome bonus")
    
    # Create token
    token = create_user_token(user.id, user.email)
    
    # Return user profile (user_dict has points_balance)
    profile = UserProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        mobile=user.mobile,
        profile_pic=user.profile_pic,
        points_balance=initial_points,
        total_games=0,
        total_wins=0,
        total_winnings=0.0,
        created_at=user.created_at,
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
    """
    Standard prize types for room config. Actual amounts are computed at game start
    via compute_prize_distribution(prize_pool). These are for display/config only.
    """
    return [
        {"prize_type": "early_five", "amount": 0, "percentage": 10},
        {"prize_type": "top_line", "amount": 0, "percentage": 10},
        {"prize_type": "middle_line", "amount": 0, "percentage": 10},
        {"prize_type": "bottom_line", "amount": 0, "percentage": 10},
        {"prize_type": "four_corners", "amount": 0, "percentage": 10},
        {"prize_type": "full_house", "amount": 0, "percentage": 50},
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
        query["status"] = {"$in": [RoomStatus.WAITING.value, RoomStatus.ACTIVE.value]}
    
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
    """Delete a room (host only). Refunds ticket cost when room was still waiting."""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can delete the room")

    room_status = room.get("status") or ""
    if room_status == RoomStatus.ACTIVE.value or room_status == RoomStatus.ACTIVE:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete room while game is active. Please end the game first.",
        )

    # Refund points when game had not started (before deleting tickets)
    if room_status == RoomStatus.WAITING.value or room_status == RoomStatus.WAITING:
        ticket_price = room.get("ticket_price", 0)
        tickets = await db.tickets.find({"room_id": room_id}).to_list(1000)
        user_ticket_counts = {}
        for t in tickets:
            uid = t.get("user_id")
            if uid:
                user_ticket_counts[uid] = user_ticket_counts.get(uid, 0) + 1
        for uid, count in user_ticket_counts.items():
            refund = ticket_price * count
            try:
                await credit_points(
                    db, uid, refund,
                    f"Refund for room deletion: {room.get('name', room_id)}",
                    room_id=room_id,
                )
            except Exception as e:
                logger.warning(f"Refund failed for user {uid}: {e}")

    tickets_result = await db.tickets.delete_many({"room_id": room_id})
    winners_result = await db.winners.delete_many({"room_id": room_id})
    await db.rooms.delete_one({"id": room_id})

    await sio.emit("room_deleted", {
        "room_id": room_id,
        "deleted_by": current_user["id"],
    })

    logger.info(f"Room {room_id} deleted by host {current_user['id']}")
    return MessageResponse(
        message="Room deleted successfully",
        data={
            "room_id": room_id,
            "tickets_deleted": tickets_result.deleted_count,
            "winners_deleted": winners_result.deleted_count,
        },
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
    """Join a game room. Mid-game join allowed (ACTIVE): user can observe; cannot buy tickets after game starts."""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room["current_players"] >= room["max_players"]:
        raise HTTPException(status_code=400, detail="Room is full")

    player_ids = [p["id"] for p in room.get("players", [])]
    if current_user["id"] in player_ids:
        return MessageResponse(message="Already in room", data={"room_id": room_id})

    if (room.get("room_type") or "").lower() == "private" and room.get("password"):
        if not join_data.password or join_data.password != room["password"]:
            raise HTTPException(status_code=403, detail="Invalid room password")

    player = {
        "id": current_user["id"],
        "name": current_user["name"],
        "profile_pic": current_user.get("profile_pic"),
        "joined_at": datetime.utcnow(),
    }
    await db.rooms.update_one(
        {"id": room_id},
        {"$push": {"players": player}, "$inc": {"current_players": 1}},
    )
    serialized_player = serialize_doc(player)
    await sio.emit("player_joined", {"room_id": room_id, "player": serialized_player}, room=room_id)
    return MessageResponse(message="Joined room successfully", data={"room_id": room_id})


# ============= TICKET ROUTES =============
@api_router.post("/tickets/buy", response_model=MessageResponse)
async def buy_tickets(
    purchase: TicketPurchase,
    current_user: dict = Depends(get_current_user)
):
    """Purchase tickets for a room. Only when room status is WAITING."""
    room = await db.rooms.find_one({"id": purchase.room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    room_status = (room.get("status") or "").lower()
    if room_status != RoomStatus.WAITING.value:
        raise HTTPException(status_code=400, detail="Cannot buy tickets after game starts")

    total_cost = room["ticket_price"] * purchase.quantity
    try:
        new_balance = await debit_points(
            db,
            current_user["id"],
            total_cost,
            f"Purchased {purchase.quantity} ticket(s) for {room['name']}",
            room_id=purchase.room_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

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
            numbers=ticket_data["numbers"],
        )
        tickets.append(ticket.dict())

    await db.tickets.insert_many(tickets)
    await db.rooms.update_one(
        {"id": purchase.room_id},
        {"$inc": {"tickets_sold": purchase.quantity}},
    )

    logger.info(f"User {current_user['id']} bought {purchase.quantity} tickets for room {purchase.room_id}")
    return MessageResponse(
        message=f"Successfully purchased {purchase.quantity} ticket(s)",
        data={"tickets": tickets, "points_balance": new_balance},
    )


# ============= POINTS ROUTES =============
@api_router.get("/points/balance")
async def get_points_balance(current_user: dict = Depends(get_current_user)):
    """Get current user points balance."""
    return {"points_balance": current_user.get("points_balance", 0.0)}


@api_router.post("/points/add-points", response_model=MessageResponse)
async def add_points(
    data: AddPoints,
    current_user: dict = Depends(get_current_user),
):
    """Add points to user (e.g. payment gateway or admin). Currency is always points."""
    try:
        new_balance = await credit_points(
            db,
            current_user["id"],
            data.amount,
            f"Added points via {data.payment_method}",
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return MessageResponse(
        message=f"Successfully added {data.amount} points",
        data={"points_balance": new_balance},
    )


@api_router.get("/points/transactions", response_model=List[Transaction])
async def get_points_transactions(
    limit: int = 50,
    current_user: dict = Depends(get_current_user),
):
    """Get points transaction history."""
    transactions = await db.transactions.find(
        {"user_id": current_user["id"]}
    ).sort("created_at", -1).limit(limit).to_list(limit)
    return [Transaction(**txn) for txn in transactions]


# ============= ADS ROUTES =============
@api_router.post("/ads/rewarded", response_model=MessageResponse)
async def ads_rewarded(current_user: dict = Depends(get_current_user)):
    """Reward user for watching an ad (points only)."""
    reward_points = 10.0
    try:
        new_balance = await credit_points(
            db, current_user["id"], reward_points, "Ad Reward - Watched Video Ad"
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return MessageResponse(
        message="Ad reward credited successfully",
        data={"points_balance": new_balance, "reward": reward_points},
    )


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
    current_user: dict = Depends(get_current_user),
):
    """Start the game (host only). Computes prize pool and distribution from tickets sold."""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can start the game")

    room_status = (room.get("status") or "").lower()
    if room_status != RoomStatus.WAITING.value:
        raise HTTPException(status_code=400, detail="Game already started or completed")

    if room.get("current_players", 0) < room.get("min_players", 2):
        raise HTTPException(
            status_code=400,
            detail=f"Need at least {room['min_players']} players to start",
        )
    tickets_sold = room.get("tickets_sold", 0)
    if tickets_sold <= 0:
        raise HTTPException(status_code=400, detail="No tickets sold. At least one ticket required to start.")

    ticket_price = room.get("ticket_price", 0)
    prize_pool = tickets_sold * ticket_price
    prize_distribution = compute_prize_distribution(prize_pool)

    await db.rooms.update_one(
        {"id": room_id},
        {
            "$set": {
                "status": RoomStatus.ACTIVE.value,
                "started_at": datetime.utcnow(),
                "prize_pool": prize_pool,
                "prize_distribution": prize_distribution,
            }
        },
    )

    await sio.emit("game_started", {
        "room_id": room_id,
        "started_at": datetime.utcnow().isoformat(),
        "prize_pool": prize_pool,
        "prize_distribution": prize_distribution,
    }, room=room_id)

    logger.info(f"Game started in room {room_id}, prize_pool={prize_pool}")
    return MessageResponse(message="Game started successfully")


@api_router.post("/game/{room_id}/call-number", response_model=MessageResponse)
async def call_number_api(
    room_id: str,
    call_data: CallNumber,
    current_user: dict = Depends(get_current_user),
):
    """Call a number (host only). Auto-marking and auto-claim are handled in socket handler."""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if room["host_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Only host can call numbers")
    if (room.get("status") or "").lower() != RoomStatus.ACTIVE.value:
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
    current_user: dict = Depends(get_current_user),
):
    """Optional manual claim. Auto-claim is done in socket on number_called; use this for late claims if needed."""
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    if (room.get("status") or "").lower() not in (RoomStatus.ACTIVE.value, RoomStatus.COMPLETED.value):
        raise HTTPException(status_code=400, detail="Game not active or completed")

    ticket = await db.tickets.find_one({"id": claim.ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    if ticket["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not your ticket")

    prize_type_str = claim.prize_type.value if hasattr(claim.prize_type, "value") else str(claim.prize_type)
    existing_winner = await db.winners.find_one({
        "room_id": room_id,
        "prize_type": prize_type_str,
    })
    if existing_winner:
        raise HTTPException(status_code=400, detail="Prize already claimed")

    called_numbers = room.get("called_numbers", [])
    if not validate_win(ticket, called_numbers, claim.prize_type):
        raise HTTPException(status_code=400, detail="Invalid claim - winning condition not met")

    distribution = room.get("prize_distribution") or {}
    prize_amount = distribution.get(prize_type_str, 0.0)
    if prize_amount <= 0:
        for p in room.get("prizes", []):
            pt = p.get("prize_type") or p.get("prize_type")
            if (pt == prize_type_str or (hasattr(pt, "value") and pt.value == prize_type_str)):
                prize_amount = p.get("amount", 0)
                break
    if prize_amount <= 0:
        prize_amount = 10.0

    winner = Winner(
        user_id=current_user["id"],
        user_name=current_user["name"],
        room_id=room_id,
        ticket_id=claim.ticket_id,
        ticket_number=ticket["ticket_number"],
        prize_type=claim.prize_type,
        amount=prize_amount,
        verified=True,
        verified_at=datetime.utcnow(),
    )
    await db.winners.insert_one(winner.dict())

    try:
        new_balance = await credit_points(
            db,
            current_user["id"],
            prize_amount,
            f"Won {prize_type_str} in {room['name']}",
            room_id=room_id,
            ticket_id=claim.ticket_id,
        )
    except ValueError:
        new_balance = current_user.get("points_balance", 0) + prize_amount

    await db.users.update_one(
        {"id": current_user["id"]},
        {"$inc": {"total_wins": 1, "total_winnings": prize_amount}},
    )
    await db.rooms.update_one(
        {"id": room_id},
        {"$push": {"winners": winner.dict()}},
    )

    await sio.emit("prize_won", {"winner": winner.dict(), "room_id": room_id}, room=room_id)
    logger.info(f"User {current_user['id']} claimed {prize_type_str} in room {room_id}")
    return MessageResponse(
        message=f"Congratulations! You won {prize_type_str}",
        data={"winner": winner.dict(), "points_balance": new_balance},
    )


@api_router.get("/game/{room_id}/winners", response_model=List[Winner])
async def get_winners(
    room_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get winners for a room."""
    winners = await db.winners.find({"room_id": room_id}).to_list(100)
    return [Winner(**w) for w in winners]


@api_router.get("/game/{room_id}/leaderboard")
async def get_leaderboard(
    room_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Leaderboard for the room: users sorted by total prize won (descending).
    Returns list of { user_id, user_name, total_won, prizes: [...] }.
    """
    room = await db.rooms.find_one({"id": room_id})
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    winners = await db.winners.find({"room_id": room_id}).to_list(100)
    by_user: dict = {}
    for w in winners:
        uid = w.get("user_id")
        if not uid:
            continue
        if uid not in by_user:
            by_user[uid] = {"user_id": uid, "user_name": w.get("user_name", ""), "total_won": 0.0, "prizes": []}
        amt = w.get("amount", 0) or 0
        by_user[uid]["total_won"] += amt
        by_user[uid]["prizes"].append({
            "prize_type": w.get("prize_type"),
            "amount": amt,
            "ticket_id": w.get("ticket_id"),
        })

    leaderboard = sorted(by_user.values(), key=lambda x: -x["total_won"])
    return leaderboard


# ============= TICKET API =============
@api_router.get("/tickets/my-tickets/{room_id}")
async def get_my_tickets(
    room_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Get user's tickets for a room. Tickets are never regenerated; marked_numbers updated by server on number call."""
    try:
        tickets = await db.tickets.find({
            "room_id": room_id,
            "user_id": current_user["id"],
        }).to_list(100)
        out = []
        for t in tickets:
            if "_id" in t:
                del t["_id"]
            if not t.get("user_name") and t.get("user_id"):
                t["user_name"] = current_user.get("name", "")
            if "marked_numbers" not in t:
                t["marked_numbers"] = []
            out.append(serialize_doc(t))
        return out
    except Exception as e:
        logger.error(f"Error fetching tickets: {e}")
        return []


# Include router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    # Use import string for reload; socket_app is the ASGI app
    # Changed port to 8001 to avoid conflict with port 8000
    uvicorn.run("server_multiplayer:socket_app", host="0.0.0.0", port=8001, reload=True)
