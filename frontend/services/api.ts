/**
 * API Service for Multiplayer Tambola
 * Using native fetch API for React Native compatibility
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// API Configuration
const API_URL = __DEV__ 
  ? 'http://localhost:8001/api'  // Development
  : 'https://your-production-api.com/api';  // Production

// Fetch wrapper with auth and error handling
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = await AsyncStorage.getItem('auth_token');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
  });

  // Handle 401 - Token expired
  if (response.status === 401) {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_data');
    throw new Error('Unauthorized');
  }

  // Parse response
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Request failed');
  }

  return data;
};

// ============= AUTH API =============
export const authAPI = {
  signup: async (data: {
    name: string;
    email: string;
    mobile: string;
    password: string;
  }) => {
    return apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  login: async (data: { email: string; password: string }) => {
    return apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getProfile: async () => {
    return apiFetch('/auth/profile');
  },

  updateProfile: async (data: {
    name?: string;
    mobile?: string;
    profile_pic?: string;
  }) => {
    return apiFetch('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },
};

// ============= ROOM API =============
export const roomAPI = {
  getRooms: async (filters?: {
    room_type?: 'public' | 'private';
    status?: string;
  }) => {
    const params = new URLSearchParams(filters as any).toString();
    return apiFetch(`/rooms${params ? `?${params}` : ''}`);
  },

  createRoom: async (data: {
    name: string;
    room_type: 'public' | 'private';
    ticket_price: number;
    max_players: number;
    min_players: number;
    auto_start: boolean;
    prizes: Array<{
      prize_type: string;
      amount: number;
      enabled: boolean;
    }>;
    password?: string;
  }) => {
    return apiFetch('/rooms/create', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getRoom: async (roomId: string) => {
    return apiFetch(`/rooms/${roomId}`);
  },

  /** Get all tickets in a room (host only) - for admin winner selection */
  getRoomTickets: async (roomId: string) => {
    return apiFetch(`/rooms/${roomId}/tickets`);
  },

  /** Set winning ticket for room (host only) */
  setRoomAdminTicket: async (roomId: string, ticketId: string) => {
    return apiFetch(`/rooms/${roomId}/admin-ticket?ticket_id=${encodeURIComponent(ticketId)}`, {
      method: 'PUT',
    });
  },

  joinRoom: async (roomId: string, password?: string) => {
    return apiFetch(`/rooms/${roomId}/join`, {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
        password,
      }),
    });
  },
};

// ============= TICKET API =============
export const ticketAPI = {
  buyTickets: async (roomId: string, quantity: number) => {
    return apiFetch('/tickets/buy', {
      method: 'POST',
      body: JSON.stringify({
        room_id: roomId,
        quantity,
      }),
    });
  },

  getMyTickets: async (roomId: string) => {
    return apiFetch(`/tickets/my-tickets/${roomId}`);
  },
};

// ============= WALLET API =============
export const walletAPI = {
  getBalance: async () => {
    return apiFetch('/wallet/balance');
  },

  addMoney: async (amount: number, paymentMethod: string = 'razorpay') => {
    return apiFetch('/wallet/add-money', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        payment_method: paymentMethod,
      }),
    });
  },

  getTransactions: async () => {
    return apiFetch('/wallet/transactions');
  },
};

// ============= GAME API =============
export const gameAPI = {
  startGame: async (roomId: string) => {
    return apiFetch(`/game/${roomId}/start`, {
      method: 'POST',
    });
  },

  callNumber: async (roomId: string, number?: number) => {
    return apiFetch(`/game/${roomId}/call-number`, {
      method: 'POST',
      body: JSON.stringify({ number }),
    });
  },

  claimPrize: async (roomId: string, ticketId: string, prizeType: string) => {
    return apiFetch(`/game/${roomId}/claim`, {
      method: 'POST',
      body: JSON.stringify({
        ticket_id: ticketId,
        prize_type: prizeType,
      }),
    });
  },
};

export default apiFetch;
