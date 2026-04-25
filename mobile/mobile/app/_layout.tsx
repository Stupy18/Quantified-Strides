import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Newsreader:        require('../assets/fonts/Newsreader-Regular.ttf'),
    Newsreader_Italic: require('../assets/fonts/Newsreader-Italic.ttf'),
    JetBrainsMono:     require('../assets/fonts/JetBrainsMono-Regular.ttf'),
    Geist:             require('../assets/fonts/Geist-Regular.ttf'),
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  )
}
