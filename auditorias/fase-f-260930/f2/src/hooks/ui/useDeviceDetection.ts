import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
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

interface UserSession {
  id: string;
  device_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  is_active: boolean | null;
  started_at: string;
  last_activity_at: string;
  expires_at: string;
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
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('is_active', true)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
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
    }
  }, [fetchDevices]);

  // Remove a device
  const removeDevice = useCallback(async (deviceId: string) => {
    try {
      // First, end all sessions for this device
      await supabase
        .from('user_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('device_id', deviceId);

      // Then remove the device
      const { error } = await supabase
        .from('user_devices')
        .delete()
        .eq('id', deviceId);

      if (error) throw error;
      await fetchDevices();
      await fetchSessions();
    } catch (error) {
      log.error('Error removing device:', error);
    }
  }, [fetchDevices, fetchSessions]);

  // End a session
  const endSession = useCallback(async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;
      await fetchSessions();
    } catch (error) {
      log.error('Error ending session:', error);
    }
  }, [fetchSessions]);

  // End all other sessions
  const endAllOtherSessions = useCallback(async () => {
    if (!currentDeviceId) return;

    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ is_active: false, ended_at: new Date().toISOString() })
        .neq('device_id', currentDeviceId)
        .eq('is_active', true);

      if (error) throw error;
      await fetchSessions();
    } catch (error) {
      log.error('Error ending sessions:', error);
    }
  }, [currentDeviceId, fetchSessions]);

  // Initial load
  useEffect(() => {
    if (user) {
      setLoading(true);
      Promise.all([checkDevice(), fetchDevices(), fetchSessions()])
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
