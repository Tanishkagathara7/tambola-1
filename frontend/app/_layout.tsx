import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameStateProvider } from '../contexts/GameStateContext';
import { AuthProvider } from '../contexts/AuthContext';

export default function RootLayout() {
  useEffect(() => {
    console.log('Tunnel Mode Active - OTA Disabled');
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <GameStateProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="auth/login" />
              <Stack.Screen name="auth/signup" />
              <Stack.Screen name="lobby" />
              <Stack.Screen name="create-room" />
              <Stack.Screen name="room/[id]" />
              <Stack.Screen name="room/game/[id]" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
              <Stack.Screen name="profile" />
              <Stack.Screen name="prize-config" />
              <Stack.Screen name="prize-category-detail" />
              <Stack.Screen name="game" />
              <Stack.Screen name="recent-games" />
              <Stack.Screen name="player-tickets" options={{ presentation: 'card' }} />
              <Stack.Screen name="claims" options={{ presentation: 'card' }} />
            </Stack>
          </GameStateProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
