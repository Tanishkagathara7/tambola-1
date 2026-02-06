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
from datetime import datetime
import random
import socketio

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
        # First 5 numbers of ticket
        return len(ticket_called) >= 5 and all(n in called_numbers for n in numbers[:5])
    
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
    
    # Create token
    token = create_user_token(user.id, user.email)
    
    # Return user profile
    profile = UserProfile(
        id=user.id,
        name=user.name,
        email=user.email,
        mobile=user.mobile,
        profile_pic=user.profile_pic,
        wallet_balance=user.wallet_balance,
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
        wallet_balance=user.get("wallet_balance", 0.0),
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
        wallet_balance=current_user.get("wallet_balance", 0.0),
        total_games=current_user.get("total_games", 0),
        total_wins=current_user.get("total_wins", 0),
        total_winnings=current_user.get("total_winnings", 0.0),
        created_at=current_user["created_at"]
    )


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
    return [Room(**room) for room in rooms]


@api_router.post("/rooms/create", response_model=Room)
async def create_room(
    room_data: RoomCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new game room"""
    room = Room(
        name=room_data.name,
        host_id=current_user["id"],
        host_name=current_user["name"],
        room_type=room_data.room_type,
        ticket_price=room_data.ticket_price,
        max_players=room_data.max_players,
        min_players=room_data.min_players,
        auto_start=room_data.auto_start,
        prizes=room_data.prizes,
        password=room_data.password
    )
    
    await db.rooms.insert_one(room.dict())
    
    logger.info(f"Room created: {room.id} by {current_user['name']}")
    
    # Broadcast new room to all connected clients
    await sio.emit('new_room', room.dict())
    
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
    return Room(**room)


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
    return [Ticket(**t) for t in tickets]


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
        raise HTTPException(status_code=400, detail="Already in room")
    
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
    
    # Broadcast player joined
    await sio.emit('player_joined', {
        "room_id": room_id,
        "player": player
    }, room=room_id)
    
    return MessageResponse(message="Joined room successfully", data={"room_id": room_id})


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
    if current_user["wallet_balance"] < total_cost:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")
    
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
    new_balance = current_user["wallet_balance"] - total_cost
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"wallet_balance": new_balance}}
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
    
    # Update room
    await db.rooms.update_one(
        {"id": purchase.room_id},
        {
            "$inc": {
                "tickets_sold": purchase.quantity,
                "prize_pool": total_cost * 0.8  # 80% goes to prize pool
            }
        }
    )
    
    logger.info(f"User {current_user['id']} bought {purchase.quantity} tickets for room {purchase.room_id}")
    
    return MessageResponse(
        message=f"Successfully purchased {purchase.quantity} ticket(s)",
        data={"tickets": tickets, "new_balance": new_balance}
    )


@api_router.get("/tickets/my-tickets/{room_id}", response_model=List[Ticket])
async def get_my_tickets(
    room_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get user's tickets for a specific room"""
    tickets = await db.tickets.find({
        "room_id": room_id,
        "user_id": current_user["id"]
    }).to_list(100)
    
    return [Ticket(**ticket) for ticket in tickets]


# ============= WALLET ROUTES =============
@api_router.get("/wallet/balance")
async def get_wallet_balance(current_user: dict = Depends(get_current_user)):
    """Get wallet balance"""
    return {"balance": current_user.get("wallet_balance", 0.0)}


@api_router.post("/wallet/add-money", response_model=MessageResponse)
async def add_money(
    wallet_data: WalletAddMoney,
    current_user: dict = Depends(get_current_user)
):
    """Add money to wallet (payment gateway integration needed)"""
    # TODO: Integrate with Razorpay or other payment gateway
    # For now, just add money directly (for testing)
    
    new_balance = current_user.get("wallet_balance", 0.0) + wallet_data.amount
    
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"wallet_balance": new_balance}}
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


# Include router
app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn
    # Use import string for reload; socket_app is the ASGI app
    # Changed port to 8001 to avoid conflict with port 8000
    uvicorn.run("server_multiplayer:socket_app", host="0.0.0.0", port=8001, reload=True)
