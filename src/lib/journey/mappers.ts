/**
 * Mapeadores das fontes do Histórico (Journey) — etapas S019–S042 do plano
 * `docs/plans/PLANO_JOURNEY_HISTORICO_COMPLETO_100_ETAPAS_2026-10-07.md`.
 *
 * Funções PURAS: recebem as linhas CRUAS (`rawRows.ts`, J06) e devolvem `JourneyEvent`
 * (`model.ts`, J01). Nenhuma consulta, nenhum Supabase, nenhum componente, nenhum efeito
 * colateral — quem busca as linhas é o hook de cada fonte (`src/hooks/chat/journey/`).
 *
 * Regras que valem para TODAS as fontes:
 * - `at` sai normalizado em **ISO** (instante completo). Linha sem data legível é IGNORADA: não há
 *   instante para colocar no trilho (mesma regra do `stats.ts` — "linha com `at` inválido é
 *   ignorada em toda conta").
 * - `id` é `prefixo-da-fonte + id-cru` e **não se repete** na saída de uma chamada (id cru repetido,
 *   dado anômalo, ganha sufixo `~n` em vez de virar duas linhas com o mesmo id).
 * - Nada de JSON cru: o texto da MENSAGEM passa sempre por `safeEventText` (D07). O da NOTA só é
 *   levado a ele quando o conteúdo é JSON de verdade, porque a nota é escrita por gente e começa
 *   com "[" de propósito (o marcador que a própria aba de Notas ensina — `textoDeNota`).
 * - O autor viaja como `{kind, id, name, avatarUrl}`: `names` (id → nome) é **opcional** e, sem
 *   ele, nenhum nome é inventado. Onde o plano manda mostrar "De/Para", responsável e criador, o
 *   fallback é o próprio id (decisão do plano: "os nomes vêm depois; guarde ids").
 * - Evento sem autor (`performed_by` nulo = automação/robô/IA) vira `actor.kind = 'system'` (D03).
 * - Cada fonte só produz os `kind` que o modelo conhece (`KIND_TO_CATEGORY`); `conversation_events`
 *   de tipo desconhecido é descartado em vez de virar texto técnico na tela.
 */
import { formatTalk } from '@/lib/calls/duration';
import { calendarDayKey } from '@/lib/localDay';
import { KIND_TO_CATEGORY, safeEventText } from '@/lib/journey/model';
import type { JourneyActor, JourneyEvent, JourneyKind, JourneyTarget } from '@/lib/journey/model';
import type {
  RawActivity,
  RawCall,
  RawDeal,
  RawEmail,
  RawEvent,
  RawMessage,
  RawNote,
  RawTask,
} from '@/lib/journey/rawRows';
import { getFileCategory, formatFileSize } from '@/utils/whatsappFileTypes';

// ---------------------------------------------------------------- entrada

/** Mapa id → nome (contato, usuário, fila, motivo). Opcional: sem ele, nada quebra. */
export type JourneyNames = Readonly<Record<string, string | null | undefined>>;

export interface JourneyMapperOptions {
  /** Nomes para o autor e para os detalhes "De/Para". */
  names?: JourneyNames;
  /** Relógio de referência (tarefa atrasada). Padrão: agora. */
  now?: Date;
}

/**
 * Linhas CRUAS de todas as fontes, do jeito que os hooks as entregam. Cada campo é opcional e
 * tolera `null`: o mapeador nunca falha com dado faltando (devolve lista vazia).
 */
export interface JourneySources {
  messages?: readonly RawMessage[] | null;
  calls?: readonly RawCall[] | null;
  emails?: readonly RawEmail[] | null;
  notes?: readonly RawNote[] | null;
  tasks?: readonly JourneyTaskRow[] | null;
  events?: readonly RawEvent[] | null;
  deals?: readonly RawDeal[] | null;
  activities?: readonly RawActivity[] | null;
}

/**
 * `RawTask` + `priority`. A coluna `conversation_tasks.priority` existe no banco, mas o tipo cru
 * (`rawRows.ts`) ainda não a carrega; aqui ela entra como campo OPCIONAL para que a prioridade
 * apareça nos detalhes assim que o hook da fonte passar o valor, sem quebrar quem chama o
 * mapeador com o `RawTask` puro (sem prioridade, o detalhe simplesmente não é emitido).
 */
export type JourneyTaskRow = RawTask & { priority?: string | null };

// ---------------------------------------------------------------- constantes

/** Janela do agrupamento de mensagens seguidas do mesmo autor (D06). */
export const MESSAGE_GROUP_WINDOW_MS = 10 * 60 * 1000;

