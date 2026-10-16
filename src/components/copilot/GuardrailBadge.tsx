// CV-119–120: GuardrailBadge component
// Displays warning badges for privacy, tone, and LGPD issues

import React from 'react';
import type { PrivacyGuardResult } from '../../hooks/copilot/usePrivacyGuard';
import type { ToneGuardResult } from '../../hooks/copilot/useToneGuard';
import type { LGPDStatus } from '../../hooks/copilot/useLGPDConsent';

const LGPD_CONSENT_TEMPLATE =
  'Olá! Para continuar nosso atendimento de forma transparente, precisamos do seu consentimento ' +
  'para tratar seus dados pessoais conforme a Lei Geral de Proteção de Dados (LGPD). ' +
  'Você concorda? Responda "Sim" para confirmar.';

export interface GuardrailBadgeProps {
  privacyResult: PrivacyGuardResult | null;
  toneResult: ToneGuardResult | null;
  lgpdStatus: LGPDStatus | null;
  onDismiss?: () => void;
}

export function GuardrailBadge({
  privacyResult,
  toneResult,
  lgpdStatus,
  onDismiss,
}: GuardrailBadgeProps) {
  const showPrivacy = privacyResult?.hasViolation === true;
  const showTone = toneResult?.hasIssues === true;
  // Show LGPD badge only when consent is missing (suggestConsentMessage is
  // handled by the parent; here we use the raw status)
  const showLgpd = lgpdStatus !== null && !lgpdStatus.hasConsent;

  if (!showPrivacy && !showTone && !showLgpd) return null;

  const handleCopyLgpd = () => {
    void navigator.clipboard.writeText(LGPD_CONSENT_TEMPLATE);
  };

  return (
    <div className="flex flex-col gap-1.5 p-2" role="status" aria-live="polite">
      {/* Privacy badge — red */}
      {showPrivacy && (
        <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {/* Shield icon (inline SVG) */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span>Informação sensível detectada — texto sanitizado</span>
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="ml-auto text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200"
              aria-label="Dispensar aviso de privacidade"
            >
              ✕
            </button>
          )}
        </div>
      )}

      {/* Tone badge — orange */}
      {showTone && (
        <div className="flex items-start gap-2 rounded-md bg-orange-50 border border-orange-200 px-3 py-2 text-sm text-orange-800 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-200">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {/* Warning triangle icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <ul className="flex flex-col gap-0.5">
            {toneResult!.issues.map((issue, idx) => (
              <li key={idx}>{issue.suggestion}</li>
            ))}
          </ul>
        </div>
      )}

      {/* LGPD badge — blue */}
      {showLgpd && (
        <div className="flex items-start gap-2 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200">
          <span className="mt-0.5 shrink-0" aria-hidden="true">
            {/* Info icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </span>
          <span className="flex-1">Solicitar consentimento LGPD</span>
          <button
            onClick={handleCopyLgpd}
            className="ml-2 shrink-0 rounded border border-blue-300 px-2 py-0.5 text-xs hover:bg-blue-100 dark:border-blue-700 dark:hover:bg-blue-900"
            aria-label="Copiar mensagem de consentimento LGPD"
          >
            Copiar
          </button>
        </div>
      )}
    </div>
  );
}
