import { useState, useEffect, useCallback } from 'react'
import * as metricsApi from '@/api/metrics'
import type { DashboardStats, AnnotatorStats } from '@/types'
import { getErrorMessage } from '@/lib/utils'

export function useDashboard(autoRefreshMs?: number) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setError(null)
    try {
      const data = await metricsApi.getDashboard()
      setStats(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
    if (autoRefreshMs && autoRefreshMs > 0) {
      const interval = setInterval(fetch, autoRefreshMs)
      return () => clearInterval(interval)
    }
  }, [fetch, autoRefreshMs])

  return { stats, loading, error, refresh: fetch }
}

export function useAnnotators() {
  const [annotators, setAnnotators] = useState<AnnotatorStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await metricsApi.getAnnotators()
      setAnnotators(data)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { annotators, loading, error, refresh: fetch }
}

export function useAnnotatorStats(id: string | null) {
  const [stats, setStats] = useState<AnnotatorStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    metricsApi
      .getAnnotator(id)
      .then(setStats)
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [id])

  return { stats, loading, error }
}