/** Remetentes que contam como SAÍDA. Qualquer outro é o contato. */
const OUTBOUND_SENDERS = new Set(['agent', 'user', 'system', 'bot', 'ai', 'assistant']);

/** Mídia que tem rótulo próprio no `safeEventText` e NÃO é tratada como "arquivo" (D07). */
const MEDIA_WITH_OWN_LABEL = new Set([
  'ptt',
  'audio',
  'audio_meme',
  'voice',
  'sticker',
  'vcard',
  'contact',
  'contact_card',
]);

/** Mesmo contrato do `stats.ts`: ligação ATENDIDA pelo status; o resto depende do tempo falado. */
const CALL_ANSWERED_STATUSES = new Set(['answered', 'completed']);
/** Status de tarefa que já contam como concluída (mesma regra do `stats.ts`). */
const TASK_CONCLUDED_STATUSES = new Set(['done', 'completed']);

const NOTE_CATEGORY_LABEL: Record<string, string> = {
  note: 'Nota',
  fact: 'Fato',
  objection: 'Objeção',
  promise: 'Promessa',
};

const FILE_CATEGORY_LABEL: Record<string, string> = {
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  document: 'Documento',
  sticker: 'Sticker',
};

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  call: 'Ligação',
  email: 'E-mail',
  meeting: 'Reunião',
  note: 'Nota',
  task: 'Tarefa',
  whatsapp: 'Mensagem',
};

const TRANSFER_EVENT_TYPES = new Set(['transfer', 'queue_transfer']);
const REASSIGN_EVENT_TYPES = new Set(['overload_reassign', 'absence_reassign']);
const ASSIGN_EVENT_TYPES = new Set(['assign']);
const UNASSIGN_EVENT_TYPES = new Set(['unassign']);
const CLOSE_EVENT_TYPES = new Set(['close']);
const REOPEN_EVENT_TYPES = new Set(['reopen']);

const MOEDA = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

// ---------------------------------------------------------------- utilidades

/** Texto com espaços aparados; vazio/ausente → `null` (nunca string vazia no lugar de dado). */
function texto(valor: string | null | undefined): string | null {
  const t = (valor ?? '').trim();
  return t ? t : null;
}

/** Número finito; qualquer outra coisa → `null`. */
function numero(valor: number | null | undefined): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

