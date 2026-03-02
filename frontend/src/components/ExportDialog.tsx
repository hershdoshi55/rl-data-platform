import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X, Download, Loader2 } from 'lucide-react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { cn } from '@/lib/utils'
import { createExportJob } from '@/api/exports'
import { useUiStore } from '@/stores/uiStore'
import type { ExportFormat, TaskType } from '@/types'

const schema = z.object({
  output_format: z.enum(['jsonl', 'preference_pairs', 'huggingface', 'csv']),
  task_type: z.string().optional(),
  quality_threshold: z.number().min(0).max(7).default(0),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; description: string }[] = [
  { value: 'jsonl', label: 'JSONL', description: 'JSON Lines format, one record per line' },
  { value: 'preference_pairs', label: 'Preference Pairs', description: 'Paired comparison format for DPO training' },
  { value: 'huggingface', label: 'HuggingFace', description: 'Compatible with HuggingFace datasets library' },
  { value: 'csv', label: 'CSV', description: 'Comma-separated values for spreadsheet tools' },
]

const TASK_TYPE_OPTIONS: { value: TaskType | ''; label: string }[] = [
  { value: '', label: 'All Types' },
  { value: 'coding', label: 'Coding' },
  { value: 'reasoning', label: 'Reasoning' },
  { value: 'open_ended', label: 'Open Ended' },
  { value: 'preference_comparison', label: 'Preference Comparison' },
  { value: 'safety_evaluation', label: 'Safety Evaluation' },
]

export function ExportDialog({ open, onOpenChange, onCreated }: ExportDialogProps) {
  const [loading, setLoading] = useState(false)
  const { addNotification } = useUiStore()

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    formState: {},
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      output_format: 'jsonl',
      task_type: '',
      quality_threshold: 0,
      start_date: '',
      end_date: '',
    },
  })

  const selectedFormat = watch('output_format')
  const qualityThreshold = watch('quality_threshold')

  const onSubmit = async (values: FormValues) => {
    setLoading(true)
    try {
      const filters: Record<string, string> = {}
      if (values.task_type) filters['task_type'] = values.task_type
      if (values.start_date) filters['start_date'] = values.start_date
      if (values.end_date) filters['end_date'] = values.end_date

      await createExportJob({
        output_format: values.output_format,
        filters: Object.keys(filters).length > 0 ? filters : undefined,
        quality_threshold: values.quality_threshold > 0 ? values.quality_threshold : undefined,
      })

      addNotification({
        type: 'success',
        title: 'Export job created',
        message: 'Your export is being processed. You can track its progress on the exports page.',
      })
      reset()
      onOpenChange(false)
      onCreated?.()
    } catch (err) {
      addNotification({
        type: 'error',
        title: 'Failed to create export',
        message: String(err),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg rounded-lg border border-border bg-card shadow-xl p-6 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                New Export Job
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground mt-1">
                Configure and start a new data export
              </Dialog.Description>
            </div>
            <Dialog.Close className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Format selector */}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-foreground">
                Output Format <span className="text-destructive">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {FORMAT_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className={cn(
                      'cursor-pointer rounded-md border-2 p-3 transition-colors',
                      selectedFormat === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <Controller
                      name="output_format"
                      control={control}
                      render={({ field }) => (
                        <input
                          type="radio"
                          className="sr-only"
                          value={opt.value}
                          checked={field.value === opt.value}
                          onChange={() => field.onChange(opt.value)}
                        />
                      )}
                    />
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </label>
                ))}
              </div>
            </div>

            {/* Task type filter */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Task Type Filter</label>
              <select
                {...register('task_type')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {TASK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Quality threshold */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">
                  Minimum Quality Threshold
                </label>
                <span className="text-sm font-bold text-primary tabular-nums">
                  {qualityThreshold === 0 ? 'None' : qualityThreshold}
                </span>
              </div>
              <Controller
                name="quality_threshold"
                control={control}
                render={({ field }) => (
                  <input
                    type="range"
                    min={0}
                    max={7}
                    step={0.5}
                    value={field.value}
                    onChange={(e) => field.onChange(Number(e.target.value))}
                    className="w-full h-2 accent-primary cursor-pointer"
                  />
                )}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>No filter</span>
                <span>7.0 - Max</span>
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">Start Date</label>
                <input
                  type="date"
                  {...register('start_date')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">End Date</label>
                <input
                  type="date"
                  {...register('end_date')}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors',
                  loading
                    ? 'bg-muted text-muted-foreground cursor-not-allowed'
                    : 'bg-primary text-primary-foreground hover:bg-primary/90'
                )}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Create Export
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
