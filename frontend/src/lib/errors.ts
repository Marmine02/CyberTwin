import type { TFunction } from 'i18next'
import { ApiError } from '../api/client'

/** Specific, translated text for any error thrown by the API layer. */
export function errorText(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) return t(err.i18nCode, err.params)
  return t('error.network')
}
