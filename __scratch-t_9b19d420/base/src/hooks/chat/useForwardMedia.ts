import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import { PRIVATE_MEDIA_BUCKETS, parseSupabaseStorageObjectUrl } from '@/lib/storage_object_reference';
import { createStorageObjectId, removeStoredObjectBestEffort, sanitizeStorageFileName } from '@/lib/storage_object_upload';
import { sendOutboundMessage } from '@/services/outbound-message.service';

/**
 * Encaminhar de verdade (etapa 36).
 *
 * Para cada par (arquivo x destino) o objeto de origem e COPIADO server-side para a pasta
 * do contato de destino, no MESMO bucket de origem, e o envio usa o locator HTTPS duravel
 * do path copiado (o RPC `enqueue_outbound_message` rejeita `p_media_url` sem `https://`).
 * Copiar e obrigatorio: a policy de SELECT autoriza pela pasta do contato e reusar o
 * locator de origem apontaria a mensagem do destino para a pasta do contato de origem.
 *
 * O servico e sequencial (um envio por par, na ordem arquivo x destino) e NAO reenvia o
 * que ja concluiu: `ForwardRunState.completedKeys` guarda o par `(itemId, targetId)` que
 * deu certo, entao o retry da etapa 38 dispara so o que faltou. `copiedPaths` evita
 * recopiar um objeto que ficou no Storage apos falha de entrega, e `clientMessageIds`
 * mantem o idempotency key estavel para o RPC de fila.
 *
 * Limpeza honesta (nunca apaga o que pode ter sido enfileirado): em falha de envio, so
 * remove o objeto copiado quando a reconciliacao por `(contact_id, client_message_id)`
 * responde ZERO linhas; linha encontrada ou consulta falhando (estado indeterminado)
 * mantem o objeto.
 */

export type ForwardTargetType = 'contact' | 'group';
export type ForwardMediaKind = 'image' | 'video' | 'audio' | 'document';

export interface ForwardTarget {
  id: string;
  type: ForwardTargetType;
}

export interface ForwardMediaItem {
  id: string;
  url: string;
  type: ForwardMediaKind;
  filename: string;
  caption?: string | null;
}

export interface ForwardPairOutcome {
  itemId: string;
  targetId: string;
  targetType: ForwardTargetType;
  ok: boolean;
  error?: string;
}

export interface ForwardNonForwardable {
  itemId: string;
  reason: string;
}

export interface ForwardResult {
  pairOutcomes: ForwardPairOutcome[];
  nonForwardable: ForwardNonForwardable[];
  /** Pares efetivamente tentados nesta execucao (nao inclui os ja concluidos). */
  attempted: number;
  sent: number;
  failed: number;
}

export interface ForwardRunState {
  completedKeys: Set<string>;
  copiedPaths: Map<string, string>;
  clientMessageIds: Map<string, string>;
}

export function createForwardRunState(): ForwardRunState {
  return { completedKeys: new Set(), copiedPaths: new Map(), clientMessageIds: new Map() };
}

export function forwardPairKey(itemId: string, targetId: string): string {
  return `${itemId}::${targetId}`;
}

export interface ForwardMediaOptions {
  state?: ForwardRunState;
  onProgress?: (done: number, total: number) => void;
  whatsappConnectionId?: string | null;
}

const STORAGE_ORIGINS = [new URL(SUPABASE_URL).origin] as const;

const CONTENT_BY_KIND: Record<ForwardMediaKind, string> = {
  image: '[Imagem]',
  video: '[Vídeo]',
  audio: '[Áudio]',
  document: '[Arquivo]',
};

interface ResolvedItem {
  item: ForwardMediaItem;
  bucket: string;
  path: string;
}

function resolveItem(item: ForwardMediaItem): ResolvedItem | { reason: string } {
  const reference = parseSupabaseStorageObjectUrl(item.url, PRIVATE_MEDIA_BUCKETS, STORAGE_ORIGINS);
  if (!reference) {
    return { reason: 'A origem do arquivo não é um objeto de bucket privado reconhecido.' };
  }
  return { item, bucket: reference.bucket, path: reference.path };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível enviar o arquivo.';
}

/**
 * Reconciliacao da fila: `true` = a linha existe, `false` = provado que nao existe,
 * `null` = estado indeterminado (a consulta falhou). Só `false` autoriza remover o objeto.
 */
async function outboundRowExists(contactId: string, clientMessageId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id')
      .eq('contact_id', contactId)
      .eq('client_message_id', clientMessageId)
      .limit(1);
    if (error) return null;
    return (data?.length ?? 0) > 0;
  } catch {
    return null;
  }
}

