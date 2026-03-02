import { useEffect, useRef, useCallback } from 'react'
import Editor from '@monaco-editor/react'
import {
  Loader2,
  AlertCircle,
  PlayCircle,
  CheckCircle2,
  ListX,
} from 'lucide-react'
import { cn, taskTypeLabel, difficultyLabel } from '@/lib/utils'
import { useAssignment } from '@/hooks/useAssignment'
import { RewardForm } from '@/components/RewardForm'
import { useUiStore } from '@/stores/uiStore'
import type { SubmitResponsePayload, SubmitRewardSignalPayload } from '@/types'

const DRAFT_STORAGE_KEY = 'workspace_draft'

export function WorkspacePage() {
  const {
    currentAssignment,
    loading,
    error,
    noTasksAvailable,
    getNextTask,
    submitWork,
    skip,
    clearError,
  } = useAssignment()
  const { addNotification } = useUiStore()
  const hasDraftRef = useRef(false)

  // Auto-save draft every 30 seconds
  useEffect(() => {
    if (!currentAssignment) return
    const interval = setInterval(() => {
      const draft = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (draft) {
        // Draft already being maintained by RewardForm via form state
        // This just signals that there's unsaved work
        hasDraftRef.current = true
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [currentAssignment])

  // Warn before unload if there's a current assignment
  useEffect(() => {
    if (!currentAssignment) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [currentAssignment])

  // Clear draft when assignment changes
  useEffect(() => {
    if (!currentAssignment) {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      hasDraftRef.current = false
    }
  }, [currentAssignment])

  const handleSubmit = useCallback(
    async (response: SubmitResponsePayload, rewardSignal: SubmitRewardSignalPayload) => {
      await submitWork(response, rewardSignal)
      addNotification({
        type: 'success',
        title: 'Annotation submitted!',
        message: 'Great work. Loading your next task...',
        duration: 3000,
      })
      // Auto-load next task after short delay
      setTimeout(() => {
        getNextTask()
      }, 1500)
    },
    [submitWork, addNotification, getNextTask]
  )

  const handleSkip = useCallback(async () => {
    await skip()
    addNotification({
      type: 'info',
      title: 'Task skipped',
      message: 'Loading your next task...',
      duration: 2000,
    })
    setTimeout(() => {
      getNextTask()
    }, 1000)
  }, [skip, addNotification, getNextTask])

  // ─── Empty / loading states ───────────────────────────────────────────────

  if (!currentAssignment && !loading && !noTasksAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6">
        <div className="text-center space-y-2">
          <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <PlayCircle className="h-10 w-10 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Annotation Workspace</h2>
          <p className="text-muted-foreground max-w-md">
            Click the button below to receive your next annotation task. Take your time and provide
            high-quality feedback.
          </p>
        </div>
        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
        <button
          onClick={() => { clearError(); getNextTask() }}
          disabled={loading}
          className="flex items-center gap-2 rounded-md bg-primary px-8 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
          Get Next Task
        </button>
      </div>
    )
  }

  if (loading && !currentAssignment) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Finding your next task...</p>
      </div>
    )
  }

  if (noTasksAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-6">
        <div className="text-center space-y-2">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto">
            <ListX className="h-10 w-10 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-bold text-foreground">No Tasks Available</h2>
          <p className="text-muted-foreground max-w-sm">
            There are currently no tasks assigned to you. Check back later or contact your
            administrator.
          </p>
        </div>
        <button
          onClick={getNextTask}
          className="flex items-center gap-2 rounded-md border border-border px-6 py-2.5 text-sm font-medium text-foreground hover:bg-accent transition-colors"
        >
          <PlayCircle className="h-4 w-4" />
          Check Again
        </button>
      </div>
    )
  }

  if (!currentAssignment) return null

  const { task } = currentAssignment
  const isCoding = task.task_type === 'coding'

  // ─── Active task view ─────────────────────────────────────────────────────
  return (
    <div className="max-w-4xl space-y-6">
      {/* Task header */}
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary">
            {taskTypeLabel(task.task_type)}
          </span>
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
              task.difficulty <= 2
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : task.difficulty <= 3
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
            )}
          >
            {difficultyLabel(task.difficulty)} (D{task.difficulty})
          </span>
          {task.is_gold && (
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              Gold Standard
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CheckCircle2 className="h-4 w-4 text-green-500" />
          <span>
            {task.completed_annotations}/{task.required_annotations} annotations
          </span>
        </div>
      </div>

      {/* Task prompt */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
        <h3 className="font-semibold text-foreground">Task Prompt</h3>
        {isCoding ? (
          <div className="rounded-md border border-border overflow-hidden">
            <Editor
              height="280px"
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
                contextmenu: false,
              }}
              theme="vs-light"
            />
          </div>
        ) : (
          <div className="rounded-md bg-muted/50 border border-border p-4 text-sm text-foreground whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
            {task.prompt}
          </div>
        )}
      </div>

      {/* Reward form */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h3 className="font-semibold text-foreground mb-4">Your Annotation</h3>
        <RewardForm
          taskType={task.task_type}
          deadline={currentAssignment.deadline}
          loading={loading}
          onSubmit={handleSubmit}
          onSkip={handleSkip}
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}
    </div>
  )
}
