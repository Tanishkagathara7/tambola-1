import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function SettingsScreen() {
  const router = useRouter();
  const [secretTapCount, setSecretTapCount] = useState(0);

  const handleSecretAccess = () => {
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

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all players, tickets, and game history. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.clear();
              Alert.alert('Success', 'All data cleared');
            } catch (error) {
              console.error('Error clearing data:', error);
              Alert.alert('Error', 'Failed to clear data');
            }
          },
        },
      ]
    );
  };

  const SettingItem = ({
    icon,
    title,
    subtitle,
    onPress,
    color = '#FFD700',
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress: () => void;
    color?: string;
  }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingIconContainer}>
        <MaterialCommunityIcons name={icon as any} size={28} color={color} />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={24} color="rgba(255,255,255,0.5)" />
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={['#1a5f1a', '#2d8b2d']} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* App Info */}
          <View style={styles.section}>
            <View style={styles.appInfo}>
              <MaterialCommunityIcons name="ticket" size={60} color="#FFD700" />
              <Text style={styles.appTitle}>TAMBOLA</Text>
              <Text style={styles.appVersion}>Housie Book v1.0</Text>
            </View>
          </View>

          {/* Settings */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settings</Text>
            <View style={styles.settingsContainer}>
              <SettingItem
                icon="information"
                title="About"
                subtitle="Learn about Tambola/Housie"
                onPress={() => Alert.alert('About', 'Tambola/Housie Book - Digital version for family entertainment')}
              />
              <SettingItem
                icon="help-circle"
                title="How to Play"
                subtitle="Rules and instructions"
                onPress={() =>
                  Alert.alert(
                    'How to Play',
                    '1. Add players\n2. Set ticket count per player\n3. Start game\n4. Call numbers manually or automatically\n5. Mark Full House when all 15 numbers are called'
                  )
                }
              />
            </View>
          </View>

          {/* Data Management */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Data</Text>
            <View style={styles.settingsContainer}>
              <SettingItem
                icon="delete-forever"
                title="Clear All Data"
                subtitle="Delete players and game history"
                onPress={handleClearData}
                color="#FF6B6B"
              />
            </View>
          </View>

          {/* Secret Admin Access - Tap version text 7 times */}
          <TouchableOpacity
            style={styles.secretButton}
            onPress={handleSecretAccess}
            activeOpacity={1}
          >
            <Text style={styles.appVersion}>Housie Book v1.0</Text>
          </TouchableOpacity>

          {/* Footer */}
          <Text style={styles.footer}>Made for Family Entertainment</Text>
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
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFD700',
    marginBottom: 12,
    marginLeft: 4,
  },
  appInfo: {
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  appTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFD700',
    marginTop: 12,
    letterSpacing: 2,
  },
  appVersion: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
  },
  settingsContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  settingIconContainer: {
    width: 40,
    alignItems: 'center',
  },
  settingContent: {
    flex: 1,
    marginLeft: 12,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  settingSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginTop: 2,
  },
  secretButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    marginTop: 32,
  },
  secretText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.2)',
  },
  footer: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: 24,
  },
});
