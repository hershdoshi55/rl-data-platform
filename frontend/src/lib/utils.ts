import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  if (mins < 60) return `${mins}m ${secs}s`
  const hours = Math.floor(mins / 60)
  const remainingMins = mins % 60
  return `${hours}h ${remainingMins}m`
}

export function formatCountdown(deadline: string): string {
  const now = new Date().getTime()
  const end = new Date(deadline).getTime()
  const diff = end - now

  if (diff <= 0) return 'Expired'

  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((diff % (1000 * 60)) / 1000)

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

export function getErrorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    if (e.response && typeof e.response === 'object') {
      const response = e.response as Record<string, unknown>
      if (response.data && typeof response.data === 'object') {
        const data = response.data as Record<string, unknown>
        if (typeof data.detail === 'string') return data.detail
        if (Array.isArray(data.detail)) {
          return data.detail.map((d: { msg?: string }) => d.msg || String(d)).join(', ')
        }
      }
    }
    if (typeof e.message === 'string') return e.message
  }
  return 'An unexpected error occurred'
}

export function taskTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    coding: 'Coding',
    reasoning: 'Reasoning',
    open_ended: 'Open Ended',
    preference_comparison: 'Preference Comparison',
    safety_evaluation: 'Safety Evaluation',
  }
  return labels[type] ?? type
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: 'Draft',
    queued: 'Queued',
    in_progress: 'In Progress',
    fully_annotated: 'Fully Annotated',
    archived: 'Archived',
    assigned: 'Assigned',
    completed: 'Completed',
    expired: 'Expired',
    skipped: 'Skipped',
    pending: 'Pending',
    processing: 'Processing',
    failed: 'Failed',
  }
  return labels[status] ?? status
}

export function difficultyLabel(difficulty: number): string {
  if (difficulty <= 1) return 'Trivial'
  if (difficulty <= 2) return 'Easy'
  if (difficulty <= 3) return 'Medium'
  if (difficulty <= 4) return 'Hard'
  return 'Expert'
}
