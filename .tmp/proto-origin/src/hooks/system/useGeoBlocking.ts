import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';

interface Country {
  id: string;
  country_code: string;
  country_name: string;
  added_by?: string | null;
  blocked_by?: string | null;
  reason?: string | null;
  created_at: string;
}

interface GeoSettings {
  id: string;
  mode: 'disabled' | 'whitelist' | 'blacklist';
}

type ModoDeBloqueio = GeoSettings['mode'];
type PaisDaLista = Pick<Country, 'country_code'>;

/**
 * Por que a troca de modo foi recusada:
 * - `pais-nao-detectado`: não deu para confirmar o país do próprio admin;
 * - `whitelist-sem-pais-do-admin`: ativar a whitelist deixaria o admin fora dela;
 * - `blacklist-com-pais-do-admin`: ativar a blacklist bloquearia o próprio admin.
 */
export type MotivoRecusaTrocaDeModo =
  | 'pais-nao-detectado'
  | 'whitelist-sem-pais-do-admin'
  | 'blacklist-com-pais-do-admin';

export type AvaliacaoTrocaDeModo =
  | { permitido: true; motivo: null; mensagem: null }
  | { permitido: false; motivo: MotivoRecusaTrocaDeModo; mensagem: string };

// Os textos falam do país do próprio acesso e não citam nenhum país das listas.
const MENSAGENS_DE_RECUSA: Record<MotivoRecusaTrocaDeModo, string> = {
  'pais-nao-detectado':
    'Não foi possível confirmar o país do seu acesso — a ativação foi recusada para não trancar você fora do sistema.',
  'whitelist-sem-pais-do-admin':
    'A whitelist não inclui o país do seu acesso — ativá-la agora trancaria você fora do sistema.',
  'blacklist-com-pais-do-admin':
    'O país do seu acesso está na blacklist — ativá-la agora trancaria você fora do sistema.',
};

const PERMITIDO: AvaliacaoTrocaDeModo = { permitido: true, motivo: null, mensagem: null };

function recusar(motivo: MotivoRecusaTrocaDeModo): AvaliacaoTrocaDeModo {
  return { permitido: false, motivo, mensagem: MENSAGENS_DE_RECUSA[motivo] };
}

/** Código de país comparável: `br` e `BR` são o mesmo país; vazio/ausente = não detectado. */
export function normalizarCodigoDePais(pais: string | null | undefined): string | null {
  if (typeof pais !== 'string') return null;
  const codigo = pais.trim().toUpperCase();
  return codigo === '' ? null : codigo;
}

/**
 * Decide se a troca de modo pode ser aplicada sem trancar o próprio admin.
 * Desativar é sempre permitido: abre o acesso, nunca fecha. O resultado não
 * revela os países das listas — só diz qual é o risco.
 */
export function avaliarTrocaDeModo(
  modo: ModoDeBloqueio,
  paisDoAdmin: string | null | undefined,
  listas: { allowedCountries: PaisDaLista[]; blockedCountries: PaisDaLista[] },
): AvaliacaoTrocaDeModo {
  if (modo === 'disabled') return PERMITIDO;

  const pais = normalizarCodigoDePais(paisDoAdmin);
  if (!pais) return recusar('pais-nao-detectado');

  if (
    modo === 'whitelist' &&
    !listas.allowedCountries.some((c) => normalizarCodigoDePais(c.country_code) === pais)
  ) {
    return recusar('whitelist-sem-pais-do-admin');
  }

  if (
    modo === 'blacklist' &&
    listas.blockedCountries.some((c) => normalizarCodigoDePais(c.country_code) === pais)
  ) {
    return recusar('blacklist-com-pais-do-admin');
  }

  return PERMITIDO;
}

export interface OpcoesDoBloqueioGeografico {
  /** País detectado para o próprio admin (`null`/`''`/ausente = não detectado). */
  country?: string | null;
}

