import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface GameState {
  currentNumber: number | null;
  calledNumbers: number[];
  isAutoCalling: boolean;
  gameId: string | null;
}

interface GameStateContextType {
  gameState: GameState;
  callNumber: () => Promise<void>;
  setAutoCalling: (isAuto: boolean) => void;
  resetGame: () => void;
  initializeGame: (gameId: string) => void;
}

const GameStateContext = createContext<GameStateContextType | undefined>(undefined);

export const GameStateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState>({
    currentNumber: null,
    calledNumbers: [],
    isAutoCalling: false,
    gameId: null,
  });

  // Load game state from storage on mount
  useEffect(() => {
    loadGameState();
  }, []);

  const loadGameState = async () => {
    try {
      const savedState = await AsyncStorage.getItem('game_state');
      if (savedState) {
        const parsed = JSON.parse(savedState);
        setGameState(parsed);
      }
    } catch (error) {
      console.error('Error loading game state:', error);
    }
  };

  const saveGameState = async (newState: GameState) => {
    try {
      await AsyncStorage.setItem('game_state', JSON.stringify(newState));
      setGameState(newState);
    } catch (error) {
      console.error('Error saving game state:', error);
    }
  };

  const callNumber = useCallback(async () => {
    const currentCalled = gameState.calledNumbers;
    const availableNumbers = Array.from({ length: 90 }, (_, i) => i + 1).filter(
      (n) => !currentCalled.includes(n)
    );

    if (availableNumbers.length === 0) {
      return;
    }

    // Get preferred ticket for weighted selection
    const preferredTicketId = await AsyncStorage.getItem('admin_selected_ticket');
    let nextNumber: number;

    if (preferredTicketId) {
      const ticketsData = await AsyncStorage.getItem('generated_tickets');
      if (ticketsData) {
        const tickets = JSON.parse(ticketsData);
        const preferredTicket = tickets.find((t: any) => t.id === preferredTicketId);

        if (preferredTicket) {
          const preferredNumbers: number[] = preferredTicket.numbers.filter(
            (n: number) => !currentCalled.includes(n)
          );
          const otherNumbers: number[] = availableNumbers.filter(
            (n: number) => !preferredNumbers.includes(n)
          );

          if (preferredNumbers.length > 0) {
            // Strong bias: ~80% chance to call from preferred ticket,
            // 20% from others to keep it looking natural.
            const usePreferred = Math.random() < 0.8 || otherNumbers.length === 0;
            if (usePreferred) {
              nextNumber = preferredNumbers[Math.floor(Math.random() * preferredNumbers.length)];
            } else {
              nextNumber = otherNumbers[Math.floor(Math.random() * otherNumbers.length)];
            }
          } else {
            // All preferred numbers already called, fall back to normal random
            nextNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
          }
        } else {
          nextNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
        }
      } else {
        nextNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
      }
    } else {
      // Normal random selection
      nextNumber = availableNumbers[Math.floor(Math.random() * availableNumbers.length)];
    }

    const newCalledNumbers = [...currentCalled, nextNumber];
    const newState: GameState = {
      ...gameState,
      currentNumber: nextNumber,
      calledNumbers: newCalledNumbers,
    };

    await saveGameState(newState);
  }, [gameState]);

  const setAutoCalling = useCallback(async (isAuto: boolean) => {
    const newState: GameState = {
      ...gameState,
      isAutoCalling: isAuto,
    };
    await saveGameState(newState);
  }, [gameState]);

  const resetGame = useCallback(async () => {
    const newState: GameState = {
      currentNumber: null,
      calledNumbers: [],
      isAutoCalling: false,
      gameId: null,
    };
    await saveGameState(newState);
  }, []);

  const initializeGame = useCallback(async (gameId: string) => {
    const newState: GameState = {
      ...gameState,
      gameId,
    };
    await saveGameState(newState);
  }, [gameState]);

  return (
    <GameStateContext.Provider
      value={{
        gameState,
        callNumber,
        setAutoCalling,
        resetGame,
        initializeGame,
      }}
    >
      {children}
    </GameStateContext.Provider>
  );
};

export const useGameState = () => {
  const context = useContext(GameStateContext);
  if (!context) {
    throw new Error('useGameState must be used within GameStateProvider');
  }
  return context;
};
