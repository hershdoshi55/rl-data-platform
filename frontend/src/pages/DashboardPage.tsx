import { useEffect } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import { Loader2, AlertCircle, ListTodo, CheckCircle2, Users, PenLine, RefreshCw } from 'lucide-react'
import { useDashboard } from '@/hooks/useMetrics'
import { cn, statusLabel } from '@/lib/utils'

const STATUS_COLORS: Record<string, string> = {
  draft: '#94a3b8',
  queued: '#60a5fa',
  in_progress: '#f59e0b',
  fully_annotated: '#22c55e',
  archived: '#475569',
}

interface StatCardProps {
  label: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  colorClass?: string
  description?: string
}

function StatCard({ label, value, icon: Icon, colorClass = 'text-primary', description }: StatCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className={cn('text-3xl font-bold mt-1 tabular-nums', colorClass)}>{value}</p>
          {description && (
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        <div className={cn('rounded-lg p-2 bg-primary/10', colorClass)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { stats, loading, error, refresh } = useDashboard(30000)

  useEffect(() => {
    document.title = 'Dashboard | RL Platform'
  }, [])

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">{error}</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </div>
    )
  }

  const tasksByStatus = stats?.tasks_by_status ?? {}
  const chartData = Object.entries(tasksByStatus).map(([status, count]) => ({
    name: statusLabel(status),
    count,
    status,
  }))

  const queued = tasksByStatus['queued'] ?? 0
  const inProgress = tasksByStatus['in_progress'] ?? 0
  const fullyAnnotated = tasksByStatus['fully_annotated'] ?? 0

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Platform overview — auto-refreshes every 30 seconds
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Total Tasks"
          value={stats?.total_tasks ?? 0}
          icon={ListTodo}
          colorClass="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          label="Queued"
          value={queued}
          icon={PenLine}
          colorClass="text-amber-600 dark:text-amber-400"
          description={`${inProgress} in progress`}
        />
        <StatCard
          label="Fully Annotated"
          value={fullyAnnotated}
          icon={CheckCircle2}
          colorClass="text-green-600 dark:text-green-400"
          description={`${stats?.total_annotations ?? 0} total annotations`}
        />
        <StatCard
          label="Active Annotators"
          value={stats?.active_annotators ?? 0}
          icon={Users}
          colorClass="text-purple-600 dark:text-purple-400"
        />
      </div>

      {/* Bar chart */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-base font-semibold text-foreground mb-4">Tasks by Status</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={chartData} margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={32}
              />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '13px',
                }}
              />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {chartData.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={STATUS_COLORS[entry.status] ?? '#94a3b8'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
            No task data available
          </div>
        )}
      </div>

      {/* Status breakdown */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="text-base font-semibold text-foreground mb-4">Status Breakdown</h3>
        <div className="space-y-3">
          {Object.entries(tasksByStatus).map(([status, count]) => {
            const total = stats?.total_tasks ?? 1
            const pct = total > 0 ? Math.round((count / total) * 100) : 0
            return (
              <div key={status} className="flex items-center gap-3">
                <div className="w-28 shrink-0">
                  <span className="text-sm text-foreground capitalize">{statusLabel(status)}</span>
                </div>
                <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${pct}%`,
                      background: STATUS_COLORS[status] ?? '#94a3b8',
                    }}
                  />
                </div>
                <div className="w-20 text-right shrink-0">
                  <span className="text-sm tabular-nums text-foreground">{count}</span>
                  <span className="text-xs text-muted-foreground ml-1">({pct}%)</span>
                </div>
              </div>
            )
          })}
          {Object.keys(tasksByStatus).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
          )}
        </div>
      </div>
    </div>
  )
}
