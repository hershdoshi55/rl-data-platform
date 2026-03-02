import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, ChevronLeft, ChevronRight, Loader2, AlertCircle, Trash2 } from 'lucide-react'
import { cn, taskTypeLabel, statusLabel, difficultyLabel } from '@/lib/utils'
import { useTasks } from '@/hooks/useTasks'
import type { Task, TaskType, TaskStatus } from '@/types'
import { format } from 'date-fns'

const TASK_TYPE_OPTIONS: { value: TaskType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'coding', label: 'Coding' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'open_ended', label: 'Open Ended' },
  { value: 'preference_comparison', label: 'Preference Comparison' },
  { value: 'safety_evaluation', label: 'Safety Evaluation' },
]

const STATUS_OPTIONS: { value: TaskStatus | ''; label: string }[] = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'queued', label: 'Queued' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'fully_annotated', label: 'Fully Annotated' },
  { value: 'archived', label: 'Archived' },
]

const statusBadgeClasses: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  queued: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  fully_annotated: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

const difficultyColors = ['', 'text-green-600', 'text-lime-600', 'text-amber-600', 'text-orange-600', 'text-red-600']

function DifficultyBadge({ difficulty }: { difficulty: number }) {
  return (
    <span className={cn('text-xs font-semibold tabular-nums', difficultyColors[difficulty] ?? 'text-muted-foreground')}>
      {difficultyLabel(difficulty)} ({difficulty})
    </span>
  )
}

function ProgressBar({ completed, required }: { completed: number; required: number }) {
  const pct = required > 0 ? Math.min(100, Math.round((completed / required) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground shrink-0">
        {completed}/{required}
      </span>
    </div>
  )
}

export function TaskListPage() {
  const navigate = useNavigate()
  const { tasks, total, page, pageSize, filters, loading, error, fetchTasks, applyFilters, goToPage, deleteTask } = useTasks()
  const [search, setSearch] = useState(filters.search ?? '')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const totalPages = Math.ceil(total / pageSize)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    applyFilters({ search: search.trim() || undefined })
  }

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (deleteConfirm !== id) {
      setDeleteConfirm(id)
      return
    }
    await deleteTask(id)
    setDeleteConfirm(null)
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Tasks</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} task{total !== 1 ? 's' : ''} total
          </p>
        </div>
        <button
          onClick={() => navigate('/tasks/create')}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-card p-4">
        <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[200px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks..."
              className="w-full rounded-md border border-input bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Search
          </button>
        </form>

        <select
          value={filters.task_type ?? ''}
          onChange={(e) => applyFilters({ task_type: e.target.value as TaskType | undefined })}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {TASK_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filters.status ?? ''}
          onChange={(e) => applyFilters({ status: e.target.value as TaskStatus | undefined })}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {error && !loading && (
          <div className="flex items-center justify-center gap-2 py-12 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Prompt</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Difficulty</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Progress</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      No tasks found. Create your first task to get started.
                    </td>
                  </tr>
                ) : (
                  tasks.map((task: Task) => (
                    <tr
                      key={task.id}
                      onClick={() => navigate(`/tasks/${task.id}`)}
                      className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                          {taskTypeLabel(task.task_type)}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[280px]">
                        <p className="truncate text-foreground">{task.prompt}</p>
                      </td>
                      <td className="px-4 py-3">
                        <DifficultyBadge difficulty={task.difficulty} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            statusBadgeClasses[task.status] ?? 'bg-muted text-muted-foreground'
                          )}
                        >
                          {statusLabel(task.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 min-w-[120px]">
                        <ProgressBar
                          completed={task.completed_annotations}
                          required={task.required_annotations}
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(task.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => handleDelete(task.id, e)}
                          className={cn(
                            'p-1.5 rounded text-xs transition-colors',
                            deleteConfirm === task.id
                              ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400'
                              : 'text-muted-foreground hover:text-destructive hover:bg-destructive/10'
                          )}
                          title={deleteConfirm === task.id ? 'Click again to confirm' : 'Delete task'}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({total} total)
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const pageNum = Math.max(1, Math.min(page - 2 + i, totalPages - 4 + i))
                return (
                  <button
                    key={pageNum}
                    onClick={() => goToPage(pageNum)}
                    className={cn(
                      'h-8 w-8 rounded-md text-sm font-medium transition-colors',
                      page === pageNum
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                  >
                    {pageNum}
                  </button>
                )
              })}
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page >= totalPages}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
