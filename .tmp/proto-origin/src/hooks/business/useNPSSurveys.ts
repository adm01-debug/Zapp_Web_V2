import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('NPSSurveys');
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface NPSSurvey {
  id: string;
  contact_id: string;
  agent_id: string | null;
  score: number;
  feedback: string | null;
  survey_type: 'periodic' | 'post_resolution' | 'manual';
  created_at: string;
}

interface NPSMetrics {
  totalResponses: number;
  promoters: number;
  passives: number;
  detractors: number;
  npsScore: number;
  avgScore: number;
}

/**
 * Teto de linhas lidas do PostgREST (`.limit`). A agregação deste hook é feita no
 * cliente, então ela só enxerga as respostas mais recentes até este teto — o
 * consumidor precisa avisar o usuário quando o teto é atingido (o painel mostra
 * "baseado nas últimas N respostas"), em vez de apresentar o número como se fosse
 * o total da base.
 */
export const NPS_SURVEY_LIMIT = 500;

/** PostgrestError não é `instanceof Error`: o `message` dele precisa ser lido à parte. */
function mensagemDoErro(err: unknown, padrao: string): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string' && msg) return msg;
  }
  return padrao;
}

export function useNPSSurveys() {
  const [surveys, setSurveys] = useState<NPSSurvey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchSurveys = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('nps_surveys')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(NPS_SURVEY_LIMIT);

      if (fetchError) throw fetchError;
      if (isMountedRef.current) {
        const rows = (data as NPSSurvey[]) || [];
        setSurveys(rows);
        setIsTruncated(rows.length >= NPS_SURVEY_LIMIT);
      }
    } catch (err) {
      log.error('Error fetching NPS surveys:', err);
      if (isMountedRef.current) {
        // Falha de leitura NÃO é "nenhuma pesquisa respondida": sem este estado o
        // painel exibia NPS 0 e contadores zerados como se fossem dado real.
        setError(mensagemDoErro(err, 'Falha ao carregar as pesquisas NPS'));
        setIsTruncated(false);
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchSurveys();
  }, [fetchSurveys]);

  const createSurvey = useCallback(async (data: {
    contact_id: string;
    score: number;
    feedback?: string;
    survey_type?: string;
  }) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id || '')
        .single();

      const { error } = await supabase
        .from('nps_surveys')
        .insert({
          contact_id: data.contact_id,
          agent_id: profile?.id || null,
          score: data.score,
          feedback: data.feedback || null,
          survey_type: data.survey_type || 'manual',
        });

      if (error) throw error;
      toast.success('Pesquisa NPS registrada!');
      await fetchSurveys();
    } catch (err) {
      toast.error('Erro ao registrar pesquisa NPS');
      throw err;
    }
  }, [fetchSurveys]);

  // NOTA (código morto conhecido): `createSurvey` não tem chamador — nenhuma tela, Edge
  // Function ou cron insere em `nps_surveys` na V2 (o envio de pesquisa NPS não existe; a
  // satisfação automática do atendimento é o CSAT/PD-34). Fica mantido (documentado) em vez
  // de removido porque apagá-lo desloca a linha da dívida `react-hooks/set-state-in-effect`
  // já registrada em scripts/ci/eslint-baseline.json, cuja alteração exige aprovação
  // explícita. Quando o baseline for regerado, a remoção deste trecho é segura.

  const metrics: NPSMetrics = useMemo(() => {
    const total = surveys.length;
    if (total === 0) {
      return { totalResponses: 0, promoters: 0, passives: 0, detractors: 0, npsScore: 0, avgScore: 0 };
    }

    const promoters = surveys.filter(s => s.score >= 9).length;
    const passives = surveys.filter(s => s.score >= 7 && s.score <= 8).length;
    const detractors = surveys.filter(s => s.score <= 6).length;
    const npsScore = Math.round(((promoters - detractors) / total) * 100);
    const avgScore = +(surveys.reduce((sum, s) => sum + s.score, 0) / total).toFixed(1);

    return { totalResponses: total, promoters, passives, detractors, npsScore, avgScore };
  }, [surveys]);

  return { surveys, isLoading, error, isTruncated, metrics, createSurvey, refetch: fetchSurveys };
}
