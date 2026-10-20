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

export function useNPSSurveys() {
  const [surveys, setSurveys] = useState<NPSSurvey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const fetchSurveys = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('nps_surveys')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      if (isMountedRef.current) {
        setSurveys((data as NPSSurvey[]) || []);
      }
    } catch (err) {
      log.error('Error fetching NPS surveys:', err);
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

  return { surveys, isLoading, metrics, createSurvey, refetch: fetchSurveys };
}
