import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import {
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  History,
  FileText,
} from 'lucide-react'
import { cn, taskTypeLabel, statusLabel, difficultyLabel, formatDuration } from '@/lib/utils'
import { getTask, getTaskVersions } from '@/api/tasks'
import { getTaskMetrics } from '@/api/metrics'
import type { Task, TaskMetrics, TaskVersion } from '@/types'
import { format } from 'date-fns'
import { useAuthStore } from '@/stores/authStore'

type Tab = 'overview' | 'annotations' | 'versions'

const statusClasses: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  queued: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  in_progress: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  fully_annotated: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 6 ? 'text-green-600' : score >= 4 ? 'text-amber-600' : 'text-red-600'
  return <span className={cn('font-bold tabular-nums', color)}>{score.toFixed(1)}</span>
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [task, setTask] = useState<Task | null>(null)
  const [metrics, setMetrics] = useState<TaskMetrics | null>(null)
  const [versions, setVersions] = useState<TaskVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [showRefSolution, setShowRefSolution] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      getTask(id),
      getTaskMetrics(id).catch(() => null),
      getTaskVersions(id).catch(() => []),
    ])
      .then(([taskData, metricsData, versionsData]) => {
        setTask(taskData)
        setMetrics(metricsData)
        setVersions(versionsData)
      })
      .catch(() => setError('Failed to load task details'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">{error ?? 'Task not found'}</p>
        </div>
        <button
          onClick={() => navigate('/tasks')}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </button>
      </div>
    )
  }

  const canEdit = user?.role === 'researcher' || user?.role === 'admin'

  return (
    <div className="max-w-5xl space-y-6">
      {/* Back nav */}
      <button
        onClick={() => navigate('/tasks')}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Tasks
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">
              {taskTypeLabel(task.task_type)}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                statusClasses[task.status] ?? 'bg-muted text-muted-foreground'
              )}
            >
              {statusLabel(task.status)}
            </span>
            <span className="text-xs text-muted-foreground">
              v{task.version} • Difficulty: {task.difficulty} ({difficultyLabel(task.difficulty)})
            </span>
            {task.is_gold && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
                Gold
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Created by {task.created_by} on {format(new Date(task.created_at), 'MMM d, yyyy')}
          </p>
          <p className="text-sm text-muted-foreground">
            Annotations: {task.completed_annotations} / {task.required_annotations}
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => navigate(`/tasks/${task.id}/edit`)}
            className="shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors"
          >
            Edit Task
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-1">
        {(['overview', 'annotations', 'versions'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium capitalize border-b-2 -mb-px transition-colors',
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            )}
          >
            {tab === 'overview' && <FileText className="h-3.5 w-3.5" />}
            {tab === 'annotations' && <span>{metrics?.annotation_count ?? 0}</span>}
            {tab === 'versions' && <History className="h-3.5 w-3.5" />}
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Prompt */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
            <h3 className="font-semibold text-foreground">Prompt</h3>
            {task.task_type === 'coding' ? (
              <div className="rounded-md border border-border overflow-hidden">
                <Editor
                  height="250px"
                  defaultLanguage="python"
                  value={task.prompt}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 13,
                    lineNumbers: 'on',
                    wordWrap: 'on',
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                  }}
                  theme="vs-light"
                />
              </div>
            ) : (
              <div className="rounded-md bg-muted/50 border border-border p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {task.prompt}
              </div>
            )}
          </div>

          {/* Reference solution (collapsible) */}
          {task.reference_solution && (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <button
                onClick={() => setShowRefSolution((p) => !p)}
                className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
              >
                <span className="text-sm font-semibold text-foreground">Reference Solution</span>
                {showRefSolution ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showRefSolution && (
                <div className="px-5 pb-5">
                  {task.task_type === 'coding' ? (
                    <div className="rounded-md border border-border overflow-hidden">
                      <Editor
                        height="200px"
                        defaultLanguage="python"
                        value={task.reference_solution}
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          fontSize: 13,
                          lineNumbers: 'on',
                          wordWrap: 'on',
                          automaticLayout: true,
                        }}
                        theme="vs-light"
                      />
                    </div>
                  ) : (
                    <div className="rounded-md bg-muted/50 border border-border p-4 text-sm text-foreground whitespace-pre-wrap">
                      {task.reference_solution}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Metrics summary */}
          {metrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">{metrics.annotation_count}</p>
                <p className="text-xs text-muted-foreground mt-1">Annotations</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {metrics.average_score.toFixed(1)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Avg Score</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {(metrics.annotator_agreement * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">Agreement</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm text-center">
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {metrics.score_variance.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Variance</p>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'annotations' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Annotator</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Score</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Dimensions</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Time Spent</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {(metrics?.annotations ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-12 text-muted-foreground">
                      No annotations yet
                    </td>
                  </tr>
                ) : (
                  (metrics?.annotations ?? []).map((ann) => (
                    <tr key={ann.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 text-foreground">
                        {ann.annotator_name ?? ann.annotator_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3">
                        <ScoreBadge score={ann.overall_score} />
                      </td>
                      <td className="px-4 py-3">
                        {ann.dimension_scores ? (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(ann.dimension_scores).map(([dim, score]) => (
                              <span
                                key={dim}
                                className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs"
                              >
                                <span className="capitalize text-muted-foreground">{dim}:</span>
                                <span className="font-medium">{score}</span>
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {ann.time_spent_seconds ? formatDuration(ann.time_spent_seconds) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(ann.submitted_at), 'MMM d, yyyy HH:mm')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'versions' && (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          {versions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No version history available
            </div>
          ) : (
            <div className="divide-y divide-border">
              {versions.map((v) => (
                <div key={v.version} className="p-5 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">Version {v.version}</span>
                      {v.version === task.version && (
                        <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                          Current
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(v.created_at), 'MMM d, yyyy HH:mm')}
                    </span>
                  </div>
                  {v.change_summary && (
                    <p className="text-sm text-muted-foreground">{v.change_summary}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Difficulty: {v.difficulty} • By: {v.created_by}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
