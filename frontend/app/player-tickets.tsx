import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGameState } from '../contexts/GameStateContext';

const { width } = Dimensions.get('window');

interface Ticket {
  id: string;
  ticket_number: number;
  player_id: string;
  player_name: string;
  grid: (number | null)[][];
  numbers: number[];
}

export default function PlayerTicketsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ playerId: string; playerName: string }>();
  const { gameState } = useGameState();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const ticketsData = await AsyncStorage.getItem('generated_tickets');
      if (ticketsData) {
        const allTickets: Ticket[] = JSON.parse(ticketsData);
        const playerTickets = allTickets.filter(
          (t) => t.player_id === params.playerId || t.player_name === params.playerName
        );
        setTickets(playerTickets);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderTicketCell = (
    value: number | null,
    colIndex: number,
    rowIndex: number,
    ticketId: string
  ) => {
    const isCalled = value !== null && gameState.calledNumbers.includes(value);
    const isCurrent = value === gameState.currentNumber;

    return (
      <View
        key={`${ticketId}-${rowIndex}-${colIndex}`}
        style={[
          styles.cell,
          value !== null && styles.cellFilled,
          isCalled && styles.cellCalled,
          isCurrent && styles.cellCurrent,
        ]}
      >
        {value !== null && (
          <Text
            style={[
              styles.cellText,
              isCalled && styles.cellTextCalled,
              isCurrent && styles.cellTextCurrent,
            ]}
          >
            {value}
          </Text>
        )}
      </View>
    );
  };

  const renderTicket = (ticket: Ticket, index: number) => {
    // Group tickets into sheets of 6
    const sheetIndex = Math.floor(index / 6);
    const ticketInSheet = index % 6;

    return (
      <View key={ticket.id} style={styles.ticketContainer}>
        <View style={styles.ticketHeader}>
          <Text style={styles.ticketNumber}>
            #{String(ticket.ticket_number).padStart(4, '0')}
          </Text>
        </View>
        <View style={styles.ticketGrid}>
          {ticket.grid.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {row.map((cell, colIndex) =>
                renderTicketCell(cell, colIndex, rowIndex, ticket.id)
              )}
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderSheet = (sheetTickets: Ticket[], sheetIndex: number) => {
    if (sheetTickets.length === 0) return null;

    return (
      <View key={sheetIndex} style={styles.sheet}>
        <Text style={styles.sheetHeader}>
          Sheet {sheetIndex + 1}: Tickets{' '}
          {String(sheetTickets[0].ticket_number).padStart(4, '0')} to{' '}
          {String(sheetTickets[sheetTickets.length - 1].ticket_number).padStart(4, '0')}
        </Text>
        <View style={styles.sheetGrid}>
          {sheetTickets.map((ticket, idx) => renderTicket(ticket, sheetIndex * 6 + idx))}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading tickets...</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  // Group tickets into sheets of 6
  const sheets: Ticket[][] = [];
  for (let i = 0; i < tickets.length; i += 6) {
    sheets.push(tickets.slice(i, i + 6));
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={24} color="#FFD700" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitle}>{params.playerName || 'Player'}</Text>
            <Text style={styles.headerSubtitle}>{tickets.length} ticket(s)</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent}>
          {tickets.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="ticket-outline"
                size={80}
                color="rgba(255,255,255,0.3)"
              />
              <Text style={styles.emptyText}>No tickets found</Text>
            </View>
          ) : (
            <>
              {sheets.map((sheet, idx) => renderSheet(sheet, idx))}
              <View style={styles.infoBox}>
                <MaterialCommunityIcons name="information" size={20} color="#FFD700" />
                <Text style={styles.infoText}>
                  Numbers highlighted in green are called. Current number is highlighted in orange.
                </Text>
              </View>
            </>
          )}
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
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  headerRight: {
    width: 40,
  },
  scrollContent: {
    padding: 16,
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
  sheet: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  sheetHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 12,
    textAlign: 'center',
  },
  sheetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ticketContainer: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    overflow: 'hidden',
    width: (width - 48) / 2,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: '#1a5f1a',
  },
  ticketHeader: {
    backgroundColor: '#1a5f1a',
    padding: 8,
    alignItems: 'center',
  },
  ticketNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  ticketGrid: {
    padding: 4,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: '#DDD',
  },
  cellFilled: {
    backgroundColor: '#FFD700',
  },
  cellCalled: {
    backgroundColor: '#4ECDC4',
  },
  cellCurrent: {
    backgroundColor: '#FF6B35',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  cellText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  cellTextCalled: {
    color: '#FFF',
  },
  cellTextCurrent: {
    color: '#FFF',
    fontSize: 14,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    gap: 8,
    alignItems: 'center',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#FFF',
    lineHeight: 16,
  },
});
