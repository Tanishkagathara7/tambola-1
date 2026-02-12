/**
 * Authentication Context for Multiplayer Tambola
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { socketService } from '../services/socket';

interface User {
  id: string;
  name: string;
  email: string;
  mobile: string;
  profile_pic?: string;
  points_balance: number;
  total_games: number;
  total_wins: number;
  total_winnings: number;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, mobile: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updatePointsBalance: (newBalance: number) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from storage on mount
  useEffect(() => {
    loadUser();
  }, []);

  // Connect socket when user is authenticated
  useEffect(() => {
    if (user) {
      socketService.connect();
    } else {
      socketService.disconnect();
    }
  }, [user]);

  const loadUser = async () => {
    try {
      const token = await AsyncStorage.getItem('auth_token');
      const userData = await AsyncStorage.getItem('user_data');

      if (token && userData) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Error loading user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      const response = await authAPI.login({ email, password });

      console.log('Login response:', JSON.stringify(response, null, 2));

      if (!response || !response.access_token) {
        throw new Error('Invalid response from server: missing access_token');
      }

      // Save token and user data
      await AsyncStorage.setItem('auth_token', response.access_token);
      await AsyncStorage.setItem('user_data', JSON.stringify(response.user));

      setUser(response.user);
    } catch (error: any) {
      console.error('Login error details:', error);
      throw new Error(error.message || 'Login failed');
    }
  };

  const signup = async (name: string, email: string, mobile: string, password: string) => {
    try {
      const response = await authAPI.signup({ name, email, mobile, password });

      // Save token and user data
      await AsyncStorage.setItem('auth_token', response.access_token);
      await AsyncStorage.setItem('user_data', JSON.stringify(response.user));

      setUser(response.user);
    } catch (error: any) {
      console.error('Signup error:', error);
      throw new Error(error.message || 'Signup failed');
    }
  };

  const logout = async () => {
    try {
      // Disconnect socket
      socketService.disconnect();

      // Clear storage
      await AsyncStorage.removeItem('auth_token');
      await AsyncStorage.removeItem('user_data');

      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const refreshProfile = async () => {
    try {
      const profile = await authAPI.getProfile();
      await AsyncStorage.setItem('user_data', JSON.stringify(profile));
      setUser(profile);
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  };

  const updatePointsBalance = (newBalance: number) => {
    if (user) {
      const updatedUser = { ...user, points_balance: newBalance };
      setUser(updatedUser);
      AsyncStorage.setItem('user_data', JSON.stringify(updatedUser));
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        logout,
        refreshProfile,
        updatePointsBalance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
