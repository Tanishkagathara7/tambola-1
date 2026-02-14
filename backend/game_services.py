"""
Game business logic: points, prize distribution, and atomic operations.
Used by both HTTP API and Socket.IO handlers. No FastAPI dependency.
"""
import logging
import uuid
from datetime import datetime
from typing import Optional

from models import Transaction, TransactionType

logger = logging.getLogger(__name__)

# Prize distribution: 10% each for 4 corners, first/middle/bottom line, early five; 50% full house
PRIZE_DISTRIBUTION = {
    "four_corners": 0.10,
    "top_line": 0.10,
    "middle_line": 0.10,
    "bottom_line": 0.10,
    "early_five": 0.10,
    "full_house": 0.50,
}


def compute_prize_distribution(prize_pool: float) -> dict:
    """
    Compute prize amounts from total pool. Used at game start.
    Returns dict: prize_type -> points (e.g. {"early_five": 50.0, "full_house": 250.0, ...}).
    """
    return {
        prize_type: round(prize_pool * pct, 2)
        for prize_type, pct in PRIZE_DISTRIBUTION.items()
    }


async def credit_points(
    db,
    user_id: str,
    amount: float,
    description: str,
    room_id: Optional[str] = None,
    ticket_id: Optional[str] = None,
) -> float:
    """
    Credit points to user. Uses $inc for atomic balance update.
    Creates a points transaction. Returns new balance. Never use current_user snapshot.
    """
    from pymongo import ReturnDocument
    logger.info(f"[CREDIT] Before: user_id={user_id} amount={amount} description={description}")
    result = await db.users.find_one_and_update(
        {"id": user_id},
        {"$inc": {"points_balance": amount}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise ValueError(f"User not found: {user_id}")
    new_balance = result.get("points_balance", 0)
    logger.info(f"[CREDIT] After: user_id={user_id} new_balance={new_balance}")

    txn = Transaction(
        user_id=user_id,
        amount=amount,
        type=TransactionType.CREDIT,
        description=description,
        balance_after=new_balance,
        room_id=room_id,
        ticket_id=ticket_id,
    )
    txn_dict = txn.dict()
    txn_dict["currency"] = "points"
    await db.transactions.insert_one(txn_dict)
    logger.info(f"Credited {amount} points to user {user_id}: {description}")
    return new_balance


async def debit_points(
    db,
    user_id: str,
    amount: float,
    description: str,
    room_id: Optional[str] = None,
) -> float:
    """
    Debit points from user. Uses $inc for atomic balance update.
    Fails if insufficient balance. Creates transaction. Returns new balance. Never use current_user snapshot.
    """
    from pymongo import ReturnDocument
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise ValueError(f"User not found: {user_id}")
    current = user.get("points_balance", 0)
    logger.info(f"[DEBIT] Before: user_id={user_id} current_balance={current} amount={amount} description={description}")
    if current < amount:
        raise ValueError(f"Insufficient points balance: have {current}, need {amount}")

    result = await db.users.find_one_and_update(
        {"id": user_id, "points_balance": {"$gte": amount}},
        {"$inc": {"points_balance": -amount}},
        return_document=ReturnDocument.AFTER,
    )
    if not result:
        raise ValueError("Insufficient points balance or user not found")
    new_balance = result.get("points_balance", 0)
    logger.info(f"[DEBIT] After: user_id={user_id} new_balance={new_balance}")

    txn = Transaction(
        user_id=user_id,
        amount=amount,
        type=TransactionType.DEBIT,
        description=description,
        balance_after=new_balance,
        room_id=room_id,
    )
    txn_dict = txn.dict()
    txn_dict["currency"] = "points"
    await db.transactions.insert_one(txn_dict)
    logger.info(f"Debited {amount} points from user {user_id}: {description}")
    return new_balance
