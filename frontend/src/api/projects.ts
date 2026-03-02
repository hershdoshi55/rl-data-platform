import { apiClient } from './client'
import type { Project } from '@/types'

export interface CreateProjectPayload {
  name: string
  description?: string
  config?: Record<string, unknown>
}

export interface UpdateProjectPayload {
  name?: string
  description?: string
  config?: Record<string, unknown>
}

export async function getProjects(): Promise<Project[]> {
  const response = await apiClient.get<Project[]>('/api/projects')
  return response.data
}

export async function getProject(id: string): Promise<Project> {
  const response = await apiClient.get<Project>(`/api/projects/${id}`)
  return response.data
}

export async function createProject(data: CreateProjectPayload): Promise<Project> {
  const response = await apiClient.post<Project>('/api/projects', data)
  return response.data
}

export async function updateProject(id: string, data: UpdateProjectPayload): Promise<Project> {
  const response = await apiClient.put<Project>(`/api/projects/${id}`, data)
  return response.data
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/api/projects/${id}`)
}
