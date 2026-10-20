import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface GlobalSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useGlobalSettings() {
  const [settings, setSettings] = useState<GlobalSetting[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .select('*')
        .order('key');
      if (error) throw error;
      if (isMountedRef.current) {
        setSettings(data || []);
      }
    } catch (err) {
      log.error('Error fetching global settings:', err);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const getSetting = useCallback((key: string): string | null => {
    return settings.find(s => s.key === key)?.value ?? null;
  }, [settings]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    try {
      const { error } = await supabase
        .from('global_settings')
        .update({ value })
        .eq('key', key);
      if (error) throw error;
      setSettings(prev => prev.map(s => s.key === key ? { ...s, value } : s));
    } catch (err) {
      log.error('Error updating global setting:', err);
      throw err;
    }
  }, []);

  const addSetting = useCallback(async (key: string, value: string, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .upsert({ key, value, description }, { onConflict: 'key' })
        .select()
        .single();
      if (error) throw error;
      await fetchSettings();
      return data;
    } catch (err) {
      log.error('Error adding global setting:', err);
      throw err;
    }
  }, [fetchSettings]);

  return { settings, isLoading, getSetting, updateSetting, addSetting, refetch: fetchSettings };
}
