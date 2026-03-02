import { useEffect, useState, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Editor from '@monaco-editor/react'
import { Loader2, Clock, SkipForward, Send } from 'lucide-react'
import { cn, formatCountdown } from '@/lib/utils'
import type { TaskType, SubmitResponsePayload, SubmitRewardSignalPayload } from '@/types'
import { useUiStore } from '@/stores/uiStore'

interface RewardFormProps {
  taskType: TaskType
  deadline: string
  loading?: boolean
  onSubmit: (response: SubmitResponsePayload, rewardSignal: SubmitRewardSignalPayload) => Promise<void>
  onSkip: () => Promise<void>
}

const codingDimensions = ['correctness', 'efficiency', 'style'] as const
const otherDimensions = ['helpfulness', 'accuracy', 'clarity'] as const

function buildSchema(taskType: TaskType) {
  const dimensions = taskType === 'coding' ? codingDimensions : otherDimensions
  const dimensionScores = Object.fromEntries(
    dimensions.map((d) => [d, z.number().min(1).max(7)])
  ) as Record<string, z.ZodNumber>

  return z.object({
    content: z.string().min(1, 'Response content is required'),
    overall_score: z.number().min(1).max(7),
    preference_choice: taskType === 'preference_comparison'
      ? z.enum(['A', 'B', 'Tie'])
      : z.string().optional(),
    preference_strength: taskType === 'preference_comparison'
      ? z.number().min(1).max(3)
      : z.number().optional(),
    dimension_scores: z.object(dimensionScores),
    justification: z.string().optional(),
  })
}

type FormValues = {
  content: string
  overall_score: number
  preference_choice?: 'A' | 'B' | 'Tie'
  preference_strength?: number
  dimension_scores: Record<string, number>
  justification?: string
}

interface ScoreSliderProps {
  label: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
}

function ScoreSlider({ label, value, onChange, min = 1, max = 7 }: ScoreSliderProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-foreground capitalize">{label}</label>
        <span className="text-sm font-bold text-primary tabular-nums">{value}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground w-4">{min}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 h-2 accent-primary cursor-pointer"
        />
        <span className="text-xs text-muted-foreground w-4">{max}</span>
      </div>
    </div>
  )
}

