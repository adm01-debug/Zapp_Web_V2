import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

interface LockStatus {
  isLocked: boolean;
  lockedUntil: Date | null;
  attempts: number;
  remainingTime: number; // in seconds
}

export async function checkAccountLock(email: string): Promise<LockStatus> {
  const { data, error } = await supabase.rpc('is_account_locked', {
    check_email: email
  });

  if (error) {
    log.error('Error checking account lock:', error);
    return { isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 };
  }

  const result = data?.[0];
  if (!result) {
    return { isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 };
  }

  const lockedUntil = result.locked_until ? new Date(result.locked_until) : null;
  const remainingTime = lockedUntil ? Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000)) : 0;

  return {
    isLocked: result.is_locked,
    lockedUntil,
    attempts: result.attempts,
    remainingTime
  };
}

export async function recordFailedLogin(email: string): Promise<LockStatus> {
  const { data, error } = await supabase.rpc('record_failed_login', {
    p_email: email,
    p_ip_address: null,
    p_user_agent: navigator.userAgent
  });

  if (error) {
    log.error('Error recording failed login:', error);
    return { isLocked: false, lockedUntil: null, attempts: 0, remainingTime: 0 };
  }

  const result = data?.[0];
  if (!result) {
    return { isLocked: false, lockedUntil: null, attempts: 1, remainingTime: 0 };
  }

  const lockedUntil = result.locked_until ? new Date(result.locked_until) : null;
  const remainingTime = lockedUntil ? Math.max(0, Math.floor((lockedUntil.getTime() - Date.now()) / 1000)) : 0;

  return {
    isLocked: result.is_locked,
    lockedUntil,
    attempts: result.attempts,
    remainingTime
  };
}

export async function clearLoginAttempts(email: string): Promise<void> {
  const { error } = await supabase.rpc('clear_login_attempts', {
    p_email: email
  });

  if (error) {
    log.error('Error clearing login attempts:', error);
  }
}

export function formatLockTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} segundo${seconds !== 1 ? 's' : ''}`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minuto${minutes !== 1 ? 's' : ''}`;
}

// Portado do V3 (design copy 20260831)
export type LoginBlockReason =
  | 'ip_blocked'
  | 'ip_not_whitelisted'
  | 'country_blocked'
  | 'country_not_allowed'
  | 'lock_check_failed';

export function blockReasonMessage(reason: LoginBlockReason | null): string {
  switch (reason) {
    case 'ip_blocked':
      return 'Seu IP está bloqueado por medidas de segurança. Tente novamente mais tarde ou contate o administrador.';
    case 'ip_not_whitelisted':
      return 'Seu IP não está na lista de IPs permitidos. Contate o administrador.';
    case 'country_blocked':
      return 'Acesso negado: seu país está na lista de bloqueio desta plataforma.';
    case 'country_not_allowed':
      return 'Acesso negado: seu país não está na lista de países permitidos.';
    case 'lock_check_failed':
      return 'Não foi possível verificar o bloqueio da conta. Tente novamente em instantes.';
    default:
      return 'Acesso bloqueado pela política de segurança.';
  }
}
