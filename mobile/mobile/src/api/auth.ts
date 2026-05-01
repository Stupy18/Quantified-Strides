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
  gender?: string
  profile_pic_url?: string
}

export interface UpdateProfilePayload {
  name?: string
  gender?: string
  profile_pic_url?: string
  goal?: string
  gym_days_week?: number
  primary_sports?: Record<string, number>
  garmin_email?: string
  garmin_password?: string
}

export interface UserProfile {
  user_id: number
  name: string
  email: string
  date_of_birth?: string
  gender?: string
  profile_pic_url?: string
  goal?: string
  gym_days_week?: number
  primary_sports: Record<string, number>
  garmin_email?: string
  garmin_password?: string
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

async function authedRequest<T>(
  path: string,
  token: string,
  method: string = 'GET',
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function apiLogin(payload: LoginPayload): Promise<TokenResponse> {
  return request<TokenResponse>('/api/v1/auth/login', payload)
}

export async function apiRegister(payload: RegisterPayload): Promise<void> {
  return request<void>('/api/v1/auth/register', payload)
}

export async function apiGetMe(token: string): Promise<UserProfile> {
  return authedRequest<UserProfile>('/api/v1/auth/me', token)
}

export async function apiUpdateProfile(token: string, payload: UpdateProfilePayload): Promise<UserProfile> {
  return authedRequest<UserProfile>('/api/v1/auth/me', token, 'PUT', payload)
}