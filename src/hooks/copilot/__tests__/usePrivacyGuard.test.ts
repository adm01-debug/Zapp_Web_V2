// Tests for CV-111–118 guardrail hooks
import { describe, it, expect } from 'vitest';
import { usePrivacyGuard } from '../usePrivacyGuard';
import { useToneGuard } from '../useToneGuard';
import { useSuggestionFilter } from '../useSuggestionFilter';
import { useLGPDConsent } from '../useLGPDConsent';

describe('usePrivacyGuard', () => {
  it('detects and redacts CPF', () => {
    const { checkText } = usePrivacyGuard();
    const result = checkText('Meu CPF é 123.456.789-01');
    expect(result.hasViolation).toBe(true);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].type).toBe('cpf');
    expect(result.violations[0].detected).toBe('123.456.789-01');
    expect(result.sanitizedText).toContain('[CPF omitido]');
    expect(result.sanitizedText).not.toContain('123.456.789-01');
  });

  it('detects CPF without formatting', () => {
    const { checkText } = usePrivacyGuard();
    const result = checkText('CPF 12345678901');
    expect(result.hasViolation).toBe(true);
    expect(result.violations[0].type).toBe('cpf');
  });

  it('returns no violation for clean text', () => {
    const { checkText } = usePrivacyGuard();
    const result = checkText('Olá, como posso ajudar?');
    expect(result.hasViolation).toBe(false);
    expect(result.violations).toHaveLength(0);
    expect(result.sanitizedText).toBe('Olá, como posso ajudar?');
  });

  it('detects credit card number', () => {
    const { checkText } = usePrivacyGuard();
    const result = checkText('Meu cartão é 1234 5678 9012 3456');
    expect(result.hasViolation).toBe(true);
    const ccViolation = result.violations.find((v) => v.type === 'credit_card');
    expect(ccViolation).toBeDefined();
    expect(result.sanitizedText).toContain('[cartão omitido]');
  });
});

describe('useToneGuard', () => {
  it('detects false urgency with high severity', () => {
    const { checkTone } = useToneGuard();
    const result = checkTone('Última chance, só hoje!');
    expect(result.hasIssues).toBe(true);
    const urgencyIssue = result.issues.find((i) => i.type === 'false_urgency');
    expect(urgencyIssue).toBeDefined();
    expect(urgencyIssue!.severity).toBe('high');
  });

  it('detects negative framing and provides improved suggestion', () => {
    const { checkTone } = useToneGuard();
    const result = checkTone('Não temos esse produto disponível.');
    expect(result.hasIssues).toBe(true);
    const negIssue = result.issues.find((i) => i.type === 'negative_framing');
    expect(negIssue).toBeDefined();
    expect(negIssue!.severity).toBe('medium');
    expect(result.improvedSuggestion).not.toBeNull();
    expect(result.improvedSuggestion).not.toMatch(/^não/i);
  });

  it('flags too casual tone', () => {
    const { checkTone } = useToneGuard();
    const result = checkTone('Boa tarde kkk como posso ajudar?');
    expect(result.hasIssues).toBe(true);
    expect(result.issues.find((i) => i.type === 'too_casual')).toBeDefined();
  });

  it('returns no issues for professional text', () => {
    const { checkTone } = useToneGuard();
    const result = checkTone('Olá! Podemos oferecer um desconto especial nessa condição.');
    expect(result.hasIssues).toBe(false);
  });
});

describe('useSuggestionFilter', () => {
  it('blocks suggestion containing PII', () => {
    const { filterSuggestion } = useSuggestionFilter();
    const result = filterSuggestion('Seu CPF 123.456.789-01 foi verificado.');
    expect(result.blocked).toBe(true);
    expect(result.blockedReasons).toContain('PII detectado');
  });

  it('blocks suggestion with high-severity tone issue', () => {
    const { filterSuggestion } = useSuggestionFilter();
    const result = filterSuggestion('Última chance, decida agora!');
    expect(result.blocked).toBe(true);
  });

  it('modifies but allows suggestion with medium tone issue', () => {
    const { filterSuggestion } = useSuggestionFilter();
    const result = filterSuggestion('Não temos esse produto.');
    expect(result.blocked).toBe(false);
    expect(result.wasModified).toBe(true);
  });

  it('passes clean suggestion unchanged', () => {
    const { filterSuggestion } = useSuggestionFilter();
    const result = filterSuggestion('Temos ótimas opções para você!');
    expect(result.blocked).toBe(false);
    expect(result.wasModified).toBe(false);
    expect(result.filtered).toBe('Temos ótimas opções para você!');
  });
});

describe('useLGPDConsent', () => {
  it('returns no consent for empty conversation', () => {
    const { status, suggestConsentMessage } = useLGPDConsent('contact-1', []);
    expect(status.hasConsent).toBe(false);
    expect(status.consentType).toBe('none');
    expect(suggestConsentMessage).toBe(false);
  });

  it('suggests consent message when no consent and >3 messages', () => {
    const messages = Array.from({ length: 4 }, (_, i) => ({ type: 'text', created_at: new Date().toISOString() }));
    const { suggestConsentMessage } = useLGPDConsent('contact-1', messages);
    expect(suggestConsentMessage).toBe(true);
  });

  it('detects implicit consent from marketing_reply', () => {
    const messages = [
      { type: 'marketing_reply', created_at: new Date().toISOString() },
    ];
    const { status } = useLGPDConsent('contact-1', messages);
    expect(status.hasConsent).toBe(true);
    expect(status.consentType).toBe('implicit');
  });

  it('respects explicit consent record', () => {
    const { status } = useLGPDConsent('contact-1', [], { date: new Date().toISOString() });
    expect(status.hasConsent).toBe(true);
    expect(status.consentType).toBe('explicit');
    expect(status.requiresRenewal).toBe(false);
  });

  it('flags expired explicit consent as requiring renewal', () => {
    const oldDate = new Date();
    oldDate.setFullYear(oldDate.getFullYear() - 2);
    const { status } = useLGPDConsent('contact-1', [], { date: oldDate.toISOString() });
    expect(status.requiresRenewal).toBe(true);
    expect(status.hasConsent).toBe(false);
  });
});
