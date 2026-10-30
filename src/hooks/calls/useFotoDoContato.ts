/**
 * Foto do contato que está ligando, para o alerta de chamada recebida
 * (`src/components/calls/IncomingCallAlert.tsx`).
 *
 * Paridade com a V3: lá o `useIncomingCallBroadcast` entrega
 * `contact_avatar_url` junto da notificação e o alerta mostra a foto. A
 * notificação da V2 (Edge `buildIncomingCallNotification`) carrega só
 * `contact_id`/nome/telefone, então a foto é lida aqui, pelo MESMO caminho de
 * contatos que o listener já usa (`contacts.avatar_url`, sob a RLS do agente —
 * nenhuma foto de terceiro fora do que a RLS permite).
 *
 * Best-effort: sem `contact_id`, sem linha visível ou com erro de rede, a
 * resposta é `null` e o alerta cai nas iniciais. Perder a foto é aceitável;
 * derrubar o alerta da chamada, não.
 *
 * A foto resolvida fica ancorada no `id` do contato que a pediu: quando a
 * chamada seguinte troca de contato, o valor antigo deixa de valer sozinho (sem
 * `setState` sincrono no efeito, que o lint do projeto reprova).
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('useFotoDoContato');

export function useFotoDoContato(contactId: string | null | undefined): string | null {
  const [resolvida, setResolvida] = useState<{ contactId: string; foto: string | null } | null>(null);

  useEffect(() => {
    if (!contactId) return;

    let ativo = true;

    void (async () => {
      try {
        const { data, error } = await supabase
          .from('contacts')
          .select('avatar_url')
          .eq('id', contactId)
          .maybeSingle();

        if (!ativo) return;

        if (error) {
          log.warn('Não foi possível ler a foto do contato da chamada', { contactId });
          setResolvida({ contactId, foto: null });
          return;
        }

        setResolvida({ contactId, foto: (data as { avatar_url?: string | null } | null)?.avatar_url ?? null });
      } catch (err) {
        // Best-effort de verdade: cliente indisponível, RLS ou rede fora não
        // podem virar erro solto — o alerta existe para tocar, não para buscar foto.
        if (!ativo) return;
        log.warn('Leitura da foto do contato falhou', { contactId, err });
        setResolvida({ contactId, foto: null });
      }
    })();

    return () => {
      ativo = false;
    };
  }, [contactId]);

  if (!contactId) return null;
  return resolvida && resolvida.contactId === contactId ? resolvida.foto : null;
}
