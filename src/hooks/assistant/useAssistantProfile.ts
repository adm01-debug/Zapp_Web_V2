import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { log } from '@/lib/logger';

export type Atividade = 'venda' | 'compra' | 'atendimento' | 'supervisao';
export type AjudaPreferida = 'sempre' | 'relevante' | 'sob_demanda';
export type TomPreferido = 'direto' | 'consultivo' | 'formal';

export interface AssistantProfile {
  atividade: Atividade;
  foco: string;
  ajuda: AjudaPreferida;
  tom: TomPreferido;
}

export const DEFAULT_ASSISTANT_PROFILE: AssistantProfile = {
  atividade: 'atendimento',
  foco: '',
  ajuda: 'relevante',
  tom: 'consultivo',
};

const VALID = {
  atividade: new Set(['venda', 'compra', 'atendimento', 'supervisao']),
  ajuda: new Set(['sempre', 'relevante', 'sob_demanda']),
  tom: new Set(['direto', 'consultivo', 'formal']),
} as const;

function isProfile(value: unknown): value is AssistantProfile {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.atividade === 'string' && VALID.atividade.has(p.atividade as never) &&
    typeof p.foco === 'string' &&
    typeof p.ajuda === 'string' && VALID.ajuda.has(p.ajuda as never) &&
    typeof p.tom === 'string' && VALID.tom.has(p.tom as never)
  );
}

/** Fase 1 do assistente pessoal: identidade de quem está do outro lado. */
export function useAssistantProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<AssistantProfile>(DEFAULT_ASSISTANT_PROFILE);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('assistant_profiles')
          .select('atividade, foco, ajuda, tom')
          .eq('user_id', user.id)
          .maybeSingle();
        if (cancelled) return;
        if (error) throw error;
        if (data && isProfile(data)) {
          setProfile(data);
        }
      } catch (err) {
        log.error('Falha ao ler perfil do assistente', err);
        if (!cancelled) setIsError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const saveProfile = useCallback(
    async (next: AssistantProfile): Promise<boolean> => {
      if (!user) return false;
      setIsSaving(true);
      try {
        const row = { ...next, user_id: user.id, updated_at: new Date().toISOString() };
        const { error } = await supabase
          .from('assistant_profiles')
          .upsert(row, { onConflict: 'user_id' });
        if (error) throw error;
        setProfile(next);
        return true;
      } catch (err) {
        log.error('Falha ao salvar perfil do assistente', err);
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [user],
  );

  return { profile, isLoading, isError, isSaving, saveProfile };
}
