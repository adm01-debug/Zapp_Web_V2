import { useState, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const validateEmail = (email: string): boolean => {
  if (!email) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const validatePhone = (phone: string): boolean => {
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 && cleaned.length <= 15;
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
) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<FieldError>({});
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const dupCheckTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const checkDuplicate = useCallback(async (phone: string) => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) { setDuplicateWarning(null); return; }
    const { data } = await supabase
      .from('contacts')
      .select('name, phone')
      .or(`phone.ilike.%${cleaned.slice(-8)}%`)
      .limit(1);
    setDuplicateWarning(data && data.length > 0 ? `Possível duplicata: "${data[0].name}" (${data[0].phone})` : null);
  }, []);

  const validate = useCallback((field: string, value: string): string | null => {
    switch (field) {
      case 'name':
        if (!value.trim()) return 'Nome é obrigatório';
        if (value.trim().length < 2) return 'Nome deve ter pelo menos 2 caracteres';
        if (value.length > 100) return 'Nome deve ter no máximo 100 caracteres';
        return null;
      case 'phone':
        if (!value.trim()) return 'Telefone é obrigatório';
        if (!validatePhone(value)) return 'Formato inválido (mín. 10 dígitos)';
        return null;
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
  }, [onChange, touched, validate]);

  const handleBlur = useCallback((field: string, value: string) => {
    setTouched(prev => ({ ...prev, [field]: true }));
    setErrors(prev => ({ ...prev, [field]: validate(field, value) }));
  }, [validate]);

  const handlePhoneChange = useCallback((value: string) => {
    const formatted = formatPhone(value);
    onChange('phone', formatted);
    if (touched.phone) setErrors(prev => ({ ...prev, phone: validate('phone', formatted) }));
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
    touched, errors, duplicateWarning, isValid,
    handleChange, handleBlur, handlePhoneChange, handleSubmit,
  };
}
