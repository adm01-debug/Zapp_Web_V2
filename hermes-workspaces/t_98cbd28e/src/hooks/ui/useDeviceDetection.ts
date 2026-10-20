import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { useAuth } from '../auth/useAuth';
import { log } from '@/lib/logger';

interface UserDevice {
  id: string;
  device_fingerprint: string;
  device_name: string | null;
  browser: string | null;
  os: string | null;
  ip_address: string | null;
  city: string | null;
  country: string | null;
  is_trusted: boolean | null;
  first_seen_at: string;
  last_seen_at: string;
}

// `auth_session_id` é adicionado pela migration do cartão backend (t_29b824ad,
// R2-AUTH-004). O types.ts gerado ainda não o conhece — será regenerado pelo
// types-sync depois do merge — então o acesso a `user_sessions` que toca essa
// coluna usa `fromTable` (escape dinâmico tipado) em vez do client tipado.
interface UserSession {
  id: string;
  device_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean | null;
  auth_session_id: string | null;
  started_at: string;
  last_activity_at: string;
  expires_at: string;
  ended_at: string | null;
}

interface SessionAuthIdRow {
  auth_session_id: string | null;
}

export function useDeviceDetection() {
  const { user } = useAuth();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);

  // Generate device fingerprint
  const generateFingerprint = useCallback(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('fingerprint', 2, 2);
    }
    
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      `${screen.width}x${screen.height}`,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      canvas.toDataURL(),
    ];

    // Simple hash function
    const hash = components.join('|').split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0);

    return Math.abs(hash).toString(36);
  }, []);

  // Get browser info
  const getBrowserInfo = useCallback(() => {
    const ua = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';

    // Browser detection
    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';
    else if (ua.includes('Opera')) browser = 'Opera';

    // OS detection
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    // Device name
    const isMobile = /Mobile|Android|iPhone|iPad/.test(ua);
    const deviceName = isMobile ? 'Dispositivo Móvel' : 'Desktop';

    return { browser, os, deviceName };
  }, []);

  // Check device on login
  const checkDevice = useCallback(async () => {
    if (!user) return;

    try {
      const fingerprint = generateFingerprint();
      const { browser, os, deviceName } = getBrowserInfo();

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await supabase.functions.invoke('detect-new-device', {
        body: {
          device_fingerprint: fingerprint,
          browser,
          os,
          device_name: deviceName,
        },
      });

      if (response.data) {
        setCurrentDeviceId(response.data.device_id);
        log.debug('Device check result:', response.data);
      }
    } catch (error) {
      log.error('Error checking device:', error);
    }
  }, [user, generateFingerprint, getBrowserInfo]);

  // Fetch user devices
  const fetchDevices = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_devices')
        .select('*')
        .order('last_seen_at', { ascending: false });

      if (error) throw error;
      setDevices(data || []);
    } catch (error) {
      log.error('Error fetching devices:', error);
    }
  }, [user]);

  // Fetch user sessions
  const fetchSessions = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await fromTable('user_sessions')
        .select('*')
        .eq('is_active', true)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      setSessions((data ?? []) as UserSession[]);
    } catch (error) {
      log.error('Error fetching sessions:', error);
    }
  }, [user]);

  // Trust a device
  const trustDevice = useCallback(async (deviceId: string) => {
    try {
      const { error } = await supabase
        .from('user_devices')
        .update({ is_trusted: true })
        .eq('id', deviceId);

      if (error) throw error;
      await fetchDevices();
    } catch (error) {
      log.error('Error trusting device:', error);
      throw error;
    }
  }, [fetchDevices]);

  // Remove a device — revoga todas as sessões Auth vinculadas ANTES de excluir.
  const removeDevice = useCallback(async (deviceId: string) => {
    // 1. Descobre as sessões Auth vinculadas a este dispositivo.
    const { data: deviceSessions, error: sessionsError } = await fromTable('user_sessions')
      .select('auth_session_id')
      .eq('device_id', deviceId);

    if (sessionsError) throw sessionsError;

    const authSessionIds = ((deviceSessions ?? []) as SessionAuthIdRow[])
      .map((s) => s.auth_session_id)
      .filter((sid): sid is string => typeof sid === 'string' && sid.length > 0);

    // 2. Revoga cada sessão Auth (scope local). Fail-closed: se qualquer revogação
    // falhar, o dispositivo NÃO é removido.
    for (const targetSessionId of authSessionIds) {
      const { error: revokeError } = await supabase.functions.invoke('revoke-auth-sessions', {
        body: { scope: 'local', target_session_id: targetSessionId },
      });
      if (revokeError) throw revokeError;
    }

    // 3. Só remove depois de TODAS as revogações confirmarem.
    const { error } = await supabase
      .from('user_devices')
      .delete()
      .eq('id', deviceId);

    if (error) throw error;
    await fetchDevices();
    await fetchSessions();
  }, [fetchDevices, fetchSessions]);

  // End a session — revoga a sessão Auth correspondente via scope local.
  const endSession = useCallback(async (sessionId: string) => {
    const { data, error: lookupError } = await fromTable('user_sessions')
      .select('auth_session_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (lookupError) throw lookupError;

    const authSessionId = (data as SessionAuthIdRow | null)?.auth_session_id ?? null;
    if (!authSessionId) {
      throw new Error('Sessão sem vínculo Auth; não é possível revogar');
    }

    const { error: revokeError } = await supabase.functions.invoke('revoke-auth-sessions', {
      body: { scope: 'local', target_session_id: authSessionId },
    });
    if (revokeError) throw revokeError;

    await fetchSessions();
  }, [fetchSessions]);

  // End all other sessions — scope others preserva a sessão corrente (derivada no
  // servidor a partir do claim session_id do JWT).
  const endAllOtherSessions = useCallback(async () => {
    const { error } = await supabase.functions.invoke('revoke-auth-sessions', {
      body: { scope: 'others' },
    });
    if (error) throw error;

    await fetchSessions();
  }, [fetchSessions]);

  // Initial load
  useEffect(() => {
    if (user) {
      setLoading(true);
      void Promise.all([checkDevice(), fetchDevices(), fetchSessions()])
        .finally(() => setLoading(false));
    }
  }, [user, checkDevice, fetchDevices, fetchSessions]);

  return {
    devices,
    sessions,
    loading,
    currentDeviceId,
    trustDevice,
    removeDevice,
    endSession,
    endAllOtherSessions,
    refetch: async () => {
      await fetchDevices();
      await fetchSessions();
    },
  };
}
