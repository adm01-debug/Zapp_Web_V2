import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { toast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';

export interface Call {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  whatsapp_connection_id: string | null;
  direction: 'inbound' | 'outbound';
  status: 'ringing' | 'answered' | 'ended' | 'missed';
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface StartCallParams {
  contactId?: string;
  contactPhone: string;
  contactName: string;
  direction: 'inbound' | 'outbound';
  whatsappConnectionId?: string;
}

export const useCalls = () => {
  const { user } = useAuth();
  const [currentCallId, setCurrentCallId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Get current user's profile id
  const getProfileId = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    
    return data?.id || null;
  }, [user]);

  // Start a new call
  const startCall = useCallback(async (params: StartCallParams): Promise<string | null> => {
    setIsLoading(true);
    try {
      const profileId = await getProfileId();
      
      const { data, error } = await supabase
        .from('calls')
        .insert({
          contact_id: params.contactId || null,
          agent_id: profileId,
          direction: params.direction,
          status: 'ringing',
          whatsapp_connection_id: params.whatsappConnectionId || null,
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentCallId(data.id);
      return data.id;
    } catch (error) {
      log.error('Error starting call:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível registrar a chamada',
        variant: 'destructive',
      });
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [getProfileId]);

  // Answer the call
  const answerCall = useCallback(async (callId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'answered',
          answered_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) throw error;
      return true;
    } catch (error) {
      log.error('Error answering call:', error);
      return false;
    }
  }, []);

  // End the call
  const endCall = useCallback(async (callId: string, durationSeconds: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
          duration_seconds: durationSeconds,
        })
        .eq('id', callId);

      if (error) throw error;
      
      setCurrentCallId(null);
      return true;
    } catch (error) {
      log.error('Error ending call:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível finalizar a chamada',
        variant: 'destructive',
      });
      return false;
    }
  }, []);

  // Mark call as missed
  const missCall = useCallback(async (callId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'missed',
          ended_at: new Date().toISOString(),
        })
        .eq('id', callId);

      if (error) throw error;
      
      setCurrentCallId(null);
      return true;
    } catch (error) {
      log.error('Error marking call as missed:', error);
      return false;
    }
  }, []);

  // Add notes to a call
  const addCallNotes = useCallback(async (callId: string, notes: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('calls')
        .update({ notes })
        .eq('id', callId);

      if (error) throw error;
      return true;
    } catch (error) {
      log.error('Error adding call notes:', error);
      return false;
    }
  }, []);

  // Get call history for a contact
  const getContactCalls = useCallback(async (contactId: string): Promise<Call[]> => {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .eq('contact_id', contactId)
        .order('started_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Call[];
    } catch (error) {
      log.error('Error fetching contact calls:', error);
      return [];
    }
  }, []);

  return {
    currentCallId,
    isLoading,
    startCall,
    answerCall,
    endCall,
    missCall,
    addCallNotes,
    getContactCalls,
  };
};
