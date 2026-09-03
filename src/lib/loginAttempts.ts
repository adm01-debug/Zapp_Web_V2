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
    p_ip_address: undefined,
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