async function forwardOnePair(
  resolved: ResolvedItem,
  target: ForwardTarget,
  key: string,
  state: ForwardRunState,
  whatsappConnectionId: string | null,
): Promise<ForwardPairOutcome> {
  const base = { itemId: resolved.item.id, targetId: target.id, targetType: target.type };

  // Grupo nao tem caminho de envio (`enqueue_outbound_message` valida `contacts.id`, e
  // `whatsapp_groups.group_id` nao e aceito). Falha clara, sem copiar nada.
  if (target.type !== 'contact') {
    return { ...base, ok: false, error: 'Encaminhamento para grupos ainda não é suportado.' };
  }

  // Retry apos falha de entrega reaproveita o objeto que ficou no Storage (nao recopia).
  let destinationPath = state.copiedPaths.get(key);
  if (!destinationPath) {
    destinationPath = `${target.id}/${createStorageObjectId()}-${sanitizeStorageFileName(resolved.item.filename)}`;
    const { error: copyError } = await supabase.storage.from(resolved.bucket).copy(resolved.path, destinationPath);
    if (copyError) {
      return { ...base, ok: false, error: copyError.message || 'Não foi possível copiar o arquivo.' };
    }
    state.copiedPaths.set(key, destinationPath);
  }

  const { data: locatorData } = supabase.storage.from(resolved.bucket).getPublicUrl(destinationPath);
  const locatorUrl = locatorData?.publicUrl;
  if (!locatorUrl) {
    await removeStoredObjectBestEffort(resolved.bucket, destinationPath);
    state.copiedPaths.delete(key);
    return { ...base, ok: false, error: 'Erro ao gerar a referência durável do arquivo copiado.' };
  }

  const clientMessageId = state.clientMessageIds.get(key) ?? createStorageObjectId();
  state.clientMessageIds.set(key, clientMessageId);

  const messageType = resolved.item.type;
  const content = messageType === 'document' ? resolved.item.filename : CONTENT_BY_KIND[messageType];

  try {
    await sendOutboundMessage({
      contactId: target.id,
      content,
      messageType,
      mediaUrl: locatorUrl,
      caption: resolved.item.caption ?? null,
      whatsappConnectionId,
      clientMessageId,
    });
    return { ...base, ok: true };
  } catch (error) {
    const rowExists = await outboundRowExists(target.id, clientMessageId);
    if (rowExists === false) {
      await removeStoredObjectBestEffort(resolved.bucket, destinationPath);
      state.copiedPaths.delete(key);
    }
    return { ...base, ok: false, error: errorMessage(error) };
  }
}

export async function forwardMediaMessages(
  items: readonly ForwardMediaItem[],
  targets: readonly ForwardTarget[],
  options: ForwardMediaOptions = {},
): Promise<ForwardResult> {
  const state = options.state ?? createForwardRunState();
  const pairOutcomes: ForwardPairOutcome[] = [];
  const nonForwardable: ForwardNonForwardable[] = [];

  const resolvable = new Map<string, ResolvedItem>();
  for (const item of items) {
    const resolved = resolveItem(item);
    if ('reason' in resolved) nonForwardable.push({ itemId: item.id, reason: resolved.reason });
    else resolvable.set(item.id, resolved);
  }

  // Pares desta execucao: arquivo resolvivel x destino, pulando o que ja concluiu.
  const pairs: { resolved: ResolvedItem; target: ForwardTarget; key: string }[] = [];
  for (const item of items) {
    const resolved = resolvable.get(item.id);
    if (!resolved) continue;
    for (const target of targets) {
      const key = forwardPairKey(item.id, target.id);
      if (state.completedKeys.has(key)) continue;
      pairs.push({ resolved, target, key });
    }
  }

  const total = pairs.length;
  let done = 0;
  options.onProgress?.(0, total);

  for (const { resolved, target, key } of pairs) {
    const outcome = await forwardOnePair(resolved, target, key, state, options.whatsappConnectionId ?? null);
    pairOutcomes.push(outcome);
    if (outcome.ok) state.completedKeys.add(key);
    done += 1;
    options.onProgress?.(done, total);
  }

  const sent = pairOutcomes.filter((outcome) => outcome.ok).length;
  return {
    pairOutcomes,
    nonForwardable,
    attempted: pairOutcomes.length,
    sent,
    failed: pairOutcomes.length - sent,
  };
}
