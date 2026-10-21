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

/**
 * Formata uma string de dígitos em telefone brasileiro:
 *   +55 XX XXXXX-XXXX  (celular, 11 dígitos no total)
 *   +55 XX XXXX-XXXX   (fixo, 10)
 *   +CC XXXXXXXXX      (internacional/incompleto — passthrough)
 * Comportamento portado do `PhoneInput` da V3.
 */
function formatPhone(digits: string, raw = ''): string {
  if (!digits) return '';

  // Começa com 55 e tem corpo suficiente: formata como BR.
  if (digits.startsWith('55') && digits.length >= 4) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length <= 5) {
      return `+55 ${ddd} ${rest}`;
    }
    // Fixo (10 dígitos no total): 8 após o DDD → XXXX-XXXX. Mas 8 dígitos também
    // cabem no celular parcial, e apagar um dígito de "98765-4321" não pode
    // reflowar para "9876-5432": o grupo que já está na tela manda.
    const grupoDigitado = (raw.split(/\s+/).pop() ?? '').split('-')[0].replace(/\D/g, '').length;
    if (rest.length === 8 && grupoDigitado !== 5) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    // Celular (11 dígitos) e parciais: 5-4.
    // Teto: no máximo 9 dígitos após o DDD.
    const capped = rest.slice(0, 9);
    return `+55 ${ddd} ${capped.slice(0, 5)}-${capped.slice(5)}`;
  }

  // Internacional (E.164) e parcial: passthrough, sem grupo brasileiro.
  return `+${digits}`;
}

/** Extrai apenas os dígitos de uma string. */
function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Campo de telefone com máscara brasileira (+55 XX XXXXX-XXXX).
 * - Prefixa +55 quando o operador digita um DDD direto
 * - Aceita apenas dígitos
 * - Formata em tempo real
 * - `onChange` devolve (formatado, bruto)
 * - Sem pré-preenchimento no foco: o campo vazio continua vazio e o
 *   placeholder faz o papel de dica ([refazer 1] P1 — '+55' sozinho não
 *   pode contar como número preenchido).
 */
export function PhoneInput({ value, onChange, placeholder = '+55 11 99999-0000', className, disabled }: PhoneInputProps) {
  // O valor exibido é DERIVADO do `value` controlado (sem effect): o que sobe
  // pelo onChange já vem formatado, então formatar de novo é idempotente.
  const displayValue = useMemo(() => formatPhone(extractDigits(value), value), [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = extractDigits(e.target.value);

    // Prefixa 55 quando o operador digita um DDD brasileiro direto (ex.: "11...").
    // Com "+" na frente o número é E.164 DECLARADO (+1, +351, +44): não ganha 55.
    const internacional = e.target.value.trimStart().startsWith('+');
    if (!internacional && digits.length >= 2 && !digits.startsWith('55')) {
      const possibleDDD = parseInt(digits.slice(0, 2), 10);
      if (possibleDDD >= 11 && possibleDDD <= 99) {
        digits = '55' + digits;
      }
    }

    // Teto de 13 dígitos (55 + 2 DDD + 9 número).
    if (digits.length > 13) digits = digits.slice(0, 13);

    onChange(formatPhone(digits, e.target.value), digits);
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
