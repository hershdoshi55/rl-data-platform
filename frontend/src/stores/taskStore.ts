import { create } from 'zustand'
import type { Task, TaskFilters, PaginatedResponse } from '@/types'

interface TaskState {
  tasks: Task[]
  total: number
  page: number
  pageSize: number
  filters: TaskFilters
  loading: boolean
  error: string | null
  selectedTask: Task | null

  setTasks: (data: PaginatedResponse<Task>) => void
  setFilters: (filters: Partial<TaskFilters>) => void
  resetFilters: () => void
  setPage: (page: number) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setSelectedTask: (task: Task | null) => void
  updateTaskInList: (task: Task) => void
  removeTaskFromList: (id: string) => void
  addTaskToList: (task: Task) => void
}

const defaultFilters: TaskFilters = {
  project_id: undefined,
  task_type: undefined,
  status: undefined,
  search: undefined,
  page: 1,
  page_size: 20,
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  total: 0,
  page: 1,
  pageSize: 20,
  filters: defaultFilters,
  loading: false,
  error: null,
  selectedTask: null,

  setTasks: (data) =>
    set({
      tasks: data.items,
      total: data.total,
      page: data.page,
      pageSize: data.page_size,
    }),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters, page: 1 },
    })),

  resetFilters: () => set({ filters: defaultFilters }),

  setPage: (page) =>
    set((state) => ({
      filters: { ...state.filters, page },
    })),

  setLoading: (loading) => set({ loading }),

  setError: (error) => set({ error }),

  setSelectedTask: (task) => set({ selectedTask: task }),

  updateTaskInList: (updatedTask) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
      selectedTask: state.selectedTask?.id === updatedTask.id ? updatedTask : state.selectedTask,
    })),

  removeTaskFromList: (id) =>
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== id),
      total: state.total - 1,
    })),

  addTaskToList: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
      total: state.total + 1,
    })),
}))
