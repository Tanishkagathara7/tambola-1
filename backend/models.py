"""
Database Models for Multiplayer Tambola
"""
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum
import uuid


# ============= ENUMS =============
class RoomStatus(str, Enum):
    WAITING = "waiting"
    STARTING = "starting"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class RoomType(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"


class TransactionType(str, Enum):
    CREDIT = "credit"
    DEBIT = "debit"


class PrizeType(str, Enum):
    EARLY_FIVE = "early_five"
    TOP_LINE = "top_line"
    MIDDLE_LINE = "middle_line"
    BOTTOM_LINE = "bottom_line"
    FOUR_CORNERS = "four_corners"
    FULL_HOUSE = "full_house"
    STAR = "star"


# ============= USER MODELS =============
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    mobile: str = Field(..., pattern=r'^\+?[1-9]\d{9,14}$')
    password: str = Field(..., min_length=6)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    email: EmailStr
    mobile: str
    password_hash: str
    profile_pic: Optional[str] = None
    points_balance: float = 0.0
    total_games: int = 0
    total_wins: int = 0
    total_winnings: float = 0.0
    is_active: bool = True
    is_banned: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None


class UserProfile(BaseModel):
    id: str
    name: str
    email: EmailStr
    mobile: str
    profile_pic: Optional[str]
    points_balance: float
    total_games: int
    total_wins: int
    total_winnings: float
    created_at: datetime


class UserUpdate(BaseModel):
    name: Optional[str] = None
    mobile: Optional[str] = None
    profile_pic: Optional[str] = None


# ============= ROOM MODELS =============
class PrizeConfig(BaseModel):
    prize_type: PrizeType
    amount: float
    enabled: bool = True
    multiple_winners: bool = False


class RoomCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=50)
    room_type: RoomType = RoomType.PUBLIC
    ticket_price: float = Field(..., ge=5, le=1000)
    max_players: int = Field(default=50, ge=2, le=100)
    min_players: int = Field(default=2, ge=2)
    auto_start: bool = True
    prizes: List[PrizeConfig]
    password: Optional[str] = None


class Room(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_code: str = Field(default_factory=lambda: str(uuid.uuid4())[:8].upper())
    name: str
    host_id: str
    host_name: str
    room_type: RoomType
    ticket_price: float
    max_players: int
    min_players: int
    current_players: int = 0
    auto_start: bool
    prizes: List[PrizeConfig]
    password: Optional[str] = None
    status: RoomStatus = RoomStatus.WAITING
    players: List[Dict[str, Any]] = []
    tickets_sold: int = 0
    prize_pool: float = 0.0
    called_numbers: List[int] = []
    current_number: Optional[int] = None
    is_paused: bool = False
    winners: List[Dict[str, Any]] = []
    admin_selected_ticket: Optional[str] = None  # ticket_id for host's winner pick
    created_at: datetime = Field(default_factory=datetime.utcnow)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class RoomJoin(BaseModel):
    room_id: str
    password: Optional[str] = None


# ============= TICKET MODELS =============
class TicketPurchase(BaseModel):
    room_id: str
    quantity: int = Field(default=1, ge=1, le=10)


class Ticket(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    ticket_number: int
    user_id: str
    user_name: str
    room_id: str
    grid: List[List[Optional[int]]]
    numbers: List[int]
    marked_numbers: List[int] = []
    purchased_at: datetime = Field(default_factory=datetime.utcnow)


# ============= WALLET MODELS =============
class WalletAddMoney(BaseModel):
    amount: float = Field(..., ge=10, le=10000)
    payment_method: str = "razorpay"


class Transaction(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    amount: float
    type: TransactionType
    description: str
    balance_after: float
    room_id: Optional[str] = None
    ticket_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ============= GAME MODELS =============
class CallNumber(BaseModel):
    room_id: str
    number: Optional[int] = None  # None for auto-generate


class ClaimPrize(BaseModel):
    room_id: str
    ticket_id: str
    prize_type: PrizeType


class Winner(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    user_name: str
    room_id: str
    ticket_id: str
    ticket_number: int
    prize_type: PrizeType
    amount: float
    verified: bool = False
    claimed_at: datetime = Field(default_factory=datetime.utcnow)
    verified_at: Optional[datetime] = None


# ============= CHAT MODELS =============
class ChatMessage(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    room_id: str
    user_id: str
    user_name: str
    message: str = Field(..., max_length=500)
    timestamp: datetime = Field(default_factory=datetime.utcnow)


# ============= RESPONSE MODELS =============
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserProfile


class MessageResponse(BaseModel):
    message: str
    data: Optional[Any] = None