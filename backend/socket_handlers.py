"""
Socket.IO Event Handlers for Real-time Gameplay
"""
import socketio
from typing import Dict, Any
import logging
from datetime import datetime
from bson import ObjectId
import uuid

logger = logging.getLogger(__name__)

# Store active connections
active_connections: Dict[str, str] = {}  # sid -> user_id++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++-
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


async def handle_game_completion(sio, db, room_id):
    """Handle graceful game completion with winners and rankings"""
    try:
        # Update room status
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
            w.get('claimed_at', datetime.utcnow())
        ))
        
        serialized_winners = [serialize_doc(w) for w in sorted_winners]
        
        # Distribute remaining pool to Full House if needed (simplified logic for now)
        # In a real scenario, we'd calculate exact shares here.
        # For this requirement, we trust the points added during 'claim_prize' or 'end_game'
        
        # Emit game_completed event (not game_ended)
        await sio.emit('game_completed', {
            'room_id': room_id,
            'winners': serialized_winners,
            'completed_at': str(datetime.utcnow()),
            'prize_pool': (await db.rooms.find_one({"id": room_id})).get("prize_pool", 0)
        }, room=room_id)
        
        logger.info(f"Game completed in room {room_id} with {len(winners)} winners")
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
                # Check for mid-game join
                if room.get("status") == "active":
                    # Emit game_state_sync
                    await sio.emit('game_state_sync', {
                        "room_id": room_id,
                        "called_numbers": room.get("called_numbers", []),
                        "current_number": room.get("current_number"),
                        "last_called_at": str(datetime.utcnow()) # Approximate or add field to room
                    }, room=sid)

                # AUTO GENERATE ONE FREE TICKET FOR PLAYER
                # Check if player already has a ticket in this room
                existing_ticket = await db.tickets.find_one({
                    "room_id": room_id,
                    "user_id": user_id
                })
                
                if not existing_ticket:
                    # Generate ticket number based on existing tickets count
                    ticket_count = await db.tickets.count_documents({"room_id": room_id})
                    ticket_number = ticket_count + 1
                    
                    # Import generate function from server_multiplayer
                    from server_multiplayer import generate_tambola_ticket
                    
                    # Generate ticket grid
                    ticket_grid = generate_tambola_ticket(ticket_number)
                    
                    # Create ticket document
                    ticket_id = str(uuid.uuid4())
                    new_ticket = {
                        "id": ticket_id,
                        "room_id": room_id,
                        "user_id": user_id,
                        "ticket_number": ticket_number,
                        "grid": ticket_grid,
                        "marked_numbers": [],  # Empty array for marking
                        "created_at": datetime.utcnow()
                    }
                    
                    await db.tickets.insert_one(new_ticket)
                    logger.info(f"Auto-generated ticket {ticket_id} for user {user_id} in room {room_id}")
                
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
                    # GRACEFUL GAME COMPLETION - NO ERROR
                    # Calculate winners and end game
                    await handle_game_completion(sio, db, room_id)
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
            
            # AUTO-MARK ALL TICKETS IN THE ROOM AND AUTO-CLAIM PRIZES
            # Get all tickets for this room
            tickets = await db.tickets.find({"room_id": room_id}).to_list(1000)
            
            # Get room data for prize pool
            room_doc = await db.rooms.find_one({"id": room_id})
            prize_pool = room_doc.get("prize_pool", 0)
            
            for ticket in tickets:
                # Check if number exists in ticket grid
                number_found = False
                grid = ticket.get('grid', [])
                
                # Ensure grid is a list
                if not isinstance(grid, list):
                    logger.warning(f"Invalid grid format for ticket {ticket.get('id')}")
                    continue
                
                for row in grid:
                    # Ensure row is a list
                    if not isinstance(row, list):
                        continue
                    
                    # Check if number is in this row
                    if number in row:
                        number_found = True
                        break
                
                if number_found:
                    # Add number to marked_numbers if not already there
                    marked = ticket.get('marked_numbers', [])
                    
                    # Ensure marked is a list
                    if not isinstance(marked, list):
                        marked = []
                    
                    if number not in marked:
                        marked.append(number)
                        
                        # Update ticket in database
                        await db.tickets.update_one(
                            {"id": ticket['id']},
                            {"$set": {"marked_numbers": marked}}
                        )
                        
                        # Update the ticket object for pattern checking
                        ticket['marked_numbers'] = marked
                        
                        # Emit ticket_updated event to the specific user
                        serialized_ticket = serialize_doc(ticket)
                        serialized_ticket['marked_numbers'] = marked
                        
                        await sio.emit('ticket_updated', {
                            'ticket': serialized_ticket,
                            'number': number
                        }, room=room_id)
                
                # AUTO-CLAIM PRIZES: Check if any prize pattern is complete
                marked = ticket.get('marked_numbers', [])
                if not isinstance(marked, list):
                    marked = []
                
                logger.info(f"Checking patterns for ticket {ticket.get('id')} - marked: {len(marked)} numbers")
                
                # Define prize types to check in order
                def check_early_five():
                    # Early five: first 5 called numbers that match this ticket
                    ticket_numbers = [n for row in grid for n in row if n is not None]
                    matching_called = [n for n in called_numbers if n in ticket_numbers]
                    result = len(matching_called) >= 5
                    logger.info(f"Early five check: {len(matching_called)}/5 matching called numbers - {result}")
                    return result
                
                def check_top_line():
                    top_row_numbers = [n for n in grid[0] if n is not None]
                    result = len(top_row_numbers) > 0 and all(n in marked for n in top_row_numbers)
                    logger.info(f"Top line check: {top_row_numbers} - all marked: {result}")
                    return result
                
                def check_middle_line():
                    middle_row_numbers = [n for n in grid[1] if n is not None]
                    result = len(middle_row_numbers) > 0 and all(n in marked for n in middle_row_numbers)
                    logger.info(f"Middle line check: {middle_row_numbers} - all marked: {result}")
                    return result
                
                def check_bottom_line():
                    bottom_row_numbers = [n for n in grid[2] if n is not None]
                    result = len(bottom_row_numbers) > 0 and all(n in marked for n in bottom_row_numbers)
                    logger.info(f"Bottom line check: {bottom_row_numbers} - all marked: {result}")
                    return result
                
                def check_full_house():
                    all_numbers = [n for row in grid for n in row if n is not None]
                    result = len(all_numbers) > 0 and all(n in marked for n in all_numbers)
                    logger.info(f"Full house check: {len(all_numbers)} total numbers - all marked: {result}")
                    return result
                
                prize_checks = [
                    ('early_five', check_early_five),
                    ('top_line', check_top_line),
                    ('middle_line', check_middle_line),
                    ('bottom_line', check_bottom_line),
                    ('four_corners', lambda: check_four_corners(grid, marked)),
                    ('full_house', check_full_house)
                ]
                
                for prize_type, check_func in prize_checks:
                    # Check if prize already claimed
                    existing_winner = await db.winners.find_one({
                        "room_id": room_id,
                        "prize_type": prize_type
                    })
                    
                    if existing_winner:
                        continue  # Prize already claimed
                    
                    # Check if pattern is complete
                    try:
                        if check_func():
                            logger.info(f"AUTO-CLAIMING: Prize {prize_type} for ticket {ticket.get('id')} in room {room_id}")
                            
                            # AUTO-CLAIM THIS PRIZE
                            winner_id = str(uuid.uuid4())
                            ticket_user_id = ticket.get('user_id')
                            
                            # Calculate winning points based on standard percentages
                            winning_points = 0
                            if prize_pool > 0:
                                # Standard prize distribution percentages (same as offline)
                                if prize_type == 'early_five': 
                                    winning_points = prize_pool * 0.15  # 15% for Early Five
                                elif prize_type == 'top_line': 
                                    winning_points = prize_pool * 0.15  # 15% for Top Line
                                elif prize_type == 'middle_line': 
                                    winning_points = prize_pool * 0.15  # 15% for Middle Line
                                elif prize_type == 'bottom_line': 
                                    winning_points = prize_pool * 0.15  # 15% for Bottom Line
                                elif prize_type == 'four_corners': 
                                    winning_points = prize_pool * 0.10  # 10% for Four Corners
                                elif prize_type == 'full_house': 
                                    winning_points = prize_pool * 0.30  # 30% for Full House
                            else:
                                # Fallback to configured amount if pool is 0
                                for p in room_doc.get("prizes", []):
                                    if p.get('prize_type') == prize_type:
                                        winning_points = p.get('amount', 10)
                                        break
                                if winning_points == 0:
                                    winning_points = 10  # Default fallback
                            
                            # Create winner record
                            winner = {
                                "id": winner_id,
                                "room_id": room_id,
                                "user_id": ticket_user_id,
                                "ticket_id": ticket.get('id'),
                                "ticket_number": ticket.get('ticket_number'),
                                "prize_type": prize_type,
                                "amount": winning_points,
                                "claimed_at": datetime.utcnow(),
                                "auto_claimed": True
                            }
                            
                            await db.winners.insert_one(winner)
                            
                            # Credit points to user
                            await db.users.update_one(
                                {"id": ticket_user_id},
                                {"$inc": {
                                    "points_balance": winning_points, 
                                    "total_winnings": winning_points, 
                                    "total_wins": 1
                                }}
                            )
                            
                            # Get user info for broadcast
                            winner_user = await db.users.find_one({"id": ticket_user_id})
                            winner_name = winner_user.get('name', 'Unknown') if winner_user else 'Unknown'
                            
                            # Broadcast prize claimed to ALL players
                            serialized_winner = serialize_doc(winner)
                            serialized_winner['user_name'] = winner_name
                            
                            await sio.emit('prize_claimed', serialized_winner, room=room_id)
                            
                            logger.info(f"AUTO-CLAIMED: Prize {prize_type} for user {ticket_user_id} in room {room_id} - {winning_points} points")
                    
                    except Exception as e:
                        logger.error(f"Error checking prize {prize_type}: {e}")
            
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
                await handle_game_completion(sio, db, room_id)
            
            logger.info(f"Number {number} called in room {room_id}")
        
        except Exception as e:
            logger.error(f"Call number error: {e}")
            await sio.emit('error', {'message': str(e)}, room=sid)

    
    @sio.event
    async def claim_prize(sid, data):
        """Claim a prize with validation"""
        try:
            room_id = data.get('room_id')
            ticket_id = data.get('ticket_id')
            prize_type = data.get('prize_type')
            user_id = active_connections.get(sid)
            
            # Get ticket
            ticket = await db.tickets.find_one({"id": ticket_id})
            if not ticket:
                await sio.emit('error', {'message': 'Ticket not found'}, room=sid)
                return
            
            # Check if prize already claimed
            existing_winner = await db.winners.find_one({
                "room_id": room_id,
                "prize_type": prize_type
            })
            
            if existing_winner:
                await sio.emit('error', {'message': f'{prize_type} already claimed'}, room=sid)
                return
            
            # Validate win based on prize type
            grid = ticket.get('grid', [])
            marked = ticket.get('marked_numbers', [])
            is_valid = False
            
            # Get room to access called numbers for early five validation
            room_doc = await db.rooms.find_one({"id": room_id})
            called_numbers = room_doc.get('called_numbers', []) if room_doc else []
            
            if prize_type == 'early_five':
                # Early five: first 5 called numbers that match this ticket
                ticket_numbers = [n for row in grid for n in row if n is not None]
                matching_called = [n for n in called_numbers if n in ticket_numbers]
                is_valid = len(matching_called) >= 5
            
            elif prize_type == 'top_line':
                # All numbers in top row marked
                top_row = [n for n in grid[0] if n is not None]
                is_valid = len(top_row) > 0 and all(n in marked for n in top_row)
            
            elif prize_type == 'middle_line':
                # All numbers in middle row marked
                middle_row = [n for n in grid[1] if n is not None]
                is_valid = len(middle_row) > 0 and all(n in marked for n in middle_row)
            
            elif prize_type == 'bottom_line':
                # All numbers in bottom row marked
                bottom_row = [n for n in grid[2] if n is not None]
                is_valid = len(bottom_row) > 0 and all(n in marked for n in bottom_row)
            
            elif prize_type == 'four_corners':
                # Four corners marked
                is_valid = check_four_corners(grid, marked)
            
            elif prize_type == 'full_house':
                # All numbers in ticket marked
                all_numbers = [n for row in grid for n in row if n is not None]
                is_valid = len(all_numbers) > 0 and all(n in marked for n in all_numbers)
            
            if not is_valid:
                await sio.emit('error', {'message': 'Invalid claim - pattern not complete'}, room=sid)
                return
            
            # Save winner
            winner_id = str(uuid.uuid4())
            winner = {
                "id": winner_id,
                "room_id": room_id,
                "user_id": user_id,
                "ticket_id": ticket_id,
                "prize_type": prize_type,
                "claimed_at": datetime.utcnow()
            }
            
            await db.winners.insert_one(winner)
            
            # Get room data for prize pool calculation
            room_doc = await db.rooms.find_one({"id": room_id})
            prize_pool = room_doc.get("prize_pool", 0)
            
            # Calculate winning points based on standard percentages (same as offline)
            winning_points = 0
            if prize_pool > 0:
                # Standard prize distribution percentages
                if prize_type == 'early_five': 
                    winning_points = prize_pool * 0.15  # 15% for Early Five
                elif prize_type == 'top_line': 
                    winning_points = prize_pool * 0.15  # 15% for Top Line
                elif prize_type == 'middle_line': 
                    winning_points = prize_pool * 0.15  # 15% for Middle Line
                elif prize_type == 'bottom_line': 
                    winning_points = prize_pool * 0.15  # 15% for Bottom Line
                elif prize_type == 'four_corners': 
                    winning_points = prize_pool * 0.10  # 10% for Four Corners
                elif prize_type == 'full_house': 
                    winning_points = prize_pool * 0.30  # 30% for Full House
                else: 
                    winning_points = 10  # Default fallback
            else:
                 # Fallback to configured amount if pool is 0 (e.g. testing)
                 for p in room_doc.get("prizes", []):
                     if p['prize_type'] == prize_type:
                         winning_points = p['amount']
                         break
                 if winning_points == 0:
                     winning_points = 10  # Default fallback

            # Update winner record with actual amount
            await db.winners.update_one(
                {"id": winner_id},
                {"$set": {"amount": winning_points}}
            )

            # Credit points to user
            await db.users.update_one(
                {"id": user_id},
                {"$inc": {"points_balance": winning_points, "total_winnings": winning_points, "total_wins": 1}}
            )
            
            # Get updated balance
            updated_user = await db.users.find_one({"id": user_id})
            new_balance = updated_user.get("points_balance", 0)

            # Emit points_updated to the WINNER only
            await sio.emit('points_updated', {
                'balance': new_balance,
                'message': f"You won {winning_points} points for {prize_type}!"
            }, room=sid)

            # Broadcast prize claimed to ALL
            serialized_winner['amount'] = winning_points 
            await sio.emit('prize_claimed', serialized_winner, room=room_id)
        
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
            
            # Check if game is active
            if room.get('status') == 'active':
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
