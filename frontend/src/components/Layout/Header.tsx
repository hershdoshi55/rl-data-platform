import { Bell, Moon, Sun } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/tasks': 'Tasks',
  '/tasks/create': 'New Task',
  '/export': 'Export Data',
  '/workspace': 'Annotation Workspace',
  '/history': 'Annotation History',
  '/admin/users': 'User Management',
}

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  researcher: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  annotator: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
}

export function Header() {
  const { user } = useAuthStore()
  const { theme, toggleTheme, notifications, removeNotification } = useUiStore()
  const location = useLocation()

  const pageTitle = (() => {
    if (PAGE_TITLES[location.pathname]) return PAGE_TITLES[location.pathname]
    if (location.pathname.startsWith('/tasks/') && location.pathname !== '/tasks/create') {
      return 'Task Detail'
    }
    return 'RL Platform'
  })()

  return (
    <header className="flex items-center justify-between h-16 px-6 border-b border-border bg-card shrink-0">
      <h1 className="text-lg font-semibold text-foreground">{pageTitle}</h1>

      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* Notifications */}
        <div className="relative">
          <button
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {notifications.length > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            )}
          </button>

          {notifications.length > 0 && (
            <div className="absolute right-0 top-10 z-50 w-80 rounded-lg border border-border bg-card shadow-lg">
              <div className="p-3 border-b border-border">
                <span className="text-sm font-semibold">Notifications</span>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-start gap-3 p-3 border-b border-border last:border-0 hover:bg-accent/50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {n.message && (
                        <p className="text-xs text-muted-foreground mt-0.5">{n.message}</p>
                      )}
                    </div>
                    <button
                      onClick={() => removeNotification(n.id)}
                      className="text-muted-foreground hover:text-foreground text-xs shrink-0"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User badge */}
        {user && (
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold">
              {(user.display_name ?? user.email).charAt(0).toUpperCase()}
            </div>
            <div className="hidden sm:block">
              <p className="text-sm font-medium text-foreground leading-none">
                {user.display_name ?? user.email.split('@')[0]}
              </p>
              <span
                className={cn(
                  'inline-block mt-0.5 rounded px-1.5 py-0.5 text-xs font-medium capitalize',
                  roleBadgeColors[user.role] ?? roleBadgeColors['pending']
                )}
              >
                {user.role}
              </span>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
