import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';

export interface WhitelistedCity {
  id: string;
  city_name: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
}

interface CitySettings {
  id: string;
  city_whitelist_enabled: boolean;
}

// city_whitelist e geo_blocking_settings.city_whitelist_enabled ainda não estão em
// types.ts (regenerado pelo types-sync depois do apply): cast local, sem tocar nele.
/* eslint-disable @typescript-eslint/no-explicit-any */
const cityTable = () => supabase.from('city_whitelist' as never) as any;
const settingsTable = () => supabase.from('geo_blocking_settings') as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function useCityWhitelist() {
  const [settings, setSettings] = useState<CitySettings | null>(null);
  const [cities, setCities] = useState<WhitelistedCity[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [cityToRemove, setCityToRemove] = useState<WhitelistedCity | null>(null);

  const fetchData = async () => {
    try {
      const { data: settingsData } = await settingsTable().select('id, city_whitelist_enabled').limit(1).single();
      if (settingsData) setSettings(settingsData as CitySettings);

      const { data: cityData, error } = await cityTable()
        .select('id, city_name, is_active, created_by, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setCities((cityData ?? []) as WhitelistedCity[]);
    } catch (error) {
      log.error('Error fetching city whitelist:', error);
      toast.error('Erro ao carregar cidades');
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial (mesmo padrão de useGeoBlocking): o setState acontece após o await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void fetchData(); }, []);

  const handleToggle = async (enabled: boolean) => {
    if (!settings) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await settingsTable()
        .update({ city_whitelist_enabled: enabled, updated_by: user?.id, updated_at: new Date().toISOString() })
        .eq('id', settings.id);
      if (error) throw error;
      setSettings({ ...settings, city_whitelist_enabled: enabled });
      toast.success(enabled ? 'Bloqueio por cidade ativado' : 'Bloqueio por cidade desativado');
    } catch (error) {
      log.error('Error updating city whitelist toggle:', error);
      toast.error('Erro ao alterar bloqueio por cidade');
    }
  };

  const handleAddCity = async (cityName: string) => {
    const name = cityName.trim();
    if (!name) {
      toast.error('Informe o nome da cidade');
      return;
    }
    setUpdating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await cityTable().insert({ city_name: name, created_by: user?.id });
      if (error) {
        if (error.code === '23505') { toast.error('Esta cidade já está na lista'); return; }
        throw error;
      }
      toast.success(`${name} adicionada à lista`);
      setDialogOpen(false);
      void fetchData();
    } catch (error) {
      log.error('Error adding city:', error);
      toast.error('Erro ao adicionar cidade');
    } finally {
      setUpdating(false);
    }
  };

  const handleRemoveCity = async () => {
    if (!cityToRemove) return;
    setUpdating(true);
    try {
      const { error } = await cityTable().delete().eq('id', cityToRemove.id);
      if (error) throw error;
      toast.success(`${cityToRemove.city_name} removida`);
      setCityToRemove(null);
      void fetchData();
    } catch (error) {
      log.error('Error removing city:', error);
      toast.error('Erro ao remover cidade');
    } finally {
      setUpdating(false);
    }
  };

  return {
    settings, cities, loading, updating,
    dialogOpen, setDialogOpen, cityToRemove, setCityToRemove,
    handleToggle, handleAddCity, handleRemoveCity,
  };
}
