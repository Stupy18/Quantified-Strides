import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { AuthProvider, useAuth } from '../src/context/AuthContext'

function AuthGate() {
  const { token, loading } = useAuth()
  const segments           = useSegments()
  const router             = useRouter()

  useEffect(() => {
    if (loading) return                          // wait until secure store is read

    const inAuth = segments[0] === '((auth))'

    if (!token && !inAuth) {
      // Not logged in — send to login
      router.replace('/(auth)/login')
    } else if (token && inAuth) {
      // Already logged in — send into app
      router.replace('/(tabs)/today')
    }
  }, [token, loading, segments])

  return null
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <AuthGate />
      <Stack screenOptions={{ headerShown: false }} />
    </AuthProvider>
  )
}