export function RewardForm({ taskType, deadline, loading = false, onSubmit, onSkip }: RewardFormProps) {
  const [countdown, setCountdown] = useState(formatCountdown(deadline))
  const [skipConfirm, setSkipConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { addNotification } = useUiStore()
  const dimensions = taskType === 'coding' ? codingDimensions : otherDimensions
  const isExpired = countdown === 'Expired'
  const editorRef = useRef<unknown>(null)

  const defaultDimScores = Object.fromEntries(dimensions.map((d) => [d, 4]))

  const {
    control,
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(buildSchema(taskType)),
    defaultValues: {
      content: '',
      overall_score: 4,
      preference_choice: undefined,
      preference_strength: 2,
      dimension_scores: defaultDimScores,
      justification: '',
    },
  })

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(deadline))
    }, 1000)
    return () => clearInterval(timer)
  }, [deadline])

  const onFormSubmit = async (values: FormValues) => {
    setSubmitting(true)
    try {
      const response: SubmitResponsePayload = {
        content: values.content,
        content_type: taskType === 'coding' ? 'code' : 'text',
      }
      const rewardSignal: SubmitRewardSignalPayload = {
        overall_score: values.overall_score,
        dimension_scores: values.dimension_scores,
        justification: values.justification,
        ...(taskType === 'preference_comparison' && {
          preference_choice: values.preference_choice,
          preference_strength: values.preference_strength,
        }),
      }
      await onSubmit(response, rewardSignal)
    } catch (err) {
      addNotification({ type: 'error', title: 'Submission failed', message: String(err) })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (!skipConfirm) {
      setSkipConfirm(true)
      return
    }
    try {
      await onSkip()
      setSkipConfirm(false)
    } catch {
      addNotification({ type: 'error', title: 'Could not skip task' })
    }
  }

  const isLoading = loading || submitting
  const overallScore = watch('overall_score')
  const prefChoice = watch('preference_choice')

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6">
      {/* Deadline countdown */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium',
          isExpired
            ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
            : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
        )}
      >
        <Clock className="h-4 w-4" />
        <span>Deadline: {countdown}</span>
      </div>

      {/* Response content */}
      <div className="space-y-2">
        <label className="text-sm font-semibold text-foreground">
          Your Response <span className="text-destructive">*</span>
        </label>
        {taskType === 'coding' ? (
          <div className="rounded-md border border-border overflow-hidden">
            <Controller
              name="content"
              control={control}
              render={({ field }) => (
                <Editor
                  height="250px"
                  defaultLanguage="python"
                  value={field.value}
                  onChange={(v) => field.onChange(v ?? '')}
                  onMount={(editor) => { editorRef.current = editor }}
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
              )}
            />
          </div>
        ) : (
          <textarea
            {...register('content')}
            rows={6}
            className={cn(
              'w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y',
              errors.content && 'border-destructive focus:ring-destructive'
            )}
            placeholder="Enter your response here..."
          />
        )}
        {errors.content && (
          <p className="text-xs text-destructive">{errors.content.message}</p>
        )}
      </div>

      {/* Overall score */}
      <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Overall Score</h3>
        <Controller
          name="overall_score"
          control={control}
          render={({ field }) => (
            <ScoreSlider
              label={`Score (${overallScore}/7)`}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <div className="flex justify-between text-xs text-muted-foreground pt-1">
          <span>1 - Very Poor</span>
          <span>4 - Acceptable</span>
          <span>7 - Excellent</span>
        </div>
      </div>

      {/* Preference comparison (only for that task type) */}
      {taskType === 'preference_comparison' && (
        <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
          <h3 className="text-sm font-semibold text-foreground">Preference</h3>
          <div className="flex gap-3">
            {(['A', 'B', 'Tie'] as const).map((choice) => (
              <label
                key={choice}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 cursor-pointer rounded-md border-2 py-2.5 text-sm font-medium transition-colors',
                  prefChoice === choice
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/50'
                )}
              >
                <Controller
                  name="preference_choice"
                  control={control}
                  render={({ field }) => (
                    <input
                      type="radio"
                      className="sr-only"
                      value={choice}
                      checked={field.value === choice}
                      onChange={() => field.onChange(choice)}
                    />
                  )}
                />
                {choice === 'Tie' ? 'Tie' : `Response ${choice}`}
              </label>
            ))}
          </div>
          {errors.preference_choice && (
            <p className="text-xs text-destructive">{errors.preference_choice.message}</p>
          )}
          <Controller
            name="preference_strength"
            control={control}
            render={({ field }) => (
              <ScoreSlider
                label="Preference Strength"
                value={field.value ?? 2}
                onChange={field.onChange}
                min={1}
                max={3}
              />
            )}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>1 - Slight</span>
            <span>2 - Moderate</span>
            <span>3 - Strong</span>
          </div>
        </div>
      )}

      {/* Dimension scores */}
      <div className="rounded-lg border border-border p-4 space-y-4 bg-muted/30">
        <h3 className="text-sm font-semibold text-foreground">Dimension Scores</h3>
        {dimensions.map((dim) => (
          <Controller
            key={dim}
            name={`dimension_scores.${dim}`}
            control={control}
            render={({ field }) => (
              <ScoreSlider
                label={dim}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        ))}
      </div>

      {/* Justification */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">
          Justification <span className="text-muted-foreground text-xs">(optional)</span>
        </label>
        <textarea
          {...register('justification')}
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
          placeholder="Explain your scores briefly..."
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isLoading || isExpired}
          className={cn(
            'flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold transition-colors',
            isLoading || isExpired
              ? 'bg-muted text-muted-foreground cursor-not-allowed'
              : 'bg-primary text-primary-foreground hover:bg-primary/90'
          )}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Submit
        </button>

        <button
          type="button"
          onClick={handleSkip}
          disabled={isLoading}
          className={cn(
            'flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium border transition-colors',
            skipConfirm
              ? 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
          )}
        >
          <SkipForward className="h-4 w-4" />
          {skipConfirm ? 'Confirm Skip' : 'Skip'}
        </button>

        {skipConfirm && (
          <button
            type="button"
            onClick={() => setSkipConfirm(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
