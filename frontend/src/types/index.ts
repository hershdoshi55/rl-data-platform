export interface User {
  id: string
  email: string
  role: 'admin' | 'researcher' | 'annotator' | 'pending'
  display_name?: string
  skills?: Record<string, unknown>
  is_active: boolean
  created_at: string
}

export interface Project {
  id: string
  name: string
  description?: string
  created_by: string
  config?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type TaskType =
  | 'coding'
  | 'reasoning'
  | 'open_ended'
  | 'preference_comparison'
  | 'safety_evaluation'

export type TaskStatus = 'draft' | 'queued' | 'in_progress' | 'fully_annotated' | 'archived'

export interface Task {
  id: string
  project_id?: string
  task_type: TaskType
  prompt: string
  reference_solution?: string
  difficulty: number
  required_annotations: number
  completed_annotations: number
  status: TaskStatus
  is_gold: boolean
  version: number
  created_by: string
  created_at: string
  metadata?: Record<string, unknown>
}

export type AssignmentStatus =
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'expired'
  | 'skipped'

export interface Assignment {
  id: string
  task_id: string
  annotator_id: string
  status: AssignmentStatus
  assigned_at: string
  deadline: string
  started_at?: string
  completed_at?: string
  time_spent_seconds?: number
}

export interface AssignmentWithTask extends Assignment {
  task: Task
}

export interface RewardSignal {
  id: string
  response_id: string
  task_id: string
  overall_score: number
  preference_choice?: string
  preference_strength?: number
  dimension_scores?: Record<string, number>
  justification?: string
  created_at: string
}

export type ExportFormat = 'jsonl' | 'preference_pairs' | 'huggingface' | 'csv'
export type ExportStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface ExportJob {
  id: string
  created_by: string
  status: ExportStatus
  output_format: ExportFormat
  filters?: Record<string, unknown>
  quality_threshold?: number
  file_path?: string
  file_size_bytes?: number
  record_count?: number
  error_message?: string
  created_at: string
}

export interface DashboardStats {
  total_tasks: number
  tasks_by_status: Record<string, number>
  total_annotations: number
  active_annotators: number
  recent_activity?: RecentActivity[]
  tasks_created_today?: number
  annotations_today?: number
}

export interface RecentActivity {
  id: string
  action: string
  user: string
  timestamp: string
  details?: string
}

export interface AnnotatorStats {
  id: string
  display_name?: string
  email: string
  total_annotations: number
  average_score: number
  tasks_completed: number
  average_time_seconds: number
  last_active?: string
}

export interface TaskMetrics {
  task_id: string
  annotation_count: number
  average_score: number
  score_variance: number
  annotator_agreement: number
  dimension_averages?: Record<string, number>
  annotations: AnnotationDetail[]
}

export interface AnnotationDetail {
  id: string
  annotator_id: string
  annotator_name?: string
  overall_score: number
  dimension_scores?: Record<string, number>
  justification?: string
  submitted_at: string
  time_spent_seconds?: number
}

export interface TaskVersion {
  version: number
  prompt: string
  reference_solution?: string
  difficulty: number
  created_at: string
  created_by: string
  change_summary?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export interface ApiError {
  detail: string | { msg: string; type: string }[]
  status?: number
}

export interface TaskFilters {
  project_id?: string
  task_type?: TaskType | ''
  status?: TaskStatus | ''
  difficulty?: number
  search?: string
  page?: number
  page_size?: number
}

export interface CreateTaskPayload {
  task_type: TaskType
  prompt: string
  reference_solution?: string
  difficulty: number
  required_annotations: number
  project_id?: string
  auto_queue?: boolean
  metadata?: Record<string, unknown>
}

export interface UpdateTaskPayload {
  task_type?: TaskType
  prompt?: string
  reference_solution?: string
  difficulty?: number
  required_annotations?: number
  status?: TaskStatus
  metadata?: Record<string, unknown>
}

export interface SubmitResponsePayload {
  content: string
  content_type: 'text' | 'code' | 'markdown'
}

export interface SubmitRewardSignalPayload {
  overall_score: number
  preference_choice?: 'A' | 'B' | 'Tie'
  preference_strength?: number
  dimension_scores?: Record<string, number>
  justification?: string
}

export type UserRole = 'admin' | 'researcher' | 'annotator' | 'pending'
