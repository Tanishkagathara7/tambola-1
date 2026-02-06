import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();
  const [logoPressStart, setLogoPressStart] = useState<number | null>(null);
  const [versionTapCount, setVersionTapCount] = useState(0);
  const versionTapTimeout = useRef<NodeJS.Timeout | null>(null);

  const handleStart = () => {
    router.push('/(tabs)/players');
  };

  const handleLogoLongPress = () => {
    const startTime = Date.now();
    setLogoPressStart(startTime);
    
    setTimeout(() => {
      if (Date.now() - startTime >= 5000) {
        // 5 seconds long press detected
        router.push('/admin');
        setLogoPressStart(null);
      }
    }, 5000);
  };

  const handleLogoPressOut = () => {
    setLogoPressStart(null);
  };

  const handleVersionTap = () => {
    const newCount = versionTapCount + 1;
    setVersionTapCount(newCount);

    if (newCount >= 7) {
      // 7 taps detected
      router.push('/admin');
      setVersionTapCount(0);
      if (versionTapTimeout.current) {
        clearTimeout(versionTapTimeout.current);
      }
    } else {
      // Reset counter after 2 seconds of inactivity
      if (versionTapTimeout.current) {
        clearTimeout(versionTapTimeout.current);
      }
      versionTapTimeout.current = setTimeout(() => {
        setVersionTapCount(0);
      }, 2000);
    }
  };

  return (
    <LinearGradient
      colors={['#1a5f1a', '#2d8b2d', '#3fa13f']}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo/Title */}
        <View style={styles.logoContainer}>
          <TouchableOpacity
            onLongPress={handleLogoLongPress}
            onPressOut={handleLogoPressOut}
            delayLongPress={5000}
            activeOpacity={1}
          >
            <MaterialCommunityIcons name="ticket" size={80} color="#FFD700" />
            <Text style={styles.title}>TAMBOLA</Text>
            <Text style={styles.subtitle}>Housie Book</Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        <View style={styles.descriptionBox}>
          <Text style={styles.description}>
            Digital Tambola Book for Family Entertainment
          </Text>
          <View style={styles.features}>
            <FeatureItem icon="account-multiple" text="Unlimited Players" />
            <FeatureItem icon="ticket-account" text="100 Tickets/Player" />
            <FeatureItem icon="phone-rotate-landscape" text="Offline Play" />
          </View>
        </View>

        {/* Start Button */}
        <TouchableOpacity
          style={styles.startButton}
          onPress={handleStart}
          activeOpacity={0.8}
        >
          <Text style={styles.startButtonText}>START NEW GAME</Text>
          <MaterialCommunityIcons name="chevron-right" size={30} color="#1a5f1a" />
        </TouchableOpacity>

        {/* Footer */}
        <TouchableOpacity onPress={handleVersionTap} activeOpacity={1}>
          <Text style={styles.footer}>Tap to Begin</Text>
          <Text style={styles.version}>v1.0</Text>
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
  startButton: {
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
  },
  startButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a5f1a',
    letterSpacing: 1,
  },
  footer: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 32,
  },
  version: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.3)',
    marginTop: 4,
    textAlign: 'center',
  },
});
