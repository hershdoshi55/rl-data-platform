import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Editor from '@monaco-editor/react'
import { Loader2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
import { cn, difficultyLabel } from '@/lib/utils'
import { createTask } from '@/api/tasks'
import { getProjects } from '@/api/projects'
import type { Project, TaskType } from '@/types'
import { useUiStore } from '@/stores/uiStore'

const schema = z.object({
  task_type: z.enum(['coding', 'reasoning', 'open_ended', 'preference_comparison', 'safety_evaluation']),
  prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
  reference_solution: z.string().optional(),
  difficulty: z.number().min(1).max(5),
  required_annotations: z.number().min(1).max(20),
  project_id: z.string().optional(),
  auto_queue: z.boolean(),
})

type FormValues = z.infer<typeof schema>

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'coding', label: 'Coding' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'open_ended', label: 'Open Ended' },
  { value: 'preference_comparison', label: 'Preference Comparison' },
  { value: 'safety_evaluation', label: 'Safety Evaluation' },
]

export function TaskCreatePage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [showRefSolution, setShowRefSolution] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const { addNotification } = useUiStore()

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      task_type: 'coding',
      prompt: '',
      reference_solution: '',
      difficulty: 3,
      required_annotations: 3,
      project_id: '',
      auto_queue: true,
    },
  })

  const taskType = watch('task_type')
  const difficulty = watch('difficulty')
  const autoQueue = watch('auto_queue')

  useEffect(() => {
    getProjects()
      .then(setProjects)
      .catch(() => {/* Projects are optional */})
  }, [])

  const onSubmit = async (values: FormValues) => {
    setServerError(null)
    try {
      const task = await createTask({
        task_type: values.task_type,
        prompt: values.prompt,
        reference_solution: values.reference_solution || undefined,
        difficulty: values.difficulty,
        required_annotations: values.required_annotations,
        project_id: values.project_id || undefined,
        auto_queue: values.auto_queue,
      })
      addNotification({
        type: 'success',
        title: 'Task created',
        message: `Task #${task.id.slice(0, 8)} was created successfully.`,
      })
      navigate(`/tasks/${task.id}`)
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Failed to create task')
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Create New Task</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Define an annotation task for the platform
        </p>
      </div>

      {serverError && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/50 bg-destructive/10 p-4">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{serverError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-5">
          <h3 className="font-semibold text-foreground">Task Configuration</h3>

          {/* Task type */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Task Type <span className="text-destructive">*</span>
            </label>
            <select
              {...register('task_type')}
              className={cn(
                'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring',
                errors.task_type && 'border-destructive'
              )}
            >
              {TASK_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {errors.task_type && (
              <p className="text-xs text-destructive">{errors.task_type.message}</p>
            )}
          </div>

          {/* Project (optional) */}
          {projects.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Project <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <select
                {...register('project_id')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">No project</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Difficulty */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-foreground">Difficulty</label>
              <span className="text-sm font-semibold text-primary">
                {difficulty} — {difficultyLabel(difficulty)}
              </span>
            </div>
            <Controller
              name="difficulty"
              control={control}
              render={({ field }) => (
                <input
                  type="range"
                  min={1}
                  max={5}
                  step={1}
                  value={field.value}
                  onChange={(e) => field.onChange(Number(e.target.value))}
                  className="w-full h-2 accent-primary cursor-pointer"
                />
              )}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1 - Trivial</span>
              <span>3 - Medium</span>
              <span>5 - Expert</span>
            </div>
          </div>

          {/* Required annotations */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Required Annotations
            </label>
            <input
              type="number"
              min={1}
              max={20}
              {...register('required_annotations', { valueAsNumber: true })}
              className={cn(
                'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring',
                errors.required_annotations && 'border-destructive'
              )}
            />
            {errors.required_annotations && (
              <p className="text-xs text-destructive">{errors.required_annotations.message}</p>
            )}
          </div>

          {/* Auto queue toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">Auto-queue after creation</label>
              <p className="text-xs text-muted-foreground">Task will be immediately available for annotation</p>
            </div>
            <Controller
              name="auto_queue"
              control={control}
              render={({ field }) => (
                <button
                  type="button"
                  onClick={() => field.onChange(!field.value)}
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    field.value ? 'bg-primary' : 'bg-muted'
                  )}
                  role="switch"
                  aria-checked={field.value}
                >
                  <span
                    className={cn(
                      'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
                      field.value ? 'translate-x-5' : 'translate-x-0.5'
                    )}
                  />
                </button>
              )}
            />
          </div>
        </div>

        {/* Prompt */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-3">
          <label className="text-sm font-semibold text-foreground">
            Prompt <span className="text-destructive">*</span>
          </label>
          <Controller
            name="prompt"
            control={control}
            render={({ field }) => (
              <div className="rounded-md border border-border overflow-hidden">
                <Editor
                  height="300px"
                  defaultLanguage={taskType === 'coding' ? 'python' : 'markdown'}
                  language={taskType === 'coding' ? 'python' : 'markdown'}
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  options={{
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
            )}
          />
          {errors.prompt && (
            <p className="text-xs text-destructive">{errors.prompt.message}</p>
          )}
        </div>

        {/* Reference solution (collapsible) */}
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowRefSolution((prev) => !prev)}
            className="w-full flex items-center justify-between p-5 text-left hover:bg-muted/30 transition-colors"
          >
            <div>
              <span className="text-sm font-semibold text-foreground">Reference Solution</span>
              <span className="ml-2 text-xs text-muted-foreground">(optional)</span>
            </div>
            {showRefSolution ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showRefSolution && (
            <div className="px-5 pb-5">
              <Controller
                name="reference_solution"
                control={control}
                render={({ field }) => (
                  <div className="rounded-md border border-border overflow-hidden">
                    <Editor
                      height="250px"
                      defaultLanguage={taskType === 'coding' ? 'python' : 'markdown'}
                      language={taskType === 'coding' ? 'python' : 'markdown'}
                      value={field.value ?? ''}
                      onChange={(v) => field.onChange(v ?? '')}
                      options={{
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
                )}
              />
            </div>
          )}
        </div>

        {/* Submit */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-semibold transition-colors',
              isSubmitting
                ? 'bg-muted text-muted-foreground cursor-not-allowed'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Task
          </button>
          <button
            type="button"
            onClick={() => navigate('/tasks')}
            className="rounded-md border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
