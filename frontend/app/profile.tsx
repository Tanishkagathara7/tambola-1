import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout } = useAuth();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/lobby');
  };

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/');
          },
        },
      ]
    );
  };

  if (!user) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.header}>
            <TouchableOpacity onPress={handleBack}>
              <MaterialCommunityIcons name="arrow-left" size={28} color="#FFD700" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Profile</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={styles.centered}>
            <Text style={styles.placeholder}>Not logged in</Text>
            <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth/login')}>
              <Text style={styles.buttonText}>Log in</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack}>
            <MaterialCommunityIcons name="arrow-left" size={28} color="#FFD700" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.avatarRow}>
            <View style={styles.avatar}>
              <MaterialCommunityIcons name="account-circle" size={80} color="#FFD700" />
            </View>
            <Text style={styles.name}>{user.name}</Text>
            <Text style={styles.email}>{user.email}</Text>
          </View>

          <View style={styles.card}>
            <Row icon="phone" label="Mobile" value={user.mobile} />
            <Row icon="star" label="Points" value={`${(user.points_balance ?? 0).toFixed(0)}`} />
            <Row icon="trophy" label="Games played" value={String(user.total_games ?? 0)} />
            <Row icon="medal" label="Wins" value={String(user.total_wins ?? 0)} />
            <Row icon="cash" label="Total winnings" value={`₹ ${(user.total_winnings ?? 0).toFixed(2)}`} />
          </View>

          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <MaterialCommunityIcons name="logout" size={24} color="#FFF" />
            <Text style={styles.logoutButtonText}>Log out</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <MaterialCommunityIcons name={icon as any} size={24} color="#FFD700" />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { fontSize: 16, color: '#FFF', marginBottom: 16 },
  button: {
    backgroundColor: '#FFD700',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#1a5f1a' },
  avatarRow: { alignItems: 'center', marginBottom: 24 },
  avatar: { marginBottom: 12 },
  name: { fontSize: 22, fontWeight: 'bold', color: '#FFD700' },
  email: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  rowLabel: { flex: 1, fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  rowValue: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255, 107, 107, 0.3)',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FF6B6B',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
});
