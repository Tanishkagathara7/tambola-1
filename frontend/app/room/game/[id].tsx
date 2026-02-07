import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Dimensions,
  Modal,
  FlatList,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../contexts/AuthContext';
import { roomAPI, ticketAPI, gameAPI } from '../../../services/api';
import { socketService } from '../../../services/socket';
import * as Speech from 'expo-speech';

const { width } = Dimensions.get('window');

interface Ticket {
  id: string;
  ticket_number: number;
  grid: (number | null)[][];
  numbers: number[];
  marked_numbers: number[];
}

interface Room {
  id: string;
  name: string;
  host_id: string;
  called_numbers: number[];
  current_number: number | null;
  is_paused: boolean;
  prizes: Array<{
    prize_type: string;
    amount: number;
  }>;
}

interface Winner {
  user_name: string;
  prize_type: string;
  amount: number;
  rank?: number;
}

export default function LiveGameScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showWinnersModal, setShowWinnersModal] = useState(false);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [autoCall, setAutoCall] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [gameEnded, setGameEnded] = useState(false);
  const autoCallInterval = useRef<number | null>(null);

  useEffect(() => {
    loadGameData();
    setupSocketListeners();

    return () => {
      cleanupSocketListeners();
      if (autoCallInterval.current) {
        clearInterval(autoCallInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    if (room?.current_number && soundEnabled) {
      Speech.speak(String(room.current_number), { rate: 0.9 });
    }
  }, [room?.current_number, soundEnabled]);

  const loadGameData = async () => {
    try {
      const roomData = await roomAPI.getRoom(params.id);
      setRoom(roomData);

      // Load user's tickets
      try {
        const userTickets = await ticketAPI.getMyTickets(params.id);
        setTickets(userTickets);
        if (userTickets.length > 0) {
          setSelectedTicket(userTickets[0]);
        }
      } catch (ticketError) {
        console.error('Error loading tickets:', ticketError);
        // If no tickets, show empty state
        setTickets([]);
      }
    } catch (error) {
      console.error('Error loading game:', error);
    }
  };

  const generateMockTicket = (): (number | null)[][] => {
    // Simple mock ticket generation
    const ticket: (number | null)[][] = [
      [1, null, 23, null, 45, null, 67, null, 89],
      [null, 12, null, 34, null, 56, null, 78, null],
      [5, null, 27, null, 49, null, 61, null, 83],
    ];
    return ticket;
  };

  const setupSocketListeners = () => {
    socketService.on('number_called', handleNumberCalled);
    socketService.on('prize_claimed', handlePrizeClaimed);
    socketService.on('winner_announced', handleWinnerAnnounced);
    socketService.on('game_started', handleGameStarted);
    socketService.on('game_paused', handleGamePaused);
    socketService.on('game_ended', handleGameEnded);
  };

  const cleanupSocketListeners = () => {
    socketService.off('number_called');
    socketService.off('prize_claimed');
    socketService.off('winner_announced');
    socketService.off('game_started');
    socketService.off('game_paused');
    socketService.off('game_ended');
  };

  const handleGameStarted = (data: any) => {
    console.log('Game started:', data);
    // Load tickets if they were just generated
    if (data.tickets) {
      const myTickets = data.tickets.filter((t: any) => t.user_id === user?.id);
      setTickets(myTickets);
      if (myTickets.length > 0) {
        setSelectedTicket(myTickets[0]);
      }
    }
    Alert.alert('Game Started!', 'The game has begun. Good luck!');
  };

  const handleGamePaused = (data: any) => {
    console.log('Game paused:', data);
    setRoom((prev) => {
      if (!prev) return prev;
      return { ...prev, is_paused: data.is_paused };
    });
    
    if (data.is_paused) {
      // Stop auto-calling if active
      if (autoCallInterval.current) {
        clearInterval(autoCallInterval.current);
        autoCallInterval.current = null;
      }
      setAutoCall(false);
      Alert.alert('Game Paused', 'The game has been paused by the host');
    } else {
      Alert.alert('Game Resumed', 'The game has been resumed');
    }
  };

  const handleGameEnded = (data: any) => {
    console.log('Game ended:', data);
    setGameEnded(true);
    setWinners(data.winners || []);
    setShowWinnersModal(true);
    
    // Stop auto-calling
    if (autoCallInterval.current) {
      clearInterval(autoCallInterval.current);
      autoCallInterval.current = null;
    }
    setAutoCall(false);
    
    if (soundEnabled) {
      Speech.speak('Game Over! All numbers have been called.', { rate: 0.9 });
    }
  };

  const handleNumberCalled = (data: any) => {
    console.log('Number called:', data);
    setRoom((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        current_number: data.number,
        called_numbers: data.called_numbers,
      };
    });

    // Auto-mark on tickets
    autoMarkNumber(data.number);

    // Check if game is complete
    if (data.game_complete) {
      setGameEnded(true);
      if (autoCallInterval.current) {
        clearInterval(autoCallInterval.current);
        autoCallInterval.current = null;
      }
      setAutoCall(false);
    }
  };

  const handlePrizeClaimed = (data: any) => {
    console.log('Prize claimed:', data);
    Alert.alert('Prize Claimed!', `${data.user_name} claimed ${data.prize_type}`);
  };

  const handleWinnerAnnounced = (data: any) => {
    console.log('Winner announced:', data);
    Alert.alert(
      '🎉 Winner! 🎉',
      `${data.winner_name} won ${data.prize_type} - ₹${data.amount}!`
    );
  };

  const autoMarkNumber = (number: number) => {
    setTickets((prevTickets) =>
      prevTickets.map((ticket) => {
        const hasNumber = ticket.grid.some((row) => row.includes(number));
        if (hasNumber && !ticket.marked_numbers.includes(number)) {
          return {
            ...ticket,
            marked_numbers: [...ticket.marked_numbers, number],
          };
        }
        return ticket;
      })
    );
  };

  const handleCallNumber = () => {
    if (!room) return;
    if (room.is_paused) {
      Alert.alert('Game Paused', 'Cannot call numbers while game is paused');
      return;
    }
    if (room.called_numbers.length >= 90) {
      Alert.alert('Game Complete', 'All numbers have been called!');
      return;
    }
    socketService.callNumber(params.id);
  };

  const toggleAutoCall = () => {
    if (!room) return;
    
    if (room.is_paused) {
      Alert.alert('Game Paused', 'Cannot start auto-call while game is paused');
      return;
    }

    if (autoCall) {
      if (autoCallInterval.current) {
        clearInterval(autoCallInterval.current);
        autoCallInterval.current = null;
      }
      setAutoCall(false);
    } else {
      handleCallNumber(); // Call first number immediately
      autoCallInterval.current = setInterval(() => {
        handleCallNumber();
      }, 5000); // Every 5 seconds
      setAutoCall(true);
    }
  };

  const togglePause = () => {
    if (!room) return;
    socketService.pauseGame(params.id);
  };

  const handleEndGame = () => {
    Alert.alert(
      'End Game',
      'Are you sure you want to end the game? This will calculate final rankings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Game',
          style: 'destructive',
          onPress: () => socketService.endGame(params.id),
        },
      ]
    );
  };

  const toggleSound = () => {
    setSoundEnabled(!soundEnabled);
    if (!soundEnabled) {
      Speech.speak('Sound enabled', { rate: 0.9 });
    } else {
      Speech.stop();
    }
  };

  const handleManualMark = (number: number) => {
    if (!selectedTicket) return;

    setTickets((prevTickets) =>
      prevTickets.map((ticket) => {
        if (ticket.id === selectedTicket.id) {
          const isMarked = ticket.marked_numbers.includes(number);
          return {
            ...ticket,
            marked_numbers: isMarked
              ? ticket.marked_numbers.filter((n) => n !== number)
              : [...ticket.marked_numbers, number],
          };
        }
        return ticket;
      })
    );

    setSelectedTicket((prev) => {
      if (!prev) return prev;
      const isMarked = prev.marked_numbers.includes(number);
      return {
        ...prev,
        marked_numbers: isMarked
          ? prev.marked_numbers.filter((n) => n !== number)
          : [...prev.marked_numbers, number],
      };
    });
  };

  const checkWin = (prizeType: string): boolean => {
    if (!selectedTicket || !room) return false;

    const grid = selectedTicket.grid;
    const marked = selectedTicket.marked_numbers;

    switch (prizeType) {
      case 'early_five':
        return marked.length >= 5;

      case 'top_line':
        const topLine = grid[0].filter((n) => n !== null);
        return topLine.every((n) => marked.includes(n!));

      case 'middle_line':
        const middleLine = grid[1].filter((n) => n !== null);
        return middleLine.every((n) => marked.includes(n!));

      case 'bottom_line':
        const bottomLine = grid[2].filter((n) => n !== null);
        return bottomLine.every((n) => marked.includes(n!));

      case 'four_corners':
        const corners = [
          grid[0].find((n) => n !== null),
          grid[0].reverse().find((n) => n !== null),
          grid[2].find((n) => n !== null),
          grid[2].reverse().find((n) => n !== null),
        ].filter((n) => n !== null);
        grid[0].reverse();
        grid[2].reverse();
        return corners.every((n) => marked.includes(n!));

      case 'full_house':
        const allNumbers = grid.flat().filter((n) => n !== null);
        return allNumbers.every((n) => marked.includes(n!));

      default:
        return false;
    }
  };

  const handleClaimPrize = (prizeType: string) => {
    if (!selectedTicket || !room) return;

    if (!checkWin(prizeType)) {
      Alert.alert('Invalid Claim', 'You have not completed this pattern yet');
      return;
    }

    socketService.claimPrize(params.id, selectedTicket.id, prizeType);
    setShowClaimModal(false);
    Alert.alert('Claim Submitted', 'Your claim is being verified...');
  };

  const renderNumberGrid = () => {
    if (!room) return null;

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
                  room.called_numbers.includes(num) && styles.numberCellCalled,
                  room.current_number === num && styles.numberCellCurrent,
                ]}
              >
                <Text
                  style={[
                    styles.numberText,
                    room.called_numbers.includes(num) && styles.numberTextCalled,
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

  const renderTicket = (ticket: Ticket) => {
    return (
      <View style={styles.ticketCard}>
        <View style={styles.ticketHeader}>
          <Text style={styles.ticketNumber}>
            Ticket #{String(ticket.ticket_number).padStart(4, '0')}
          </Text>
          <TouchableOpacity
            style={styles.claimButton}
            onPress={() => setShowClaimModal(true)}
          >
            <MaterialCommunityIcons name="trophy" size={20} color="#FFD700" />
            <Text style={styles.claimButtonText}>Claim</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.ticketGrid}>
          {ticket.grid.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.ticketRow}>
              {row.map((cell, colIndex) => (
                <TouchableOpacity
                  key={`${rowIndex}-${colIndex}`}
                  style={[
                    styles.ticketCell,
                    cell !== null && styles.ticketCellFilled,
                    cell !== null &&
                      ticket.marked_numbers.includes(cell) &&
                      styles.ticketCellMarked,
                    cell === room?.current_number && styles.ticketCellCurrent,
                  ]}
                  onPress={() => cell !== null && handleManualMark(cell)}
                  disabled={cell === null}
                >
                  {cell !== null && (
                    <Text
                      style={[
                        styles.ticketCellText,
                        ticket.marked_numbers.includes(cell) &&
                          styles.ticketCellTextMarked,
                      ]}
                    >
                      {cell}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const isHost = user?.id === room?.host_id;

  if (!room) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading game...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{room.name}</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={toggleSound} style={styles.iconButton}>
              <MaterialCommunityIcons
                name={soundEnabled ? 'volume-high' : 'volume-off'}
                size={24}
                color="#FFD700"
              />
            </TouchableOpacity>
            <Text style={styles.calledCount}>{room.called_numbers.length}/90</Text>
            <TouchableOpacity onPress={() => setShowTicketModal(true)} style={styles.iconButton}>
              <MaterialCommunityIcons name="ticket" size={24} color="#FFD700" />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Current Number */}
          <View style={styles.currentNumberContainer}>
            <Text style={styles.currentNumberLabel}>Current Number</Text>
            <View style={styles.currentNumberCircle}>
              <Text style={styles.currentNumberText}>
                {room.current_number || '--'}
              </Text>
            </View>
            {room.is_paused && (
              <View style={styles.pausedBadge}>
                <MaterialCommunityIcons name="pause" size={16} color="#FFF" />
                <Text style={styles.pausedText}>PAUSED</Text>
              </View>
            )}
          </View>

          {/* Host Controls */}
          {isHost && (
            <>
              <View style={styles.controls}>
                <TouchableOpacity
                  style={[styles.controlButton, (autoCall || room.is_paused) && styles.controlButtonDisabled]}
                  onPress={handleCallNumber}
                  disabled={autoCall || room.is_paused}
                >
                  <MaterialCommunityIcons name="hand-pointing-right" size={24} color="#FFF" />
                  <Text style={styles.controlButtonText}>Call Number</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.controlButton,
                    autoCall ? styles.stopButton : styles.autoButton,
                    room.is_paused && styles.controlButtonDisabled,
                  ]}
                  onPress={toggleAutoCall}
                  disabled={room.is_paused}
                >
                  <MaterialCommunityIcons
                    name={autoCall ? 'stop' : 'play'}
                    size={24}
                    color="#FFF"
                  />
                  <Text style={styles.controlButtonText}>
                    {autoCall ? 'Stop Auto' : 'Auto Mode'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={styles.hostControls}>
                <TouchableOpacity
                  style={[styles.hostButton, styles.pauseButton]}
                  onPress={togglePause}
                >
                  <MaterialCommunityIcons
                    name={room.is_paused ? 'play' : 'pause'}
                    size={20}
                    color="#FFF"
                  />
                  <Text style={styles.hostButtonText}>
                    {room.is_paused ? 'Resume' : 'Pause'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.hostButton, styles.endButton]}
                  onPress={handleEndGame}
                >
                  <MaterialCommunityIcons name="flag-checkered" size={20} color="#FFF" />
                  <Text style={styles.hostButtonText}>End Game</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {/* Number Board */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Called Numbers</Text>
            {renderNumberGrid()}
          </View>

          {/* My Ticket */}
          {selectedTicket && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>My Ticket</Text>
              {renderTicket(selectedTicket)}
            </View>
          )}
        </ScrollView>

        {/* Claim Prize Modal */}
        <Modal
          visible={showClaimModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowClaimModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Claim Prize</Text>
              <Text style={styles.modalSubtitle}>Select the prize you want to claim</Text>

              <ScrollView style={styles.prizeList}>
                {room.prizes.map((prize) => (
                  <TouchableOpacity
                    key={prize.prize_type}
                    style={[
                      styles.prizeOption,
                      checkWin(prize.prize_type) && styles.prizeOptionAvailable,
                    ]}
                    onPress={() => handleClaimPrize(prize.prize_type)}
                    disabled={!checkWin(prize.prize_type)}
                  >
                    <MaterialCommunityIcons
                      name="trophy"
                      size={24}
                      color={checkWin(prize.prize_type) ? '#FFD700' : '#999'}
                    />
                    <View style={styles.prizeOptionInfo}>
                      <Text
                        style={[
                          styles.prizeOptionName,
                          !checkWin(prize.prize_type) && styles.prizeOptionDisabled,
                        ]}
                      >
                        {prize.prize_type.replace('_', ' ').toUpperCase()}
                      </Text>
                      <Text style={styles.prizeOptionAmount}>₹{prize.amount}</Text>
                    </View>
                    {checkWin(prize.prize_type) && (
                      <MaterialCommunityIcons name="check-circle" size={24} color="#4ECDC4" />
                    )}
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowClaimModal(false)}
              >
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* All Tickets Modal */}
        <Modal
          visible={showTicketModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTicketModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>My Tickets</Text>
              <FlatList
                data={tickets}
                renderItem={({ item }) => renderTicket(item)}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.ticketsList}
              />
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowTicketModal(false)}
              >
                <Text style={styles.modalCloseButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Winners Modal */}
        <Modal
          visible={showWinnersModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowWinnersModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.winnersHeader}>
                <MaterialCommunityIcons name="trophy" size={48} color="#FFD700" />
                <Text style={styles.modalTitle}>🎉 Game Over! 🎉</Text>
                <Text style={styles.modalSubtitle}>Final Rankings</Text>
              </View>

              <ScrollView style={styles.winnersList}>
                {winners.length > 0 ? (
                  winners.map((winner, index) => (
                    <View key={index} style={styles.winnerCard}>
                      <View style={styles.winnerRank}>
                        <Text style={styles.winnerRankText}>#{index + 1}</Text>
                      </View>
                      <View style={styles.winnerInfo}>
                        <Text style={styles.winnerName}>{winner.user_name}</Text>
                        <Text style={styles.winnerPrize}>
                          {winner.prize_type.replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.winnerAmount}>₹{winner.amount}</Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.noWinnersContainer}>
                    <Text style={styles.noWinnersText}>No winners yet</Text>
                  </View>
                )}
              </ScrollView>

              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => {
                  setShowWinnersModal(false);
                  router.back();
                }}
              >
                <Text style={styles.modalCloseButtonText}>Close & Exit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: '#FFD700',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    padding: 4,
  },
  calledCount: {
    fontSize: 14,
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
    fontSize: 14,
    color: '#FFF',
    marginBottom: 12,
    fontWeight: '600',
  },
  currentNumberCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#FFF',
  },
  currentNumberText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FF6B35',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginTop: 12,
  },
  pausedText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
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
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#FF6B35',
    gap: 8,
  },
  controlButtonDisabled: {
    opacity: 0.5,
  },
  autoButton: {
    backgroundColor: '#4ECDC4',
  },
  stopButton: {
    backgroundColor: '#FF4444',
  },
  controlButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  hostControls: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  hostButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  pauseButton: {
    backgroundColor: '#FFA500',
  },
  endButton: {
    backgroundColor: '#FF4444',
  },
  hostButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 12,
  },
  numberGrid: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 4,
  },
  numberRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 2,
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
    backgroundColor: '#4ECDC4',
  },
  numberCellCurrent: {
    backgroundColor: '#FF6B35',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  numberText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
  },
  numberTextCalled: {
    color: '#FFF',
  },
  ticketCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1a5f1a',
    padding: 12,
  },
  ticketNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  claimButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  ticketGrid: {
    padding: 8,
  },
  ticketRow: {
    flexDirection: 'row',
  },
  ticketCell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#DDD',
  },
  ticketCellFilled: {
    backgroundColor: '#FFD700',
  },
  ticketCellMarked: {
    backgroundColor: '#4ECDC4',
  },
  ticketCellCurrent: {
    backgroundColor: '#FF6B35',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  ticketCellText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  ticketCellTextMarked: {
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a5f1a',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  prizeList: {
    maxHeight: 400,
  },
  prizeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    marginBottom: 12,
    gap: 12,
  },
  prizeOptionAvailable: {
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    borderWidth: 2,
    borderColor: '#4ECDC4',
  },
  prizeOptionInfo: {
    flex: 1,
  },
  prizeOptionName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  prizeOptionDisabled: {
    color: '#999',
  },
  prizeOptionAmount: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  ticketsList: {
    paddingBottom: 16,
  },
  winnersHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  winnersList: {
    maxHeight: 400,
  },
  winnerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#F5F5F5',
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  winnerRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFD700',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  winnerRankText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  winnerInfo: {
    flex: 1,
  },
  winnerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  winnerPrize: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  winnerAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4ECDC4',
  },
  noWinnersContainer: {
    padding: 40,
    alignItems: 'center',
  },
  noWinnersText: {
    fontSize: 16,
    color: '#999',
  },
  modalCloseButton: {
    backgroundColor: '#1a5f1a',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  modalCloseButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
});
