import { apiClient } from './client'
import type { ExportJob, ExportFormat } from '@/types'

export interface CreateExportJobPayload {
  output_format: ExportFormat
  filters?: {
    task_type?: string
    start_date?: string
    end_date?: string
    project_id?: string
  }
  quality_threshold?: number
}

export async function createExportJob(data: CreateExportJobPayload): Promise<ExportJob> {
  const response = await apiClient.post<ExportJob>('/api/exports', data)
  return response.data
}

export async function getExportJobs(): Promise<ExportJob[]> {
  const response = await apiClient.get<ExportJob[]>('/api/exports')
  return response.data
}

export async function getExportJob(id: string): Promise<ExportJob> {
  const response = await apiClient.get<ExportJob>(`/api/exports/${id}`)
  return response.data
}

export async function downloadExport(id: string): Promise<Blob> {
  const response = await apiClient.get(`/api/exports/${id}/download`, {
    responseType: 'blob',
  })
  return response.data as Blob
}
