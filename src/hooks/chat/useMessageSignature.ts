import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getUiPreferences, setUiPreference, useUiPreferences } from '@/hooks/ui/useUiPreferences';

const SIGNATURE_ENABLED_KEY = 'chat_signature_enabled';

/** Cache local do boot offline; o servidor vence quando há sessão. */
function lerAssinaturaLocal(): boolean {
  try {
    return localStorage.getItem(SIGNATURE_ENABLED_KEY) !== 'false';
  } catch {
    return true;
  }
}

function normalizarAssinatura(valor: unknown): boolean | null {
  return typeof valor === 'boolean' ? valor : null;
}

export function useMessageSignature() {
  const { serverPrefs, ready } = useUiPreferences();
  const assinaturaDoServidor = normalizarAssinatura(serverPrefs?.signatureEnabled);
  const [signatureEnabled, setSignatureEnabled] = useState<boolean>(
    () => normalizarAssinatura(getUiPreferences().signatureEnabled) ?? lerAssinaturaLocal(),
  );
  const [agentSignature, setAgentSignature] = useState('');
  const mountedRef = useRef(true);
  // Ligar/desligar na aba manda: a preferência do servidor só vale para quem
  // ainda não tocou no botão (resposta atrasada não reverte a escolha).
  const assinaturaTocadaRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!ready || assinaturaTocadaRef.current || assinaturaDoServidor === null) return;
    setSignatureEnabled(prev => (prev === assinaturaDoServidor ? prev : assinaturaDoServidor));
  }, [ready, assinaturaDoServidor]);

  // Depois que o usuário mexe, toda mudança local vai para o cache e para a conta
  // (espelhado aqui, fora do updater do React, que precisa ser puro).
  useEffect(() => {
    if (!assinaturaTocadaRef.current) return;
    try { localStorage.setItem(SIGNATURE_ENABLED_KEY, String(signatureEnabled)); } catch { /* storage unavailable */ }
    setUiPreference('signatureEnabled', signatureEnabled);
  }, [signatureEnabled]);

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
    void fetchName();
  }, []);

  const toggleSignature = useCallback(() => {
    assinaturaTocadaRef.current = true;
    setSignatureEnabled(prev => !prev);
  }, []);

  const applySignature = useCallback((content: string): string => {
    if (!signatureEnabled || !agentSignature) return content;
    return `*${agentSignature}:*\n${content}`;
  }, [signatureEnabled, agentSignature]);

  return { signatureEnabled, agentName: agentSignature, toggleSignature, applySignature };
}