/** Instante em ms; data ausente/inválida → `null`. */
function msDe(valor: string | null | undefined): number | null {
  const t = texto(valor);
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

/** Instante em ISO; data ausente/inválida → `null` (quem chama decide descartar a linha). */
function isoDe(valor: string | null | undefined): string | null {
  const ms = msDe(valor);
  return ms === null ? null : new Date(ms).toISOString();
}

/**
 * Dia-calendário no formato `dd/MM/yyyy` (prazo/vencimento). Usa `calendarDayKey`, que lê o
 * timestamp gravado sem hora como o dia escolhido (o `<input type="date">` grava meia-noite UTC):
 * formatar em hora local mostraria o dia anterior em UTC-3.
 */
function diaLegivel(valor: string | null | undefined): string | null {
  const chave = calendarDayKey(valor);
  if (!chave) return null;
  const [ano, mes, dia] = chave.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Valor em reais; `null`/ausente → `null`. */
function reais(valor: number | null | undefined): string | null {
  const n = numero(valor);
  return n === null ? null : MOEDA.format(n);
}

/** Tamanho de arquivo legível; ausente/zero/negativo → `null` (mesmo formato do resto do app). */
function tamanhoLegivel(bytes: number | null | undefined): string | null {
  const n = numero(bytes);
  if (n === null || n <= 0) return null;
  return formatFileSize(n);
}

/** Linha de detalhe `rótulo: valor`; valor em branco não vira linha. */
function detalhe(label: string, value: string | null | undefined): { label: string; value: string } | null {
  const t = texto(value);
  return t ? { label, value: t } : null;
}

/** Tira as linhas vazias e devolve `undefined` quando não sobra nenhuma. */
function detalhes(
  itens: ({ label: string; value: string } | null)[],
): { label: string; value: string }[] | undefined {
  const lista = itens.filter((item): item is { label: string; value: string } => item !== null);
  return lista.length ? lista : undefined;
}

/** Nome do id; sem entrada no mapa → `null`. */
function nomeDe(names: JourneyNames | undefined, id: string | null | undefined): string | null {
  const chave = texto(id);
  if (!chave) return null;
  return texto(names?.[chave]);
}

/** Nome do id para linha de detalhe; sem nome, o próprio id (o plano manda guardar os ids). */
function referencia(names: JourneyNames | undefined, id: string | null | undefined): string | null {
  return nomeDe(names, id) ?? texto(id);
}

/** Automação/robô/IA (D03). */
function autorSistema(): JourneyActor {
  return { kind: 'system', id: null, name: 'Sistema', avatarUrl: null };
}

function autorContato(id: string | null | undefined, name: string | null | undefined): JourneyActor {
  return { kind: 'contact', id: texto(id), name: texto(name), avatarUrl: null };
}

/** Usuário; sem id não há como identificá-lo → Sistema (D03). */
function autorUsuario(
  id: string | null | undefined,
  names?: JourneyNames,
  nomeAlternativo?: string | null,
): JourneyActor {
  const chave = texto(id);
  if (!chave) return autorSistema();
  return { kind: 'user', id: chave, name: nomeDe(names, chave) ?? texto(nomeAlternativo), avatarUrl: null };
}

/**
 * Gerador de id de evento: `prefixo-id-cru`, com desempate para id cru repetido (a mesma linha
 * vinda duas vezes não pode virar dois episódios com o mesmo id). Quando `idCru` é nulo,
 * `alternativa` entra como base; o sufixo da etapa (criada/iniciada/concluída/atrasada) é
 * incorporado ao `idCru` para que cada etapa tenha um id fixo e estável.
 */
function criadorDeId(): (prefixo: string, idCru: string | null | undefined, alternativa: string) => string {
  const usados = new Map<string, number>();
  return (prefixo, idCru, alternativa) => {
    const base = `${prefixo}-${texto(idCru) ?? alternativa}`;
    const repetido = usados.get(base) ?? 0;
    usados.set(base, repetido + 1);
    return repetido === 0 ? base : `${base}~${repetido + 1}`;
  };
}

/** Ordem do trilho: mais recente primeiro, com desempate por id (ordem determinística). */
function ordenarDesc(events: JourneyEvent[]): JourneyEvent[] {
  return [...events].sort((a, b) => {
    if (a.at !== b.at) return a.at < b.at ? 1 : -1;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });
}

// ---------------------------------------------------------------- mensagens

function remetenteEhSaida(sender: string | null | undefined): boolean {
  return OUTBOUND_SENDERS.has((sender ?? '').trim().toLowerCase());
}

/** Autor da mensagem: o contato, o agente que enviou, ou o sistema (robô/IA). */
function autorDeMensagem(message: RawMessage, names?: JourneyNames): JourneyActor {
  const sender = (message.sender ?? '').trim().toLowerCase();
  if (!OUTBOUND_SENDERS.has(sender)) return autorContato(null, null);
  if (sender !== 'agent' && sender !== 'user') return autorSistema();
  return autorUsuario(message.agentId, names);
}

/**
 * Mensagem que o histórico trata como ARQUIVO: tem mídia e a mídia não é uma das que têm rótulo
 * próprio (áudio, sticker, contato) nem conteúdo de localização (que vem no `content`).
 */
function ehArquivo(message: RawMessage): boolean {
  const temMidia = !!texto(message.mediaFilename) || !!texto(message.mediaType);
  if (!temMidia) return false;
  return !MEDIA_WITH_OWN_LABEL.has((message.messageType ?? '').trim().toLowerCase());
}

/** Rótulo do tipo do arquivo (Imagem/Vídeo/Áudio/Documento) a partir do MIME; sem MIME, o tipo cru. */
function tipoDeArquivo(message: RawMessage): string | null {
  const mime = texto(message.mediaType);
  if (mime) {
    const categoria = getFileCategory(mime);
    if (categoria && FILE_CATEGORY_LABEL[categoria]) return FILE_CATEGORY_LABEL[categoria];
  }
  const tipo = texto(message.messageType);
  if (tipo && FILE_CATEGORY_LABEL[tipo.toLowerCase()]) return FILE_CATEGORY_LABEL[tipo.toLowerCase()];
  return tipo ?? mime;
}

/** Chave de autor do agrupamento: contato, o agente específico, ou o sistema. */
function chaveDeAutor(message: RawMessage): string {
  const sender = (message.sender ?? '').trim().toLowerCase();
  if (sender === 'agent' || sender === 'user') return `agent:${texto(message.agentId) ?? 'sem-id'}`;
  if (sender !== 'contact' && OUTBOUND_SENDERS.has(sender)) return 'system';
  return 'contact';
}

/**
 * Agrupa mensagens SEGUIDAS do mesmo autor em até `MESSAGE_GROUP_WINDOW_MS` (D06). Arquivo não
 * entra em rajada (o nome dele tem de aparecer) e, por isso, também quebra a rajada em volta.
 * A janela é medida entre mensagens vizinhas, então o grupo nunca passa de 10 min entre uma
 * mensagem e a seguinte.
 */
function agruparMensagens(mensagens: readonly RawMessage[]): RawMessage[][] {
  const linhas = mensagens
    .filter((m): m is RawMessage => !!m)
    .map((m) => ({ message: m, ms: msDe(m.createdAt) }))
    .filter((item): item is { message: RawMessage; ms: number } => item.ms !== null)
    .sort((a, b) => (a.ms !== b.ms ? a.ms - b.ms : (a.message.id < b.message.id ? -1 : a.message.id > b.message.id ? 1 : 0)));

  const grupos: RawMessage[][] = [];
  let atual: RawMessage[] = [];
  let atualMs = 0;

  for (const { message, ms } of linhas) {
    const anterior = atual[atual.length - 1];
    const podeJuntar =
      !!anterior &&
      !ehArquivo(anterior) &&
      !ehArquivo(message) &&
      chaveDeAutor(anterior) === chaveDeAutor(message) &&
      ms - atualMs <= MESSAGE_GROUP_WINDOW_MS;
    if (podeJuntar) {
      atual.push(message);
    } else {
      if (atual.length) grupos.push(atual);
      atual = [message];
    }
    atualMs = ms;
  }
  if (atual.length) grupos.push(atual);
  return grupos;
}

/**
 * Mensagens (`messages`) — S068/D06/D07. Rajada do mesmo autor vira UM episódio: título
 * "N mensagens recebidas/enviadas", resumo da última (texto seguro) e o id da PRIMEIRA mensagem
 * no alvo do clique (o começo da rajada). Arquivo vira episódio próprio, com nome, tipo e tamanho.
 */
export function mapMessages(
  messages: readonly RawMessage[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nextId = criadorDeId();
  const events: JourneyEvent[] = [];

  for (const grupo of agruparMensagens(messages ?? [])) {
    const primeira = grupo[0];
    const ultima = grupo[grupo.length - 1];
    const at = isoDe(ultima.createdAt);
    if (!at) continue;

    const arquivo = ehArquivo(primeira);
    const recebida = !remetenteEhSaida(primeira.sender);
    const kind: JourneyKind = arquivo
      ? recebida
        ? 'file_in'
        : 'file_out'
      : recebida
        ? 'message_in'
        : 'message_out';

    let title: string;
    let summary: string | undefined;
    let linhaDeDetalhes: { label: string; value: string }[] | undefined;

    if (arquivo) {
      title = recebida ? 'Arquivo recebido' : 'Arquivo enviado';
      linhaDeDetalhes = detalhes([
        detalhe('Nome', primeira.mediaFilename),
        detalhe('Tipo', tipoDeArquivo(primeira)),
        detalhe('Tamanho', tamanhoLegivel(primeira.mediaSize)),
      ]);
    } else if (grupo.length > 1) {
      title = `${grupo.length} mensagens ${recebida ? 'recebidas' : 'enviadas'}`;
      summary = safeEventText(ultima.content, ultima.messageType) || undefined;
    } else {
      title = recebida ? 'Mensagem recebida' : 'Mensagem enviada';
      summary = safeEventText(ultima.content, ultima.messageType) || undefined;
    }

    const actor = autorDeMensagem(primeira, names);

    events.push({
      id: nextId('msg', primeira.id, at),
      at,
      category: KIND_TO_CATEGORY[kind],
      kind,
      title,
      summary,
      details: linhaDeDetalhes,
      actor,
      target: {
        type: arquivo ? 'file' : 'message',
        id: texto(primeira.id) ?? at,
        messageIds: grupo.length > 1 ? grupo.map((m) => texto(m.id) ?? m.createdAt) : undefined,
      },
      count: grupo.length > 1 ? grupo.length : undefined,
    });
  }

  return ordenarDesc(events);
}

// ---------------------------------------------------------------- ligações

/**
 * Ligação ATENDIDA — mesmo contrato do `stats.ts`: `answered`/`completed` atendem por status;
 * `ended` decide pelo tempo falado (`talk_seconds` só existe quando alguém atendeu).
 */
function chamadaAtendida(call: RawCall): boolean {
  const status = (call.status ?? '').trim().toLowerCase();
  if (CALL_ANSWERED_STATUSES.has(status)) return true;
  if (status !== 'ended') return false;
  const falado = numero(call.talkSeconds);
  return falado !== null && falado > 0;
}

/** Rótulo humano do `end_reason` (mesmos valores do dono canônico `src/lib/calls/callStatus.ts`). */
const END_REASON_LABEL: Record<string, string> = {
  completed: 'Concluída',
  busy: 'Ocupado',
  no_answer: 'Não atendida',
  cancelled: 'Cancelada por você',
  declined: 'Recusada',
  failed: 'Falhou',
  cancelled_remote: 'Cancelada por quem ligou',
  timeout: 'Não atendida a tempo',
  busy_here: 'Ocupado nesta linha',
  hangup_local: 'Encerrada por você',
  hangup_remote: 'Encerrada pelo outro lado',
};

/**
 * Ligações (`calls`) — S020–S025. Entrada não atendida é "perdida" (`call_missed`); as demais
 * Detalhes: duração (`talk_seconds`), motivo do fim e gravação quando existe
 * (`hasRecording`, o único sinal de gravação do tipo cru). O alvo é a ligação
 * (`call`), que é onde o detalhe com o player de gravação abre.
 */
export function mapCalls(
  calls: readonly RawCall[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nextId = criadorDeId();
  const events: JourneyEvent[] = [];

  for (const call of calls ?? []) {
    if (!call) continue;
    const at = isoDe(call.startedAt);
    if (!at) continue;

    const inbound = (call.direction ?? '').trim().toLowerCase() !== 'outbound';
    const atendida = chamadaAtendida(call);
    const kind: JourneyKind = atendida ? (inbound ? 'call_in' : 'call_out') : inbound ? 'call_missed' : 'call_out';

    let title: string;
    if (kind === 'call_missed') title = 'Chamada perdida';
    else if (kind === 'call_in') title = 'Chamada recebida';
    else title = 'Chamada realizada';

    const badge = atendida
      ? { label: 'Concluída', tone: 'success' as const }
      : kind === 'call_missed'
        ? { label: 'Perdida', tone: 'destructive' as const }
        : { label: 'Sem resposta', tone: 'warning' as const };

    const falado = numero(call.talkSeconds);
    const motivo = texto(call.endReason);
    const actor = !atendida && inbound
      ? autorContato(null, null)
      : autorUsuario(call.answeredBy ?? call.agentId, names);

    events.push({
      id: nextId('call', call.id, at),
      at,
      category: KIND_TO_CATEGORY[kind],
      kind,
      title,
      details: detalhes([
        detalhe('Duração', falado !== null && falado > 0 ? formatTalk(falado) : null),
        detalhe('Motivo do fim', motivo ? END_REASON_LABEL[motivo.toLowerCase()] ?? motivo : null),
        detalhe('Gravação', call.hasRecording ? 'Disponível' : null),
      ]),
      actor,
      target: { type: 'call', id: texto(call.id) ?? at },
      badge,
    });
  }

  return ordenarDesc(events);
}

// ---------------------------------------------------------------- e-mails

/**
 * E-mails (`email_messages`) — S027–S029. Os e-mails da MESMA conversa e do MESMO sentido viram um
 * episódio (D06): o assunto fica no título, o trecho no resumo e o id da conversa (`threadId`) no
 * alvo do clique, que é o que o módulo de E-mail usa para abrir a conversa. O autor é o contato
 * quando recebido e o responsável pela conversa quando enviado (desconhecido → Sistema).
 */
export function mapEmails(
  emails: readonly RawEmail[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nextId = criadorDeId();
  const events: JourneyEvent[] = [];

  const grupos = new Map<string, RawEmail[]>();
  for (const email of emails ?? []) {
    if (!email) continue;
    if (msDe(email.at) === null) continue;
    const inbound = (email.direction ?? '').trim().toLowerCase() !== 'outbound';
    const chave = `${texto(email.threadId) ?? 'sem-conversa'}|${inbound ? 'in' : 'out'}`;
    const atual = grupos.get(chave);
    if (atual) atual.push(email);
    else grupos.set(chave, [email]);
  }

  for (const grupo of grupos.values()) {
    grupo.sort(
      (a, b) =>
        (msDe(a.at) ?? 0) - (msDe(b.at) ?? 0) ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    );
    const primeiro = grupo[0];
    const ultimo = grupo[grupo.length - 1];
    const at = isoDe(ultimo.at);
    if (!at) continue;

    const inbound = (primeiro.direction ?? '').trim().toLowerCase() !== 'outbound';
    const kind: JourneyKind = inbound ? 'email_in' : 'email_out';
    const threadId = texto(primeiro.threadId);

    events.push({
      id: nextId('email', threadId ? `${threadId}-${inbound ? 'in' : 'out'}` : primeiro.id, at),
      at,
      category: KIND_TO_CATEGORY[kind],
      kind,
      title: texto(primeiro.subject) ?? (inbound ? 'E-mail recebido' : 'E-mail enviado'),
      summary: safeEventText(ultimo.snippet) || undefined,
      actor: inbound
        ? autorContato(null, ultimo.fromName ?? primeiro.fromName)
        : autorUsuario(ultimo.assignedTo ?? primeiro.assignedTo, names),
      target: { type: 'email', id: texto(ultimo.id) ?? at, threadId: threadId ?? undefined },
      count: grupo.length > 1 ? grupo.length : undefined,
    });
  }

  return ordenarDesc(events);
}

// ---------------------------------------------------------------- notas

/** Mesmo teto de corte do `safeEventText` (`SAFE_EVENT_TEXT_MAX` em `model.ts`). */
const NOTA_TEXTO_MAX = 120;

/** JSON de verdade (com aspas/chaves válidas) — só ele vai para o `safeEventText`. */
function ehJson(valor: string): boolean {
  if (!valor.startsWith('{') && !valor.startsWith('[')) return false;
  try {
    JSON.parse(valor);
    return true;
  } catch {
    return false;
  }
}

/**
 * Texto da nota. A nota é escrita por gente e pode começar com "[" DE PROPÓSITO — é o marcador
 * que a própria aba de Notas ensina (ex.: "[Preço] acha o valor alto") — por isso só passa pelo
 * `safeEventText` (que troca JSON por rótulo) quando o conteúdo é JSON de verdade; o resto sai
 * com espaços normalizados e o mesmo corte de 120 caracteres.
 */
function textoDeNota(content: string | null | undefined): string | undefined {
  const bruto = (content ?? '').trim();
  if (!bruto) return undefined;
  if (ehJson(bruto)) return safeEventText(bruto) || undefined;
  const normalizado = bruto.replace(/\s+/g, ' ');
  return normalizado.length <= NOTA_TEXTO_MAX ? normalizado : `${normalizado.slice(0, NOTA_TEXTO_MAX).trimEnd()}…`;
}

/**
 * Notas (`contact_notes`) — S031/S032. O autor é quem escreveu (`author_id`); sem autor → Sistema.
 * Categoria e prazo entram nos detalhes (S041).
 */
export function mapNotes(
  notes: readonly RawNote[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nextId = criadorDeId();
  const events: JourneyEvent[] = [];

  for (const note of notes ?? []) {
    if (!note) continue;
    const at = isoDe(note.createdAt);
    if (!at) continue;

    const categoria = texto(note.category);

    events.push({
      id: nextId('note', note.id, at),
      at,
      category: KIND_TO_CATEGORY.note,
      kind: 'note',
      title: 'Nota adicionada',
      summary: textoDeNota(note.content),
      details: detalhes([
        detalhe('Categoria', categoria ? NOTE_CATEGORY_LABEL[categoria.toLowerCase()] ?? categoria : null),
        detalhe('Prazo', diaLegivel(note.dueDate)),
      ]),
      actor: autorUsuario(note.authorId, names),
      target: { type: 'note', id: texto(note.id) ?? at },
    });
  }

  return ordenarDesc(events);
}

// ---------------------------------------------------------------- tarefas

function tarefaConcluida(task: JourneyTaskRow): boolean {
  return !!texto(task.completedAt) || TASK_CONCLUDED_STATUSES.has((task.status ?? '').trim().toLowerCase());
}

/**
 * Tarefas (`conversation_tasks`) — S033/S034. Quatro episódios possíveis: criada (`created_at`),
 * iniciada (`started_at`), concluída (`completed_at`) e atrasada (prazo vencido e não concluída,
 * MESMA regra do `stats.ts`: prazo nulo nunca atrasa; o instante do episódio é o próprio prazo).
 * Responsável, criador, prazo e prioridade entram nos detalhes (S041). Tarefa concluída SEM
 * carimbo de conclusão não gera o episódio "concluída": não há instante para colocar no trilho.
 */
export function mapTasks(
  tasks: readonly JourneyTaskRow[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nowMs = (options.now ?? new Date()).getTime();
  const nextId = criadorDeId();
  const events: JourneyEvent[] = [];

  for (const task of tasks ?? []) {
    if (!task) continue;

    const responsavel = task.assignedTo ?? null;
    const criador = task.createdBy ?? null;
    // Id do alvo: o da tarefa; sem id cru, o instante de criação (nunca string vazia no alvo).
    const alvo = texto(task.id) ?? isoDe(task.createdAt);
    if (!alvo) continue;
    const base = {
      category: KIND_TO_CATEGORY.task_created,
      summary: safeEventText(task.title, null) || undefined,
      details: detalhes([
        detalhe('Responsável', referencia(names, responsavel)),
        detalhe('Criador', referencia(names, criador)),
        detalhe('Prazo', diaLegivel(task.dueDate)),
        detalhe('Prioridade', texto(task.priority)),
      ]),
      target: { type: 'task' as JourneyTarget['type'], id: alvo },
    };

    const criadaEm = isoDe(task.createdAt);
    if (criadaEm) {
      events.push({
        ...base,
        id: nextId('task', task.id ? `${task.id}-created` : null, criadaEm),
        at: criadaEm,
        kind: 'task_created',
        title: 'Tarefa criada',
        actor: autorUsuario(criador ?? responsavel, names),
      });
    }

    const iniciadaEm = isoDe(task.startedAt);
    if (iniciadaEm) {
      events.push({
        ...base,
        id: nextId('task', task.id ? `${task.id}-started` : null, iniciadaEm),
        at: iniciadaEm,
        kind: 'task_started',
        title: 'Tarefa iniciada',
        actor: autorUsuario(responsavel ?? criador, names),
      });
    }

    const concluidaEm = isoDe(task.completedAt);
    if (concluidaEm) {
      events.push({
        ...base,
        id: nextId('task', task.id ? `${task.id}-done` : null, concluidaEm),
        at: concluidaEm,
        kind: 'task_done',
        title: 'Tarefa concluída',
        actor: autorUsuario(responsavel ?? criador, names),
        badge: { label: 'Concluída', tone: 'success' },
      });
    }

    const prazoMs = msDe(task.dueDate);
    if (!tarefaConcluida(task) && prazoMs !== null && prazoMs < nowMs) {
      const atrasadaEm = isoDe(task.dueDate);
      if (atrasadaEm) {
        events.push({
          ...base,
          id: nextId('task', task.id ? `${task.id}-overdue` : null, atrasadaEm),
          at: atrasadaEm,
          kind: 'task_overdue',
          title: 'Tarefa atrasada',
          actor: autorUsuario(responsavel ?? criador, names),
          badge: { label: 'Atrasada', tone: 'destructive' },
        });
      }
    }
  }

  return ordenarDesc(events);
}

// ---------------------------------------------------------------- eventos da conversa

/**
 * Eventos da conversa (`conversation_events`) — S035–S039: transferência (agente ou fila),
 * reatribuição automática, atribuição/desatribuição, encerramento (com o `closure_id` no motivo)
 * e reabertura. "De → Para" e as filas entram nos detalhes; sem nome no mapa, o id fica no lugar
 * (decisão do plano). `performed_by` nulo (automação/robô/IA) → autor Sistema. Tipo de evento
 * desconhecido é descartado (não vira texto técnico na tela).
 */
export function mapConversationEvents(
  events: readonly RawEvent[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nextId = criadorDeId();
  const mapeados: JourneyEvent[] = [];

  for (const evento of events ?? []) {
    if (!evento) continue;
    const at = isoDe(evento.createdAt);
    if (!at) continue;

    const tipo = (evento.eventType ?? '').trim().toLowerCase();
    const de = referencia(names, evento.fromAgentId);
    const para = referencia(names, evento.toAgentId);
    const filaDe = referencia(names, evento.fromQueueId);
    const filaPara = referencia(names, evento.toQueueId);
    const id = nextId('event', evento.id, at);
    const actor = autorUsuario(evento.performedBy, names);

    if (TRANSFER_EVENT_TYPES.has(tipo) || REASSIGN_EVENT_TYPES.has(tipo)) {
      const reatribuicao = REASSIGN_EVENT_TYPES.has(tipo);
      mapeados.push({
        id,
        at,
        category: KIND_TO_CATEGORY.transfer,
        kind: 'transfer',
        title: reatribuicao ? 'Reatribuição automática' : 'Transferência',
        details: detalhes([
          detalhe('De', de),
          detalhe('Para', para),
          detalhe('Fila de origem', filaDe),
          detalhe('Fila de destino', filaPara),
        ]),
        actor,
        target: { type: 'detail', id },
      });
      continue;
    }

    if (ASSIGN_EVENT_TYPES.has(tipo) || UNASSIGN_EVENT_TYPES.has(tipo)) {
      const desatribuicao = UNASSIGN_EVENT_TYPES.has(tipo);
      mapeados.push({
        id,
        at,
        category: KIND_TO_CATEGORY[desatribuicao ? 'unassign' : 'assign'],
        kind: desatribuicao ? 'unassign' : 'assign',
        title: desatribuicao ? 'Desatribuição' : 'Atribuição',
        details: detalhes([
          detalhe(desatribuicao ? 'De' : 'Para', desatribuicao ? de : para),
          detalhe('Fila', desatribuicao ? filaDe : filaPara),
        ]),
        actor,
        target: { type: 'detail', id },
      });
      continue;
    }

    if (CLOSE_EVENT_TYPES.has(tipo)) {
      mapeados.push({
        id,
        at,
        category: KIND_TO_CATEGORY.case_closed,
        kind: 'case_closed',
        title: 'Conversa encerrada',
        details: detalhes([detalhe('Motivo', referencia(names, evento.closureId))]),
        actor,
        target: { type: 'detail', id },
        badge: { label: 'Encerrada', tone: 'muted' },
      });
      continue;
    }

    if (REOPEN_EVENT_TYPES.has(tipo)) {
      mapeados.push({
        id,
        at,
        category: KIND_TO_CATEGORY.case_reopened,
        kind: 'case_reopened',
        title: 'Conversa reaberta',
        actor,
        target: { type: 'detail', id },
        badge: { label: 'Reaberta', tone: 'success' },
      });
    }
  }

  return ordenarDesc(mapeados);
}

// ---------------------------------------------------------------- propostas e atividades

/**
 * Propostas (`sales_deals`) — S040. Valor e responsável nos detalhes; o selo mostra o status que
 * existe (aberta, ganha, perdida — sem "visualizada", decisão do dono). O alvo é a proposta.
 */
export function mapDeals(
  deals: readonly RawDeal[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nextId = criadorDeId();
  const events: JourneyEvent[] = [];

  for (const deal of deals ?? []) {
    if (!deal) continue;
    const at = isoDe(deal.createdAt);
    if (!at) continue;

    const status = (deal.status ?? '').trim().toLowerCase();
    const badge =
      status === 'won'
        ? { label: 'Ganha', tone: 'success' as const }
        : status === 'lost'
          ? { label: 'Perdida', tone: 'destructive' as const }
          : { label: 'Aberta', tone: 'warning' as const };

    events.push({
      id: nextId('deal', deal.id, at),
      at,
      category: KIND_TO_CATEGORY.deal_created,
      kind: 'deal_created',
      title: texto(deal.title) ?? 'Proposta',
      details: detalhes([
        detalhe('Valor', reais(deal.value)),
        detalhe('Responsável', referencia(names, deal.assignedTo)),
      ]),
      actor: autorUsuario(deal.assignedTo, names),
      target: { type: 'deal', id: texto(deal.id) ?? at },
      badge,
    });
  }

  return ordenarDesc(events);
}

/**
 * Atividades da proposta (`deal_activities`) — S040/S041. O autor é o `performed_by` (nulo →
 * Sistema) e o alvo aponta a proposta a que a atividade pertence.
 */
export function mapDealActivities(
  activities: readonly RawActivity[] | null | undefined,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  const names = options.names;
  const nextId = criadorDeId();
  const events: JourneyEvent[] = [];

  for (const atividade of activities ?? []) {
    if (!atividade) continue;
    const at = isoDe(atividade.createdAt);
    if (!at) continue;

    const tipo = texto(atividade.activityType);
    const title = texto(atividade.description) ?? (tipo ? ACTIVITY_TYPE_LABEL[tipo.toLowerCase()] ?? tipo : 'Atividade da proposta');

    events.push({
      id: nextId('deal-activity', atividade.id, at),
      at,
      category: KIND_TO_CATEGORY.deal_activity,
      kind: 'deal_activity',
      title,
      actor: autorUsuario(atividade.performedBy, names),
      target: { type: 'deal', id: texto(atividade.dealId) ?? at },
    });
  }

  return ordenarDesc(events);
}

// ---------------------------------------------------------------- todas as fontes

/**
 * Todas as fontes de uma vez, já ordenadas (mais recente primeiro). É o atalho que o hook da aba
 * usa: uma chamada, uma lista, sem regra de tela.
 */
export function mapJourneyEvents(
  sources: JourneySources,
  options: JourneyMapperOptions = {},
): JourneyEvent[] {
  return ordenarDesc([
    ...mapMessages(sources.messages, options),
    ...mapCalls(sources.calls, options),
    ...mapEmails(sources.emails, options),
    ...mapNotes(sources.notes, options),
    ...mapTasks(sources.tasks, options),
    ...mapConversationEvents(sources.events, options),
    ...mapDeals(sources.deals, options),
    ...mapDealActivities(sources.activities, options),
  ]);
}

