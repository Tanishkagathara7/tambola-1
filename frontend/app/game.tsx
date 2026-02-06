import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const { width } = Dimensions.get('window');

interface Ticket {
  id: string;
  ticket_number: number;
  player_id: string;
  player_name: string;
  grid: (number | null)[][];
  numbers: number[];
}

interface GameData {
  id: string;
  players: any[];
  tickets: Ticket[];
  called_numbers: number[];
  current_number: number | null;
  game_mode: string;
  auto_speed: number;
  admin_selected_ticket: string | null;
}

export default function GameScreen() {
  const router = useRouter();
  const [game, setGame] = useState<GameData | null>(null);
  const [loading, setLoading] = useState(true);
  const [calledNumbers, setCalledNumbers] = useState<number[]>([]);
  const [currentNumber, setCurrentNumber] = useState<number | null>(null);
  const [gameMode, setGameMode] = useState<'manual' | 'auto'>('manual');
  const [autoSpeed, setAutoSpeed] = useState(3); // seconds
  const [isPlaying, setIsPlaying] = useState(false);
  const [ticketsModalVisible, setTicketsModalVisible] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<Ticket[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeGame();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const initializeGame = async () => {
    try {
      const gameDataStr = await AsyncStorage.getItem('current_game');
      if (!gameDataStr) {
        Alert.alert('Error', 'No game data found');
        router.back();
        return;
      }

      const gameData = JSON.parse(gameDataStr);
      
      // Generate tickets
      const response = await fetch(`${API_URL}/api/tickets/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: gameData.players,
          tickets_per_player: gameData.ticketCounts,
        }),
      });

      const ticketsData = await response.json();
      const tickets = ticketsData.tickets;

      // Create game
      const gameResponse = await fetch(`${API_URL}/api/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          players: gameData.players,
          tickets_per_player: gameData.ticketCounts,
        }),
      });

      const createdGame = await gameResponse.json();
      setGame(createdGame);
      
      // Save tickets locally
      await AsyncStorage.setItem('generated_tickets', JSON.stringify(tickets));
      
      // Check for admin selected ticket
      const adminTicket = await AsyncStorage.getItem('admin_selected_ticket');
      if (adminTicket) {
        await fetch(`${API_URL}/api/games/${createdGame.id}/admin-ticket?ticket_id=${adminTicket}`, {
          method: 'PUT',
        });
      }
    } catch (error) {
      console.error('Error initializing game:', error);
      Alert.alert('Error', 'Failed to initialize game');
    } finally {
      setLoading(false);
    }
  };

  const callNumber = async () => {
    if (!game) return;

    try {
      const adminTicket = await AsyncStorage.getItem('admin_selected_ticket');
      const mode = adminTicket ? 'smart' : 'random';
      
      const response = await fetch(`${API_URL}/api/games/${game.id}/call-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: game.id, mode }),
      });

      const data = await response.json();
      
      if (data.number) {
        setCurrentNumber(data.number);
        setCalledNumbers(data.called_numbers);
      } else {
        Alert.alert('Game Complete', 'All numbers have been called!');
        setIsPlaying(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch (error) {
      console.error('Error calling number:', error);
    }
  };

  const toggleAutoMode = () => {
    if (isPlaying) {
      // Stop
      setIsPlaying(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      // Start
      setIsPlaying(true);
      callNumber(); // Call first number immediately
      intervalRef.current = setInterval(() => {
        callNumber();
      }, autoSpeed * 1000);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setAutoSpeed(speed);
    if (isPlaying) {
      // Restart interval with new speed
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        callNumber();
      }, speed * 1000);
    }
  };

  const viewTickets = (playerName: string) => {
    const tickets = game?.tickets.filter(t => t.player_name === playerName) || [];
    setSelectedTickets(tickets);
    setTicketsModalVisible(true);
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
                  calledNumbers.includes(num) && styles.numberCellCalled,
                  currentNumber === num && styles.numberCellCurrent,
                ]}
              >
                <Text
                  style={[
                    styles.numberText,
                    calledNumbers.includes(num) && styles.numberTextCalled,
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

  const renderTicket = (ticket: Ticket) => (
    <View key={ticket.id} style={styles.miniTicketContainer}>
      <View style={styles.miniTicketHeader}>
        <Text style={styles.miniTicketNumber}>#{String(ticket.ticket_number).padStart(4, '0')}</Text>
      </View>
      <View style={styles.miniTicketGrid}>
        {ticket.grid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.miniRow}>
            {row.map((cell, colIndex) => {
              const isCalled = cell !== null && calledNumbers.includes(cell);
              return (
                <View
                  key={colIndex}
                  style={[
                    styles.miniCell,
                    cell !== null && styles.miniCellFilled,
                    isCalled && styles.miniCellCalled,
                  ]}
                >
                  {cell !== null && (
                    <Text style={[styles.miniCellText, isCalled && styles.miniCellTextCalled]}>
                      {cell}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Generating Tickets...</Text>
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
            <Text style={styles.calledCount}>{calledNumbers.length}/90</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Current Number Display */}
          <View style={styles.currentNumberContainer}>
            <Text style={styles.currentNumberLabel}>Current Number</Text>
            <View style={styles.currentNumberCircle}>
              <Text style={styles.currentNumberText}>
                {currentNumber || '--'}
              </Text>
            </View>
          </View>

          {/* Controls */}
          <View style={styles.controls}>
            <TouchableOpacity
              style={[styles.controlButton, styles.manualButton]}
              onPress={callNumber}
              disabled={isPlaying}
            >
              <MaterialCommunityIcons name="hand-pointing-right" size={24} color="#FFF" />
              <Text style={styles.controlButtonText}>Call Number</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, isPlaying ? styles.stopButton : styles.autoButton]}
              onPress={toggleAutoMode}
            >
              <MaterialCommunityIcons
                name={isPlaying ? 'stop' : 'play'}
                size={24}
                color="#FFF"
              />
              <Text style={styles.controlButtonText}>
                {isPlaying ? 'Stop Auto' : 'Auto Mode'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Speed Control */}
          {gameMode === 'auto' && (
            <View style={styles.speedControl}>
              <Text style={styles.speedLabel}>Speed:</Text>
              {[1, 2, 3, 5].map((speed) => (
                <TouchableOpacity
                  key={speed}
                  style={[
                    styles.speedButton,
                    autoSpeed === speed && styles.speedButtonActive,
                  ]}
                  onPress={() => handleSpeedChange(speed)}
                >
                  <Text
                    style={[
                      styles.speedButtonText,
                      autoSpeed === speed && styles.speedButtonTextActive,
                    ]}
                  >
                    {speed}s
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

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
                  onPress={() => viewTickets(player.name)}
                >
                  <MaterialCommunityIcons name="account" size={32} color="#FFD700" />
                  <Text style={styles.playerCardName}>{player.name}</Text>
                  <Text style={styles.playerCardTickets}>{playerTickets.length} tickets</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Tickets Modal */}
        <Modal
          visible={ticketsModalVisible}
          animationType="slide"
          onRequestClose={() => setTicketsModalVisible(false)}
        >
          <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.modalContainer}>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Tickets</Text>
                <TouchableOpacity onPress={() => setTicketsModalVisible(false)}>
                  <MaterialCommunityIcons name="close" size={28} color="#FFD700" />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.modalContent}>
                <View style={styles.ticketsGrid}>
                  {selectedTickets.map(renderTicket)}
                </View>
              </ScrollView>
            </SafeAreaView>
          </LinearGradient>
        </Modal>
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
    width: 60,
    alignItems: 'flex-end',
  },
  calledCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
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
  speedControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 8,
  },
  speedLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  speedButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  speedButtonActive: {
    backgroundColor: '#FFD700',
  },
  speedButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  speedButtonTextActive: {
    color: '#1a5f1a',
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
  modalContainer: {
    flex: 1,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  modalContent: {
    padding: 16,
  },
  ticketsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  miniTicketContainer: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    overflow: 'hidden',
    width: (width - 48) / 2,
    borderWidth: 2,
    borderColor: '#1a5f1a',
  },
  miniTicketHeader: {
    backgroundColor: '#1a5f1a',
    padding: 8,
    alignItems: 'center',
  },
  miniTicketNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  miniTicketGrid: {
    padding: 4,
  },
  miniRow: {
    flexDirection: 'row',
  },
  miniCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#DDD',
  },
  miniCellFilled: {
    backgroundColor: '#FFD700',
  },
  miniCellCalled: {
    backgroundColor: '#4ECDC4',
  },
  miniCellText: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  miniCellTextCalled: {
    color: '#FFF',
  },
});
