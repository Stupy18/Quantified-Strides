import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../src/api/queryClient';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { ThemeProvider } from '../src/context/ThemeContext';
import { useCheckInStore } from '../src/store/checkInStore';

SplashScreen.preventAutoHideAsync();


function AuthGate() {
  const { token, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!token && !inAuthGroup) {
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      router.replace('/(tabs)/today');
    }
  }, [token, loading, segments]);

  return null;
}

// Sits inside AuthProvider so it has access to the token
function CheckInHydrator() {
  const { token, loading } = useAuth();
  const hydrate = useCheckInStore(s => s.hydrate);

  useEffect(() => {
    // Wait until auth is resolved and we have a token before hitting the backend
    if (loading || !token) return;
    hydrate(token);
  }, [loading, token]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Newsreader:        require('../assets/fonts/Newsreader-Regular.ttf'),
    Newsreader_Italic: require('../assets/fonts/Newsreader-Italic.ttf'),
    JetBrainsMono:     require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    Geist:             require('../assets/fonts/Geist-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <CheckInHydrator />
          <AuthGate />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}