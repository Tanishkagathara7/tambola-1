import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { roomAPI } from '../services/api';

interface Prize {
  prize_type: string;
  name: string;
  amount: string;
  enabled: boolean;
  description: string;
}

const DEFAULT_PRIZES: Prize[] = [
  { prize_type: 'early_five', name: 'Early 5', amount: '100', enabled: true, description: 'First 5 numbers' },
  { prize_type: 'top_line', name: 'Top Line', amount: '200', enabled: true, description: 'Complete top row' },
  { prize_type: 'middle_line', name: 'Middle Line', amount: '200', enabled: true, description: 'Complete middle row' },
  { prize_type: 'bottom_line', name: 'Bottom Line', amount: '200', enabled: true, description: 'Complete bottom row' },
  { prize_type: 'four_corners', name: '4 Corners', amount: '300', enabled: true, description: 'All 4 corners' },
  { prize_type: 'full_house', name: 'Full House', amount: '1000', enabled: true, description: 'All numbers' },
];

export default function CreateRoomScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Room settings
  const [roomName, setRoomName] = useState('');
  const [roomType, setRoomType] = useState<'public' | 'private'>('public');
  const [password, setPassword] = useState('');
  const [ticketPrice, setTicketPrice] = useState('10');
  const [maxPlayers, setMaxPlayers] = useState('50');
  const [minPlayers, setMinPlayers] = useState('2');
  const [autoStart, setAutoStart] = useState(true);
  const [prizes, setPrizes] = useState<Prize[]>(DEFAULT_PRIZES);

  const updatePrize = (index: number, field: keyof Prize, value: any) => {
    const updated = [...prizes];
    updated[index] = { ...updated[index], [field]: value };
    setPrizes(updated);
  };

  const getTotalPrizePool = () => {
    return prizes
      .filter(p => p.enabled)
      .reduce((sum, p) => sum + (parseInt(p.amount) || 0), 0);
  };

  const validateInputs = () => {
    if (!roomName.trim()) {
      Alert.alert('Error', 'Please enter a room name');
      return false;
    }

    if (roomName.length < 3) {
      Alert.alert('Error', 'Room name must be at least 3 characters');
      return false;
    }

    const price = parseInt(ticketPrice);
    if (isNaN(price) || price < 5 || price > 1000) {
      Alert.alert('Error', 'Ticket price must be between ₹5 and ₹1000');
      return false;
    }

    const max = parseInt(maxPlayers);
    if (isNaN(max) || max < 2 || max > 100) {
      Alert.alert('Error', 'Max players must be between 2 and 100');
      return false;
    }

    const min = parseInt(minPlayers);
    if (isNaN(min) || min < 2 || min > max) {
      Alert.alert('Error', 'Min players must be between 2 and max players');
      return false;
    }

    if (roomType === 'private' && !password.trim()) {
      Alert.alert('Error', 'Please set a password for private room');
      return false;
    }

    const enabledPrizes = prizes.filter(p => p.enabled);
    if (enabledPrizes.length === 0) {
      Alert.alert('Error', 'Please enable at least one prize');
      return false;
    }

    return true;
  };

  const handleCreateRoom = async () => {
    if (!validateInputs()) return;

    setLoading(true);
    try {
      const roomData = {
        name: roomName.trim(),
        room_type: roomType,
        ticket_price: parseInt(ticketPrice),
        max_players: parseInt(maxPlayers),
        min_players: parseInt(minPlayers),
        auto_start: autoStart,
        prizes: prizes
          .filter(p => p.enabled)
          .map(p => ({
            prize_type: p.prize_type,
            amount: parseInt(p.amount),
            enabled: true,
          })),
        password: roomType === 'private' ? password : undefined,
      };

      const room = await roomAPI.createRoom(roomData);
      const roomName = room?.name ?? 'Room';

      // Navigate first so we always get to lobby even if Alert callback fails (e.g. on web)
      router.replace('/lobby');

      // Then show success message (non-blocking)
      Alert.alert(
        'Room Created!',
        `"${roomName}" has been created. You can open it from the lobby.`,
        [{ text: 'OK' }]
      );
    } catch (error: any) {
      console.error('Error creating room:', error);
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create room');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/lobby'))}>
            <MaterialCommunityIcons name="arrow-left" size={28} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Room</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Room Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Room Details</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Room Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter room name"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={roomName}
                onChangeText={setRoomName}
                maxLength={50}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Room Type</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    roomType === 'public' && styles.typeButtonActive,
                  ]}
                  onPress={() => setRoomType('public')}
                >
                  <MaterialCommunityIcons
                    name="earth"
                    size={24}
                    color={roomType === 'public' ? '#1a5f1a' : '#FFD700'}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      roomType === 'public' && styles.typeTextActive,
                    ]}
                  >
                    Public
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    roomType === 'private' && styles.typeButtonActive,
                  ]}
                  onPress={() => setRoomType('private')}
                >
                  <MaterialCommunityIcons
                    name="lock"
                    size={24}
                    color={roomType === 'private' ? '#1a5f1a' : '#FFD700'}
                  />
                  <Text
                    style={[
                      styles.typeText,
                      roomType === 'private' && styles.typeTextActive,
                    ]}
                  >
                    Private
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {roomType === 'private' && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Room Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter password"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                />
              </View>
            )}

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Ticket Price (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="10"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={ticketPrice}
                  onChangeText={setTicketPrice}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.label}>Max Players</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  placeholderTextColor="rgba(255,255,255,0.5)"
                  value={maxPlayers}
                  onChangeText={setMaxPlayers}
                  keyboardType="numeric"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Min Players to Start</Text>
              <TextInput
                style={styles.input}
                placeholder="2"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={minPlayers}
                onChangeText={setMinPlayers}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.label}>Auto Start Game</Text>
                <Text style={styles.hint}>Start when max players reached</Text>
              </View>
              <Switch
                value={autoStart}
                onValueChange={setAutoStart}
                trackColor={{ false: '#767577', true: '#FFD700' }}
                thumbColor={autoStart ? '#1a5f1a' : '#f4f3f4'}
              />
            </View>
          </View>

          {/* Prize Configuration */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Prize Configuration</Text>

            {prizes.map((prize, index) => (
              <View key={prize.prize_type} style={styles.prizeCard}>
                <View style={styles.prizeHeader}>
                  <View style={styles.prizeInfo}>
                    <Text style={styles.prizeName}>{prize.name}</Text>
                    <Text style={styles.prizeDescription}>{prize.description}</Text>
                  </View>
                  <Switch
                    value={prize.enabled}
                    onValueChange={(value) => updatePrize(index, 'enabled', value)}
                    trackColor={{ false: '#767577', true: '#FFD700' }}
                    thumbColor={prize.enabled ? '#1a5f1a' : '#f4f3f4'}
                  />
                </View>
                {prize.enabled && (
                  <View style={styles.amountContainer}>
                    <Text style={styles.currencySymbol}>₹</Text>
                    <TextInput
                      style={styles.amountInput}
                      value={prize.amount}
                      onChangeText={(value) => updatePrize(index, 'amount', value)}
                      keyboardType="numeric"
                      placeholder="0"
                      placeholderTextColor="#999"
                    />
                  </View>
                )}
              </View>
            ))}

            <View style={styles.totalCard}>
              <MaterialCommunityIcons name="cash-multiple" size={32} color="#FFD700" />
              <View style={styles.totalInfo}>
                <Text style={styles.totalLabel}>Total Prize Pool</Text>
                <Text style={styles.totalAmount}>₹ {getTotalPrizePool().toLocaleString()}</Text>
              </View>
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.createButton}
            onPress={handleCreateRoom}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#1a5f1a" />
            ) : (
              <>
                <Text style={styles.createButtonText}>Create Room</Text>
                <MaterialCommunityIcons name="check" size={24} color="#1a5f1a" />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFD700',
    marginBottom: 8,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#FFF',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: '#FFD700',
    gap: 8,
  },
  typeButtonActive: {
    backgroundColor: '#FFD700',
  },
  typeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFD700',
  },
  typeTextActive: {
    color: '#1a5f1a',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  prizeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  prizeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prizeInfo: {
    flex: 1,
  },
  prizeName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  prizeDescription: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a5f1a',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a5f1a',
    paddingVertical: 12,
  },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
    borderRadius: 12,
    padding: 20,
    marginTop: 8,
    borderWidth: 3,
    borderColor: '#FFD700',
    gap: 16,
  },
  totalInfo: {
    flex: 1,
  },
  totalLabel: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 4,
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
  createButton: {
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
});
