import { useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (formatted: string, raw: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** Detects if a stored formatted BR value uses celular-style (5+ digits before hyphen). */
function isBrCelularStyle(formatted: string): boolean {
  const body = formatted.replace(/^\+55\s+\d{2}\s+/, '');
  return body.indexOf('-') >= 5;
}

function formatPhone(digits: string, forceCelularStyle = false): string {
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 4) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length <= 5) return `+55 ${ddd} ${rest}`;
    if (rest.length === 8 && !forceCelularStyle) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    const capped = rest.slice(0, 9);
    return `+55 ${ddd} ${capped.slice(0, 5)}-${capped.slice(5)}`;
  }
  if (digits.length <= 2) return `+${digits}`;
  return `+${digits}`;
}

/** Extrai apenas os dígitos de uma string. */
function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Campo de telefone com máscara brasileira (+55 XX XXXXX-XXXX) e suporte
 * a números internacionais (E.164, sem espaços, sem prefixo BR automático).
 * - Prefixa +55 quando o operador digita um DDD direto (sem +)
 * - Números internacionais com + explícito são preservados como E.164
 * - `onChange` devolve (formatado, bruto)
 * - Sem pré-preenchimento no foco: o campo vazio continua vazio.
 */
export function PhoneInput({ value, onChange, placeholder = '+55 11 99999-0000', className, disabled }: PhoneInputProps) {
  const displayValue = useMemo(() => {
    const digits = extractDigits(value);
    if (!digits) return '';
    const celStyle = digits.startsWith('55') && isBrCelularStyle(value);
    return formatPhone(digits, celStyle);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    let digits = extractDigits(rawValue);
    const hasPlus = rawValue.trimStart().startsWith('+');

    // Internacional com + explícito e código de país diferente de 55: E.164 puro.
    if (hasPlus && !digits.startsWith('55')) {
      if (digits.length > 15) digits = digits.slice(0, 15);
      onChange(formatPhone(digits), digits);
      return;
    }

    // Auto-prefixo 55 quando operador digita DDD direto (sem +).
    if (!hasPlus && digits.length >= 2 && !digits.startsWith('55')) {
      const possibleDDD = parseInt(digits.slice(0, 2), 10);
      if (possibleDDD >= 11 && possibleDDD <= 99) digits = '55' + digits;
    }

    if (digits.startsWith('55') && digits.length > 13) digits = digits.slice(0, 13);

    const celStyle = hasPlus && digits.startsWith('55') && isBrCelularStyle(rawValue);
    onChange(formatPhone(digits, celStyle), digits);
  }, [onChange]);

  return (
    <Input
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      placeholder={placeholder}
      value={displayValue}
      onChange={handleChange}
      disabled={disabled}
      className={cn('tracking-wide', className)}
    />
  );
}
