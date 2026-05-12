import React, { createContext, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiLogin, apiRegister, LoginPayload, RegisterPayload } from '../api/auth'
import { useAuthStore } from '../store/authStore'
import { queryClient } from '../api/queryClient'

const TOKEN_KEY = 'qs_token'
const USER_KEY  = 'qs_user'

interface AuthUser {
  user_id: number
  name: string
}

interface AuthContextValue {
  token:    string | null
  user:     AuthUser | null
  loading:  boolean
  login:    (payload: LoginPayload) => Promise<void>
  register: (payload: RegisterPayload) => Promise<void>
  logout:   () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token,   setToken]   = useState<string | null>(null)
  const [user,    setUser]    = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function restore() {
      try {
        const [t, u] = await Promise.all([
          AsyncStorage.getItem(TOKEN_KEY),
          AsyncStorage.getItem(USER_KEY),
        ])
        if (t) {
          setToken(t)
          const parsed = u ? JSON.parse(u) : null
          if (parsed) useAuthStore.getState().setAuth(t, parsed.user_id)
        }
        if (u) setUser(JSON.parse(u))
      } catch {
        // corrupt storage — start fresh
      } finally {
        setLoading(false)
      }
    }
    restore()
  }, [])

  async function login(payload: LoginPayload) {
    const res = await apiLogin(payload)
    await AsyncStorage.setItem(TOKEN_KEY, res.access_token)
    await AsyncStorage.setItem(USER_KEY, JSON.stringify({ user_id: res.user_id, name: res.name }))
    setToken(res.access_token)
    setUser({ user_id: res.user_id, name: res.name })
    useAuthStore.getState().setAuth(res.access_token, res.user_id)
  }

  async function register(payload: RegisterPayload) {
    await apiRegister(payload)
  }

  async function logout() {
    await AsyncStorage.removeItem(TOKEN_KEY)
    await AsyncStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
    useAuthStore.getState().clearAuth()
    queryClient.clear()
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}