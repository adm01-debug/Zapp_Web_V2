// CV-111–112: Privacy Guard hook
// Detects PII in copilot suggestions and sanitizes them before display

export type PrivacyViolationType =
  | 'cpf'
  | 'rg'
  | 'credit_card'
  | 'bank_account'
  | 'email_in_wrong_context'
  | 'phone_in_text';

export interface PrivacyViolation {
  type: PrivacyViolationType;
  detected: string;
  redacted: string;
}

export interface PrivacyGuardResult {
  hasViolation: boolean;
  violations: PrivacyViolation[];
  sanitizedText: string;
}

const CPF_PATTERN = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g;
const RG_PATTERN = /\d{1,2}\.?\d{3}\.?\d{3}-?[\dxX]/g;
const CREDIT_CARD_PATTERN = /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g;
const BANK_ACCOUNT_PATTERN = /ag\w*\s*\d+.*cc?\s*\d+/gi;

function checkPattern(
  text: string,
  pattern: RegExp,
  type: PrivacyViolationType,
  redactLabel: string
): { violations: PrivacyViolation[]; sanitized: string } {
  const violations: PrivacyViolation[] = [];
  let sanitized = text;
  const regex = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    violations.push({
      type,
      detected: match[0],
      redacted: redactLabel,
    });
  }

  if (violations.length > 0) {
    sanitized = sanitized.replace(new RegExp(pattern.source, pattern.flags), redactLabel);
  }

  return { violations, sanitized };
}

export function usePrivacyGuard() {
  const checkText = (text: string): PrivacyGuardResult => {
    const allViolations: PrivacyViolation[] = [];
    let sanitizedText = text;

    const cpfResult = checkPattern(sanitizedText, CPF_PATTERN, 'cpf', '[CPF omitido]');
    allViolations.push(...cpfResult.violations);
    sanitizedText = cpfResult.sanitized;

    const rgResult = checkPattern(sanitizedText, RG_PATTERN, 'rg', '[RG omitido]');
    allViolations.push(...rgResult.violations);
    sanitizedText = rgResult.sanitized;

    const ccResult = checkPattern(sanitizedText, CREDIT_CARD_PATTERN, 'credit_card', '[cartão omitido]');
    allViolations.push(...ccResult.violations);
    sanitizedText = ccResult.sanitized;

    const bankResult = checkPattern(sanitizedText, BANK_ACCOUNT_PATTERN, 'bank_account', '[dados bancários omitidos]');
    allViolations.push(...bankResult.violations);
    sanitizedText = bankResult.sanitized;

    return {
      hasViolation: allViolations.length > 0,
      violations: allViolations,
      sanitizedText,
    };
  };

  return { checkText };
}
