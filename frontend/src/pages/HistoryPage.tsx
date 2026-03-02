import React, { useEffect, useState } from 'react'
import { Loader2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { cn, taskTypeLabel, formatDuration, truncate } from '@/lib/utils'
import { getAssignmentHistory } from '@/api/assignments'
import type { AssignmentWithTask } from '@/types'
import { format } from 'date-fns'

const ITEMS_PER_PAGE = 20

export function HistoryPage() {
  const [assignments, setAssignments] = useState<AssignmentWithTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [page, setPage] = useState(1)

  useEffect(() => {
    getAssignmentHistory()
      .then(setAssignments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [])

  const totalPages = Math.ceil(assignments.length / ITEMS_PER_PAGE)
  const paginated = assignments.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-2 h-64 text-destructive">
        <AlertCircle className="h-5 w-5" />
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Annotation History</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          {assignments.length} completed annotation{assignments.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {assignments.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            You haven&apos;t completed any annotations yet. Head to the workspace to get started!
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                      Task Type
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                      Prompt
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                      Time Spent
                    </th>
                    <th className="text-left px-4 py-3 font-semibold text-muted-foreground">
                      Submitted
                    </th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((assignment) => (
                    <React.Fragment key={assignment.id}>
                      <tr
                        onClick={() =>
                          setExpandedId(expandedId === assignment.id ? null : assignment.id)
                        }
                        className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                            {taskTypeLabel(assignment.task.task_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[300px]">
                          <span className="text-foreground">
                            {truncate(assignment.task.prompt, 80)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                              assignment.status === 'completed'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                : assignment.status === 'skipped'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                            )}
                          >
                            {assignment.status.charAt(0).toUpperCase() + assignment.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground tabular-nums">
                          {assignment.time_spent_seconds
                            ? formatDuration(assignment.time_spent_seconds)
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                          {assignment.completed_at
                            ? format(new Date(assignment.completed_at), 'MMM d, yyyy HH:mm')
                            : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {expandedId === assignment.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail row */}
                      {expandedId === assignment.id && (
                        <tr
                          className="border-b border-border bg-muted/10"
                        >
                          <td colSpan={6} className="px-6 py-5">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                                  Full Prompt
                                </h4>
                                <p className="text-sm text-foreground whitespace-pre-wrap bg-muted/50 rounded-md p-3 border border-border max-h-48 overflow-y-auto">
                                  {assignment.task.prompt}
                                </p>
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                                <div>
                                  <p className="text-xs text-muted-foreground">Task ID</p>
                                  <p className="font-mono text-xs text-foreground">
                                    {assignment.task_id.slice(0, 16)}...
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Difficulty</p>
                                  <p className="text-foreground font-medium">
                                    {assignment.task.difficulty}/5
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Assigned At</p>
                                  <p className="text-foreground">
                                    {format(new Date(assignment.assigned_at), 'MMM d, HH:mm')}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">Deadline</p>
                                  <p className="text-foreground">
                                    {format(new Date(assignment.deadline), 'MMM d, HH:mm')}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="rounded-md px-3 py-1.5 text-sm border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="rounded-md px-3 py-1.5 text-sm border border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
