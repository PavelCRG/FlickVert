import type { MessageKey } from '../i18n'

export const operationErrorMessages = {
  input: 'Input file unavailable',
  unsupported: 'Format not supported',
  engine: 'Required engine unavailable',
  access: 'Access denied',
  conversion: 'Could not convert',
  protected: 'Encrypted PDFs cannot be processed',
  write: 'Could not save output',
  cancelled: 'Cancelled',
} as const satisfies Record<string, MessageKey>

export type OperationErrorKind = keyof typeof operationErrorMessages

export function operationErrorKind(error: unknown): OperationErrorKind {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error)
  const match = message.match(/flickvert-error:(input|unsupported|engine|access|conversion|protected|write|cancelled)/)
  return (match?.[1] as OperationErrorKind | undefined) ?? 'conversion'
}
