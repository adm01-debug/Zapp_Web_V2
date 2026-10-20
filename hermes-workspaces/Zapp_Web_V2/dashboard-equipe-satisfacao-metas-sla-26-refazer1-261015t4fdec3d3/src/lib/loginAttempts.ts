import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

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
