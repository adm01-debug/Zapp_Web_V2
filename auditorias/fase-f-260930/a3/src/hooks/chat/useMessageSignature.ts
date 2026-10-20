import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SIGNATURE_ENABLED_KEY = 'chat_signature_enabled';

export function useMessageSignature() {
  const [signatureEnabled, setSignatureEnabled] = useState(() => {
    try {
      return localStorage.getItem(SIGNATURE_ENABLED_KEY) !== 'false';
    } catch {
      return true;
    }
  });
  const [agentSignature, setAgentSignature] = useState('');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const fetchName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mountedRef.current) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, job_title')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!mountedRef.current) return;
      if (profile?.name) {
        const firstName = profile.name.split(' ')[0];
        const sig = profile.job_title
          ? `${firstName} - ${profile.job_title}`
          : firstName;
        setAgentSignature(sig);
      }
    };
    fetchName();
  }, []);

  const toggleSignature = useCallback(() => {
    setSignatureEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(SIGNATURE_ENABLED_KEY, String(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const applySignature = useCallback((content: string): string => {
    if (!signatureEnabled || !agentSignature) return content;
    return `*${agentSignature}:*\n${content}`;
  }, [signatureEnabled, agentSignature]);

  return { signatureEnabled, agentName: agentSignature, toggleSignature, applySignature };
}
