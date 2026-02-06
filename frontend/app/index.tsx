import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function HomeScreen() {
  const router = useRouter();

  const handleStart = () => {
    router.push('/(tabs)/players');
  };

  return (
    <LinearGradient
      colors={['#1a5f1a', '#2d8b2d', '#3fa13f']}
      style={styles.container}
    >
      <View style={styles.content}>
        {/* Logo/Title */}
        <View style={styles.logoContainer}>
          <MaterialCommunityIcons name="ticket" size={80} color="#FFD700" />
          <Text style={styles.title}>TAMBOLA</Text>
          <Text style={styles.subtitle}>Housie Book</Text>
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
        <Text style={styles.footer}>Tap to Begin</Text>
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
});
