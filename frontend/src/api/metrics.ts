import { apiClient } from './client'
import type { DashboardStats, AnnotatorStats, TaskMetrics } from '@/types'

export async function getDashboard(): Promise<DashboardStats> {
  const response = await apiClient.get<DashboardStats>('/api/metrics/dashboard')
  return response.data
}

export async function getAnnotators(): Promise<AnnotatorStats[]> {
  const response = await apiClient.get<AnnotatorStats[]>('/api/metrics/annotators')
  return response.data
}

export async function getAnnotator(id: string): Promise<AnnotatorStats> {
  const response = await apiClient.get<AnnotatorStats>(`/api/metrics/annotators/${id}`)
  return response.data
}

export async function getTaskMetrics(id: string): Promise<TaskMetrics> {
  const response = await apiClient.get<TaskMetrics>(`/api/metrics/tasks/${id}`)
  return response.data
}

export interface AdminUser {
  id: string
  email: string
  display_name?: string
  role: string
  is_active: boolean
  created_at: string
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const response = await apiClient.get<AdminUser[]>('/api/admin/users')
  return response.data
}

export async function updateUserRole(id: string, role: string): Promise<AdminUser> {
  const response = await apiClient.put<AdminUser>(`/api/admin/users/${id}/role`, { role })
  return response.data
}

export async function updateUserStatus(id: string, is_active: boolean): Promise<AdminUser> {
  const response = await apiClient.put<AdminUser>(`/api/admin/users/${id}/status`, { is_active })
  return response.data
}

export async function getAdminHealth(): Promise<Record<string, unknown>> {
  const response = await apiClient.get<Record<string, unknown>>('/api/admin/health')
  return response.data
}
