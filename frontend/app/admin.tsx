import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Admin screen - fully offline

interface Ticket {
  id: string;
  ticket_number: number;
  player_id: string;
  player_name: string;
  grid: (number | null)[][];
  numbers: number[];
}

export default function AdminScreen() {
  const router = useRouter();
  const [authenticated, setAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);

  useEffect(() => {
    loadTickets();
  }, []);

  const loadTickets = async () => {
    try {
      const ticketsData = await AsyncStorage.getItem('generated_tickets');
      if (ticketsData) {
        setTickets(JSON.parse(ticketsData));
      }
      
      const adminTicket = await AsyncStorage.getItem('admin_selected_ticket');
      if (adminTicket) {
        setSelectedTicket(adminTicket);
      }
    } catch (error) {
      console.error('Error loading tickets:', error);
    }
  };

  const handleLogin = async () => {
    try {
      // Offline authentication - check local password
      // Default password stored locally
      const storedPassword = await AsyncStorage.getItem('admin_password');
      const defaultPassword = 'admin@123';
      const correctPassword = storedPassword || defaultPassword;
      
      if (username.toLowerCase() === 'admin' && password === correctPassword) {
        setAuthenticated(true);
      } else {
        Alert.alert('Error', 'Invalid credentials');
      }
    } catch (error) {
      console.error('Error authenticating:', error);
      Alert.alert('Error', 'Authentication failed');
    }
  };

  const handleSelectTicket = async (ticketId: string) => {
    setSelectedTicket(ticketId);
    await AsyncStorage.setItem('admin_selected_ticket', ticketId);
    Alert.alert(
      'Success',
      'Winning ticket selected! This ticket will have 100% advantage in the game.',
      [{ text: 'OK', onPress: () => router.back() }]
    );
  };

  const renderTicket = (ticket: Ticket) => {
    const isSelected = selectedTicket === ticket.id;
    
    return (
      <TouchableOpacity
        key={ticket.id}
        style={[
          styles.ticketCard,
          isSelected && styles.ticketCardSelected,
        ]}
        onPress={() => handleSelectTicket(ticket.id)}
      >
        <View style={styles.ticketCardHeader}>
          <Text style={styles.ticketCardTitle}>
            Ticket #{String(ticket.ticket_number).padStart(4, '0')}
          </Text>
          <Text style={styles.ticketCardPlayer}>{ticket.player_name}</Text>
          {isSelected && (
            <MaterialCommunityIcons name="check-circle" size={24} color="#4ECDC4" />
          )}
        </View>
        <View style={styles.miniGrid}>
          {ticket.grid.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.miniRow}>
              {row.map((cell, colIndex) => (
                <View
                  key={colIndex}
                  style={[
                    styles.miniCell,
                    cell !== null && styles.miniCellFilled,
                  ]}
                >
                  {cell !== null && (
                    <Text style={styles.miniCellText}>{cell}</Text>
                  )}
                </View>
              ))}
            </View>
          ))}
        </View>
      </TouchableOpacity>
    );
  };

  if (!authenticated) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.loginContainer}
          >
            <View style={styles.loginBox}>
              <View style={styles.loginHeader}>
                <MaterialCommunityIcons name="shield-lock" size={60} color="#FFD700" />
                <Text style={styles.loginTitle}>Admin Access</Text>
                <Text style={styles.loginSubtitle}>Enter credentials to continue</Text>
              </View>

              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
                <Text style={styles.loginButtonText}>Login</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => router.back()}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <MaterialCommunityIcons name="close" size={28} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.infoBox}>
            <MaterialCommunityIcons name="information" size={24} color="#FFD700" />
            <Text style={styles.infoText}>
              Select ONE ticket to give it 100% winning advantage. The selected ticket will
              receive its numbers first, ensuring it completes Full House naturally.
            </Text>
          </View>

          {tickets.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons
                name="ticket-outline"
                size={80}
                color="rgba(255,255,255,0.3)"
              />
              <Text style={styles.emptyText}>No tickets available</Text>
              <Text style={styles.emptySubtext}>Start a game to select winning ticket</Text>
            </View>
          ) : (
            <View style={styles.ticketsContainer}>
              {tickets.map(renderTicket)}
            </View>
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
  loginContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  loginBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 24,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  loginHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  loginTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 16,
  },
  loginSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#FFF',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  loginButton: {
    backgroundColor: '#FFD700',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
  cancelButton: {
    padding: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  cancelButtonText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.7)',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  content: {
    padding: 16,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 215, 0, 0.2)',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FFD700',
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#FFF',
    lineHeight: 20,
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
  ticketsContainer: {
    gap: 12,
  },
  ticketCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  ticketCardSelected: {
    backgroundColor: 'rgba(78, 205, 196, 0.2)',
    borderColor: '#4ECDC4',
    borderWidth: 3,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  ticketCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  ticketCardPlayer: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    flex: 1,
    marginLeft: 12,
  },
  miniGrid: {
    backgroundColor: '#FFF',
    borderRadius: 6,
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
  miniCellText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#1a5f1a',
  },
});
