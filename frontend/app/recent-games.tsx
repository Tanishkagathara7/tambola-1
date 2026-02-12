import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    ActivityIndicator,
    RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { roomAPI } from '../services/api';

interface Winner {
    user_name: string;
    prize_type: string;
    amount: number;
}

interface CompletedRoom {
    id: string;
    name: string;
    completed_at: string;
    prize_pool: number;
    winners: Winner[];
}

export default function RecentGamesScreen() {
    const router = useRouter();
    const [rooms, setRooms] = useState<CompletedRoom[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadCompletedRooms();
    }, []);

    const loadCompletedRooms = async () => {
        try {
            const data = await roomAPI.getCompleted();
            setRooms(data);
        } catch (error) {
            console.error('Error loading completed rooms:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        loadCompletedRooms();
    };

    const renderRoom = ({ item }: { item: CompletedRoom }) => (
        <View style={styles.roomCard}>
            <View style={styles.roomHeader}>
                <Text style={styles.roomName}>{item.name}</Text>
                <Text style={styles.roomDate}>
                    {new Date(item.completed_at).toLocaleDateString()}
                </Text>
            </View>

            <View style={styles.roomStats}>
                <MaterialCommunityIcons name="trophy" size={20} color="#FFD700" />
                <Text style={styles.poolText}>Prize Pool: ₹{item.prize_pool}</Text>
            </View>

            <View style={styles.winnersList}>
                <Text style={styles.winnersLabel}>Winners:</Text>
                {item.winners && item.winners.length > 0 ? (
                    item.winners.map((winner, index) => (
                        <View key={index} style={styles.winnerRow}>
                            <MaterialCommunityIcons name="crown" size={14} color="#FFD700" />
                            <Text style={styles.winnerText}>
                                {winner.user_name} - {winner.prize_type.replace('_', ' ').toUpperCase()} (₹{winner.amount})
                            </Text>
                        </View>
                    ))
                ) : (
                    <Text style={styles.noWinnersText}>No winners recorded</Text>
                )}
            </View>
        </View>
    );

    return (
        <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <MaterialCommunityIcons name="arrow-left" size={28} color="#FFD700" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Recent Games</Text>
                    <View style={{ width: 28 }} />
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#FFD700" />
                    </View>
                ) : (
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
                                <Text style={styles.emptyText}>No completed games yet</Text>
                            </View>
                        }
                    />
                )}
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
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    listContainer: {
        padding: 16,
    },
    roomCard: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: 'rgba(255, 215, 0, 0.3)',
    },
    roomHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    roomName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#FFD700',
    },
    roomDate: {
        fontSize: 12,
        color: 'rgba(255, 255, 255, 0.6)',
    },
    roomStats: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 8,
    },
    poolText: {
        fontSize: 16,
        color: '#FFF',
        fontWeight: '600',
    },
    winnersList: {
        marginTop: 8,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255, 255, 255, 0.1)',
        paddingTop: 8,
    },
    winnersLabel: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: 4,
        fontStyle: 'italic',
    },
    winnerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 2,
    },
    winnerText: {
        fontSize: 14,
        color: '#FFF',
    },
    noWinnersText: {
        fontSize: 14,
        color: 'rgba(255, 255, 255, 0.5)',
        fontStyle: 'italic',
    },
    emptyState: {
        padding: 32,
        alignItems: 'center',
    },
    emptyText: {
        fontSize: 16,
        color: 'rgba(255, 255, 255, 0.5)',
    },
});
