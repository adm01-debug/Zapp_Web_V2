import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { normalizeE164BR } from '@/lib/calls/phone';

export const validateEmail = (email: string): boolean => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Formato canônico de gravação em `contacts.phone`: só dígitos, com DDI 55 —
 * exatamente o que o webhook grava (`jidToPhone` sobre o JID do WhatsApp,
 * ex.: `5511999999999@s.whatsapp.net` → `5511999999999`). Sem o DDI, o cadastro
 * manual criava um segundo contato para o mesmo número (a UNIQUE não casava).
 *
 * Devolve `phone` preenchido quando normalizável, ou `error` com a razão
 * (pt-BR) para a tela avisar o operador.
 */
export function normalizeContactPhone(
  raw: string,
): { phone: string; error: null } | { phone: null; error: string } {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { phone: null, error: 'Telefone é obrigatório' };

  const digits = trimmed.replace(/\D/g, '');
  // DDI explícito que não seja o +55 (ex.: +1 …) fica fora do escopo do sistema.
  const hasExplicitDdi = trimmed.startsWith('+') || /^00/.test(trimmed);
  if (hasExplicitDdi && !digits.startsWith('55')) {
    return { phone: null, error: 'Apenas números do Brasil (DDI +55)' };
  }

  const e164 = normalizeE164BR(trimmed);
  if (e164 === null) {
    return { phone: null, error: 'Telefone inválido — informe DDD + número (ex.: (11) 99999-9999)' };
  }

  const local = e164.slice(3); // DDD + assinante (10 ou 11 dígitos)
  const ddd = Number(local.slice(0, 2));
  if (!(ddd >= 11 && ddd <= 99)) {
    return { phone: null, error: `Telefone inválido — DDD ${local.slice(0, 2)} não existe` };
  }

  return { phone: e164.slice(1), error: null };
}

export const validatePhone = (phone: string): boolean => {
  return normalizeContactPhone(phone).phone !== null;
};

export const formatPhone = (value: string): string => {
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 2) return cleaned;
  if (cleaned.startsWith('55')) {
    if (cleaned.length <= 4) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2)}`;
    if (cleaned.length <= 6) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4)}`;
    if (cleaned.length <= 11) return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9, 13)}`;
  }
  return value;
};

export type FieldError = Record<string, string | null>;

interface ContactFormValues {
  name: string;
  nickname?: string | null;
  surname?: string | null;
  job_title?: string | null;
  company?: string | null;
  phone: string;
  email?: string | null;
  contact_type?: string | null;
}

export function useContactFormValidation(
  values: ContactFormValues,
  onChange: (field: string, value: string) => void,
  onSubmit: () => void,
  excludeContactId?: string,
) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<FieldError>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [duplicateEmailWarning, setDuplicateEmailWarning] = useState<string | null>(null);
  const dupCheckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emailDupCheckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const emailCheckSeqRef = useRef(0);
  const phoneCheckSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      clearTimeout(dupCheckTimer.current);
      clearTimeout(emailDupCheckTimer.current);
    };
  }, []);

  const checkDuplicate = useCallback(async (phone: string) => {
    const seq = phoneCheckSeqRef.current;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) { setDuplicateWarning(null); return; }
    // cleaned is pure digits after /\D/ strip — %, _ and \\ are impossible;
    // escaping is defensive parity with checkEmailDuplicate.
    const last8 = cleaned.slice(-8).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    let query = supabase
      .from('contacts')
      .select('name, phone')
      .or(`phone.ilike.%${last8}%`);
    if (excludeContactId) query = query.neq('id', excludeContactId);
    const { data } = await query.limit(1);
    if (seq !== phoneCheckSeqRef.current) return;
    setDuplicateWarning(data && data.length > 0 ? `Possível duplicata: "${data[0].name}" (${data[0].phone})` : null);
  }, [excludeContactId]);

  const checkEmailDuplicate = useCallback(async (email: string) => {
    const trimmed = email.trim();
    // Capture seq without incrementing — handleChange already incremented synchronously
    const seq = emailCheckSeqRef.current;
    if (!trimmed || !validateEmail(trimmed)) { setDuplicateEmailWarning(null); return; }
    const escapedEmail = trimmed.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    let query = supabase
      .from('contacts')
      .select('name, email')
      .ilike('email', escapedEmail);
    if (excludeContactId) query = query.neq('id', excludeContactId);
    const { data } = await query.limit(1);
    if (seq !== emailCheckSeqRef.current) return;
    setDuplicateEmailWarning(data && data.length > 0 ? `Email já cadastrado: "${data[0].name}"` : null);
  }, [excludeContactId]);

  const validate = useCallback((field: string, value: string): string | null => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Nome é obrigatório';
        if (value.trim().length < 2) return 'Nome deve ter pelo menos 2 caracteres';
        if (value.length > 100) return 'Nome deve ter no máximo 100 caracteres';
        return null;
      case 'phone': {
        const normalized = normalizeContactPhone(value);
        return normalized.phone === null ? normalized.error : null;
      }
      case 'email':
        if (value && !validateEmail(value)) return 'Email inválido';
        return null;
      case 'surname':
        if (value && value.length > 100) return 'Máximo 100 caracteres';
        return null;
      default: return null;
    }
  }, []);

  const handleChange = useCallback((field: string, value: string) => {
    onChange(field, value);
    if (touched[field]) setErrors(prev => ({ ...prev, [field]: validate(field, value) }));
    if (field === 'email') {
      // Increment synchronously so any in-flight query is immediately invalidated,
      // even if it resolves before the 500 ms debounce fires.
      ++emailCheckSeqRef.current;
      clearTimeout(emailDupCheckTimer.current);
      emailDupCheckTimer.current = setTimeout(() => checkEmailDuplicate(value), 500);
    }
  }, [onChange, touched, validate, checkEmailDuplicate]);

  const handleBlur = useCallback((field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(prev => ({ ...prev, [field]: validate(field, value) }));
  }, [validate]);

  const handlePhoneChange = useCallback((value: string) => {
    const formatted = formatPhone(value);
    onChange('phone', formatted);
    if (touched.phone) setErrors(prev => ({ ...prev, phone: validate('phone', formatted) }));
    ++phoneCheckSeqRef.current;
    clearTimeout(dupCheckTimer.current);
    dupCheckTimer.current = setTimeout(() => checkDuplicate(formatted), 500);
  }, [onChange, touched, validate, checkDuplicate]);

  const handleSubmit = useCallback(() => {
    const newErrors: FieldError = {
      name: validate('name', values.name),
      phone: validate('phone', values.phone),
      email: validate('email', values.email || ''),
    };
    setErrors(newErrors);
    setTouched({ name: true, phone: true, email: true });
    if (Object.values(newErrors).some(e => e !== null)) return;
    onSubmit();
  }, [values, validate, onSubmit]);

  const isValid = useMemo(() => {
    return values.name.trim().length >= 2 && validatePhone(values.phone) && (!values.email || validateEmail(values.email));
  }, [values.name, values.phone, values.email]);

  return {
    touched, errors, duplicateWarning, duplicateEmailWarning, isValid,
    handleChange, handleBlur, handlePhoneChange, handleSubmit,
  };
}
