/**
 * useEvolutionContactProfile — perfil enriquecido do contato na tabela
 * `evolution_contacts` (banco da VPS da Evolution), lido pela edge
 * `external-db-proxy` (que só permite SELECT nessa tabela).
 *
 * Restaurado (2026-11-12) do hook que saiu em cascata na #1886, agora com
 * React Query. `notConfigured` vem do próprio proxy quando a VPS não está
 * ligada neste ambiente — a tela diz isso em vez de fingir "sem perfil".
 */
import { useQuery } from '@tanstack/react-query';
import { queryExternalProxy } from '@/lib/externalProxy';

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
  } | null;
  device_info?: {
    platform?: string;
    device_manufacturer?: string;
    device_model?: string;
    os_version?: string;
    wa_version?: string;
  } | null;
  last_seen?: string | null;
  labels?: string[] | null;
}

export interface EvolutionContactProfileResult {
  profile: EvolutionContactProfile | null;
  notConfigured: boolean;
}

const normalizeDigits = (value?: string | null) => (value ?? '').replace(/\D/g, '');

/** O mesmo número pode estar gravado com/sem DDI 55 e com sufixo novo ou antigo. */
export function buildJidVariants(phone: string): string[] {
  const digits = normalizeDigits(phone);
  if (!digits) return [];
  const base = digits.startsWith('55') ? digits : `55${digits}`;
  return Array.from(new Set([
    `${digits}@s.whatsapp.net`,
    `${base}@s.whatsapp.net`,
    `${digits}@c.us`,
    `${base}@c.us`,
  ]));
}

export function useEvolutionContactProfile(phone: string | null | undefined) {
  const jids = buildJidVariants(phone ?? '');
  return useQuery<EvolutionContactProfileResult>({
    queryKey: ['evolution-contact-profile', jids.join(',')],
    queryFn: async () => {
      const result = await queryExternalProxy<EvolutionContactProfile>({
        table: 'evolution_contacts',
        select: '*',
        filters: [{ column: 'remote_jid', operator: 'in', value: `(${jids.map((j) => `"${j}"`).join(',')})` }],
        limit: 1,
      });
      if (result.notConfigured) return { profile: null, notConfigured: true };
      const profile = Array.isArray(result.data) && result.data.length > 0 ? result.data[0] : null;
      return { profile, notConfigured: false };
    },
    enabled: jids.length > 0,
    staleTime: 5 * 60_000,
  });
}
