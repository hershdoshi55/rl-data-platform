import { apiClient } from './client'
import type {
  AssignmentWithTask,
  SubmitResponsePayload,
  SubmitRewardSignalPayload,
} from '@/types'

export async function getNextAssignment(): Promise<AssignmentWithTask> {
  const response = await apiClient.post<AssignmentWithTask>('/api/assignments/next')
  return response.data
}

export async function submitAssignment(
  id: string,
  response: SubmitResponsePayload,
  reward_signal: SubmitRewardSignalPayload
): Promise<unknown> {
  const res = await apiClient.post(`/api/assignments/${id}/submit`, {
    response,
    reward_signal,
  })
  return res.data
}

export async function skipAssignment(id: string): Promise<void> {
  await apiClient.post(`/api/assignments/${id}/skip`)
}

export async function getAssignmentHistory(): Promise<AssignmentWithTask[]> {
  const response = await apiClient.get<AssignmentWithTask[]>('/api/assignments/history')
  return response.data
}
