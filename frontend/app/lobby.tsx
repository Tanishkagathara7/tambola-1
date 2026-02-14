import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { roomAPI, adsAPI } from '../services/api';

let RewardedAd: any, TestIds: any, AdEventType: any;
try {
  const mobileAds = require('react-native-google-mobile-ads');
  RewardedAd = mobileAds.RewardedAd;
  TestIds = mobileAds.TestIds;
  AdEventType = mobileAds.AdEventType;
} catch {
  RewardedAd = null;
  TestIds = { REWARDED: 'ca-app-pub-3940256099942544/5224354917' };
}

interface Room {
  id: string;
  room_code: string;
  name: string;
  host_name: string;
  room_type: 'public' | 'private';
  ticket_price: number;
  max_players: number;
  current_players: number;
  status: string;
  prize_pool: number;
}

export default function LobbyScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'public' | 'private'>('all');

  useEffect(() => {
    loadRooms();

    // Ensure socket is connected for real-time updates
    import('../services/socket').then(({ socketService }) => {
      if (!socketService.isConnected()) {
        socketService.connect().catch(err => {
          console.error('Failed to connect socket:', err);
        });
      }
    });
  }, [filter]);

  const loadRooms = async () => {
    try {
      const filters = filter === 'all' ? {} : { room_type: filter };
      const data = await roomAPI.getRooms(filters);
      setRooms(data);
    } catch (error: any) {
      console.error('Error loading rooms:', error);
      
      // Don't show error alert for server startup/timeout issues
      if (error.message?.includes('Server is starting up') || 
          error.message?.includes('timeout') || 
          error.message?.includes('Network timeout')) {
        console.log('Server is starting up, will retry automatically...');
        // Set empty rooms array and let user refresh manually
        setRooms([]);
      } else {
        // Only show alert for actual errors (not server startup)
        Alert.alert('Error', 'Failed to load rooms. Pull down to refresh.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRooms();
  };

  const [joiningRoomId, setJoiningRoomId] = useState<string | null>(null);
  const [adLoading, setAdLoading] = useState(false);
  const [adLoaded, setAdLoaded] = useState(false);
  const rewardedAdRef = useRef<any>(null);
  const REWARDED_ID = (TestIds && TestIds.REWARDED) ? TestIds.REWARDED : 'ca-app-pub-3940256099942544/5224354917';

  useEffect(() => {
    if (!RewardedAd || Platform.OS === 'web') return;
    const ad = RewardedAd.createForAdRequest(REWARDED_ID, { requestNonPersonalizedAdsOnly: true });
    rewardedAdRef.current = ad;
    const unsubLoaded = ad.addAdEventListener(AdEventType?.LOADED ?? 'loaded', () => setAdLoaded(true));
    ad.load();
    return () => {
      try { unsubLoaded?.(); } catch {}
    };
  }, []);

  const handleWatchAd = async () => {
    setAdLoading(true);
    try {
      if (RewardedAd && rewardedAdRef.current && adLoaded && Platform.OS !== 'web') {
        const rewardToken = `admob_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const onEarned = () => {
          adsAPI.watchRewarded({ ad_network: 'admob', reward_token: rewardToken, reward_amount: 10 })
            .then(() => {
              setAdLoaded(false);
              rewardedAdRef.current?.load();
              Alert.alert('Success', 'You earned 10 points!');
            })
            .catch((e: any) => Alert.alert('Error', e?.message || 'Failed to credit points'));
        };
        rewardedAdRef.current.addAdEventListener(AdEventType?.EARNED_REWARD ?? 'earned_reward', onEarned);
        await rewardedAdRef.current.show();
        setAdLoaded(false);
        rewardedAdRef.current.load();
      } else {
        await adsAPI.watchRewarded({ ad_network: 'admob', reward_amount: 10 });
        Alert.alert('Success', 'You earned 10 points!');
      }
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Ad not ready or failed. Try again.');
      if (rewardedAdRef.current) {
        setAdLoaded(false);
        rewardedAdRef.current.load();
      }
    } finally {
      setAdLoading(false);
    }
  };

  const handleJoinRoom = async (room: Room) => {
    if (joiningRoomId) return; // Prevent double click
    if (room.current_players >= room.max_players) {
      Alert.alert('Room Full', 'This room is full');
      return;
    }

    if (room.room_type === 'private') {
      Alert.prompt(
        'Private Room',
        'Enter room password',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Join',
            onPress: async (password?: string) => {
              setJoiningRoomId(room.id);
              try {
                await roomAPI.joinRoom(room.id, password);
                router.push({
                  pathname: '/room/[id]',
                  params: { id: room.id },
                });
              } catch (error: any) {
                Alert.alert('Error', error.message || 'Failed to join room');
              } finally {
                setJoiningRoomId(null);
              }
            },
          },
        ],
        'secure-text'
      );
    } else {
      setJoiningRoomId(room.id);
      try {
        await roomAPI.joinRoom(room.id);
        router.push({
          pathname: '/room/[id]',
          params: { id: room.id },
        });
      } catch (error: any) {
        Alert.alert('Error', error.message || 'Failed to join room');
      } finally {
        setJoiningRoomId(null);
      }
    }
  };

  const renderRoom = ({ item }: { item: Room }) => (
    <TouchableOpacity
      style={[styles.roomCard, joiningRoomId === item.id && { opacity: 0.7 }]}
      onPress={() => handleJoinRoom(item)}
      activeOpacity={0.7}
      disabled={!!joiningRoomId}
    >
      <View style={styles.roomHeader}>
        <View style={styles.roomInfo}>
          <Text style={styles.roomName}>{item.name}</Text>
          <Text style={styles.roomHost}>Host: {item.host_name}</Text>
        </View>
        <View style={[
          styles.roomTypeBadge,
          item.room_type === 'private' && styles.privateBadge
        ]}>
          <MaterialCommunityIcons
            name={item.room_type === 'private' ? 'lock' : 'earth'}
            size={16}
            color="#FFF"
          />
          <Text style={styles.roomTypeText}>
            {item.room_type.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.roomDetails}>
        <View style={styles.roomStat}>
          <MaterialCommunityIcons name="account-group" size={20} color="#FFD700" />
          <Text style={styles.roomStatText}>
            {item.current_players}/{item.max_players}
          </Text>
        </View>

        <View style={styles.roomStat}>
          <MaterialCommunityIcons name="ticket" size={20} color="#FFD700" />
          <Text style={styles.roomStatText}>₹{item.ticket_price}</Text>
        </View>

        <View style={styles.roomStat}>
          <MaterialCommunityIcons name="trophy" size={20} color="#FFD700" />
          <Text style={styles.roomStatText}>₹{item.prize_pool}</Text>
        </View>
      </View>

      <View style={styles.roomFooter}>
        <View style={[
          styles.statusBadge,
          item.status === 'active' && styles.activeBadge
        ]}>
          <Text style={styles.statusText}>
            {item.status === 'waiting' ? 'WAITING' : 'IN PROGRESS'}
          </Text>
        </View>
        {joiningRoomId === item.id ? (
          <ActivityIndicator size="small" color="#FFD700" />
        ) : (
          <MaterialCommunityIcons name="chevron-right" size={24} color="#FFD700" />
        )}
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>Loading rooms...</Text>
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
          <View>
            <Text style={styles.headerTitle}>Game Lobby</Text>
            <Text style={styles.headerSubtitle}>Welcome, {user?.name}!</Text>
          </View>
          <View style={styles.headerRight}>
            {refreshing && (
              <ActivityIndicator size="small" color="#FFD700" style={{ marginRight: 8 }} />
            )}
            <TouchableOpacity
              style={[styles.adButton, (adLoading || (RewardedAd && !adLoaded)) && { opacity: 0.8 }]}
              onPress={handleWatchAd}
              disabled={adLoading}
            >
              {adLoading ? (
                <ActivityIndicator size="small" color="#1a5f1a" />
              ) : (
                <MaterialCommunityIcons name="play-circle" size={20} color="#1a5f1a" />
              )}
              <Text style={styles.adButtonText}>
                {RewardedAd && !adLoaded && !adLoading ? 'Load ad' : '+10 Pts'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.walletButton}
              onPress={() => router.push('/profile')}
            >
              <MaterialCommunityIcons name="star" size={24} color="#FFD700" />
              <Text style={styles.walletText}>{user?.points_balance || 0}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/profile')}>
              <MaterialCommunityIcons name="account-circle" size={32} color="#FFD700" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter Tabs */}
        <View style={styles.filterContainer}>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
            onPress={() => setFilter('all')}
          >
            <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
              All Rooms
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'public' && styles.filterTabActive]}
            onPress={() => setFilter('public')}
          >
            <Text style={[styles.filterText, filter === 'public' && styles.filterTextActive]}>
              Public
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, filter === 'private' && styles.filterTabActive]}
            onPress={() => setFilter('private')}
          >
            <Text style={[styles.filterText, filter === 'private' && styles.filterTextActive]}>
              Private
            </Text>
          </TouchableOpacity>
        </View>

        {/* Rooms List */}
        <FlatList
          data={rooms}
          renderItem={renderRoom}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#FFD700"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="inbox" size={80} color="rgba(255,255,255,0.3)" />
              <Text style={styles.emptyText}>
                {loading ? 'Loading rooms...' : 'No rooms available'}
              </Text>
              <Text style={styles.emptySubtext}>
                {loading ? 'Server is starting up...' : 'Create a new room to get started or pull down to refresh'}
              </Text>
            </View>
          }
        />

        {/* Create Room Button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/create-room')}
        >
          <MaterialCommunityIcons name="plus" size={28} color="#1a5f1a" />
          <Text style={styles.createButtonText}>Create Room</Text>
        </TouchableOpacity>

        {/* Recent Games Button */}
        <TouchableOpacity
          style={styles.recentButton}
          onPress={() => router.push('/recent-games' as any)}
        >
          <MaterialCommunityIcons name="history" size={28} color="#FFD700" />
        </TouchableOpacity>
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
    justifyContent: 'space-between',
    alignItems: 'center',
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
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  walletText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  filterContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#FFD700',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  filterTextActive: {
    color: '#1a5f1a',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  roomCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  roomHost: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  roomTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  privateBadge: {
    backgroundColor: '#FF6B35',
  },
  roomTypeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },
  roomDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.3)',
  },
  roomStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  roomStatText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },
  roomFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 215, 0, 0.3)',
  },
  activeBadge: {
    backgroundColor: 'rgba(78, 205, 196, 0.3)',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
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
  createButton: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  createButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  adButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFD700',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
    marginRight: 8,
  },
  adButtonText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  recentButton: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
});
