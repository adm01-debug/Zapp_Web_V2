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

function formatPhone(digits: string): string {
  if (!digits) return '';
  if (digits.startsWith('55') && digits.length >= 4) {
    const ddd = digits.slice(2, 4);
    const rest = digits.slice(4);
    if (rest.length <= 5) return `+55 ${ddd} ${rest}`;
    if (rest.length === 8 && !rest.startsWith('9')) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    const capped = rest.slice(0, 9);
    return `+55 ${ddd} ${capped.slice(0, 5)}-${capped.slice(5)}`;
  }
  if (digits.length <= 2) return `+${digits}`;
  if (digits.length <= 4) return `+${digits.slice(0, 2)} ${digits.slice(2)}`;
  return `+${digits}`;
}

function extractDigits(value: string): string {
  return value.replace(/\D/g, '');
}

export function PhoneInput({ value, onChange, placeholder = '+55 11 99999-0000', className, disabled }: PhoneInputProps) {
  const displayValue = useMemo(() => formatPhone(extractDigits(value)), [value]);

  const initialDigits = extractDigits(value);
  const isExplicitInternationalRef = useRef(
    initialDigits.length >= 2 && !initialDigits.startsWith('55')
  );
  const wasExplicitPlusRef = useRef(false);
  const lastEmittedRawRef = useRef(initialDigits);

  const currentRaw = extractDigits(value);
  if (currentRaw !== lastEmittedRawRef.current) {
    isExplicitInternationalRef.current = currentRaw.length >= 2 && !currentRaw.startsWith('55');
    wasExplicitPlusRef.current = false;
    lastEmittedRawRef.current = currentRaw;
  }

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let digits = extractDigits(e.target.value);
    const prevRaw = lastEmittedRawRef.current;
    const nativeInput = e.nativeEvent as InputEvent;
    const inputType = nativeInput.inputType ?? '';
    const isDeletion = inputType.startsWith('delete') || inputType === 'historyUndo';
    const isPasteOrDrop = inputType === 'insertFromPaste' || inputType === 'insertFromDrop';

    // Bug D: dataTransfer gives the actual pasted/dropped text; e.target.value always starts
    // with '+' from the formatter, so it cannot distinguish a paste-with-+ from a paste-without-+.
    const pastedText = isPasteOrDrop
      ? (nativeInput.dataTransfer?.getData('text/plain') ?? nativeInput.data ?? '')
      : '';

    // User explicitly entered '+': typed it (data==='+') or pasted/dropped content with leading '+'
    const isExplicitPlusInput =
      (inputType === 'insertText' && nativeInput.data === '+') ||
      (isPasteOrDrop && pastedText.trimStart().startsWith('+') && !extractDigits(pastedText).startsWith('55'));

    if (isExplicitPlusInput) {
      isExplicitInternationalRef.current = true;
      // Bug G: pasting a standalone '+' has the same semantics as typing '+' — both must set
      // this guard so the next typed digit doesn't reset international mode.
      wasExplicitPlusRef.current = true;
    } else if (!e.target.value.startsWith('+') && !isDeletion && (!wasExplicitPlusRef.current || isPasteOrDrop)) {
      // Paste/type without leading '+' (e.g. '(11) 98765-4321') → treat as BR.
      // Bug B: wasExplicitPlusRef guards regular typing so a lone '+' keystroke isn't undone by the
      //         next digit (which arrives without '+' in e.target.value while the field is empty).
      // Bug A: isPasteOrDrop bypasses the guard — a paste is always an intentional replacement.
      isExplicitInternationalRef.current = false;
      wasExplicitPlusRef.current = false;
    } else if (isDeletion && digits.length < 3 && !wasExplicitPlusRef.current && !e.target.value.startsWith('+')) {
      // Bug C: only reset when the field is completely empty ('+' has left the display).
      // Prevents resetting a loaded international number whose mode wasn't set by an explicit '+' key.
      isExplicitInternationalRef.current = false;
      wasExplicitPlusRef.current = false;
    } else if (!isDeletion && digits.length >= 3 && !digits.startsWith('55')) {
      // Digit sequence ≥ 3 non-55 chars: check for BR country-prefix deletion first
      const isBRPrefixDeletion = prevRaw.startsWith('55') && digits === prevRaw.slice(2);
      if (!isBRPrefixDeletion) {
        isExplicitInternationalRef.current = true;
      } else {
        digits = '55' + digits;
      }
    }

    // DDD auto-prefix: only on insertions and when not in international mode
    if (
      !isDeletion &&
      digits.length >= 2 &&
      !digits.startsWith('55') &&
      !isExplicitInternationalRef.current
    ) {
      const possibleDDD = parseInt(digits.slice(0, 2), 10);
      if (possibleDDD >= 11 && possibleDDD <= 99) {
        digits = '55' + digits;
      }
    }

    if (digits.length > 13) digits = digits.slice(0, 13);
    lastEmittedRawRef.current = digits;
    onChange(formatPhone(digits), digits);
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
