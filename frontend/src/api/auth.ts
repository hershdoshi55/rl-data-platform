import { apiClient } from './client'
import type { User, TokenResponse } from '@/types'

export async function login(email: string, password: string): Promise<TokenResponse> {
  // OAuth2 password flow requires form data
  const formData = new URLSearchParams()
  formData.append('username', email)
  formData.append('password', password)

  const response = await apiClient.post<TokenResponse>('/api/auth/login', formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return response.data
}

export async function register(
  email: string,
  password: string,
  display_name?: string
): Promise<User> {
  const response = await apiClient.post<User>('/api/auth/register', {
    email,
    password,
    display_name,
  })
  return response.data
}

export async function refreshToken(refresh_token: string): Promise<TokenResponse> {
  const response = await apiClient.post<TokenResponse>('/api/auth/refresh', { refresh_token })
  return response.data
}

export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>('/api/auth/me')
  return response.data
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post('/api/auth/logout')
  } catch {
    // Ignore errors on logout — we always clear local state
  }
}
