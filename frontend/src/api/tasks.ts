import { apiClient } from './client'
import type {
  Task,
  PaginatedResponse,
  TaskFilters,
  CreateTaskPayload,
  UpdateTaskPayload,
  TaskVersion,
} from '@/types'

export async function getTasks(params?: TaskFilters): Promise<PaginatedResponse<Task>> {
  const cleanParams: Record<string, string | number | boolean> = {}
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        cleanParams[key] = value as string | number | boolean
      }
    })
  }
  const response = await apiClient.get<PaginatedResponse<Task>>('/api/tasks', {
    params: cleanParams,
  })
  return response.data
}

export async function getTask(id: string): Promise<Task> {
  const response = await apiClient.get<Task>(`/api/tasks/${id}`)
  return response.data
}

export async function createTask(data: CreateTaskPayload): Promise<Task> {
  const response = await apiClient.post<Task>('/api/tasks', data)
  return response.data
}

export async function updateTask(id: string, data: UpdateTaskPayload): Promise<Task> {
  const response = await apiClient.put<Task>(`/api/tasks/${id}`, data)
  return response.data
}

export async function deleteTask(id: string): Promise<void> {
  await apiClient.delete(`/api/tasks/${id}`)
}

export async function bulkCreateTasks(tasks: CreateTaskPayload[]): Promise<Task[]> {
  const response = await apiClient.post<Task[]>('/api/tasks/bulk', { tasks })
  return response.data
}

export async function getTaskVersions(id: string): Promise<TaskVersion[]> {
  const response = await apiClient.get<TaskVersion[]>(`/api/tasks/${id}/versions`)
  return response.data
}
