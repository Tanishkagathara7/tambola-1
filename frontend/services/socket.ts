/**
 * Socket.IO Service for Real-time Communication
 */
import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SOCKET_URL = __DEV__
  ? 'http://localhost:8001'  // Development
  : 'https://your-production-api.com';  // Production

class SocketService {
  private socket: Socket | null = null;
  private userId: string | null = null;
  private currentRoom: string | null = null;

  /**
   * Connect to Socket.IO server
   */
  async connect() {
    if (this.socket?.connected) {
      console.log('Socket already connected');
      return;
    }

    // Get user ID from storage
    const userData = await AsyncStorage.getItem('user_data');
    if (userData) {
      const user = JSON.parse(userData);
      this.userId = user.id;
    }

    this.socket = io(SOCKET_URL, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    this.setupEventListeners();
    console.log('Socket connecting...');
  }

  /**
   * Disconnect from Socket.IO server
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      console.log('Socket disconnected');
    }
  }

  /**
   * Setup default event listeners
   */
  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Socket connected:', this.socket?.id);
      
      // Authenticate
      if (this.userId) {
        this.socket?.emit('authenticate', { user_id: this.userId });
      }
    });

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    this.socket.on('error', (error: any) => {
      console.error('Socket error:', error);
    });

    this.socket.on('authenticated', (data: any) => {
      console.log('Socket authenticated:', data);
    });
  }

  /**
   * Join a game room
   */
  joinRoom(roomId: string) {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }

    this.currentRoom = roomId;
    this.socket.emit('join_room', { room_id: roomId });
    console.log('Joining room:', roomId);
  }

  /**
   * Leave current room
   */
  leaveRoom() {
    if (!this.socket?.connected || !this.currentRoom) {
      return;
    }

    this.socket.emit('leave_room', { room_id: this.currentRoom });
    console.log('Leaving room:', this.currentRoom);
    this.currentRoom = null;
  }

  /**
   * Call a number (host only)
   */
  callNumber(roomId: string, number?: number) {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }

    this.socket.emit('call_number', {
      room_id: roomId,
      number,
    });
  }

  /**
   * Claim a prize
   */
  claimPrize(roomId: string, ticketId: string, prizeType: string) {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }

    this.socket.emit('claim_prize', {
      room_id: roomId,
      ticket_id: ticketId,
      prize_type: prizeType,
    });
  }

  /**
   * Send chat message
   */
  sendMessage(roomId: string, message: string) {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }

    this.socket.emit('chat_message', {
      room_id: roomId,
      message,
    });
  }

  /**
   * Start game (host only)
   */
  startGame(roomId: string) {
    if (!this.socket?.connected) {
      console.error('Socket not connected');
      return;
    }

    this.socket.emit('start_game', { room_id: roomId });
  }

  /**
   * Listen to an event
   */
  on(event: string, callback: (data: any) => void) {
    if (!this.socket) {
      console.error('Socket not initialized');
      return;
    }

    this.socket.on(event, callback);
  }

  /**
   * Remove event listener
   */
  off(event: string, callback?: (data: any) => void) {
    if (!this.socket) {
      return;
    }

    if (callback) {
      this.socket.off(event, callback);
    } else {
      this.socket.off(event);
    }
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Get current room ID
   */
  getCurrentRoom(): string | null {
    return this.currentRoom;
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;
