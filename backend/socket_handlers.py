"""
Socket.IO Event Handlers for Real-time Gameplay.
Uses points only; auto-mark and auto-claim on number call; room closes on full house.
"""
import random
import socketio
import uuid
import logging
from datetime import datetime
from typing import Dict, Any
from bson import ObjectId

from models import PrizeType, RoomStatus
from game_services import credit_points, compute_prize_distribution

logger = logging.getLogger(__name__)

active_connections: Dict[str, str] = {}  # sid -> user_id
user_rooms: Dict[str, str] = {}  # user_id -> room_id


def check_four_corners(grid, marked):
    """Check if four corners are marked"""
    try:
        corners = []
        for row_idx in [0, 2]:  # Top and bottom rows
            row = grid[row_idx]
            # Find first and last non-None numbers
            non_none = [n for n in row if n is not None]
            if len(non_none) >= 2:
                corners.append(non_none[0])
                corners.append(non_none[-1])
        return len(corners) == 4 and all(c in marked for c in corners)
    except Exception:
        return False


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


async def _build_leaderboard(db, room_id):
    """Build leaderboard list for room: [{ user_id, user_name, total_won, prizes }]."""
    winners = await db.winners.find({"room_id": room_id}).to_list(1000)
    by_user = {}
    for w in winners:
        uid = w.get("user_id")
        if not uid:
            continue
        if uid not in by_user:
            by_user[uid] = {"user_id": uid, "user_name": w.get("user_name", ""), "total_won": 0.0, "prizes": []}
        amt = float(w.get("amount") or 0)
        by_user[uid]["total_won"] += amt
        by_user[uid]["prizes"].append({"prize_type": w.get("prize_type"), "amount": amt})
    return sorted(by_user.values(), key=lambda x: -x["total_won"])


async def handle_game_completion(sio, db, room_id):
    """Set room COMPLETED, completed_at, final_results; increment total_games for ALL players in room."""
    try:
        room = await db.rooms.find_one({"id": room_id})
        if not room:
            return
        winners = await db.winners.find({"room_id": room_id}).to_list(1000)
        prize_order = {"early_five": 1, "top_line": 2, "middle_line": 3, "bottom_line": 4, "four_corners": 5, "full_house": 6}
        sorted_winners = sorted(winners, key=lambda w: (prize_order.get(w.get("prize_type"), 999), w.get("claimed_at", datetime.utcnow())))
        serialized_winners = [serialize_doc(w) for w in sorted_winners]
        leaderboard = await _build_leaderboard(db, room_id)
        await db.rooms.update_one(
            {"id": room_id},
            {
                "$set": {
                    "status": RoomStatus.COMPLETED.value,
                    "completed_at": datetime.utcnow(),
                    "final_results": leaderboard,
                }
            },
        )
        player_ids = [p.get("id") for p in room.get("players", []) if p.get("id")]
        for uid in player_ids:
            await db.users.update_one({"id": uid}, {"$inc": {"total_games": 1}})
        await sio.emit("game_completed", {
            "room_id": room_id,
            "winners": serialized_winners,
            "completed_at": datetime.utcnow().isoformat(),
            "prize_pool": room.get("prize_pool", 0),
            "leaderboard": leaderboard,
        }, room=room_id)
        await sio.emit("leaderboard_updated", {"room_id": room_id, "leaderboard": leaderboard}, room=room_id)
        logger.info(f"Game completed in room {room_id} winners={len(winners)} final_results stored")
    except Exception as e:
        logger.error(f"Game completion error: {e}")


