import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Ticket {
  id: string;
  ticket_number: number;
  player_id: string;
  player_name: string;
  grid: (number | null)[][];
  numbers: number[];
}

export default function TicketsScreen() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupedTickets, setGroupedTickets] = useState<{ [key: string]: Ticket[] }>({});

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const gameData = await AsyncStorage.getItem('generated_tickets');
      if (gameData) {
        const parsed = JSON.parse(gameData);
        setTickets(parsed);
        
        // Group tickets by player
        const grouped: { [key: string]: Ticket[] } = {};
        parsed.forEach((ticket: Ticket) => {
          if (!grouped[ticket.player_name]) {
            grouped[ticket.player_name] = [];
          }
          grouped[ticket.player_name].push(ticket);
        });
        setGroupedTickets(grouped);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderTicketCell = (value: number | null, colIndex: number) => {
    const bgColor = value === null ? 'transparent' : '#FFD700';
    return (
      <View key={colIndex} style={[styles.cell, { backgroundColor: bgColor }]}>
        {value !== null && <Text style={styles.cellText}>{value}</Text>}
      </View>
    );
  };

  const renderTicket = (ticket: Ticket) => (
    <View key={ticket.id} style={styles.ticketContainer}>
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketNumber}>#{String(ticket.ticket_number).padStart(4, '0')}</Text>
      </View>
      <View style={styles.ticketGrid}>
        {ticket.grid.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.map((cell, colIndex) => renderTicketCell(cell, colIndex))}
          </View>
        ))}
      </View>
    </View>
  );

  const renderPlayerSection = (playerName: string, playerTickets: Ticket[]) => {
    // Group tickets into sheets of 6
    const sheets: Ticket[][] = [];
    for (let i = 0; i < playerTickets.length; i += 6) {
      sheets.push(playerTickets.slice(i, i + 6));
    }

    return (
      <View key={playerName} style={styles.playerSection}>
        <View style={styles.playerHeader}>
          <MaterialCommunityIcons name="account" size={24} color="#FFD700" />
          <Text style={styles.playerName}>{playerName}</Text>
          <Text style={styles.ticketCount}>({playerTickets.length} tickets)</Text>
        </View>

        {sheets.map((sheet, sheetIndex) => (
          <View key={sheetIndex} style={styles.sheet}>
            <Text style={styles.sheetHeader}>
              Sheet {sheetIndex + 1}: Tickets{' '}
              {String(sheet[0].ticket_number).padStart(4, '0')} to{' '}
              {String(sheet[sheet.length - 1].ticket_number).padStart(4, '0')}
            </Text>
            <View style={styles.sheetGrid}>
              {sheet.map((ticket) => renderTicket(ticket))}
            </View>
          </View>
        ))}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFD700" />
      </View>
    );
  }

  if (tickets.length === 0) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="ticket-outline" size={80} color="rgba(255,255,255,0.3)" />
            <Text style={styles.emptyText}>No Tickets Generated</Text>
            <Text style={styles.emptySubtext}>Start a game to generate tickets</Text>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {Object.keys(groupedTickets).map((playerName) =>
            renderPlayerSection(playerName, groupedTickets[playerName])
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
    backgroundColor: '#1a5f1a',
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
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
  },
  playerSection: {
    marginBottom: 24,
  },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  playerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  ticketCount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
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
    width: '48%',
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
    fontSize: 16,
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
  cellText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
});
