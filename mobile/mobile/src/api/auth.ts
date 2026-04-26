const BASE_URL = process.env.EXPO_PUBLIC_API_URL

export interface LoginPayload {
  email: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
  goal: string
  gym_days_week: number
  primary_sports: Record<string, number>
  date_of_birth?: string
}

export interface TokenResponse {
  access_token: string
  user_id: number
  name: string
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiLogin(payload: LoginPayload): Promise<TokenResponse> {
  const jsonString = JSON.stringify(payload);
  console.log("LOGIN ATTEMPT JSON:", jsonString);
  return request<TokenResponse>('/api/v1/(auth)/login', payload)
}

export async function apiRegister(payload: RegisterPayload): Promise<void> {
  console.log(payload)
  return request<void>('/api/v1/(auth)/register', payload)
}
