import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { toast } from 'sonner';
import { useActionFeedback } from '@/hooks/ui/useActionFeedback';
import type { WhatsAppGroup, WhatsAppConnection } from './types';

interface UseGroupActionsParams {
  connections: WhatsAppConnection[];
  groups: WhatsAppGroup[];
  selectedGroups: Set<string>;
  setGroups: React.Dispatch<React.SetStateAction<WhatsAppGroup[]>>;
  setSelectedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
  fetchGroups: () => Promise<void>;
}

/**
 * O proxy da Evolution responde HTTP 200 com a falha lógica no corpo
 * (`{ error: true, message }`); R2-API-042 também cobre `error` textual (ex.: "falha").
 * Sem esta checagem a ação termina como sucesso apesar da recusa da Evolution.
 */
function evolutionRecusou(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const erro = (payload as { error?: unknown }).error;
  if (typeof erro === 'string') return erro.trim() !== '';
  return erro === true;
}

/** Mensagem legível da recusa, para o log. */
function motivosDaRecusa(payload: unknown): unknown {
  const recusa = payload as { error?: unknown; message?: string };
  return recusa?.message ?? recusa?.error;
}

/**
 * Idempotência do envio em massa.
 *
 * A mesma ação (grupo + texto) reaproveita o `client_message_id` por até 2 min, então
 * um clique repetido, um retry de rede ou o reenvio imediato da MESMA mensagem ao MESMO
 * grupo não criam uma segunda linha na fila: a RPC
 * `enqueue_group_outbound_message` encontra o par (whatsapp_group_id, client_message_id)
 * no índice único `messages_group_client_msg_uq` e devolve a linha existente.
 *
 * O mapa é de memória, como em `outbound-message.service`: depois de recarregar a aba a
 * composição é uma ação nova. A chave tem vida CURTA — sem o TTL, o mesmo texto enviado
 * mais tarde (ex.: "bom dia") reaproveitaria um id já entregue e a fila o descartaria,
 * sem nada sair. Entrada vencida é descartada na leitura; não há timer próprio.
 */
export const BROADCAST_ACTION_TTL_MS = 2 * 60 * 1000;

interface BroadcastAction {
  id: string;
  /** Instante (epoch ms) depois do qual a chave não vale mais. */
  expiresAt: number;
}

const broadcastActionIds = new Map<string, BroadcastAction>();

function createClientMessageId(): string {
  if (typeof crypto?.randomUUID !== 'function') {
    throw new Error('Seu navegador não suporta identificadores de entrega seguros. Atualize-o e tente novamente.');
  }
  return crypto.randomUUID();
}

/** Chave da ação: o destino (grupo) e o texto compõem a identidade do envio. */
function broadcastActionKey(groupId: string, content: string): string {
  return `${groupId}\u0000${content}`;
}

function resolveBroadcastClientMessageId(groupId: string, content: string): string {
  const key = broadcastActionKey(groupId, content);
  const agora = Date.now();
  const pendente = broadcastActionIds.get(key);
  if (pendente && pendente.expiresAt > agora) return pendente.id;
  const id = createClientMessageId();
  broadcastActionIds.set(key, { id, expiresAt: agora + BROADCAST_ACTION_TTL_MS });
  return id;
}

/** Resultado do envio em massa POR GRUPO (o que entrou na fila e o que falhou). */
export interface GroupBroadcastResult {
  groupId: string;
  name: string;
  status: 'queued' | 'failed';
  /** Id da linha criada em `public.messages` (a trilha por grupo). */
  messageId?: string;
}

