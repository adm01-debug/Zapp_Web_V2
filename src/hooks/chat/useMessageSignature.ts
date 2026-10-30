import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

const SIGNATURE_ENABLED_KEY = 'chat_signature_enabled';

/**
 * Assinatura de texto do agente no Inbox.
 *
 * O nome vem do contexto de autenticação (`useAuth`) — a identidade já resolvida no
 * boot. Antes o hook chamava `supabase.auth.getUser()` a cada montagem do `ChatPanel`,
 * o que era uma ida à rede desnecessária (e uma nova espera) toda vez que a conversa
 * era aberta.
 *
 * `applySignature` é IDEMPOTENTE: aplicar de novo a um texto que já começa pelo
 * prefixo não duplica a assinatura. Isso protege os caminhos em que a mensagem passa
 * mais de uma vez pela assinatura (reuso de rascunho, prévia e envio medindo o mesmo
 * payload) — sem essa guarda o prefixo era empilhado uma vez por passagem.
 */
export function useMessageSignature() {
  const { user } = useAuth();
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
    if (!user || !mountedRef.current) return;
    const fetchName = async () => {
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
  }, [user]);

  const toggleSignature = useCallback(() => {
    setSignatureEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(SIGNATURE_ENABLED_KEY, String(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, []);

  const applySignature = useCallback((content: string): string => {
    if (!signatureEnabled || !agentSignature || !content) return content;
    const prefix = `*${agentSignature}:*\n`;
    if (content.startsWith(prefix)) return content;
    return `${prefix}${content}`;
  }, [signatureEnabled, agentSignature]);

  return { signatureEnabled, agentName: agentSignature, toggleSignature, applySignature };
}
