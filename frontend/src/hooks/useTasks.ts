import { useCallback } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import * as tasksApi from '@/api/tasks'
import { getErrorMessage } from '@/lib/utils'
import type { CreateTaskPayload, UpdateTaskPayload, TaskFilters } from '@/types'

export function useTasks() {
  const {
    tasks,
    total,
    page,
    pageSize,
    filters,
    loading,
    error,
    setTasks,
    setFilters,
    resetFilters,
    setPage,
    setLoading,
    setError,
    updateTaskInList,
    removeTaskFromList,
    addTaskToList,
  } = useTaskStore()

  const fetchTasks = useCallback(async (overrideFilters?: TaskFilters) => {
    setLoading(true)
    setError(null)
    try {
      const params = overrideFilters ?? useTaskStore.getState().filters
      const data = await tasksApi.getTasks(params)
      setTasks(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, setTasks])

  const createTask = useCallback(async (data: CreateTaskPayload) => {
    setLoading(true)
    setError(null)
    try {
      const task = await tasksApi.createTask(data)
      addTaskToList(task)
      return task
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
      throw new Error(msg)
    } finally {
      setLoading(false)
    }
  }, [setLoading, setError, addTaskToList])

  const updateTask = useCallback(async (id: string, data: UpdateTaskPayload) => {
    setError(null)
    try {
      const task = await tasksApi.updateTask(id, data)
      updateTaskInList(task)
      return task
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [setError, updateTaskInList])

  const deleteTask = useCallback(async (id: string) => {
    setError(null)
    try {
      await tasksApi.deleteTask(id)
      removeTaskFromList(id)
    } catch (err) {
      const msg = getErrorMessage(err)
      setError(msg)
      throw new Error(msg)
    }
  }, [setError, removeTaskFromList])

  const applyFilters = useCallback((newFilters: Partial<TaskFilters>) => {
    setFilters(newFilters)
    const updatedFilters = { ...useTaskStore.getState().filters, ...newFilters, page: 1 }
    fetchTasks(updatedFilters)
  }, [setFilters, fetchTasks])

  const goToPage = useCallback((newPage: number) => {
    setPage(newPage)
    const updatedFilters = { ...useTaskStore.getState().filters, page: newPage }
    fetchTasks(updatedFilters)
  }, [setPage, fetchTasks])

  return {
    tasks,
    total,
    page,
    pageSize,
    filters,
    loading,
    error,
    fetchTasks,
    createTask,
    updateTask,
    deleteTask,
    applyFilters,
    goToPage,
    resetFilters,
  }
}
