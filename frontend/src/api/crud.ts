import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { errorText } from '../lib/errors'
import { noteText } from '../lib/notes'
import { useApp } from '../store/app'
import { toast } from '../store/toast'
import { api } from './client'
import { useInvalidateAll } from './hooks'
import type { RevisionInfo } from './types'

export type CollectionPath = 'assets' | 'connections' | 'principals' | 'firewall-rules' | 'vulnerabilities'

export interface MutationResult { revision: RevisionInfo; affected?: Record<string, string[]> }

/** Create/update/delete on the head revision. Every success creates a new revision. */
export function useCrud(path: CollectionPath) {
  const { t } = useTranslation()
  const twinId = useApp((s) => s.twinId)
  const setRevision = useApp((s) => s.setRevision)
  const invalidate = useInvalidateAll()
  const onSuccess = (r: MutationResult) => {
    setRevision(null)
    void invalidate()
    toast.success(t('ui.crud.saved', { n: r.revision.number }), noteText(t, r.revision.note))
  }
  const onError = (e: unknown) => toast.error(t('ui.crud.failed'), errorText(t, e))
  const create = useMutation({
    mutationFn: (item: object) => api.post<MutationResult>(`/twins/${twinId}/${path}`, item),
    onSuccess, onError,
  })
  const update = useMutation({
    mutationFn: ({ id, item }: { id: string; item: object }) => api.put<MutationResult>(`/twins/${twinId}/${path}/${encodeURIComponent(id)}`, item),
    onSuccess, onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => api.del<MutationResult>(`/twins/${twinId}/${path}/${encodeURIComponent(id)}`),
    onSuccess, onError,
  })
  return { create, update, remove }
}

export function useSavePositions() {
  const twinId = useApp((s) => s.twinId)
  return useMutation({
    mutationFn: (positions: Record<string, { x: number; y: number }>) => api.put(`/twins/${twinId}/positions`, { positions }),
  })
}
