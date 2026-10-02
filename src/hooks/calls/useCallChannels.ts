/**
 * T23 — capacidades por canal (VoIP e WhatsApp).
 *
 * Duas peças no mesmo módulo, de propósito:
 *  - `capacidadesPorCanal` é a regra PURA (sem React, sem I/O) — é o que o
 *    teste cobre e o que a UI pode reusar sem montar o hook;
 *  - `useCallChannels` lê o estado real (linha SIP + microfone pelo provider)
 *    e a linha de WhatsApp no banco, e devolve o mesmo par.
 *
 * Regra do plano (etapa T23): o VoIP só disca com `sipStatus === 'registered'`
 * e microfone liberado; o WhatsApp entra SEMPRE como somente-recebidas
 * (`whatsapp_no_outbound`) enquanto a linha `is_default` estiver conectada.
 * As conexões de teste `[E2E]` nunca viram linha real.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCallSession } from '@/providers/CallSessionProvider';
import { useAuth } from '@/hooks/auth/useAuth';
import type { SipStatus } from '@/hooks/sip/useSipConnection';
import { type ChannelCapability, type CapabilityReason } from '@/lib/calls/capabilities';
import type { CallChannel } from '@/lib/calls/callStatus';

/** Canal como constante tipada — o contrato pede `CallChannel` importado. */
const CANAL_VOIP: CallChannel = 'voip';
const CANAL_WHATSAPP: CallChannel = 'whatsapp';

/** Prefixo das linhas criadas por teste E2E (nunca contam como linha real). */
const PREFIXO_E2E = '[E2E]';

/** Linha de `whatsapp_connections` que decide a capacidade do canal. */
export interface WhatsappConnectionRow {
  name?: string | null;
  status?: string | null;
  is_default?: boolean | null;
}

/** Entrada do mapeamento puro: o estado que o hook lê, já sem I/O. */
export interface CapacidadesEntrada {
  sipStatus: SipStatus;
  sipReason: CapabilityReason | null;
  micReason: CapabilityReason | null;
  /** Conexões candidatas; o mapper escolhe a `is_default` e descarta `[E2E]`. */
  whatsapp: readonly WhatsappConnectionRow[] | null | undefined;
  /**
   * O usuário enxerga a linha de WhatsApp? A RLS de `whatsapp_connections` só devolve
   * linhas para admin/supervisor, então para o agente comum a ausência de linha NÃO
   * significa "sem conexão" — significa "sem permissão". Ausente/true = comportamento
   * antigo (não quebra quem já usava o mapper).
   */
  podeVerWhatsApp?: boolean;
}

/** Resultado do mapeamento: uma capacidade por canal. */
export interface CapacidadesPorCanal {
  voip: ChannelCapability;
  whatsapp: ChannelCapability;
}

/** É uma linha criada por teste E2E? (nunca conta como linha real). */
export function ehLinhaE2E(name: string | null | undefined): boolean {
  return typeof name === 'string' && name.startsWith(PREFIXO_E2E);
}

/**
 * Motivo padrão do VoIP quando o SIP não está registrado e o `sipReason` não
 * trouxe um mais específico (`line_in_use_*`, por exemplo).
 *
 * `connecting` é a mesma família de `reconnecting`: a linha ainda não atende
 * nem disca, e a frase operacional ("Reconectando…") é a mesma — não vale
 * inventar um segundo motivo para o mesmo sintoma.
 */
function motivoPadraoDoSip(sipStatus: SipStatus): CapabilityReason {
  switch (sipStatus) {
    case 'reconnecting':
    case 'connecting':
      return 'voip_reconnecting';
    case 'unavailable':
      return 'voip_unavailable';
    case 'idle':
      return 'voip_not_configured';
    case 'registered':
      // Só chega aqui com microfone travado, tratado antes deste ponto.
      return 'voip_unavailable';
  }
}

/**
 * Capacidade do VoIP. O microfone tem precedência sobre o status do SIP:
 * com o mic travado o agente não disca nem atende, mas ainda consegue RECUSAR
 * uma chamada que já está tocando — recusar não precisa de microfone.
 */
function capacidadeVoip(
  sipStatus: SipStatus,
  sipReason: CapabilityReason | null,
  micReason: CapabilityReason | null,
): ChannelCapability {
  // Qualquer motivo não-nulo significa que a sondagem do microfone FALHOU.
  // Tratar só os três motivos conhecidos deixaria o canal mentindo "disca"
  // quando o `motivoDoMicrofone` devolvesse `unknown` numa causa não mapeada.
  if (micReason !== null) {
    return {
      channel: CANAL_VOIP,
      canDial: false,
      canReceive: false,
      canRecord: false,
      // Recusar não precisa de microfone, mas precisa de LINHA: sem registro
      // não existe chamada tocando para recusar.
      canReject: sipStatus === 'registered',
      reason: micReason,
    };
  }

  if (sipStatus === 'registered') {
    // Linha boa: sem motivo para mostrar na tela. Sem gravação de chamada no
    // código hoje, `canRecord` é sempre falso.
    return {
      channel: CANAL_VOIP,
      canDial: true,
      canReceive: true,
      canRecord: false,
      canReject: true,
    };
  }

  // Linha fora do ar: não disca, não recebe e não há o que recusar. O motivo
  // específico do `sipReason` (linha em outra aba/usuário) prevalece sobre o
  // motivo genérico do status.
  return {
    channel: CANAL_VOIP,
    canDial: false,
    canReceive: false,
    canRecord: false,
    canReject: false,
    reason: sipReason ?? motivoPadraoDoSip(sipStatus),
  };
}

