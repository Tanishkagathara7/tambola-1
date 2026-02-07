"""
Socket.IO Event Handlers for Real-time Gameplay
"""
import socketio
from typing import Dict, Any
import logging
from datetime import datetime
from bson import ObjectId

logger = logging.getLogger(__name__)

# Store active connections
active_connections: Dict[str, str] = {}  # sid -> user_id
user_rooms: Dict[str, str] = {}  # user_id -> room_id


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
    async def join_room(sid, data):
        """Join a game room"""
        try:
            room_id = data.get('room_id')
            user_id = active_connections.get(sid)
            
            if not user_id:
                await sio.emit('error', {'message': 'Not authenticated'}, room=sid)
                return
            
            # Join socket.io room
            await sio.enter_room(sid, room_id)
            user_rooms[user_id] = room_id
            
            # Get room data
            room = await db.rooms.find_one({"id": room_id})
            if room:
                # Serialize room data to remove ObjectId
                serialized_room = serialize_doc(room)
                
                await sio.emit('room_joined', {
                    'room': serialized_room,
                    'user_id': user_id
                }, room=sid)
                
                # Notify others
                await sio.emit('player_joined', {
                    'user_id': user_id,
                    'room_id': room_id
                }, room=room_id, skip_sid=sid)
                
                logger.info(f"User {user_id} joined room {room_id}")
        
        except Exception as e:
            logger.error(f"Join room error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
    
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
        """Call a number in the game"""
        try:
            room_id = data.get('room_id')
            number = data.get('number')
            user_id = active_connections.get(sid)
            
            # Get room
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                await sio.emit('error', {'message': 'Room not found'}, room=sid)
                return
            
            # Check if user is host
            if room['host_id'] != user_id:
                await sio.emit('error', {'message': 'Only host can call numbers'}, room=sid)
                return
            
            # Generate or validate number
            called_numbers = room.get('called_numbers', [])
            
            if number is None:
                # Auto-generate
                available = [n for n in range(1, 91) if n not in called_numbers]
                if not available:
                    await sio.emit('error', {'message': 'All numbers called'}, room=sid)
                    return
                import random
                number = random.choice(available)
            else:
                # Validate
                if number in called_numbers:
                    await sio.emit('error', {'message': 'Number already called'}, room=sid)
                    return
                if number < 1 or number > 90:
                    await sio.emit('error', {'message': 'Invalid number'}, room=sid)
                    return
            
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
            
            # Check if all numbers have been called
            game_complete = len(called_numbers) >= 90
            
            # Broadcast to all players in room
            await sio.emit('number_called', {
                'number': number,
                'called_numbers': called_numbers,
                'remaining': 90 - len(called_numbers),
                'game_complete': game_complete
            }, room=room_id)
            
            # If game complete, trigger end game
            if game_complete:
                await db.rooms.update_one(
                    {"id": room_id},
                    {"$set": {"status": "completed", "completed_at": datetime.utcnow()}}
                )
                
                # Get winners and rankings
                winners = await db.winners.find({"room_id": room_id}).to_list(1000)
                prize_order = {
                    'early_five': 1,
                    'top_line': 2,
                    'middle_line': 3,
                    'bottom_line': 4,
                    'four_corners': 5,
                    'full_house': 6
                }
                sorted_winners = sorted(winners, key=lambda w: (
                    prize_order.get(w['prize_type'], 999),
                    w['claimed_at']
                ))
                
                serialized_winners = [serialize_doc(w) for w in sorted_winners]
                
                await sio.emit('game_ended', {
                    'room_id': room_id,
                    'winners': serialized_winners,
                    'completed_at': str(datetime.utcnow())
                }, room=room_id)
            
            logger.info(f"Number {number} called in room {room_id}")
        
        except Exception as e:
            logger.error(f"Call number error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
    
    @sio.event
    async def claim_prize(sid, data):
        """Claim a prize"""
        try:
            room_id = data.get('room_id')
            ticket_id = data.get('ticket_id')
            prize_type = data.get('prize_type')
            user_id = active_connections.get(sid)
            
            # Validate claim (will be done in API route)
            # Just broadcast for now
            await sio.emit('prize_claimed', {
                'user_id': user_id,
                'ticket_id': ticket_id,
                'prize_type': prize_type,
                'room_id': room_id
            }, room=room_id)
            
            logger.info(f"Prize claimed by {user_id} in room {room_id}")
        
        except Exception as e:
            logger.error(f"Claim prize error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
    
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
        """Start the game"""
        try:
            room_id = data.get('room_id')
            user_id = active_connections.get(sid)
            
            # Get room
            room = await db.rooms.find_one({"id": room_id})
            if not room:
                return
            
            # Check if user is host
            if room['host_id'] != user_id:
                await sio.emit('error', {'message': 'Only host can start game'}, room=sid)
                return
            
            # Check if players have tickets
            tickets_count = await db.tickets.count_documents({"room_id": room_id})
            if tickets_count == 0:
                await sio.emit('error', {'message': 'No tickets purchased yet'}, room=sid)
                return
            
            # Update room status
            await db.rooms.update_one(
                {"id": room_id},
                {
                    "$set": {
                        "status": "active",
                        "started_at": datetime.utcnow(),
                        "is_paused": False
                    }
                }
            )
            
            # Get all tickets for this room
            tickets = await db.tickets.find({"room_id": room_id}).to_list(1000)
            serialized_tickets = [serialize_doc(t) for t in tickets]
            
            # Broadcast game started with tickets
            await sio.emit('game_started', {
                'room_id': room_id,
                'started_at': str(datetime.utcnow()),
                'tickets': serialized_tickets
            }, room=room_id)
            
            logger.info(f"Game started in room {room_id} with {len(tickets)} tickets")
        
        except Exception as e:
            logger.error(f"Start game error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)
    
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
                        "status": "completed",
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
