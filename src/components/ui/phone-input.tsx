import { useCallback, useMemo, useRef } from 'react';
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
function formatPhone(digits: string): string {
  if (!digits) return '';

  // Começa com 55 e tem corpo suficiente: formata como BR.
  if (digits.startsWith('55') && digits.length >= 4) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length <= 5) {
      return `+55 ${ddd} ${rest}`;
    }
    // Fixo (10 dígitos no total): 8 após o DDD, sem '9' inicial → XXXX-XXXX.
    if (rest.length === 8 && !rest.startsWith('9')) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    // Celular (11 dígitos) e parciais: 5-4.
    // Teto: no máximo 9 dígitos após o DDD.
    const capped = rest.slice(0, 9);
    return `+55 ${ddd} ${capped.slice(0, 5)}-${capped.slice(5)}`;
  }

  // Parcial: usuário começou a digitar.
  if (digits.length <= 2) return `+${digits}`;
  if (digits.length <= 4) return `+${digits.slice(0, 2)} ${digits.slice(2)}`;

  // Internacional: passthrough E.164 sem reformatar (Ajuste UI-07).
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
  const displayValue = useMemo(() => formatPhone(extractDigits(value)), [value]);

  // Rastreia se o usuário iniciou entrada como número internacional explícito.
  // Inicializa como true quando o valor recebido já é internacional (não-55),
  // para não corromper edições de contatos internacionais existentes.
  const initialDigits = extractDigits(value);
  const isExplicitInternationalRef = useRef(
    initialDigits.length >= 2 && !initialDigits.startsWith('55')
  );

  // Rastreia os dígitos brutos do último valor emitido pelo onChange.
  // Isso permite distinguir um eco do próprio onChange (value volta idêntico)
  // de uma mudança externa feita pelo pai (reset de formulário, troca de contato).
  // extractDigits(formatPhone(d)) === d é invariante para qualquer d, então a
  // comparação por dígitos é suficiente e robusta.
  const lastEmittedRawRef = useRef(initialDigits);

  // Sincroniza isExplicitInternationalRef quando o pai muda value externamente.
  // Executado durante o render (React permite mutação de ref em render; é
  // idempotente: renders extras do Strict Mode produzem o mesmo resultado).
  const currentRaw = extractDigits(value);
  if (currentRaw !== lastEmittedRawRef.current) {
    isExplicitInternationalRef.current = currentRaw.length >= 2 && !currentRaw.startsWith('55');
    lastEmittedRawRef.current = currentRaw;
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = extractDigits(e.target.value);

    // O formatter sempre exibe '+...' após o primeiro dígito, então não podemos
    // usar e.target.value.startsWith('+') para detectar intenção internacional —
    // seria sempre true. Usamos ref + contexto do campo antes do evento.
    if (e.target.value === '+') {
      // '+' sozinho ocorre em dois cenários:
      // (a) Usuário digita '+' num campo vazio → intl explícito
      // (b) Usuário apaga entrada existente até restar só '+' → limpando; reseta
      if (displayValue === '') {
        isExplicitInternationalRef.current = true;
      } else {
        // Limpando número existente. O próximo dígito reclassifica a entrada.
        isExplicitInternationalRef.current = false;
      }
    } else if (
      e.target.value.startsWith('+') &&
      digits.length >= 3 &&
      !digits.startsWith('55')
    ) {
      // Número internacional colado (ou digitado diretamente), independente de
      // o campo estar vazio ou não. 3+ dígitos sem prefixo '55' é sinal seguro
      // de número intl — evita falso-positivo com DDDs BR como 35, 44, etc.
      isExplicitInternationalRef.current = true;
    } else if (!digits) {
      // Campo completamente esvaziado → sai do modo internacional
      isExplicitInternationalRef.current = false;
    }

    // Prefixa 55 quando o operador digita um DDD brasileiro direto (ex.: "11...").
    // Não aplica em números internacionais explícitos.
    if (digits.length >= 2 && !digits.startsWith('55') && !isExplicitInternationalRef.current) {
      const possibleDDD = parseInt(digits.slice(0, 2), 10);
      if (possibleDDD >= 11 && possibleDDD <= 99) {
        digits = '55' + digits;
      }
    }

    // Teto de 13 dígitos (55 + 2 DDD + 9 número).
    if (digits.length > 13) digits = digits.slice(0, 13);

    // Registra o que estamos emitindo antes de chamar onChange, para que o
    // bloco de sincronização de render reconheça o eco do pai e não sobrescreva
    // o ref com o valor errado.
    lastEmittedRawRef.current = digits;
    onChange(formatPhone(digits), digits);
  }, [onChange, displayValue]);

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
