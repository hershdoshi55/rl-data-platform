import { useState } from 'react'
import { useAuthStore } from '@/stores/authStore'
import * as authApi from '@/api/auth'
import { getErrorMessage } from '@/lib/utils'

export function useAuth() {
  const { user, accessToken, setUser, setTokens, clearAuth, isAuthenticated } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const login = async (email: string, password: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const tokens = await authApi.login(email, password)
      setTokens(tokens.access_token, tokens.refresh_token)
      const me = await authApi.getMe()
      setUser(me)
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }

  const register = async (
    email: string,
    password: string,
    display_name?: string
  ): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await authApi.register(email, password, display_name)
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }

  const logout = async (): Promise<void> => {
    setLoading(true)
    try {
      await authApi.logout()
    } finally {
      clearAuth()
      setLoading(false)
    }
  }

  const loadCurrentUser = async (): Promise<void> => {
    if (!accessToken) return
    try {
      const me = await authApi.getMe()
      setUser(me)
    } catch {
      clearAuth()
    }
  }

  return {
    user,
    loading,
    error,
    isAuthenticated: isAuthenticated(),
    login,
    logout,
    register,
    loadCurrentUser,
  }
}