/**
 * Capacidade do WhatsApp. Considera SÓ a conexão `is_default` e ignora as
 * linhas `[E2E]` — a garantia fica aqui além do filtro da consulta.
 *
 * Linha existente → somente-recebidas (`whatsapp_no_outbound`, texto literal do
 * plano). Sem linha utilizável (nenhuma default ou só a `[E2E]`) →
 * `whatsapp_unavailable` e não recebe.
 */
function capacidadeWhatsapp(
  whatsapp: readonly WhatsappConnectionRow[] | null | undefined,
  podeVerWhatsApp?: boolean,
): ChannelCapability {
  const conexao = (whatsapp ?? []).find(
    (linha) => linha.is_default === true && !ehLinhaE2E(linha.name),
  );

  if (!conexao) {
    return {
      channel: CANAL_WHATSAPP,
      canDial: false,
      canReceive: false,
      canRecord: false,
      canReject: false,
      // D8: sem permissão, a linha é invisível por RLS — o canal não pode mentir
      // "indisponível" e sim dizer por que ele não aparece para este usuário.
      reason: podeVerWhatsApp === false ? 'whatsapp_restrito_supervisores' : 'whatsapp_unavailable',
    };
  }

  return {
    channel: CANAL_WHATSAPP,
    canDial: false,
    canReceive: conexao.status === 'connected',
    canRecord: false,
    canReject: false,
    reason: 'whatsapp_no_outbound',
  };
}

/** Regra pura das capacidades — sem React e sem I/O. */
export function capacidadesPorCanal({
  sipStatus,
  sipReason,
  micReason,
  whatsapp,
  podeVerWhatsApp,
}: CapacidadesEntrada): CapacidadesPorCanal {
  return {
    voip: capacidadeVoip(sipStatus, sipReason, micReason),
    whatsapp: capacidadeWhatsapp(whatsapp, podeVerWhatsApp),
  };
}

/**
 * Lê o estado real e devolve as capacidades por canal.
 *
 * O estado do VoIP vem do provider (`useCallSession`), que é a fonte única:
 * ele repassa `sipStatus`/`sipReason`/`micReason` do `useSipClient` já montado
 * (um por app). Chamar `useSipClient()` aqui dentro criaria um SEGUNDO motor
 * SIP — outro UserAgent/REGISTER — e não refletiria a linha de verdade.
 */
export function useCallChannels(): { voip: ChannelCapability; whatsapp: ChannelCapability } {
  const { sipStatus, sipReason, micReason } = useCallSession();
  const { user } = useAuth();
  const [whatsapp, setWhatsapp] = useState<WhatsappConnectionRow[] | null>(null);
  // Mesma leitura de papéis que `usePermissions` já faz (user_roles do próprio usuário).
  // Começa em `false` de propósito: se a leitura falhar, o canal aparece como restrito
  // ("Disponível para supervisores") em vez de fingir "sem conexão".
  const [podeVerWhatsApp, setPodeVerWhatsApp] = useState<boolean>(false);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      if (!user) {
        if (ativo) setPodeVerWhatsApp(false);
        return;
      }
      try {
        const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id);
        const papeis = (data ?? []).map((linha) => linha.role);
        if (ativo) setPodeVerWhatsApp(papeis.includes('admin') || papeis.includes('supervisor'));
      } catch {
        if (ativo) setPodeVerWhatsApp(false);
      }
    })();
    return () => {
      ativo = false;
    };
  }, [user]);

  useEffect(() => {
    let ativo = true;
    void (async () => {
      try {
        const { data } = await supabase
          .from('whatsapp_connections')
          .select('name, status, is_default')
          .eq('is_default', true)
          // Linhas de teste nunca entram: filtradas na consulta E de novo no
          // mapper (`capacidadeWhatsapp`), que é a garantia final.
          .not('name', 'ilike', `${PREFIXO_E2E}%`)
          .limit(1);
        if (ativo) setWhatsapp(data ?? []);
      } catch {
        // Best-effort: sem linha visível, o canal cai em `whatsapp_unavailable`.
        if (ativo) setWhatsapp([]);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  return useMemo(
    () => capacidadesPorCanal({ sipStatus, sipReason, micReason, whatsapp, podeVerWhatsApp }),
    [sipStatus, sipReason, micReason, whatsapp, podeVerWhatsApp],
  );
}
