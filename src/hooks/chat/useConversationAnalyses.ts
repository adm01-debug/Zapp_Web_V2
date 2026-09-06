import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface ConversationAnalysis {
  id: string;
  contact_id: string;
  analyzed_by: string | null;
  summary: string;
  status: string;
  key_points: string[];
  next_steps: string[];
  sentiment: 'positivo' | 'neutro' | 'negativo' | 'critico';
  sentiment_score: number;
  topics: string[];
  urgency: 'baixa' | 'media' | 'alta' | 'critica' | null;
  customer_satisfaction: number;
  message_count: number;
  created_at: string;
}

export function useConversationAnalyses(contactId: string | null) {
  const [analyses, setAnalyses] = useState<ConversationAnalysis[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalyses = useCallback(async () => {
    if (!contactId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('conversation_analyses')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      setAnalyses((data || []) as ConversationAnalysis[]);
    } catch (err) {
      log.error('Error fetching analyses:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    fetchAnalyses();
  }, [fetchAnalyses]);

  const saveAnalysis = async (analysis: Omit<ConversationAnalysis, 'id' | 'created_at' | 'analyzed_by'>) => {
    try {
      // Get current user's profile id
      const { data: { user } } = await supabase.auth.getUser();
      let profileId: string | null = null;
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        
        profileId = profile?.id || null;
      }

      const { data, error } = await supabase
        .from('conversation_analyses')
        .insert({
          ...analysis,
          analyzed_by: profileId
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state
      setAnalyses(prev => [data as ConversationAnalysis, ...prev]);
      
      return data as ConversationAnalysis;
    } catch (err) {
      log.error('Error saving analysis:', err);
      throw err;
    }
  };

  const getLatestAnalysis = () => {
    return analyses[0] || null;
  };

  const getSentimentTrend = () => {
    if (analyses.length < 2) return null;
    
    const recent = analyses.slice(0, 5);
    const avgRecent = recent.reduce((sum, a) => sum + a.sentiment_score, 0) / recent.length;
    
    const older = analyses.slice(5, 10);
    if (older.length === 0) return null;
    
    const avgOlder = older.reduce((sum, a) => sum + a.sentiment_score, 0) / older.length;
    
    const diff = avgRecent - avgOlder;
    
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  };

  return {
    analyses,
    loading,
    error,
    saveAnalysis,
    getLatestAnalysis,
    getSentimentTrend,
    refetch: fetchAnalyses
  };
}
