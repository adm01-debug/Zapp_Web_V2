import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';

// Default ElevenLabs voice: Custom system voice
const DEFAULT_TTS_VOICE_ID = 'TY3h8ANhQUsJaa0Bga5F';
const DEFAULT_TTS_SPEED = 1.0;

export interface UserSettings {
  id?: string;
  user_id?: string;
  
  // Business hours
  business_hours_enabled: boolean;
  business_hours_start: string;
  business_hours_end: string;
  work_days: number[];
  
  // Messages
  welcome_message: string;
  away_message: string;
  closing_message: string;
  
  // Automation
  auto_assignment_enabled: boolean;
  auto_assignment_method: string;
  inactivity_timeout: number;
  auto_transcription_enabled: boolean;
  
  // Notifications
  sound_enabled: boolean;
  browser_notifications_enabled: boolean;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  
  // Appearance
  theme: string;
  language: string;
  compact_mode: boolean;
  
  // TTS
  tts_voice_id: string;
  tts_speed: number;
}

const DEFAULT_SETTINGS: UserSettings = {
  business_hours_enabled: true,
  business_hours_start: '09:00',
  business_hours_end: '18:00',
  work_days: [1, 2, 3, 4, 5],
  
  welcome_message: '',
  away_message: '',
  closing_message: '',
  
  auto_assignment_enabled: true,
  auto_assignment_method: 'roundrobin',
  inactivity_timeout: 30,
  auto_transcription_enabled: true,
  
  sound_enabled: true,
  browser_notifications_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  
  theme: 'system',
  language: 'pt-BR',
  compact_mode: false,
  
  tts_voice_id: DEFAULT_TTS_VOICE_ID,
  tts_speed: DEFAULT_TTS_SPEED,
};

export function useUserSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch settings from DB
  useEffect(() => {
    if (!user?.id) {
      setIsLoading(false);
      return;
    }

    const fetchSettings = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned
          log.error('Error fetching settings:', error);
          return;
        }

        if (data) {
          setSettings({
            id: data.id,
            user_id: data.user_id,
            business_hours_enabled: data.business_hours_enabled ?? DEFAULT_SETTINGS.business_hours_enabled,
            business_hours_start: data.business_hours_start ?? DEFAULT_SETTINGS.business_hours_start,
            business_hours_end: data.business_hours_end ?? DEFAULT_SETTINGS.business_hours_end,
            work_days: data.work_days ?? DEFAULT_SETTINGS.work_days,
            welcome_message: data.welcome_message ?? DEFAULT_SETTINGS.welcome_message,
            away_message: data.away_message ?? DEFAULT_SETTINGS.away_message,
            closing_message: data.closing_message ?? DEFAULT_SETTINGS.closing_message,
            auto_assignment_enabled: data.auto_assignment_enabled ?? DEFAULT_SETTINGS.auto_assignment_enabled,
            auto_assignment_method: data.auto_assignment_method ?? DEFAULT_SETTINGS.auto_assignment_method,
            inactivity_timeout: data.inactivity_timeout ?? DEFAULT_SETTINGS.inactivity_timeout,
            auto_transcription_enabled: data.auto_transcription_enabled ?? DEFAULT_SETTINGS.auto_transcription_enabled,
            sound_enabled: data.sound_enabled ?? DEFAULT_SETTINGS.sound_enabled,
            browser_notifications_enabled: data.browser_notifications_enabled ?? DEFAULT_SETTINGS.browser_notifications_enabled,
            quiet_hours_enabled: data.quiet_hours_enabled ?? DEFAULT_SETTINGS.quiet_hours_enabled,
            quiet_hours_start: data.quiet_hours_start ?? DEFAULT_SETTINGS.quiet_hours_start,
            quiet_hours_end: data.quiet_hours_end ?? DEFAULT_SETTINGS.quiet_hours_end,
            theme: data.theme ?? DEFAULT_SETTINGS.theme,
            language: data.language ?? DEFAULT_SETTINGS.language,
            compact_mode: data.compact_mode ?? DEFAULT_SETTINGS.compact_mode,
            tts_voice_id: data.tts_voice_id ?? DEFAULT_SETTINGS.tts_voice_id,
            tts_speed: data.tts_speed ?? DEFAULT_SETTINGS.tts_speed,
          });
        }
      } catch (err) {
        log.error('Error in fetchSettings:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, [user?.id]);

  // Update settings locally
  const updateSettings = useCallback((updates: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
  }, []);

  // Save settings to DB
  const saveSettings = useCallback(async () => {
    if (!user?.id) {
      toast({
        title: 'Erro',
        description: 'Você precisa estar logado para salvar configurações.',
        variant: 'destructive',
      });
      return false;
    }

    setIsSaving(true);
    try {
      const settingsData = {
        user_id: user.id,
        business_hours_enabled: settings.business_hours_enabled,
        business_hours_start: settings.business_hours_start,
        business_hours_end: settings.business_hours_end,
        work_days: settings.work_days,
        welcome_message: settings.welcome_message,
        away_message: settings.away_message,
        closing_message: settings.closing_message,
        auto_assignment_enabled: settings.auto_assignment_enabled,
        auto_assignment_method: settings.auto_assignment_method,
        inactivity_timeout: settings.inactivity_timeout,
        auto_transcription_enabled: settings.auto_transcription_enabled,
        sound_enabled: settings.sound_enabled,
        browser_notifications_enabled: settings.browser_notifications_enabled,
        quiet_hours_enabled: settings.quiet_hours_enabled,
        quiet_hours_start: settings.quiet_hours_start,
        quiet_hours_end: settings.quiet_hours_end,
        theme: settings.theme,
        language: settings.language,
        compact_mode: settings.compact_mode,
        tts_voice_id: settings.tts_voice_id,
        tts_speed: settings.tts_speed,
      };

      const { error } = await supabase
        .from('user_settings')
        .upsert(settingsData, { onConflict: 'user_id' });

      if (error) {
        log.error('Error saving settings:', error);
        toast({
          title: 'Erro ao salvar',
          description: 'Não foi possível salvar as configurações.',
          variant: 'destructive',
        });
        return false;
      }

      toast({
        title: 'Configurações salvas',
        description: 'Suas configurações foram salvas com sucesso.',
      });
      return true;
    } catch (err) {
      log.error('Error in saveSettings:', err);
      toast({
        title: 'Erro ao salvar',
        description: 'Ocorreu um erro inesperado.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [user?.id, settings]);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
  }, []);

  // Toggle work day
  const toggleWorkDay = useCallback((day: number) => {
    setSettings((prev) => {
      const workDays = prev.work_days.includes(day)
        ? prev.work_days.filter((d) => d !== day)
        : [...prev.work_days, day].sort();
      return { ...prev, work_days: workDays };
    });
  }, []);

  return {
    settings,
    isLoading,
    isSaving,
    updateSettings,
    saveSettings,
    resetSettings,
    toggleWorkDay,
  };
}
