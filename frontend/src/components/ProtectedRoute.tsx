import { useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { getMe } from '@/api/auth'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '@/types'

interface ProtectedRouteProps {
  roles?: UserRole[]
  children?: React.ReactNode
}

export function ProtectedRoute({ roles, children }: ProtectedRouteProps) {
  const { user, accessToken, setUser, clearAuth } = useAuthStore()
  const [checking, setChecking] = useState(!user && !!accessToken)

  useEffect(() => {
    if (!user && accessToken) {
      getMe()
        .then(setUser)
        .catch(() => clearAuth())
        .finally(() => setChecking(false))
    } else {
      setChecking(false)
    }
  }, [user, accessToken, setUser, clearAuth])

  if (checking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!accessToken || !user) {
    return <Navigate to="/login" replace />
  }

  if (roles && roles.length > 0 && !roles.includes(user.role as UserRole)) {
    return <Navigate to="/unauthorized" replace />
  }

  if (children) {
    return <>{children}</>
  }

  return <Outlet />
}
