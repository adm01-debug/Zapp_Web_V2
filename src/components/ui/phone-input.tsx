import { useCallback, useMemo, type ChangeEvent } from 'react';
import { Input } from '@/components/ui/input';
import { cleanPhone } from '@/lib/calls/phone';
import { cn } from '@/lib/utils';

interface PhoneInputProps {
  value: string;
  onChange: (formatted: string, raw: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/** DDI do Brasil em E.164. */
const BR_CC = '55';
/** Teto do Brasil: 55 (DDI) + DDD (2) + assinante (9). */
const BR_MAX_DIGITS = 13;
/** Teto E.164 (DDI + assinante). */
const E164_MAX_DIGITS = 15;

/**
 * Máscara brasileira: `+55 XX XXXXX-XXXX` (celular) / `+55 XX XXXX-XXXX` (fixo).
 *
 * O grupo do assinante é decidido pelo primeiro dígito (celular começa em 9)
 * para que apagar um dígito NÃO troque o formato do número já exibido.
 */
function formatBR(digits: string): string {
  const ddd = digits.slice(2, 4);
  const rest = digits.slice(4, BR_MAX_DIGITS);

  const parts = ['+55'];
  if (ddd.length > 0) parts.push(ddd);
  if (rest.length > 0) {
    if (rest.length <= 5) {
      parts.push(rest);
    } else {
      const head = rest.startsWith('9') ? 5 : 4;
      parts.push(`${rest.slice(0, head)}-${rest.slice(head)}`);
    }
  }
  return parts.join(' ');
}

/** Internacional: E.164, sem inventar DDI. */
function formatE164(digits: string): string {
  return digits.length > 0 ? `+${digits.slice(0, E164_MAX_DIGITS)}` : '';
}

/**
 * Decide como exibir o `value` controlado. O valor guardado já vem do
 * `onChange` (formatado), então a exibição é idempotente:
 * - com `+` e corpo começando em 55 → Brasil;
 * - com `+` e outro DDI → E.164 (não é tocado pela máscara BR);
 * - sem `+` → parcela local ainda incompleta, exibida como digitada.
 */
function formatDisplay(value: string): string {
  const digits = cleanPhone(value);
  if (!digits) return '';
  if (!value.trimStart().startsWith('+')) return digits;
  if (digits.startsWith(BR_CC)) return formatBR(digits.slice(0, BR_MAX_DIGITS));
  return formatE164(digits);
}

/** `onChange(e.target.value)` → (formatado, bruto). */
function resolveNext(text: string): { formatted: string; raw: string } {
  let digits = cleanPhone(text);
  if (!digits) return { formatted: '', raw: '' };

  const explicitDdi = text.trimStart().startsWith('+');

  if (explicitDdi) {
    // DDI digitado que não é o Brasil: E.164, nunca ganha +55.
    if (!digits.startsWith(BR_CC)) {
      digits = digits.slice(0, E164_MAX_DIGITS);
      return { formatted: formatE164(digits), raw: digits };
    }
  } else if (!(digits.length >= 12 && digits.startsWith(BR_CC))) {
    // Sem DDI: 10/11 dígitos (DDD + número) ou DDD plausível → é o Brasil.
    const ddd = digits.length >= 2 ? Number(digits.slice(0, 2)) : Number.NaN;
    if (digits.length >= 10 || (ddd >= 11 && ddd <= 99)) {
      digits = BR_CC + digits;
    } else {
      // Parcial local: ainda não dá para decidir — devolve como foi digitado.
      return { formatted: digits, raw: digits };
    }
  }

  digits = digits.slice(0, BR_MAX_DIGITS);
  return { formatted: formatBR(digits), raw: digits };
}

/**
 * Campo de telefone com máscara brasileira (`+55 XX XXXXX-XXXX`).
 * - Só o número do Brasil ganha a máscara `+55` (DDD plausível ou `+55` colado).
 * - Número de outro país com `+` é aceito e mantido em E.164, sem virar `+55`.
 * - Aceita apenas dígitos; formata em tempo real; `onChange` devolve
 *   (formatado, bruto).
 * - Sem pré-preenchimento no foco: o campo vazio continua vazio e o
 *   placeholder faz o papel de dica ([refazer 1] P1 — '+55' sozinho não
 *   pode contar como número preenchido).
 */
export function PhoneInput({ value, onChange, placeholder = '+55 11 99999-0000', className, disabled }: PhoneInputProps) {
  // O valor exibido é DERIVADO do `value` controlado (sem effect).
  const displayValue = useMemo(() => formatDisplay(value), [value]);

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const { formatted, raw } = resolveNext(e.target.value);
    onChange(formatted, raw);
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
