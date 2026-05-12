const BASE_URL = process.env.EXPO_PUBLIC_API_URL

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
  // 201/204 responses have no body
  if (res.status === 201 || res.status === 204) return undefined as T
  return res.json()
}

export interface ReadinessPayload {
  entry_date:        string
  overall_feel:      number
  legs_feel:         number
  upper_body_feel:   number
  joint_feel:        number
  injury_note?:      string | null
  time_available:    'short' | 'medium' | 'full'
  going_out_tonight: boolean
}

export async function apiSaveReadiness(token: string, payload: ReadinessPayload): Promise<void> {
  return authedRequest<void>('/api/v1/checkin/readiness', token, 'POST', payload)
}

export async function apiFetchReadiness(token: string, date: string): Promise<ReadinessPayload | null> {
  return authedRequest<ReadinessPayload | null>(`/api/v1/checkin/readiness/${date}`, token)
}
