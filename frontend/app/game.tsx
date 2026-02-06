import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useGameState } from '../contexts/GameStateContext';
import { generateTicketsForPlayers, Ticket } from '../utils/ticketGenerator';

const { width } = Dimensions.get('window');
const AUTO_SPEED_SECONDS = 5;

interface Player {
  id: string;
  name: string;
}

export default function GameScreen() {
  const router = useRouter();
  const { gameState, callNumber, setAutoCalling, initializeGame, resetGame } = useGameState();
  const [game, setGame] = useState<{ players: Player[]; tickets: Ticket[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeGameOffline();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Sync local state with GameState
  useEffect(() => {
    if (gameState.isAutoCalling && !intervalRef.current) {
      // Start auto calling
      intervalRef.current = setInterval(() => {
        callNumber();
      }, AUTO_SPEED_SECONDS * 1000);
    } else if (!gameState.isAutoCalling && intervalRef.current) {
      // Stop auto calling
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, [gameState.isAutoCalling, callNumber]);

  // Speak the number whenever it changes (offline TTS)
  useEffect(() => {
    const n = gameState.currentNumber;
    if (n === null) return;

    try {
      Speech.stop();
      Speech.speak(String(n), { rate: 0.9 });
    } catch (e) {
      // no-op (TTS may be unavailable on some devices/emulators)
    }
  }, [gameState.currentNumber]);

  const initializeGameOffline = async () => {
    try {
      const gameDataStr = await AsyncStorage.getItem('current_game');
      if (!gameDataStr) {
        Alert.alert('Error', 'No game data found');
        router.back();
        return;
      }

      const gameData = JSON.parse(gameDataStr);
      
      // Generate tickets offline (fresh tickets per new game start)
      const tickets = generateTicketsForPlayers(gameData.players, gameData.ticketCounts);
      await AsyncStorage.setItem('generated_tickets', JSON.stringify(tickets));

      // Create game object
      const gameObj = {
        players: gameData.players,
        tickets: tickets,
      };
      setGame(gameObj);
      
      // Initialize game state (fresh)
      const gameId = `game_${Date.now()}`;
      await initializeGame(gameId);
    } catch (error) {
      console.error('Error initializing game:', error);
      Alert.alert('Error', 'Failed to initialize game');
    } finally {
      setLoading(false);
    }
  };

  const handleCallNumber = async () => {
    if (gameState.calledNumbers.length >= 90) {
      Alert.alert('Game Complete', 'All numbers have been called!');
      await setAutoCalling(false);
      return;
    }
    await callNumber();
  };

  const toggleAutoMode = async () => {
    if (gameState.isAutoCalling) {
      // Stop
      await setAutoCalling(false);
    } else {
      // Start
      await setAutoCalling(true);
      await handleCallNumber(); // Call first number immediately
    }
  };

  const endGameAndGoToPlayers = async () => {
    await setAutoCalling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    Speech.stop();

    await resetGame();
    await AsyncStorage.multiRemove(['current_game', 'generated_tickets', 'admin_selected_ticket']);
    router.replace('/(tabs)/players');
  };

  const handleEndGame = () => {
    Alert.alert('End Game', 'End the current game and start a new one?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'End Game', style: 'destructive', onPress: endGameAndGoToPlayers },
    ]);
  };

  const viewPlayerTickets = (player: Player) => {
    router.push({
      pathname: '/player-tickets',
      params: {
        playerId: player.id,
        playerName: player.name,
      },
    });
  };

  const renderNumberGrid = () => {
    const numbers = Array.from({ length: 90 }, (_, i) => i + 1);
    const rows = [];
    for (let i = 0; i < 9; i++) {
      rows.push(numbers.slice(i * 10, (i + 1) * 10));
    }

    return (
      <View style={styles.numberGrid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.numberRow}>
            {row.map((num) => (
              <View
                key={num}
                style={[
                  styles.numberCell,
                  gameState.calledNumbers.includes(num) && styles.numberCellCalled,
                  gameState.currentNumber === num && styles.numberCellCurrent,
                ]}
              >
                <Text
                  style={[
                    styles.numberText,
                    gameState.calledNumbers.includes(num) && styles.numberTextCalled,
                  ]}
                >
                  {num}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Initializing Game...</Text>
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>TAMBOLA GAME</Text>
          <View style={styles.headerRight}>
            <Text style={styles.calledCount}>{gameState.calledNumbers.length}/90</Text>
            <TouchableOpacity onPress={handleEndGame} style={styles.endGameButton}>
              <MaterialCommunityIcons name="flag-checkered" size={22} color="#FFD700" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Current Number Display */}
          <View style={styles.currentNumberContainer}>
            <Text style={styles.currentNumberLabel}>Current Number</Text>
            <View style={styles.currentNumberCircle}>
              <Text style={styles.currentNumberText}>
                {gameState.currentNumber || '--'}
              </Text>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, styles.manualButton]}
              onPress={handleCallNumber}
              disabled={gameState.isAutoCalling}
            >
              <MaterialCommunityIcons name="hand-pointing-right" size={24} color="#FFF" />
              <Text style={styles.controlButtonText}>Call Number</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, gameState.isAutoCalling ? styles.stopButton : styles.autoButton]}
              onPress={toggleAutoMode}
            >
              <MaterialCommunityIcons
                name={gameState.isAutoCalling ? 'stop' : 'play'}
                size={24}
                color="#FFF"
              />
              <Text style={styles.controlButtonText}>
                {gameState.isAutoCalling ? `Auto (${AUTO_SPEED_SECONDS}s)` : 'Auto Mode'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.autoHint}>
            <MaterialCommunityIcons name="volume-high" size={18} color="#FFD700" />
            <Text style={styles.autoHintText}>Auto mode announces numbers every {AUTO_SPEED_SECONDS} seconds</Text>
          </View>

          {/* Number Grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Called Numbers</Text>
            {renderNumberGrid()}
          </View>

          {/* Players */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Players</Text>
            {game?.players.map((player) => {
              const playerTickets = game.tickets.filter(t => t.player_id === player.id);
              return (
                <TouchableOpacity
                  key={player.id}
                  style={styles.playerCard}
                  onPress={() => viewPlayerTickets(player)}
                >
                  <MaterialCommunityIcons name="account" size={32} color="#FFD700" />
                  <Text style={styles.playerCardName}>{player.name}</Text>
                  <Text style={styles.playerCardTickets}>{playerTickets.length} tickets</Text>
                  <MaterialCommunityIcons name="chevron-right" size={24} color="#FFD700" />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a5f1a',
  },
  loadingText: {
    fontSize: 18,
    color: '#FFD700',
    marginTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  headerRight: {
    width: 90,
    alignItems: 'flex-end',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
  calledCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  endGameButton: {
    padding: 6,
  },
  content: {
    padding: 16,
  },
  currentNumberContainer: {
    alignItems: 'center',
    marginBottom: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 3,
    borderColor: '#FFD700',
  },
  currentNumberLabel: {
    fontSize: 16,
    color: '#FFF',
    marginBottom: 12,
    fontWeight: '600',
  },
  currentNumberCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFF',
  },
  currentNumberText: {
    fontSize: 56,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  controls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    gap: 8,
  },
  manualButton: {
    backgroundColor: '#FF6B35',
  },
  autoButton: {
    backgroundColor: '#4ECDC4',
  },
  stopButton: {
    backgroundColor: '#FF4444',
  },
  controlButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  autoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.35)',
  },
  autoHintText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 12,
  },
  numberGrid: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 8,
  },
  numberRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  numberCell: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  numberCellCalled: {
    backgroundColor: '#FFD700',
  },
  numberCellCurrent: {
    backgroundColor: '#FF6B35',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  numberText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  numberTextCalled: {
    color: '#1a5f1a',
  },
  playerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  playerCardName: {
    flex: 1,
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
  playerCardTickets: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
});
