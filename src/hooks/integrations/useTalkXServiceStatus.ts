/**
 * X048 (TL-106) — estado dos serviços que o Talk X consome, para a Visão geral
 * aplicar o estado "Conexão WhatsApp desconectada" com o botão ligado.
 *
 * `whatsapp.connected` responde "existe conexão ativa?" com a MESMA checagem que
 * o restante do app já usa para essa pergunta
 * (`whatsapp_connections` com `status = 'connected'`, `limit(1)`):
 * `useCatalogSendReadiness` (catálogo) e `useOnboardingChecklist` (onboarding).
 *
 * O valor é tri-estado de propósito:
 *  - `true`  → existe conexão ativa;
 *  - `false` → a consulta RESPONDEU e não existe conexão ativa (a tela mostra o estado);
 *  - `null`  → ainda checando (ou a consulta falhou): sem resposta confiável não se
 *              acusa "desconectado" — a tela não inventa um problema que pode não existir.
 *
 * Isolado em `src/hooks` (e não em `src/components`): a camada de apresentação não
 * fala com o Supabase direto.
 *
 * Fora desta entrega (não há sinal no código atual, então não foi inventado):
 *  - `crm` (`ok | unavailable | not_configured`): depende do sinal de disponibilidade
 *    de CAP-092, ainda parcial no inventário (só o selo do vínculo);
 *  - `realtime`: nenhum canal do módulo expõe o estado da conexão de tempo real.
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface TalkXServiceStatus {
  whatsapp: {
    /** `true` ativa · `false` sem conexão ativa · `null` ainda não se sabe. */
    connected: boolean | null;
  };
}

export function useTalkXServiceStatus(): TalkXServiceStatus {
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_connections')
          .select('id')
          .eq('status', 'connected')
          .limit(1);
        if (cancelled) return;
        setConnected(error || !data ? null : data.length > 0);
      } catch {
        // Falha de consulta ≠ "desconectado": fica indeterminado.
        if (!cancelled) setConnected(null);
      }
    };

    void check();
    return () => { cancelled = true; };
  }, []);

  return { whatsapp: { connected } };
}
