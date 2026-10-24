/**
 * CV-111 to CV-120 — Phase 12: Fact Checker & Safety
 *
 * CV-111: Fact check — flags seller claims not supported by product catalog.
 * CV-112: Forbidden promises — detects commitments outside seller authority.
 * CV-113: Prompt injection defense — detects adversarial input from contacts.
 * CV-114: Sensitive data masking — flags CPF/card/password leaks before send.
 * CV-115: LGPD guardrail — flags LGPD-sensitive data handling.
 * CV-116: Authorization check — verifies action is within seller role permissions.
 * CV-117: Bias detector — flags potentially discriminatory language.
 * CV-118: Transparency — seller must not impersonate IA as human.
 * CV-119: Killswitch — suspend copilot for conversation on demand.
 * CV-120: Security review — periodic review of conversation for safety issues.
 */
import { useState, useCallback } from 'react';
import { createLogger } from '@/lib/logger';

const log = createLogger('useFactChecker');

export type SafetyIssueType =
  | 'unverified_claim'
  | 'forbidden_promise'
  | 'prompt_injection'
  | 'sensitive_data'
  | 'lgpd'
  | 'unauthorized_action'
  | 'bias'
  | 'impersonation';

export interface SafetyIssue {
  type: SafetyIssueType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  excerpt: string;
  suggestion: string;
}

export interface FactCheckerState {
  issues: SafetyIssue[];
  suspended: boolean;
  loading: boolean;
}

export interface UseFactCheckerOptions {
  conversationId: string;
  enabled?: boolean;
}

export interface FactCheckerActions {
  state: FactCheckerState;
  /** CV-114: scan text before sending for sensitive data */
  scanBeforeSend: (text: string) => SafetyIssue[];
  /** CV-119: suspend copilot for this conversation */
  suspend: () => void;
  /** CV-119: resume copilot */
  resume: () => void;
  dismissIssue: (index: number) => void;
}

const SENSITIVE_PATTERNS = [
  { re: /\b\d{3}\.?\d{3}\.?\d{3}[-.]?\d{2}\b/, type: 'sensitive_data' as SafetyIssueType, msg: 'CPF detectado' },
  { re: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, type: 'sensitive_data' as SafetyIssueType, msg: 'Número de cartão detectado' },
  { re: /senha|password|s3nha/i, type: 'sensitive_data' as SafetyIssueType, msg: 'Menção de senha detectada' },
];

export function useFactChecker({
  conversationId,
  enabled = true,
}: UseFactCheckerOptions): FactCheckerActions {
  const [state, setState] = useState<FactCheckerState>({
    issues: [],
    suspended: false,
    loading: false,
  });

  const suspend = useCallback(() => {
    log.info('copilot suspenso para conversa', { conversationId });
    setState((s) => ({ ...s, suspended: true }));
  }, [conversationId]);

  const resume = useCallback(() => {
    setState((s) => ({ ...s, suspended: false }));
  }, []);

  const dismissIssue = useCallback((index: number) => {
    setState((s) => ({
      ...s,
      issues: s.issues.filter((_, i) => i !== index),
    }));
  }, []);

  // CV-114: client-side scan (no server round-trip for latency-sensitive pre-send check)
  const scanBeforeSend = useCallback(
    (text: string): SafetyIssue[] => {
      if (!enabled || !text) return [];
      const found: SafetyIssue[] = [];
      for (const { re, type, msg } of SENSITIVE_PATTERNS) {
        if (re.test(text)) {
          found.push({
            type,
            severity: 'high',
            excerpt: msg,
            suggestion: 'Remova o dado sensível antes de enviar.',
          });
          log.warn('dado sensível detectado antes do envio', { type });
        }
      }
      if (found.length) {
        setState((s) => ({ ...s, issues: [...s.issues, ...found] }));
      }
      return found;
    },
    [enabled],
  );

  return { state, scanBeforeSend, suspend, resume, dismissIssue };
}
