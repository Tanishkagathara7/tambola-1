import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';

export default function HomeScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const [showOptions, setShowOptions] = useState(false);
  const [secretTapCount, setSecretTapCount] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        // User is logged in, show options
        setShowOptions(true);
      } else {
        // Not logged in, wait for user action
        setShowOptions(true);
      }
    }
  }, [isLoading, isAuthenticated]);

  const handleSecretAdminAccess = () => {
    const newCount = secretTapCount + 1;
    setSecretTapCount(newCount);

    if (newCount >= 7) {
      // Unlock admin panel after 7 taps
      router.push('/admin');
      setSecretTapCount(0);
    }

    // Reset counter after 2 seconds of inactivity
    setTimeout(() => setSecretTapCount(0), 2000);
  };

  if (isLoading || !showOptions) {
    return (
      <LinearGradient colors={['#1a5f1a', '#2d8b2d', '#3fa13f']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <MaterialCommunityIcons name="ticket" size={80} color="#FFD700" />
          <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 20 }} />
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d', '#3fa13f']} style={styles.container}>
      <View style={styles.content}>
        {/* Logo/Title */}
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons name="ticket" size={80} color="#FFD700" />
          <Text style={styles.title}>TAMBOLA</Text>
          <Text style={styles.subtitle}>Online Multiplayer</Text>
        </View>

        {/* Description */}
        <View style={styles.descriptionBox}>
          <Text style={styles.description}>
            Play Tambola with friends online!
          </Text>
          <View style={styles.features}>
            <FeatureItem icon="account-multiple" text="Multiplayer Rooms" />
            <FeatureItem icon="ticket-account" text="Real-time Gameplay" />
            <FeatureItem icon="trophy" text="Win Real Prizes" />
          </View>
        </View>

        {/* Action Buttons */}
        {isAuthenticated ? (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/lobby')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>ENTER LOBBY</Text>
              <MaterialCommunityIcons name="chevron-right" size={30} color="#1a5f1a" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/(tabs)/players')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>OFFLINE MODE</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/auth/login')}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryButtonText}>LOGIN</Text>
              <MaterialCommunityIcons name="login" size={30} color="#1a5f1a" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => router.push('/auth/signup')}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryButtonText}>CREATE ACCOUNT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.offlineButton}
              onPress={() => router.push('/(tabs)/players')}
              activeOpacity={0.8}
            >
              <Text style={styles.offlineButtonText}>Continue Offline</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Footer */}
        <TouchableOpacity onPress={handleSecretAdminAccess} activeOpacity={1}>
          <Text style={styles.footer}>v2.0 - Multiplayer Edition</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const FeatureItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.featureItem}>
    <MaterialCommunityIcons name={icon as any} size={24} color="#FFD700" />
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 16,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 20,
    color: '#FFF',
    marginTop: 8,
    letterSpacing: 2,
  },
  descriptionBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 40,
    width: '100%',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  description: {
    fontSize: 16,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '600',
  },
  features: {
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureText: {
    fontSize: 16,
    color: '#FFF',
    fontWeight: '500',
  },
  primaryButton: {
    backgroundColor: '#FFD700',
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    gap: 8,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a5f1a',
    letterSpacing: 1,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFD700',
    marginBottom: 12,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  offlineButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 8,
  },
  offlineButtonText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  footer: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 32,
  },
});

