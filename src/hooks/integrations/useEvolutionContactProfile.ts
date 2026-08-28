import { useCallback, useEffect, useRef, useState } from 'react';
import { queryExternalProxy } from '@/lib/externalProxy';
import { log } from '@/lib/logger';

/**
 * Perfil enriquecido vindo da tabela `evolution_contacts` (VPS externa).
 * Inclui foto HD, business profile, status verificado, info de device.
 */
export interface EvolutionContactProfile {
  id?: string;
  remote_jid?: string | null;
  push_name?: string | null;
  verified_name?: string | null;
  profile_picture_url?: string | null;
  profile_picture_hd?: string | null;
  about?: string | null;
  is_business?: boolean | null;
  is_enterprise?: boolean | null;
  verified?: boolean | null;
  business_profile?: {
    description?: string;
    email?: string;
    website?: string[];
    address?: string;
    category?: string;
    business_hours?: unknown;
  } | null;
  device_info?: {
    platform?: string;
    device_manufacturer?: string;
    device_model?: string;
    os_version?: string;
    wa_version?: string;
  } | null;
  status?: string | null;
  last_seen?: string | null;
  presence?: string | null;
  labels?: string[] | null;
  instance_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface UseEvolutionContactProfileResult {
  profile: EvolutionContactProfile | null;
  loading: boolean;
  error: string | null;
  notConfigured: boolean;
  refresh: () => Promise<void>;
}

const normalizeDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

const buildJidVariants = (phone: string): string[] => {
  const digits = normalizeDigits(phone);
  if (!digits) return [];
  const base = digits.startsWith('55') ? digits : `55${digits}`;
  const variants = new Set<string>([
    `${digits}@s.whatsapp.net`,
    `${base}@s.whatsapp.net`,
    `${digits}@c.us`,
    `${base}@c.us`,
  ]);
  return Array.from(variants);
};

export function useEvolutionContactProfile(phone: string | undefined | null): UseEvolutionContactProfileResult {
  const [profile, setProfile] = useState<EvolutionContactProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const fetchProfile = useCallback(async () => {
    if (!phone) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const jids = buildJidVariants(phone);
      const result = await queryExternalProxy<EvolutionContactProfile>({
        table: 'evolution_contacts',
        select: '*',
        filters: [{ column: 'remote_jid', operator: 'in', value: `(${jids.map((j) => `"${j}"`).join(',')})` }],
        limit: 1,
      });
      if (!mountedRef.current) return;
      const cast = result as unknown as { notConfigured?: boolean };
      if (cast.notConfigured) {
        setNotConfigured(true);
        setProfile(null);
        return;
      }
      setNotConfigured(false);
      setProfile(Array.isArray(result.data) && result.data.length > 0 ? result.data[0] : null);
    } catch (err) {
      log.error('useEvolutionContactProfile error', err);
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : 'Erro ao buscar perfil');
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [phone]);

  useEffect(() => { void fetchProfile(); }, [fetchProfile]);

  return { profile, loading, error, notConfigured, refresh: fetchProfile };
}