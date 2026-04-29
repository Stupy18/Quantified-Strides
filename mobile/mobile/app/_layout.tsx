import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';

// Keep splash screen visible while fonts/auth are loading
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
});

function AuthGate() {
  const { token, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Wait until Auth is checked and Fonts are loaded (handled by RootLayout)
    if (loading) return;

    // Fix: removed the double parentheses '((auth))'
    const inAuthGroup = segments[0] === '(auth)';

    if (!token && !inAuthGroup) {
      // Not logged in — send to login
      router.replace('/(auth)/login');
    } else if (token && inAuthGroup) {
      // Already logged in — send into app
      router.replace('/(tabs)/today');
    }
  }, [token, loading, segments]);

  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Newsreader:        require('../assets/fonts/Newsreader-Regular.ttf'),
    Newsreader_Italic: require('../assets/fonts/Newsreader-Italic.ttf'),
    JetBrainsMono:     require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    Geist:             require('../assets/fonts/Geist-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthGate />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}