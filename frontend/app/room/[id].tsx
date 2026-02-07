import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share as RNShare,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { roomAPI } from '../../services/api';
import { socketService } from '../../services/socket';

interface Room {
  id: string;
  room_code: string;
  name: string;
  host_id: string;
  host_name: string;
  room_type: 'public' | 'private';
  ticket_price: number;
  max_players: number;
  min_players: number;
  current_players: number;
  status: string;
  players: Array<{
    id: string;
    name: string;
    profile_pic?: string;
    joined_at: string;
  }>;
  prizes: Array<{
    prize_type: string;
    amount: number;
    enabled: boolean;
  }>;
  prize_pool: number;
}

export default function RoomScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const joinCalledRef = useRef(false);
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    loadRoom();
    setupSocketListeners();

    return () => {
      socketService.leaveRoom();
      cleanupSocketListeners();
    };
  }, [params.id]);

  const loadRoom = async () => {
    try {
      const data = await roomAPI.getRoom(params.id);
      setRoom(data);

      // Check if current user is in the room's players list
      const isInRoom = data.players?.some((p: { id: string }) => p.id === user?.id);

      // Only attempt to join if:
      // 1. User is authenticated
      // 2. User is NOT already in the room
      // 3. We haven't already tried to join (prevent double calls)
      if (user && !isInRoom && !joinCalledRef.current) {
        joinCalledRef.current = true;
        try {
          await roomAPI.joinRoom(params.id);
          // Reload room data to get updated players list
          const updated = await roomAPI.getRoom(params.id);
          setRoom(updated);
        } catch (joinErr: any) {
          // If already in room, that's okay - just continue
          const errorMsg = joinErr?.message || String(joinErr);
          if (errorMsg.includes('Already in room')) {
            console.log('User already in room, continuing...');
            joinCalledRef.current = false;
          } else {
            // For other errors, log but don't block
            console.error('Error joining room:', joinErr);
            joinCalledRef.current = false;
          }
        }
      }

      // Join socket room if connected
      if (socketService.isConnected()) {
        socketService.joinRoom(params.id);
      }
    } catch (error) {
      console.error('Error loading room:', error);
      Alert.alert('Error', 'Failed to load room');
      if (router.canGoBack()) router.back();
      else router.replace('/lobby');
    } finally {
      setLoading(false);
    }
  };

  const setupSocketListeners = () => {
    socketService.on('player_joined', handlePlayerJoined);
    socketService.on('player_left', handlePlayerLeft);
    socketService.on('game_started', handleGameStarted);
  };

  const cleanupSocketListeners = () => {
    socketService.off('player_joined', handlePlayerJoined);
    socketService.off('player_left', handlePlayerLeft);
    socketService.off('game_started', handleGameStarted);
  };

  const handlePlayerJoined = (data: any) => {
    console.log('Player joined:', data);
    loadRoom(); // Refresh room data
  };

  const handlePlayerLeft = (data: any) => {
    console.log('Player left:', data);
    loadRoom(); // Refresh room data
  };

  const handleGameStarted = (data: any) => {
    console.log('Game started:', data);
    Alert.alert('Game Started!', 'The game is starting now', [
      {
        text: 'OK',
        onPress: () => {
          router.push({
            pathname: '/room/game/[id]',
            params: { id: params.id },
          });
        },
      },
    ]);
  };

  const handleStartGame = () => {
    if (!room) return;

    if (room.current_players < room.min_players) {
      Alert.alert(
        'Not Enough Players',
        `Need at least ${room.min_players} players to start. Currently ${room.current_players} players.`
      );
      return;
    }

    Alert.alert(
      'Start Game',
      'Are you sure you want to start the game?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: () => {
            socketService.startGame(params.id);
          },
        },
      ]
    );
  };

  const handleShareRoom = async () => {
    if (!room || isSharing) return;

    const message = room.room_type === 'private'
      ? `🎲 Join my Tambola game!\n\nRoom: ${room.name}\nCode: ${room.room_code}\nTicket: ₹${room.ticket_price}\nPrize Pool: ₹${room.prize_pool ?? 0}\n\nJoin: ${typeof window !== 'undefined' ? window.location.origin + '/room/' + room.id : ''}`
      : `🎲 Join my Tambola game!\n\nRoom: ${room.name}\nTicket: ₹${room.ticket_price}\nPrize Pool: ₹${room.prize_pool ?? 0}\n\nJoin: ${typeof window !== 'undefined' ? window.location.origin + '/room/' + room.id : ''}`;

    setIsSharing(true);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({
          title: 'Join Tambola - ' + room.name,
          text: message,
        });
      } else {
        await RNShare.share({ message });
      }
    } catch (error: any) {
      if (error?.name !== 'AbortError') {
        console.error('Error sharing:', error);
        Alert.alert('Share', 'Could not share. You can copy the room link from the room code.');
      }
    } finally {
      setTimeout(() => setIsSharing(false), 1000);
    }
  };

  const handleBack = () => {
    socketService.leaveRoom();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/lobby');
    }
  };

  const handleLeaveRoom = () => {
    Alert.alert(
      'Leave Room',
      'Are you sure you want to leave this room?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: () => {
            socketService.leaveRoom();
            if (router.canGoBack()) router.back();
            else router.replace('/lobby');
          },
        },
      ]
    );
  };

  if (loading || !room) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>Loading room...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  const isHost = user?.id === room.host_id;
  const canStart = isHost && room.current_players >= room.min_players;

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={28} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{room.name}</Text>
          <TouchableOpacity onPress={handleShareRoom} disabled={isSharing}>
            <MaterialCommunityIcons name="share-variant" size={28} color="#FFD700" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Room Info */}
          <View style={styles.infoCard}>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="account" size={24} color="#FFD700" />
                <Text style={styles.infoLabel}>Host</Text>
                <Text style={styles.infoValue}>{room.host_name}</Text>
              </View>
              <View style={styles.infoItem}>
                <MaterialCommunityIcons name="ticket" size={24} color="#FFD700" />
                <Text style={styles.infoLabel}>Ticket Price</Text>
                <Text style={styles.infoValue}>₹{room.ticket_price}</Text>
              </View>
            </View>

            {room.room_type === 'private' && (
              <View style={styles.roomCodeCard}>
                <Text style={styles.roomCodeLabel}>Room Code</Text>
                <Text style={styles.roomCode}>{room.room_code}</Text>
                <Text style={styles.roomCodeHint}>Share this code with friends</Text>
              </View>
            )}
          </View>

          {/* Players */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                Players ({room.current_players}/{room.max_players})
              </Text>
              {room.current_players < room.min_players && (
                <Text style={styles.waitingText}>
                  Waiting for {room.min_players - room.current_players} more...
                </Text>
              )}
            </View>

            <View style={styles.playersGrid}>
              {room.players.map((player) => (
                <View key={player.id} style={styles.playerCard}>
                  <MaterialCommunityIcons name="account-circle" size={40} color="#FFD700" />
                  <Text style={styles.playerName} numberOfLines={1}>
                    {player.name}
                  </Text>
                  {player.id === room.host_id && (
                    <View style={styles.hostBadge}>
                      <MaterialCommunityIcons name="crown" size={12} color="#FFD700" />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Prizes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prize Pool (₹{room.prize_pool})</Text>
            {room.prizes.map((prize) => (
              <View key={prize.prize_type} style={styles.prizeRow}>
                <MaterialCommunityIcons name="trophy" size={20} color="#FFD700" />
                <Text style={styles.prizeType}>
                  {prize.prize_type.replace('_', ' ').toUpperCase()}
                </Text>
                <Text style={styles.prizeAmount}>₹{prize.amount}</Text>
              </View>
            ))}
          </View>

          {/* Status */}
          <View style={styles.statusCard}>
            <MaterialCommunityIcons
              name={room.status === 'waiting' ? 'clock-outline' : 'play-circle'}
              size={32}
              color="#FFD700"
            />
            <Text style={styles.statusText}>
              {room.status === 'waiting' ? 'Waiting for players...' : 'Game in progress'}
            </Text>
          </View>
        </ScrollView>

        {/* Footer Actions */}
        <View style={styles.footer}>
          {isHost ? (
            <TouchableOpacity
              style={[styles.startButton, !canStart && styles.startButtonDisabled]}
              onPress={handleStartGame}
              disabled={!canStart}
            >
              <MaterialCommunityIcons
                name="play"
                size={24}
                color={canStart ? '#1a5f1a' : '#999'}
              />
              <Text style={[styles.startButtonText, !canStart && styles.startButtonTextDisabled]}>
                {canStart ? 'Start Game' : `Need ${room.min_players - room.current_players} more players`}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.waitingFooter}>
              <ActivityIndicator color="#FFD700" />
              <Text style={styles.waitingFooterText}>
                Waiting for host to start the game...
              </Text>
            </View>
          )}
        </View>
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
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  infoCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  infoItem: {
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 4,
  },
  roomCodeCard: {
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
    alignItems: 'center',
  },
  roomCodeLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  roomCode: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    letterSpacing: 4,
    marginVertical: 8,
  },
  roomCodeHint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  waitingText: {
    fontSize: 12,
    color: '#FF6B35',
    fontWeight: '600',
  },
  playersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  playerCard: {
    width: '30%',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  playerName: {
    fontSize: 12,
    color: '#FFF',
    marginTop: 8,
    textAlign: 'center',
  },
  hostBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    borderRadius: 10,
    padding: 4,
  },
  prizeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    gap: 12,
  },
  prizeType: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  prizeAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#1a5f1a',
    borderTopWidth: 2,
    borderTopColor: '#FFD700',
  },
  startButton: {
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  startButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  startButtonTextDisabled: {
    color: '#999',
  },
  waitingFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  waitingFooterText: {
    fontSize: 14,
    color: '#FFD700',
  },
});
