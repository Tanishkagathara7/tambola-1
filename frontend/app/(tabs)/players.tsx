import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Player {
  id: string;
  name: string;
  ticket_count: number;
  created_at: string;
}

export default function PlayersScreen() {
  const router = useRouter();
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [ticketCounts, setTicketCounts] = useState<{ [key: string]: number }>({});

  const fetchPlayers = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/players`);
      const data = await response.json();
      setPlayers(data);
      
      // Load ticket counts from AsyncStorage
      const counts: { [key: string]: number } = {};
      for (const player of data) {
        const saved = await AsyncStorage.getItem(`ticket_count_${player.id}`);
        counts[player.id] = saved ? parseInt(saved) : 1;
      }
      setTicketCounts(counts);
    } catch (error) {
      console.error('Error fetching players:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPlayers();
  }, [fetchPlayers]);

  const handleAddPlayer = async () => {
    if (!playerName.trim()) {
      Alert.alert('Error', 'Please enter a player name');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/players`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playerName }),
      });
      const newPlayer = await response.json();
      setPlayers([...players, newPlayer]);
      setTicketCounts({ ...ticketCounts, [newPlayer.id]: 1 });
      await AsyncStorage.setItem(`ticket_count_${newPlayer.id}`, '1');
      setPlayerName('');
      setModalVisible(false);
    } catch (error) {
      console.error('Error adding player:', error);
      Alert.alert('Error', 'Failed to add player');
    }
  };

  const handleDeletePlayer = async (player: Player) => {
    Alert.alert(
      'Delete Player',
      `Are you sure you want to delete ${player.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/players/${player.id}`, {
                method: 'DELETE',
              });
              setPlayers(players.filter((p) => p.id !== player.id));
              await AsyncStorage.removeItem(`ticket_count_${player.id}`);
            } catch (error) {
              console.error('Error deleting player:', error);
            }
          },
        },
      ]
    );
  };

  const updateTicketCount = async (playerId: string, count: number) => {
    const newCount = Math.max(1, Math.min(100, count));
    setTicketCounts({ ...ticketCounts, [playerId]: newCount });
    await AsyncStorage.setItem(`ticket_count_${playerId}`, newCount.toString());
  };

  const handleStartGame = async () => {
    if (players.length === 0) {
      Alert.alert('Error', 'Please add at least one player');
      return;
    }

    // Save game data to AsyncStorage
    const gameData = {
      players: players.map(p => ({ id: p.id, name: p.name })),
      ticketCounts,
    };
    await AsyncStorage.setItem('current_game', JSON.stringify(gameData));
    
    router.push('/game');
  };

  const renderPlayer = ({ item }: { item: Player }) => (
    <View style={styles.playerCard}>
      <View style={styles.playerInfo}>
        <MaterialCommunityIcons name="account" size={40} color="#FFD700" />
        <View style={styles.playerDetails}>
          <Text style={styles.playerName}>{item.name}</Text>
          <Text style={styles.playerMeta}>
            {ticketCounts[item.id] || 1} ticket(s)
          </Text>
        </View>
      </View>

      <View style={styles.ticketControls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => updateTicketCount(item.id, (ticketCounts[item.id] || 1) - 1)}
        >
          <MaterialCommunityIcons name="minus" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.ticketCount}>{ticketCounts[item.id] || 1}</Text>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => updateTicketCount(item.id, (ticketCounts[item.id] || 1) + 1)}
        >
          <MaterialCommunityIcons name="plus" size={24} color="#FFF" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeletePlayer(item)}
      >
        <MaterialCommunityIcons name="delete" size={24} color="#FF4444" />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Manage Players</Text>
          <Text style={styles.headerSubtitle}>
            {players.length} player(s) added
          </Text>
        </View>

        {players.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="account-off" size={80} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>No players added yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add your first player</Text>
          </View>
        ) : (
          <FlatList
            data={players}
            renderItem={renderPlayer}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContainer}
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <MaterialCommunityIcons name="plus" size={24} color="#1a5f1a" />
            <Text style={styles.addButtonText}>Add Player</Text>
          </TouchableOpacity>

          {players.length > 0 && (
            <TouchableOpacity style={styles.startButton} onPress={handleStartGame}>
              <Text style={styles.startButtonText}>Start Game</Text>
              <MaterialCommunityIcons name="play" size={24} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Add Player Modal */}
        <Modal
          visible={modalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalOverlay}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Add New Player</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter player name"
                placeholderTextColor="#999"
                value={playerName}
                onChangeText={setPlayerName}
                autoFocus
              />
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => {
                    setModalVisible(false);
                    setPlayerName('');
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleAddPlayer}
                >
                  <Text style={styles.confirmButtonText}>Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
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
  header: {
    padding: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#FFD700',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#FFF',
    marginTop: 4,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  playerCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  playerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playerDetails: {
    flex: 1,
  },
  playerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  playerMeta: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  ticketControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  controlButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ticketCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    minWidth: 40,
    textAlign: 'center',
  },
  deleteButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
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
    gap: 12,
  },
  addButton: {
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  startButton: {
    backgroundColor: '#FF6B35',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  startButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 24,
    width: '80%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a5f1a',
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#DDD',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  confirmButton: {
    backgroundColor: '#1a5f1a',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF',
  },
});
