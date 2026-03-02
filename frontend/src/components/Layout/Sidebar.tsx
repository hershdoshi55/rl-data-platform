import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  ListTodo,
  PlusCircle,
  Download,
  Users,
  ClipboardCheck,
  History,
  LogOut,
  Brain,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { logout } from '@/api/auth'

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  researcher: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  annotator: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  pending: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
}

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const researcherNav: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/tasks', label: 'Tasks', icon: ListTodo },
  { to: '/tasks/create', label: 'New Task', icon: PlusCircle },
  { to: '/export', label: 'Export', icon: Download },
]

const adminOnlyNav: NavItem[] = [
  { to: '/admin/users', label: 'Users', icon: Users },
]

const annotatorNav: NavItem[] = [
  { to: '/workspace', label: 'Workspace', icon: ClipboardCheck },
  { to: '/history', label: 'History', icon: History },
]

export function Sidebar() {
  const { user, clearAuth } = useAuthStore()
  const { sidebarOpen, toggleSidebar } = useUiStore()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }

  const isAnnotator = user?.role === 'annotator'
  const isAdmin = user?.role === 'admin'

  const navItems = isAnnotator
    ? annotatorNav
    : isAdmin
    ? [...researcherNav, ...adminOnlyNav]
    : researcherNav

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-card border-r border-border transition-all duration-300 relative',
        sidebarOpen ? 'w-60' : 'w-16'
      )}
    >
      {/* Logo */}
      <div className="flex items-center h-16 px-4 border-b border-border shrink-0">
        <Brain className="h-7 w-7 text-primary shrink-0" />
        {sidebarOpen && (
          <span className="ml-3 font-bold text-base truncate text-foreground">RL Platform</span>
        )}
      </div>

      {/* Toggle button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-[4.5rem] z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:bg-accent transition-colors"
        aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        {sidebarOpen ? <ChevronLeft className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                !sidebarOpen && 'justify-center px-2'
              )
            }
            title={!sidebarOpen ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {sidebarOpen && <span className="truncate">{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-border p-3 shrink-0">
        {sidebarOpen && user && (
          <div className="mb-2 px-1">
            <p className="text-sm font-medium text-foreground truncate">
              {user.display_name ?? user.email}
            </p>
            <span
              className={cn(
                'inline-block mt-1 rounded px-1.5 py-0.5 text-xs font-medium capitalize',
                roleBadgeColors[user.role] ?? roleBadgeColors['pending']
              )}
            >
              {user.role}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors',
            !sidebarOpen && 'justify-center px-2'
          )}
          title={!sidebarOpen ? 'Logout' : undefined}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {sidebarOpen && <span>Logout</span>}
        </button>
      </div>
    </aside>
  )
}
