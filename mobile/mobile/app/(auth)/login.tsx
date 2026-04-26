import { useState } from 'react'
import { View, TextInput, Text, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { ScreenWrapper } from '../../src/components/layout/ScreenWrapper'
import { SectionTitle }  from '../../src/components/primitives/SectionTitle'
import { MetricLabel }   from '../../src/components/primitives/MetricLabel'
import { ActionButton }  from '../../src/components/primitives/ActionButton'
import { useAuth }       from '../../src/context/AuthContext'
import { useTheme }      from '../../src/hooks/useTheme'
import { SPACE, RADIUS } from '../../src/theme'

export default function LoginScreen() {
  const theme  = useTheme()
  const router = useRouter()
  const { login } = useAuth()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleLogin() {
    if (!email || !password) { setError('Please fill in all fields'); return }
    setError(null)
    setLoading(true)
    try {
      await login({ email: email.trim().toLowerCase(), password })
      // AuthGate in _layout will redirect automatically once token is set
    } catch (err: any) {
      const msg = err.message?.toLowerCase().includes('verify')
        ? 'Please verify your email before signing in'
        : 'Invalid email or password'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: theme.bgCard,
      borderColor:     theme.borderSubtle,
      color:           theme.textPrimary,
    },
  ]

  return (
    <ScreenWrapper scrollable={false}>
      <View style={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.appName, { color: theme.accent }]}>QUANTIFIEDSTRIDES</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>Sign in to your account</Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: theme.bgCard, borderColor: theme.borderSubtle }]}>
          <SectionTitle title="Welcome back" />

          <MetricLabel>Email</MetricLabel>
          <TextInput
            style={inputStyle}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.textFaint}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <MetricLabel style={{ marginTop: SPACE.md }}>Password</MetricLabel>
          <TextInput
            style={inputStyle}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={theme.textFaint}
            secureTextEntry
          />

          {error && (
            <Text style={[styles.error, { color: theme.bgAlert }]}>{error}</Text>
          )}

          {loading
            ? <ActivityIndicator color={theme.accent} style={{ marginTop: SPACE.lg }} />
            : (
              <ActionButton
                label="Sign in"
                onPress={handleLogin}
                variant="accent"
                size="lg"
                fullWidth
                style={{ marginTop: SPACE.lg }}
              />
            )
          }
        </View>

        {/* Switch to register */}
        <ActionButton
          label="No account? Create one"
          onPress={() => router.push('/(auth)/register')}
          variant="ghost"
          size="sm"
          fullWidth
          style={{ marginTop: SPACE.md }}
        />

      </View>
    </ScreenWrapper>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', paddingVertical: SPACE.xl },
  header:    { alignItems: 'center', marginBottom: SPACE.xl },
  appName:   { fontSize: 13, letterSpacing: 3, fontFamily: 'JetBrainsMono', fontWeight: '700' },
  subtitle:  { fontSize: 12, marginTop: 6, fontFamily: 'JetBrainsMono', letterSpacing: 1 },
  card:      { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.sm },
  input:     { borderWidth: 1, borderRadius: RADIUS.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 4 },
  error:     { fontSize: 12, marginTop: SPACE.sm, fontFamily: 'JetBrainsMono' },
})