export function useGroupActions({ connections, groups, selectedGroups, setGroups, setSelectedGroups, fetchGroups }: UseGroupActionsParams) {
  const feedback = useActionFeedback();

  const handleAutoSync = useCallback(async (setIsSyncing: (v: boolean) => void) => {
    if (connections.length === 0) {
      toast.error('Nenhuma conexão WhatsApp configurada');
      return;
    }

    setIsSyncing(true);
    let totalSynced = 0;
    let totalErrors = 0;

    // As linhas de TODAS as conexões são reunidas para irem em UM `upsert`: antes havia
    // um upsert POR GRUPO (221 grupos = 221 idas ao banco), e cada ida é uma chance de
    // falhar no meio da sincronização. A leitura das conexões continua por conexão
    // porque a lista vem da Evolution, uma chamada por número.
    const linhasPorGrupo = new Map<string, {
      group_id: string; name: string; description: string | null;
      participant_count: number; is_admin: boolean;
      whatsapp_connection_id: string; updated_at: string;
    }>();

    for (const conn of connections) {
      if (!conn.instance_id) continue;
      try {
        const { data, error } = await supabase.functions.invoke('evolution-api', {
          body: { action: 'list-groups', instanceName: conn.instance_id, getParticipants: 'false' },
        });
        if (error) { totalErrors++; continue; }
        if (evolutionRecusou(data)) {
          log.error(`Evolution recusou list-groups da conexão ${conn.name}:`, motivosDaRecusa(data));
          totalErrors++;
          continue;
        }

        const apiGroups = Array.isArray(data) ? data : (data?.data || data?.groups || []);
        for (const g of apiGroups) {
          // Shapes: Evolution v2 {id, subject, desc, size} · Evolution GO/whatsmeow {JID, Name, Topic, Participants}
          const groupJid = g.id || g.jid || g.groupJid || g.JID;
          if (!groupJid) continue;
          // O MESMO grupo pode voltar de duas conexões (dois números que enxergam o
          // mesmo aparelho). Com a chave repetida NO MESMO lote, o Postgres recusa o
          // lote INTEIRO ("ON CONFLICT DO UPDATE command cannot affect row a second
          // time"), então cada chave entra uma vez: a última conexão a devolver o
          // grupo fica com a linha — a mesma regra de quando o upsert era por grupo.
          linhasPorGrupo.set(groupJid, {
            group_id: groupJid,
            name: g.subject || g.name || g.Name || 'Grupo sem nome',
            description: g.desc || g.description || g.Topic || null,
            participant_count: g.size || g.participants?.length || g.Participants?.length || 0,
            is_admin: g.announce === true || g.iAmAdmin === true || g.IsAnnounce === true,
            whatsapp_connection_id: conn.id,
            updated_at: new Date().toISOString(),
          });
        }
      } catch (err) { log.error(`Sync error for connection ${conn.name}:`, err); totalErrors++; }
    }

    const linhas = [...linhasPorGrupo.values()];
    if (linhas.length > 0) {
      const { error: upsertError } = await supabase
        .from('whatsapp_groups')
        .upsert(linhas, { onConflict: 'group_id' });
      if (upsertError) {
        // O lote é atômico: sem gravação, as linhas contam como falha no aviso.
        log.error('Error upserting groups batch:', upsertError);
        totalErrors += linhas.length;
      } else {
        totalSynced = linhas.length;
      }
    }

    setIsSyncing(false);
    await fetchGroups();
    if (totalErrors > 0) toast.warning(`Sincronização parcial: ${totalSynced} grupos, ${totalErrors} erro(s)`);
    else toast.success(`${totalSynced} grupo(s) sincronizados!`);
  }, [connections, fetchGroups]);

  const handleAddGroup = useCallback(async (newGroup: { name: string; group_id: string; description: string; whatsapp_connection_id: string; category: string }) => {
    if (!newGroup.name || !newGroup.group_id) { feedback.warning('Preencha os campos obrigatórios'); return false; }
    let success = false;
    await feedback.withFeedback(
      async () => {
        const { error } = await supabase.from('whatsapp_groups').insert({
          name: newGroup.name, group_id: newGroup.group_id, description: newGroup.description || null,
          whatsapp_connection_id: newGroup.whatsapp_connection_id || null, category: newGroup.category || null,
        });
        if (error) throw error;
      },
      { loadingMessage: 'Adicionando grupo...', successMessage: 'Grupo adicionado!', errorMessage: 'Erro ao adicionar grupo',
        onSuccess: () => { success = true; void fetchGroups(); } }
    );
    return success;
  }, [feedback, fetchGroups]);

  const handleDeleteGroup = useCallback(async (id: string) => {
    await feedback.withFeedback(
      async () => { const { error } = await supabase.from('whatsapp_groups').delete().eq('id', id); if (error) throw error; },
      { loadingMessage: 'Excluindo...', successMessage: 'Grupo excluído!', errorMessage: 'Erro ao excluir', onSuccess: () => fetchGroups() }
    );
  }, [feedback, fetchGroups]);

  const handleBroadcast = useCallback(async (broadcastMessage: string): Promise<{ sent: number; failed: number; results: GroupBroadcastResult[] } | null> => {
    if (!broadcastMessage.trim()) { toast.error('Digite uma mensagem'); return null; }
    const groupsToSend = groups.filter(g => selectedGroups.has(g.id));
    if (groupsToSend.length === 0) { toast.error('Selecione pelo menos um grupo'); return null; }

    const texto = broadcastMessage;
    // ENFILEIRA, não envia: cada grupo vira uma linha em `public.messages`
    // (whatsapp_group_id + client_message_id estável) e quem entrega é a fila do
    // servidor. Antes, o laço chamava a Evolution aqui dentro com 2 s de pausa:
    // fechar a aba, trocar de rota ou perder a rede matava os grupos restantes sem
    // registro e sem retomada. Agora a aba só enfileira — o que já entrou na fila
    // não depende dela.
    const results = await Promise.all(groupsToSend.map(async (group): Promise<GroupBroadcastResult> => {
      try {
        const { data, error } = await supabase.rpc('enqueue_group_outbound_message', {
          p_group_id: group.id,
          p_client_message_id: resolveBroadcastClientMessageId(group.id, texto),
          p_content: texto,
          p_whatsapp_connection_id: group.whatsapp_connection_id ?? undefined,
        });
        if (error) throw error;
        if (!data?.id) throw new Error('enqueue_group_sem_registro');
        return { groupId: group.id, name: group.name, status: 'queued', messageId: data.id };
      } catch (err) {
        log.error(`Falha ao enfileirar o envio ao grupo ${group.name}:`, err);
        return { groupId: group.id, name: group.name, status: 'failed' };
      }
    }));

    const sent = results.filter(r => r.status === 'queued').length;
    const failed = results.length - sent;
    const nomesComFalha = results.filter(r => r.status === 'failed').map(r => r.name).join(', ');

    // Auditoria SEM o texto da mensagem: o cliente registra só a contagem. Quem
    // enviou (agent_id) e para qual grupo (whatsapp_group_id) ficam na própria
    // linha de `public.messages`, que é a trilha por grupo.
    log.info(`Broadcast de grupos: ${sent} enfileirado(s), ${failed} falha(s) de ${results.length} grupo(s) selecionado(s)`);

    // R2-API-062 (#234): a tentativa só é preservada quando NENHUM grupo entrou na
    // fila (sent === 0). Qualquer enfileiramento bem-sucedido — inclusive falha
    // parcial — encerra a tentativa e limpa a seleção, para que um novo clique não
    // reenvie a mensagem aos grupos que já estão na fila.
    if (sent > 0) setSelectedGroups(new Set());
    if (sent === 0) {
      toast.warning(`Nenhum grupo entrou na fila (${failed} falha(s)) — mensagem e seleção mantidas`);
    }
    else if (failed > 0) toast.warning(`${sent} grupo(s) na fila, ${failed} falha(s): ${nomesComFalha}`);
    else toast.success(`${sent} grupo(s) na fila — o envio continua mesmo se você fechar a aba`);
    return { sent, failed, results };
  }, [groups, selectedGroups, setSelectedGroups]);

  const handleCategoryChange = useCallback(async (groupId: string, category: string | null) => {
    const { error } = await supabase.from('whatsapp_groups').update({ category }).eq('id', groupId);
    if (error) { toast.error('Erro ao atualizar categoria'); return; }
    toast.success('Categoria atualizada');
    const group = groups.find(g => g.id === groupId);
    if (group) {
      // O JID do grupo (`12345-67890@g.us`) é guardado em `contacts.phone` sem o
      // sufixo e SEM hífen removido (R2-INB-055); a propagação casa por phone EXATO.
      // Um LIKE `%12345-67890%` podia atingir contato de outro grupo e não conseguia
      // casar formatos diferentes. Falha aqui não derruba a troca de categoria do grupo:
      // a fonte de verdade é `whatsapp_groups`, já gravada nesta altura.
      const phone = group.group_id.replace('@g.us', '');
      const { error: catError } = await supabase
        .from('contacts')
        .update({ group_category: category })
        .eq('phone', phone);
      if (catError) log.warn('Falha ao propagar a categoria aos contatos do grupo', {
        groupId, error: catError.message,
      });
    }
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, category } : g));
  }, [groups, setGroups]);

  return { handleAutoSync, handleAddGroup, handleDeleteGroup, handleBroadcast, handleCategoryChange };
}
