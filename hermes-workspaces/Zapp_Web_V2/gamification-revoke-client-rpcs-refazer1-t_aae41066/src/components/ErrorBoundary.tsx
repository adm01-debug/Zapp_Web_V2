/**
 * @deprecated Import directly from '@/components/errors/ErrorBoundary' instead.
 *
 * This file is a compatibility shim. The canonical ErrorBoundary lives at
 * src/components/errors/ErrorBoundary.tsx. Any new code should import from there.
 *
 * Re-exporting everything so existing imports of '@/components/ErrorBoundary'
 * continue to work without breaking changes.
 */
export {
  ErrorBoundary,
  withErrorBoundary,
  ErrorFallback,
} from './errors/ErrorBoundary';