export function useGeoBlocking({ country = null }: OpcoesDoBloqueioGeografico = {}) {
  const [settings, setSettings] = useState<GeoSettings | null>(null);
  const [allowedCountries, setAllowedCountries] = useState<Country[]>([]);
  const [blockedCountries, setBlockedCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');
  const [countryToRemove, setCountryToRemove] = useState<Country | null>(null);
  const [activeTab, setActiveTab] = useState<'whitelist' | 'blacklist'>('whitelist');

  const paisDoAdmin = normalizarCodigoDePais(country);

  /** Avaliação (sem escrever nada) da troca para `modo` — serve para desabilitar o botão com o motivo. */
  const avaliarModo = (modo: ModoDeBloqueio): AvaliacaoTrocaDeModo =>
    avaliarTrocaDeModo(modo, paisDoAdmin, { allowedCountries, blockedCountries });

  const fetchData = async () => {
    try {
      const { data: settingsData } = await supabase.from('geo_blocking_settings').select('*').limit(1).single();
      if (settingsData) setSettings(settingsData as GeoSettings);

      const { data: allowedData } = await supabase.from('allowed_countries').select('*').order('created_at', { ascending: false });
      setAllowedCountries(allowedData || []);

      const { data: blockedData } = await supabase.from('blocked_countries').select('*').order('created_at', { ascending: false });
      setBlockedCountries(blockedData || []);
    } catch (error) {
      log.error('Error fetching geo data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  // Carga inicial dentro de uma função assíncrona: nenhum setState acontece no corpo
  // síncrono do efeito (é o que a regra react-hooks/set-state-in-effect exige).
  useEffect(() => {
    void (async () => {
      await fetchData();
    })();
  }, []);

  const handleModeChange = async (mode: ModoDeBloqueio): Promise<AvaliacaoTrocaDeModo | null> => {
    // Devolve: a avaliação da recusa, ou a avaliação "permitido" quando a escrita
    // deu certo. `null` = nada foi escrito (sem settings ou escrita recusada).
    if (!settings) return null;

    // Ativar whitelist/blacklist sem o país do admin confirmado trancaria o próprio
    // admin fora do sistema: recusa antes de qualquer escrita.
    const avaliacao = avaliarModo(mode);
    if (!avaliacao.permitido) {
      toast.error(avaliacao.mensagem);
      return avaliacao;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('geo_blocking_settings').update({ mode, updated_by: user?.id, updated_at: new Date().toISOString() }).eq('id', settings.id);
      if (error) throw error;
      setSettings({ ...settings, mode });
      const modeLabels = { disabled: 'Desativado', whitelist: 'Whitelist (apenas permitidos)', blacklist: 'Blacklist (bloqueados)' };
      toast.success(`Modo alterado para: ${modeLabels[mode]}`);
      return avaliacao;
    } catch (error) {
      log.error('Error updating mode:', error);
      toast.error('Erro ao alterar modo');
      // A escrita falhou: o modo NÃO mudou, então não devolve "permitido".
      return null;
    }
  };

  const handleAddCountry = async (countryCode: string, countryName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = activeTab === 'whitelist'
        ? await supabase.from('allowed_countries').insert({ country_code: countryCode, country_name: countryName, added_by: user?.id })
        : await supabase.from('blocked_countries').insert({ country_code: countryCode, country_name: countryName, blocked_by: user?.id });
      if (error) {
        if (error.code === '23505') { toast.error('Este país já está na lista'); return; }
        throw error;
      }
      toast.success(`${countryName} adicionado à ${activeTab === 'whitelist' ? 'whitelist' : 'blacklist'}`);
      setDialogOpen(false);
      setSelectedCountry('');
      void fetchData();
    } catch (error) {
      log.error('Error adding country:', error);
      toast.error('Erro ao adicionar país');
    }
  };

  const handleRemoveCountry = async () => {
    if (!countryToRemove) return;
    try {
      const table = activeTab === 'whitelist' ? 'allowed_countries' : 'blocked_countries';
      const { error } = await supabase.from(table).delete().eq('id', countryToRemove.id);
      if (error) throw error;
      toast.success(`${countryToRemove.country_name} removido`);
      setCountryToRemove(null);
      void fetchData();
    } catch (error) {
      log.error('Error removing country:', error);
      toast.error('Erro ao remover país');
    }
  };

  return {
    settings, allowedCountries, blockedCountries, loading,
    dialogOpen, setDialogOpen, selectedCountry, setSelectedCountry,
    countryToRemove, setCountryToRemove, activeTab, setActiveTab,
    avaliarModo,
    handleModeChange, handleAddCountry, handleRemoveCountry,
  };
}