async def register_socket_events(sio: socketio.AsyncServer, db):
    """Register all socket.io event handlers"""
    
    @sio.event
    async def connect(sid, environ):
        """Client connected"""
        logger.info(f"Client connected: {sid}")
        await sio.emit('connected', {'sid': sid}, room=sid)
    
    @sio.event
    async def disconnect(sid):
        """Client disconnected"""
        logger.info(f"Client disconnected: {sid}")
        
        # Remove from active connections
        user_id = active_connections.pop(sid, None)
        if user_id:
            room_id = user_rooms.pop(user_id, None)
            if room_id:
                # Notify room that player left
                await sio.emit('player_disconnected', {
                    'user_id': user_id
                }, room=room_id)
    
    @sio.event
    async def authenticate(sid, data):
        """Authenticate user with token"""
        try:
            user_id = data.get('user_id')
            if user_id:
                active_connections[sid] = user_id
                await sio.emit('authenticated', {'success': True}, room=sid)
                logger.info(f"User {user_id} authenticated on {sid}")
        except Exception as e:
            logger.error(f"Authentication error: {e}")
            await sio.emit('error', {'message': 'Authentication failed'}, room=sid)

    @sio.event
    async def admin_login(sid, data):
        """Admin successfully logged in from client secret panel"""
        # Required explicit console print for admin login
        print("[ADMIN] Admin logged in successfully")
        logger.info(f"Admin login event received from sid={sid}")

    @sio.event
    async def admin_panel_open(sid, data):
        """Admin connected to the secret admin panel"""
        # Required explicit console print when admin panel opens
        print("[ADMIN_PANEL] Admin connected to panel")
        logger.info(f"Admin panel opened on sid={sid}")
    
    @sio.event
    async def join_room(sid, data):
        """Join a game room. No ticket creation here; tickets only via POST /api/tickets/buy."""
        try:
            room_id = data.get("room_id")
            if not room_id:
                await sio.emit("error", {"message": "room_id required"}, room=sid)
                return
            user_id = active_connections.get(sid)
            if not user_id:
                await sio.emit("error", {"message": "Not authenticated"}, room=sid)
                return
            # Prevent duplicate join: already in this room
            if user_rooms.get(user_id) == room_id:
                room = await db.rooms.find_one({"id": room_id})
                if room:
                    await sio.emit("room_joined", {"room": serialize_doc(room), "user_id": user_id}, room=sid)
                return
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                await sio.emit("error", {"message": "Room not found"}, room=sid)
                return
            await sio.enter_room(sid, room_id)
            user_rooms[user_id] = room_id
            if room.get("status") == RoomStatus.ACTIVE.value:
                await sio.emit("game_state_sync", {
                    "room_id": room_id,
                    "called_numbers": room.get("called_numbers", []),
                    "current_number": room.get("current_number"),
                }, room=sid)
            await sio.emit("room_joined", {"room": serialize_doc(room), "user_id": user_id}, room=sid)
            await sio.emit("player_joined", {"user_id": user_id, "room_id": room_id}, room=room_id, skip_sid=sid)
            logger.info(f"User {user_id} joined room {room_id}")
        except Exception as e:
            logger.error(f"Join room error: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)

    
    @sio.event
    async def leave_room(sid, data):
        """Leave a game room"""
        try:
            room_id = data.get('room_id')
            user_id = active_connections.get(sid)
            
            if room_id and user_id:
                await sio.leave_room(sid, room_id)
                user_rooms.pop(user_id, None)
                
                # Notify others
                await sio.emit('player_left', {
                    'user_id': user_id,
                    'room_id': room_id
                }, room=room_id)
                
                logger.info(f"User {user_id} left room {room_id}")
        
        except Exception as e:
            logger.error(f"Leave room error: {e}")
    
    @sio.event
    async def call_number(sid, data):
        """Call a number: update room, auto-mark all tickets, auto-claim prizes. On full house, complete game."""
        try:
            from server_multiplayer import validate_win
            room_id = data.get("room_id")
            number = data.get("number")
            user_id = active_connections.get(sid)
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                await sio.emit("error", {"message": "Room not found"}, room=sid)
                return
            if room["host_id"] != user_id:
                await sio.emit("error", {"message": "Only host can call numbers"}, room=sid)
                return
            if room.get("status") != RoomStatus.ACTIVE.value:
                await sio.emit("error", {"message": "Game not active"}, room=sid)
                return

            called_numbers = list(room.get("called_numbers", []))
            if number is None:
                available = [n for n in range(1, 91) if n not in called_numbers]
                if not available:
                    await handle_game_completion(sio, db, room_id)
                    return
                number = random.choice(available)
            else:
                if number in called_numbers:
                    await sio.emit("error", {"message": "Number already called"}, room=sid)
                    return
                if number < 1 or number > 90:
                    await sio.emit("error", {"message": "Invalid number"}, room=sid)
                    return

            called_numbers.append(number)
            await db.rooms.update_one(
                {"id": room_id},
                {"$set": {"current_number": number, "called_numbers": called_numbers}},
            )

            prize_dist = room.get("prize_distribution")
            if not prize_dist and room.get("prize_pool"):
                prize_dist = compute_prize_distribution(room["prize_pool"])
            if not prize_dist:
                prize_dist = {}

            tickets = await db.tickets.find({"room_id": room_id}).to_list(1000)
            full_house_won = False

            for ticket in tickets:
                grid = ticket.get("grid") or []
                if not isinstance(grid, list) or len(grid) != 3:
                    continue
                numbers_in_ticket = ticket.get("numbers")
                if not numbers_in_ticket and grid:
                    numbers_in_ticket = [n for row in grid for n in (row or []) if n is not None]
                ticket["numbers"] = numbers_in_ticket or []

                marked = list(ticket.get("marked_numbers") or [])
                if number in (ticket["numbers"] or []):
                    if number not in marked:
                        marked.append(number)
                        await db.tickets.update_one({"id": ticket["id"]}, {"$set": {"marked_numbers": marked}})
                        ticket["marked_numbers"] = marked
                        await sio.emit("ticket_updated", {
                            "ticket_id": ticket["id"],
                            "marked_numbers": marked,
                            "last_called_number": number,
                        }, room=room_id)

                prize_types_order = [
                    PrizeType.EARLY_FIVE,
                    PrizeType.TOP_LINE,
                    PrizeType.MIDDLE_LINE,
                    PrizeType.BOTTOM_LINE,
                    PrizeType.FOUR_CORNERS,
                    PrizeType.FULL_HOUSE,
                ]
                for pt in prize_types_order:
                    pt_str = pt.value
                    existing = await db.winners.find_one({"room_id": room_id, "prize_type": pt_str})
                    if existing:
                        continue
                    if not validate_win(ticket, called_numbers, pt):
                        continue
                    amount = float(prize_dist.get(pt_str, 0) or 0)
                    if amount <= 0:
                        amount = 10.0
                    winner_doc = {
                        "id": str(uuid.uuid4()),
                        "room_id": room_id,
                        "user_id": ticket["user_id"],
                        "user_name": ticket.get("user_name", ""),
                        "ticket_id": ticket["id"],
                        "ticket_number": ticket.get("ticket_number", 0),
                        "prize_type": pt_str,
                        "amount": amount,
                        "claimed_at": datetime.utcnow(),
                        "auto_claimed": True,
                    }
                    await db.winners.insert_one(winner_doc)
                    try:
                        await credit_points(
                            db,
                            ticket["user_id"],
                            amount,
                            f"Won {pt_str} in room {room_id}",
                            room_id=room_id,
                            ticket_id=ticket["id"],
                        )
                    except ValueError:
                        pass
                    await db.users.update_one(
                        {"id": ticket["user_id"]},
                        {"$inc": {"total_wins": 1, "total_winnings": amount}},
                    )
                    await db.rooms.update_one({"id": room_id}, {"$push": {"winners": winner_doc}})
                    serialized = serialize_doc(winner_doc)
                    await sio.emit("prize_won", {"winner": serialized, "room_id": room_id}, room=room_id)
                    leaderboard = await _build_leaderboard(db, room_id)
                    await sio.emit("leaderboard_updated", {"room_id": room_id, "leaderboard": leaderboard}, room=room_id)
                    if pt == PrizeType.FULL_HOUSE:
                        full_house_won = True
                    logger.info(f"[PRIZE] Awarded {pt_str} amount={amount} user={ticket['user_id']} room={room_id}")

            await sio.emit("number_called", {
                "number": number,
                "called_numbers": called_numbers,
                "remaining": 90 - len(called_numbers),
                "game_complete": len(called_numbers) >= 90,
            }, room=room_id)

            if full_house_won or len(called_numbers) >= 90:
                await handle_game_completion(sio, db, room_id)

            logger.info(f"Number {number} called in room {room_id}")
        except Exception as e:
            logger.error(f"Call number error: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)

    
    @sio.event
    async def claim_prize(sid, data):
        """Optional manual claim. Uses room prize_distribution and credit_points."""
        try:
            from server_multiplayer import validate_win
            room_id = data.get("room_id")
            ticket_id = data.get("ticket_id")
            prize_type = data.get("prize_type")
            user_id = active_connections.get(sid)
            ticket = await db.tickets.find_one({"id": ticket_id})
            if not ticket:
                await sio.emit("error", {"message": "Ticket not found"}, room=sid)
                return
            if ticket.get("user_id") != user_id:
                await sio.emit("error", {"message": "Not your ticket"}, room=sid)
                return
            existing_winner = await db.winners.find_one({"room_id": room_id, "prize_type": prize_type})
            if existing_winner:
                await sio.emit("error", {"message": f"{prize_type} already claimed"}, room=sid)
                return
            room_doc = await db.rooms.find_one({"id": room_id})
            called_numbers = room_doc.get("called_numbers", []) if room_doc else []
            pt_enum = getattr(PrizeType, prize_type.upper(), None) if isinstance(prize_type, str) else prize_type
            if pt_enum is None:
                try:
                    pt_enum = PrizeType(prize_type)
                except (ValueError, KeyError):
                    await sio.emit("error", {"message": "Invalid prize type"}, room=sid)
                    return
            if not validate_win(ticket, called_numbers, pt_enum):
                await sio.emit("error", {"message": "Invalid claim - pattern not complete"}, room=sid)
                return
            dist = room_doc.get("prize_distribution") or {}
            amount = float(dist.get(prize_type, 0) or 0)
            if amount <= 0:
                amount = 10.0
            user_doc = await db.users.find_one({"id": user_id})
            winner_doc = {
                "id": str(uuid.uuid4()),
                "room_id": room_id,
                "user_id": user_id,
                "user_name": (user_doc or {}).get("name", ""),
                "ticket_id": ticket_id,
                "ticket_number": ticket.get("ticket_number", 0),
                "prize_type": prize_type,
                "amount": amount,
                "claimed_at": datetime.utcnow(),
            }
            await db.winners.insert_one(winner_doc)
            try:
                new_balance = await credit_points(db, user_id, amount, f"Won {prize_type} in room {room_id}", room_id=room_id, ticket_id=ticket_id)
            except ValueError:
                u = await db.users.find_one({"id": user_id})
                new_balance = u.get("points_balance", 0) + amount
            await db.users.update_one({"id": user_id}, {"$inc": {"total_wins": 1, "total_winnings": amount}})
            await db.rooms.update_one({"id": room_id}, {"$push": {"winners": winner_doc}})
            serialized = serialize_doc(winner_doc)
            await sio.emit("points_updated", {"points_balance": new_balance, "message": f"You won {amount} points for {prize_type}!"}, room=sid)
            await sio.emit("prize_won", {"winner": serialized, "room_id": room_id}, room=room_id)
            leaderboard = await _build_leaderboard(db, room_id)
            await sio.emit("leaderboard_updated", {"room_id": room_id, "leaderboard": leaderboard}, room=room_id)
        except Exception as e:
            logger.error(f"Claim prize error: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)
    
    @sio.event
    async def chat_message(sid, data):
        """Send chat message"""
        try:
            room_id = data.get('room_id')
            message = data.get('message')
            user_id = active_connections.get(sid)
            
            if not message or len(message) > 500:
                return
            
            # Get user
            user = await db.users.find_one({"id": user_id})
            if not user:
                return
            
            # Broadcast message
            await sio.emit('chat_message', {
                'user_id': user_id,
                'user_name': user['name'],
                'message': message,
                'timestamp': str(datetime.utcnow())
            }, room=room_id)
        
        except Exception as e:
            logger.error(f"Chat message error: {e}")
    
    @sio.event
    async def start_game(sid, data):
        """Start the game: set status active, compute prize_pool and prize_distribution if not set."""
        try:
            room_id = data.get("room_id")
            user_id = active_connections.get(sid)
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                await sio.emit("error", {"message": "Room not found"}, room=sid)
                return
            if room["host_id"] != user_id:
                await sio.emit("error", {"message": "Only host can start game"}, room=sid)
                return
            tickets_count = await db.tickets.count_documents({"room_id": room_id})
            if tickets_count == 0:
                await sio.emit("error", {"message": "No tickets purchased yet"}, room=sid)
                return
            ticket_price = room.get("ticket_price", 0)
            current_players = room.get("current_players", 0)
            prize_pool = room.get("prize_pool")
            if prize_pool is None or prize_pool <= 0:
                prize_pool = current_players * ticket_price
            prize_dist = room.get("prize_distribution")
            if not prize_dist:
                prize_dist = compute_prize_distribution(prize_pool)
            await db.rooms.update_one(
                {"id": room_id},
                {
                    "$set": {
                        "status": RoomStatus.ACTIVE.value,
                        "started_at": datetime.utcnow(),
                        "is_paused": False,
                        "prize_pool": prize_pool,
                        "prize_distribution": prize_dist,
                    }
                },
            )
            tickets = await db.tickets.find({"room_id": room_id}).to_list(1000)
            serialized_tickets = [serialize_doc(t) for t in tickets]
            await sio.emit("game_started", {
                "room_id": room_id,
                "started_at": datetime.utcnow().isoformat(),
                "tickets": serialized_tickets,
                "prize_pool": prize_pool,
                "prize_distribution": prize_dist,
            }, room=room_id)
            logger.info(f"Game started in room {room_id} with {len(tickets)} tickets")
        except Exception as e:
            logger.error(f"Start game error: {e}")
            await sio.emit("error", {"message": str(e)}, room=sid)
    
    @sio.event
    async def pause_game(sid, data):
        """Pause/Resume the game"""
        try:
            room_id = data.get('room_id')
            user_id = active_connections.get(sid)
            
            # Get room
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                return
            
            # Check if user is host
            if room['host_id'] != user_id:
                await sio.emit('error', {'message': 'Only host can pause game'}, room=sid)
                return
            
            # Toggle pause state
            is_paused = not room.get('is_paused', False)
            
            # Update room status
            await db.rooms.update_one(
                {"id": room_id},
                {"$set": {"is_paused": is_paused}}
            )
            
            # Broadcast pause state
            await sio.emit('game_paused', {
                'room_id': room_id,
                'is_paused': is_paused
            }, room=room_id)
            
            logger.info(f"Game {'paused' if is_paused else 'resumed'} in room {room_id}")
        
        except Exception as e:
            logger.error(f"Pause game error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
    
    @sio.event
    async def end_game(sid, data):
        """End the game and calculate rankings"""
        try:
            room_id = data.get('room_id')
            user_id = active_connections.get(sid)
            
            # Get room
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                return
            
            # Check if user is host
            if room['host_id'] != user_id:
                await sio.emit('error', {'message': 'Only host can end game'}, room=sid)
                return
            
            # Get all winners
            winners = await db.winners.find({"room_id": room_id}).to_list(1000)
            
            # Calculate rankings based on prize types and claim time
            prize_order = {
                'early_five': 1,
                'top_line': 2,
                'middle_line': 3,
                'bottom_line': 4,
                'four_corners': 5,
                'full_house': 6
            }
            
            # Sort winners by prize order and claim time
            sorted_winners = sorted(winners, key=lambda w: (
                prize_order.get(w['prize_type'], 999),
                w['claimed_at']
            ))
            
            # Add rank to winners
            for idx, winner in enumerate(sorted_winners):
                await db.winners.update_one(
                    {"id": winner['id']},
                    {"$set": {"rank": idx + 1}}
                )
            
            # Update room status
            await db.rooms.update_one(
                {"id": room_id},
                {
                    "$set": {
                        "status": RoomStatus.COMPLETED.value,
                        "completed_at": datetime.utcnow()
                    }
                }
            )
            
            # Serialize winners
            serialized_winners = [serialize_doc(w) for w in sorted_winners]
            
            # Broadcast game ended with rankings
            await sio.emit('game_ended', {
                'room_id': room_id,
                'winners': serialized_winners,
                'completed_at': str(datetime.utcnow())
            }, room=room_id)
            
            logger.info(f"Game ended in room {room_id}")
        
        except Exception as e:
            logger.error(f"End game error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
    
    @sio.event
    async def delete_room(sid, data):
        """Delete a room (host only) via socket"""
        try:
            room_id = data.get('room_id')
            user_id = active_connections.get(sid)
            
            # Get room
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                await sio.emit('error', {'message': 'Room not found'}, room=sid)
                return
            
            # Check if user is host
            if room['host_id'] != user_id:
                await sio.emit('error', {'message': 'Only host can delete room'}, room=sid)
                return
            
            if room.get("status") == RoomStatus.ACTIVE.value:
                await sio.emit('error', {
                    'message': 'Cannot delete room while game is active. Please end the game first.'
                }, room=sid)
                return
            
            # Delete associated data
            tickets_result = await db.tickets.delete_many({"room_id": room_id})
            winners_result = await db.winners.delete_many({"room_id": room_id})
            
            # Delete the room
            await db.rooms.delete_one({"id": room_id})
            
            # Notify all players in the room
            await sio.emit('room_deleted', {
                'room_id': room_id,
                'message': 'Room has been deleted by the host'
            }, room=room_id)
            
            # Notify the host
            await sio.emit('room_delete_success', {
                'room_id': room_id,
                'tickets_deleted': tickets_result.deleted_count,
                'winners_deleted': winners_result.deleted_count
            }, room=sid)
            
            logger.info(f"Room {room_id} deleted by host {user_id} via socket")
        
        except Exception as e:
            logger.error(f"Delete room error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
