import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Dimensions,
  Linking,
  Share,
  Platform,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { useGameState } from '../contexts/GameStateContext';
import { generateTicketsForPlayers, Ticket } from '../utils/ticketGenerator';
import { checkPrizeWin, checkCustomPattern } from '../utils/prizeValidator';
import { PrizeClaim, SelectedPrize } from '../types/claim-types';

// Conditional import for google mobile ads (native only)
let BannerAd: any, BannerAdSize: any, TestIds: any, InterstitialAd: any, AdEventType: any;

if (Platform.OS !== 'web') {
  try {
    const mobileAds = require('react-native-google-mobile-ads');
    BannerAd = mobileAds.BannerAd;
    BannerAdSize = mobileAds.BannerAdSize;
    TestIds = mobileAds.TestIds;
    InterstitialAd = mobileAds.InterstitialAd;
    AdEventType = mobileAds.AdEventType;
  } catch (error) {
    console.warn('Failed to load react-native-google-mobile-ads (likely Expo Go). Using mocks.');
    // Fallback to mocks
    TestIds = { BANNER: 'mock', INTERSTITIAL: 'mock' };
    BannerAdSize = { BANNER: 'BANNER', ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' };
    AdEventType = { LOADED: 'LOADED', CLOSED: 'CLOSED', ERROR: 'ERROR' };
    BannerAd = () => null;
    InterstitialAd = {
      createForAdRequest: () => ({
        load: () => { console.log('Mock Interstitial loaded'); },
        show: () => { console.log('Mock Interstitial shown'); },
        addAdEventListener: (event: any, handler: any) => {
          if (event === 'LOADED') setTimeout(handler, 100);
          return () => { };
        },
        loaded: true,
      }),
    };
  }
} else {
  // Web stubs
  TestIds = { BANNER: 'mock', INTERSTITIAL: 'mock' };
  BannerAdSize = { BANNER: 'BANNER', ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' };
  AdEventType = { LOADED: 'LOADED', CLOSED: 'CLOSED', ERROR: 'ERROR' };
  BannerAd = () => null; // Render nothing on web
  InterstitialAd = {
    createForAdRequest: () => ({
      load: () => { },
      show: () => { },
      addAdEventListener: () => () => { },
      loaded: false,
    }),
  };
}

const { width } = Dimensions.get('window');
const AUTO_SPEED_SECONDS = 5;

// Ad Unit IDs
const BANNER_ID = __DEV__ ? TestIds.BANNER : 'ca-app-pub-1819958924466866/8783242378';
const INTERSTITIAL_ID = __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-1819958924466866/6057938890';

const interstitial = InterstitialAd.createForAdRequest(INTERSTITIAL_ID, {
  requestNonPersonalizedAdsOnly: true,
});

interface Player {
  id: string;
  name: string;
}

export default function GameScreen() {
  const router = useRouter();
  const { gameState, callNumber, setAutoCalling, initializeGame, resetGame, addClaim, isPrizeClaimed } = useGameState();
  const [game, setGame] = useState<{ players: Player[]; tickets: Ticket[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPrizes, setSelectedPrizes] = useState<SelectedPrize[]>([]);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    initializeGameOffline();
    interstitial.load();
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Sync local state with GameState
  useEffect(() => {
    if (gameState.isAutoCalling && !intervalRef.current) {
      // Start auto calling - the first number is already called in toggleAutoMode
      intervalRef.current = setInterval(() => {
        callNumber();
      }, AUTO_SPEED_SECONDS * 1000) as unknown as NodeJS.Timeout;
    } else if (!gameState.isAutoCalling && intervalRef.current) {
      // Stop auto calling
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
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

  // Automatically check for prize wins after each number is called
  useEffect(() => {
    if (gameState.currentNumber !== null && game) {
      checkAllPrizesAutomatically();
    }
  }, [gameState.currentNumber, game]);

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

      // Load selected prizes
      const prizesData = await AsyncStorage.getItem('selected_prizes');
      if (prizesData) {
        const prizes: SelectedPrize[] = JSON.parse(prizesData);
        setSelectedPrizes(prizes.filter(p => p.enabled));
      }

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
      // Stop auto mode
      await setAutoCalling(false);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    } else {
      // Start auto mode - call first number immediately
      await handleCallNumber();
      await setAutoCalling(true);
    }
  };

  const endGameAndGoToPlayers = async () => {
    await setAutoCalling(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    Speech.stop();

    if (interstitial.loaded) {
      interstitial.show();
    }

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

  const shareBoard = async () => {
    const called = gameState.calledNumbers.sort((a, b) => a - b);
    let message = '🎲 TAMBOLA GAME BOARD 🎲\n\n';
    message += `Called Numbers (${called.length}/90):\n`;

    // Group numbers by tens
    for (let i = 0; i < 9; i++) {
      const start = i * 10 + 1;
      const end = (i + 1) * 10;
      const range = called.filter(n => n >= start && n <= end);
      if (range.length > 0) {
        message += `${start}-${end}: ${range.join(', ')}\n`;
      }
    }

    message += `\nCurrent Number: ${gameState.currentNumber || 'Not started'}\n`;
    message += `Remaining: ${90 - called.length}`;

    try {
      await Share.share({ message });
    } catch (error) {
      console.error('Error sharing board:', error);
      Alert.alert('Error', 'Failed to share board');
    }
  };

  const sharePrizePool = async () => {
    try {
      const prizesData = await AsyncStorage.getItem('prize_config');
      if (!prizesData) {
        Alert.alert('No Prizes', 'Prize pool not configured');
        return;
      }

      const prizes = JSON.parse(prizesData);
      const enabled = prizes.filter((p: any) => p.enabled);

      let message = '🏆 TAMBOLA PRIZE POOL 🏆\n\n';
      enabled.forEach((prize: any) => {
        message += `${prize.name}: ₹${prize.amount}\n`;
      });

      const total = enabled.reduce((sum: number, p: any) => sum + parseInt(p.amount), 0);
      message += `\n💰 Total Prize Pool: ₹${total.toLocaleString()}`;

      await Share.share({ message });
    } catch (error) {
      console.error('Error sharing prizes:', error);
      Alert.alert('Error', 'Failed to share prizes');
    }
  };

  const viewClaims = () => {
    router.push('/claims');
  };

  // Automatically check all prizes for wins
  const checkAllPrizesAutomatically = async () => {
    if (!game) return;

    // Check each unclaimed prize
    for (const prize of selectedPrizes) {
      // Skip if already claimed
      if (isPrizeClaimed(prize.id)) continue;

      // Check all tickets for this prize
      for (const ticket of game.tickets) {
        let wins = false;

        // Check if it's a custom pattern
        if (prize.id.startsWith('custom_') && (prize as any).pattern) {
          wins = checkCustomPattern(ticket.grid, (prize as any).pattern, gameState.calledNumbers);
        } else {
          wins = checkPrizeWin(ticket, prize.id, gameState.calledNumbers);
        }

        if (wins) {
          // Found a winner! Create claim automatically
          const claim: PrizeClaim = {
            id: `claim_${Date.now()}_${prize.id}`,
            prize_id: prize.id,
            prize_name: prize.name,
            player_id: ticket.player_id,
            player_name: ticket.player_name,
            ticket_id: ticket.id,
            ticket_number: ticket.ticket_number,
            timestamp: new Date().toISOString(),
            verified: true,
          };

          await addClaim(claim);

          // Show celebration alert
          Alert.alert(
            '🎉 Winner!',
            `${ticket.player_name} wins ${prize.name}!\nTicket #${String(ticket.ticket_number).padStart(4, '0')}`,
            [{ text: 'OK', onPress: () => checkAllPrizesClaimed() }]
          );

          // Break after first winner for this prize (first come, first served)
          break;
        }
      }
    }
  };

  const checkAllPrizesClaimed = () => {
    const allClaimed = selectedPrizes.every(prize => isPrizeClaimed(prize.id));

    if (allClaimed && selectedPrizes.length > 0) {
      Alert.alert(
        '🎊 Game Complete!',
        'All prizes have been claimed! The game will now end.',
        [
          {
            text: 'View Claims',
            onPress: () => {
              router.push('/claims');
            },
          },
          {
            text: 'End Game',
            onPress: endGameAndGoToPlayers,
          },
        ]
      );
    }
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
            <TouchableOpacity onPress={viewClaims} style={styles.headerButton}>
              <MaterialCommunityIcons name="trophy" size={22} color="#FFD700" />
            </TouchableOpacity>
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

          {/* Share Options */}
          <View style={styles.shareSection}>
            <TouchableOpacity style={styles.shareButton} onPress={shareBoard}>
              <MaterialCommunityIcons name="share-variant" size={20} color="#FFF" />
              <Text style={styles.shareButtonText}>Share Board</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareButton} onPress={sharePrizePool}>
              <MaterialCommunityIcons name="trophy-variant" size={20} color="#FFF" />
              <Text style={styles.shareButtonText}>Share Prizes</Text>
            </TouchableOpacity>
          </View>

          {/* Number Grid */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Called Numbers</Text>
            {renderNumberGrid()}
          </View>

          {/* Prize Status */}
          {selectedPrizes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Prize Status</Text>
              {selectedPrizes.map(prize => {
                const claimed = isPrizeClaimed(prize.id);
                const claim = gameState.claims.find(c => c.prize_id === prize.id);
                return (
                  <View key={prize.id} style={styles.prizeCard}>
                    <View style={styles.prizeInfo}>
                      <Text style={styles.prizeName}>{prize.name}</Text>
                      <Text style={styles.prizeAmount}>₹{prize.amount}</Text>
                    </View>
                    {claimed && claim ? (
                      <View style={styles.prizeClaimedBadge}>
                        <MaterialCommunityIcons name="check-circle" size={16} color="#4CAF50" />
                        <Text style={styles.prizeClaimedText}>{claim.player_name}</Text>
                      </View>
                    ) : (
                      <View style={styles.prizeUnclaimedBadge}>
                        <MaterialCommunityIcons name="clock-outline" size={16} color="#FFD700" />
                        <Text style={styles.prizeUnclaimedText}>Unclaimed</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

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
      <View style={{ alignItems: 'center', paddingBottom: 8 }}>
        <BannerAd
          unitId={BANNER_ID}
          size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
        />
      </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerButton: {
    padding: 6,
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
  shareSection: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    borderWidth: 1,
    borderColor: '#FFD700',
    gap: 8,
  },
  shareButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
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
  prizeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  prizeInfo: {
    flex: 1,
  },
  prizeName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  prizeAmount: {
    fontSize: 14,
    color: '#FFD700',
    fontWeight: '600',
  },
  prizeClaimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#4CAF50',
  },
  prizeClaimedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
  },
  prizeUnclaimedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  prizeUnclaimedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFD700',
  },
});
