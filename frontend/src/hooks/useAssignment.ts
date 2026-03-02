import { useState, useCallback } from 'react'
import * as assignmentsApi from '@/api/assignments'
import { getErrorMessage } from '@/lib/utils'
import type { AssignmentWithTask, SubmitResponsePayload, SubmitRewardSignalPayload } from '@/types'

interface AssignmentState {
  currentAssignment: AssignmentWithTask | null
  loading: boolean
  error: string | null
  startTime: number | null
  noTasksAvailable: boolean
}

export function useAssignment() {
  const [state, setState] = useState<AssignmentState>({
    currentAssignment: null,
    loading: false,
    error: null,
    startTime: null,
    noTasksAvailable: false,
  })

  const getNextTask = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null, noTasksAvailable: false }))
    try {
      const assignment = await assignmentsApi.getNextAssignment()
      setState((prev) => ({
        ...prev,
        currentAssignment: assignment,
        startTime: Date.now(),
        loading: false,
      }))
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } }
      if (axiosError?.response?.status === 404) {
        setState((prev) => ({
          ...prev,
          loading: false,
          noTasksAvailable: true,
          currentAssignment: null,
        }))
      } else {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: getErrorMessage(err),
        }))
      }
    }
  }, [])

  const submitWork = useCallback(
    async (response: SubmitResponsePayload, rewardSignal: SubmitRewardSignalPayload) => {
      if (!state.currentAssignment) return
      setState((prev) => ({ ...prev, loading: true, error: null }))
      try {
        await assignmentsApi.submitAssignment(
          state.currentAssignment.id,
          response,
          rewardSignal
        )
        setState((prev) => ({
          ...prev,
          currentAssignment: null,
          startTime: null,
          loading: false,
        }))
      } catch (err) {
        const msg = getErrorMessage(err)
        setState((prev) => ({ ...prev, loading: false, error: msg }))
        throw new Error(msg)
      }
    },
    [state.currentAssignment]
  )

  const skip = useCallback(async () => {
    if (!state.currentAssignment) return
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      await assignmentsApi.skipAssignment(state.currentAssignment.id)
      setState((prev) => ({
        ...prev,
        currentAssignment: null,
        startTime: null,
        loading: false,
      }))
    } catch (err) {
      const msg = getErrorMessage(err)
      setState((prev) => ({ ...prev, loading: false, error: msg }))
      throw new Error(msg)
    }
  }, [state.currentAssignment])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }))
  }, [])

  return {
    currentAssignment: state.currentAssignment,
    loading: state.loading,
    error: state.error,
    startTime: state.startTime,
    noTasksAvailable: state.noTasksAvailable,
    getNextTask,
    submitWork,
    skip,
    clearError,
  }
}
