import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GameStateProvider } from '../contexts/GameStateContext';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GameStateProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
            <Stack.Screen name="game" />
            <Stack.Screen name="player-tickets" options={{ presentation: 'card' }} />
          </Stack>
        </GameStateProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
