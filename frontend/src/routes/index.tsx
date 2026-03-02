import { Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from '@/components/ProtectedRoute'
import { Layout } from '@/components/Layout'

// Pages
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { TaskListPage } from '@/pages/TaskListPage'
import { TaskCreatePage } from '@/pages/TaskCreatePage'
import { TaskDetailPage } from '@/pages/TaskDetailPage'
import { ExportPage } from '@/pages/ExportPage'
import { WorkspacePage } from '@/pages/WorkspacePage'
import { HistoryPage } from '@/pages/HistoryPage'

function UnauthorizedPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-3xl font-bold text-foreground">403 — Access Denied</h1>
      <p className="text-muted-foreground">You do not have permission to view this page.</p>
      <a href="/" className="text-primary hover:underline text-sm">
        Return home
      </a>
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <h1 className="text-3xl font-bold text-foreground">404 — Page Not Found</h1>
      <p className="text-muted-foreground">The page you are looking for does not exist.</p>
      <a href="/" className="text-primary hover:underline text-sm">
        Return home
      </a>
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Protected routes — require authentication */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          {/* Researcher / Admin routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute roles={['researcher', 'admin']}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute roles={['researcher', 'admin']}>
                <TaskListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks/create"
            element={
              <ProtectedRoute roles={['researcher', 'admin']}>
                <TaskCreatePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks/:id"
            element={
              <ProtectedRoute roles={['researcher', 'admin']}>
                <TaskDetailPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/export"
            element={
              <ProtectedRoute roles={['researcher', 'admin']}>
                <ExportPage />
              </ProtectedRoute>
            }
          />

          {/* Annotator routes */}
          <Route
            path="/workspace"
            element={
              <ProtectedRoute roles={['annotator']}>
                <WorkspacePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/history"
            element={
              <ProtectedRoute roles={['annotator']}>
                <HistoryPage />
              </ProtectedRoute>
            }
          />

          {/* Role-based redirect for root */}
          <Route path="/home" element={<Navigate to="/" replace />} />
        </Route>
      </Route>

      {/* 404 fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
