import { useEffect, useState, useCallback } from 'react'
import { Plus, Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { cn, formatBytes, statusLabel } from '@/lib/utils'
import { getExportJobs, downloadExport } from '@/api/exports'
import { ExportDialog } from '@/components/ExportDialog'
import type { ExportJob } from '@/types'
import { format } from 'date-fns'

const statusClasses: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  processing: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
}

const formatLabels: Record<string, string> = {
  jsonl: 'JSONL',
  preference_pairs: 'Preference Pairs',
  huggingface: 'HuggingFace',
  csv: 'CSV',
}

function StatusDot({ status }: { status: string }) {
  const dotColors: Record<string, string> = {
    pending: 'bg-gray-400',
    processing: 'bg-yellow-500 animate-pulse',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  }
  return (
    <span
      className={cn('inline-block h-2 w-2 rounded-full mr-1.5', dotColors[status] ?? 'bg-gray-400')}
    />
  )
}

export function ExportPage() {
  const [jobs, setJobs] = useState<ExportJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [downloading, setDownloading] = useState<string | null>(null)

  const hasActiveJobs = jobs.some((j) => j.status === 'pending' || j.status === 'processing')

  const fetchJobs = useCallback(async () => {
    try {
      const data = await getExportJobs()
      setJobs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load export jobs')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  // Poll active jobs every 5 seconds
  useEffect(() => {
    if (!hasActiveJobs) return
    const interval = setInterval(fetchJobs, 5000)
    return () => clearInterval(interval)
  }, [hasActiveJobs, fetchJobs])

  const handleDownload = async (job: ExportJob) => {
    if (job.status !== 'completed') return
    setDownloading(job.id)
    try {
      const blob = await downloadExport(job.id)
      const ext = job.output_format === 'jsonl' ? 'jsonl' : job.output_format === 'csv' ? 'csv' : 'json'
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `export-${job.id.slice(0, 8)}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Data Exports</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Export annotated data in various formats for model training
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchJobs}
            className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Export
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* Jobs table */}
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Format</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Records</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Size</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Quality</th>
                  <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-muted-foreground">
                      No exports yet. Click &quot;New Export&quot; to get started.
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="font-medium text-foreground">
                          {formatLabels[job.output_format] ?? job.output_format}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                            statusClasses[job.status]
                          )}
                        >
                          <StatusDot status={job.status} />
                          {statusLabel(job.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-foreground">
                        {job.record_count !== undefined ? job.record_count.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {job.file_size_bytes !== undefined ? formatBytes(job.file_size_bytes) : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {job.quality_threshold !== undefined ? `≥ ${job.quality_threshold}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {format(new Date(job.created_at), 'MMM d, yyyy HH:mm')}
                      </td>
                      <td className="px-4 py-3">
                        {job.status === 'failed' && job.error_message && (
                          <span className="text-xs text-destructive" title={job.error_message}>
                            Error
                          </span>
                        )}
                        {job.status === 'completed' && (
                          <button
                            onClick={() => handleDownload(job)}
                            disabled={downloading === job.id}
                            className="flex items-center gap-1.5 rounded-md bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                          >
                            {downloading === job.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Download className="h-3 w-3" />
                            )}
                            Download
                          </button>
                        )}
                        {(job.status === 'pending' || job.status === 'processing') && (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExportDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchJobs}
      />
    </div>
  )
}
