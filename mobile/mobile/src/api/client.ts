import axios from 'axios'

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(async (config) => {
  const { useAuthStore } = await import('../store/authStore')
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})
