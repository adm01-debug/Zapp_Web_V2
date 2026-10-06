/**
 * CT-08 — checagem pré-envio do fluxo de envio do catálogo.
 *
 * Antes de habilitar o botão "Enviar", o fluxo confere duas coisas que hoje só
 * apareciam como erro depois do envio (ou não apareciam):
 *
 *  1. existe alguma conexão de WhatsApp com status `connected` — a mesma query
 *     que o inbox usa como fallback em useChatMediaSending (whatsapp_connections
 *     .eq('status','connected').limit(1)). Sem conexão, a mensagem só falharia
 *     na edge, mensagem por mensagem;
 *  2. o contato não está suprimido em `talkx_blacklist` (por contact_id ou pelo
 *     telefone normalizado, respeitando `expires_at`). A tabela real é
 *     `talkx_blacklist` — o plano supunha `talkx_blacklist_active`, que não existe.
 *
 * Isolado em src/hooks (e não em src/components) porque a camada de apresentação
 * não fala com o Supabase direto.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SendReadinessContact {
  id: string;
  phone: string;
}

export interface SendReadiness {
  blocked: boolean;
  reason: string | null;
}

const NO_CONNECTION_REASON =
  'Nenhuma conexão de WhatsApp ativa. Reconecte a instância em Conexões para poder enviar.';

/**
 * R2-MOD-008 — a consulta de prontidão falhou: o estado é "indisponível", não
 * "liberado". Enquanto não houver resposta confiável (conexão conectada e
 * supressão conferida) o envio fica bloqueado, com retry explícito.
 */
export const READINESS_UNAVAILABLE_REASON =
  'Não foi possível verificar as condições de envio (conexão de WhatsApp e lista de supressão). '
  + 'O envio fica bloqueado até a verificação responder — tente de novo.';

export const normalizeCatalogPhone = (phone: string): string => phone.replace(/\D/g, '');

/** Consulta as duas condições e devolve o motivo do bloqueio (ou nada). */
export async function fetchCatalogSendReadiness(contact: SendReadinessContact): Promise<SendReadiness> {
  const { data: connections, error: connectionsError } = await supabase
    .from('whatsapp_connections')
    .select('id')
    .eq('status', 'connected')
    .limit(1);

  if (connectionsError) throw connectionsError;
  if (!connections || connections.length === 0) {
    return { blocked: true, reason: NO_CONNECTION_REASON };
  }

  const phone = normalizeCatalogPhone(contact.phone);
  const now = new Date().toISOString();
  // Um único filtro `or` com os dois caminhos de identificação, cada um casado
  // com a janela de validade. Dois `.or()` encadeados viram `or=...&or=...` na
  // URL e o PostgREST resolve só um deles.
  const contactsThatBlock = [
    `and(contact_id.eq.${contact.id},or(expires_at.is.null,expires_at.gt.${now}))`,
  ];
  if (phone) {
    contactsThatBlock.push(`and(phone.eq.${phone},or(expires_at.is.null,expires_at.gt.${now}))`);
  }

  const { data: blocked, error: blockedError } = await supabase
    .from('talkx_blacklist')
    .select('id, reason_code')
    .or(contactsThatBlock.join(','))
    .limit(1);

  if (blockedError) throw blockedError;
  if (blocked && blocked.length > 0) {
    return {
      blocked: true,
      reason: 'Contato na lista de supressão (opt-out/LGPD). Envio bloqueado para este número.',
    };
  }

  return { blocked: false, reason: null };
}

/**
 * `contact` nulo = passo de contato ainda sem contato escolhido: não consulta
 * nada e não bloqueia (o botão já está desabilitado por falta de contato).
 *
 * R2-MOD-008 — o resultado é explícito em três estados: `checking` (ainda
 * perguntando), `unavailable` (a consulta falhou: bloqueia e oferece `retry`)
 * e liberado (`blocked: false`). Falha de consulta NUNCA libera o envio — sem
 * resposta confiável o fluxo fica fechado, como no envio individual.
 */
export function useCatalogSendReadiness(contact: SendReadinessContact | null) {
  const query = useQuery({
    queryKey: ['catalog-send-readiness', contact?.id ?? null, contact?.phone ?? null],
    enabled: !!contact,
    staleTime: 30_000,
    queryFn: () => fetchCatalogSendReadiness(contact as SendReadinessContact),
  });

  // `isError` no React Query v5 cobre exatamente a consulta rejeitada; um
  // refetch reabre o estado `pending` (checking) e depois sucesso ou erro.
  const unavailable = !!contact && query.isError;
  const readiness = query.data ?? null;

  return {
    checking: !!contact && query.isPending && !query.isError,
    // Sem resposta confiável não se envia: indisponível vale como bloqueio.
    blocked: unavailable ? true : readiness?.blocked ?? false,
    reason: unavailable ? READINESS_UNAVAILABLE_REASON : readiness?.reason ?? null,
    unavailable,
    /** Repete a consulta depois de uma falha (mesma chave, mesmo contato). */
    retry: () => { void query.refetch(); },
  };
}
