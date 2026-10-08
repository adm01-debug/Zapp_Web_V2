/**
 * Modelo de eventos da aba Journey (o "Histórico" da conversa).
 *
 * Este módulo é só dado e função pura: nenhuma consulta ao banco e nenhum componente de tela.
 * Quem lê as fontes (mensagens, ligações, e-mails, notas, tarefas, eventos da conversa,
 * propostas e arquivos) é o mapeador da onda seguinte; aqui vive o vocabulário comum —
 * categoria, tipo fino, autor, alvo do clique, cor/rótulo/ícone e os textos seguros.
 *
 * **Cores: só as que o sistema já tem** (decisão D02 do dono, 07/10/2026), sem cor nova e sem
 * tocar em `tailwind.config.ts`/`index.css`. Há menos cores do que categorias, então algumas
 * categorias COMPARTILHAM a cor — por isso o rótulo, o ícone e o selo acompanham sempre a cor,
 * e o teste de cobertura (`__tests__/model.test.ts`) exige rótulo e ícone ÚNICOS.
 */
import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  CheckSquare,
  DollarSign,
  FileText,
  Mail,
  MessageSquare,
  Paperclip,
  Phone,
  RotateCcw,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { appShiftDayKey, localDayKey, parseDayKey } from '@/lib/localDay';

/** Categoria (o que a cor e o filtro de tipo mostram). `case` = encerramento/reabertura/atendimento. */
export type JourneyCategory =
  | 'message'
  | 'email'
  | 'call'
  | 'note'
  | 'task'
  | 'transfer'
  | 'file'
  | 'deal'
  | 'case';

/** Tipo fino do episódio (o que o mapeador sabe da linha crua). */
export type JourneyKind =
  | 'message_in'
  | 'message_out'
  | 'email_in'
  | 'email_out'
  | 'call_in'
  | 'call_out'
  | 'call_missed'
  | 'note'
  | 'task_created'
  | 'task_started'
  | 'task_done'
  | 'task_overdue'
  | 'transfer'
  | 'assign'
  | 'unassign'
  | 'file_in'
  | 'file_out'
  | 'deal_created'
  | 'deal_activity'
  | 'case_closed'
  | 'case_reopened';

/** Tom do selo do episódio (mesmos tons do `PILL_CLASS` da aba). */
export type JourneyBadgeTone = 'success' | 'warning' | 'primary' | 'muted' | 'destructive';

/**
 * Quem agiu no episódio. Cliente = contato; usuário = atendente; sistema = automação/robô/IA.
 * Sem campo de canal/origem: decisão do dono (D03), o histórico não carrega selo de canal.
 */
export interface JourneyActor {
  kind: 'contact' | 'user' | 'system';
  id: string | null;
  name: string | null;
  avatarUrl: string | null;
}

/** Onde o clique do episódio leva (o que abre, e com qual id). */
export interface JourneyTarget {
  type: 'message' | 'email' | 'call' | 'note' | 'task' | 'file' | 'deal' | 'detail';
  id: string;
  threadId?: string;
}

/** Um episódio da timeline. */
export interface JourneyEvent {
  id: string;
  /** Instante ISO. */
  at: string;
  category: JourneyCategory;
  kind: JourneyKind;
  title: string;
  summary?: string;
  details?: { label: string; value: string }[];
  actor: JourneyActor;
  target: JourneyTarget;
  /** Eventos agrupados (as mensagens seguidas do mesmo autor, por exemplo). */
  count?: number;
  badge?: { label: string; tone: JourneyBadgeTone };
}

/** Um dia da timeline. `date` é `yyyy-MM-dd` **local**. */
export interface JourneyDay {
  date: string;
  events: JourneyEvent[];
}

export interface JourneyCategoryMeta {
  label: string;
  icon: LucideIcon;
  /** Fundo + cor do ícone do tile do episódio (o par que já existe no `KIND_META` da aba). */
  iconClass: string;
  /** Cor do ponto/trilho da timeline. */
  railClass: string;
  /** Cor do selo de status do episódio. */
  badgeClass: string;
}

/**
 * Categoria -> rótulo, ícone e classes. As três classes usam SÓ tokens do sistema
 * (`primary`, `info`, `success`, `warning`, `muted`/`muted-foreground`, `border`).
 *
 * Notas usam `primary`: o violeta do sistema não serve como texto/ícone nos dois temas.
 * `--dash-violet` (282 95% 66%, `src/styles/tokens.css`) dá 3,38:1 como texto sobre o card claro
 * e 2,85:1 como ícone sobre a própria tinta `/15` — abaixo dos 4,5:1 de texto e dos 3:1 de ícone;
 * `--dash-tile-violet` (260 69% 37%) só funciona no claro e cai para 1,65:1 no card escuro.
 * O cartão autoriza cair no `primary` nesse caso (o par `bg-primary/15 text-primary` é o que o
 * `KIND_META` da aba já usa hoje); a medição está no relato do cartão.
 */
export const CATEGORY_META: Record<JourneyCategory, JourneyCategoryMeta> = {
  message: {
    label: 'Mensagens',
    icon: MessageSquare,
    iconClass: 'bg-primary/15 text-primary',
    railClass: 'bg-primary',
    badgeClass: 'bg-primary/15 text-primary border-primary/30',
  },
  email: {
    label: 'E-mail',
    icon: Mail,
    iconClass: 'bg-info/15 text-info',
    railClass: 'bg-info',
    badgeClass: 'bg-info/15 text-info border-info/30',
  },
  call: {
    label: 'Telefone',
    icon: Phone,
    iconClass: 'bg-success/15 text-success',
    railClass: 'bg-success',
    badgeClass: 'bg-success/15 text-success border-success/30',
  },
  note: {
    label: 'Notas',
    icon: FileText,
    iconClass: 'bg-primary/15 text-primary',
    railClass: 'bg-primary',
    badgeClass: 'bg-primary/15 text-primary border-primary/30',
  },
  task: {
    label: 'Tarefas',
    icon: CheckSquare,
    iconClass: 'bg-warning/15 text-warning',
    railClass: 'bg-warning',
    badgeClass: 'bg-warning/15 text-warning border-warning/30',
  },
  transfer: {
    label: 'Transferências',
    icon: ArrowLeftRight,
    iconClass: 'bg-success/15 text-success',
    railClass: 'bg-success',
    badgeClass: 'bg-success/15 text-success border-success/30',
  },
  file: {
    label: 'Arquivos',
    icon: Paperclip,
    iconClass: 'bg-muted/60 text-muted-foreground',
    railClass: 'bg-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
  deal: {
    label: 'Propostas',
    icon: DollarSign,
    iconClass: 'bg-success/15 text-success',
    railClass: 'bg-success',
    badgeClass: 'bg-success/15 text-success border-success/30',
  },
  // Encerrado e reaberto ficam na mesma categoria; quem diz qual dos dois é o `badge` do evento
  // (encerrado = `muted`, reaberto = `success`), como já acontece hoje no `KIND_META` da aba.
  // O ícone é o do ciclo de vida da conversa — mesmo ícone do "reaberta" de hoje.
  case: {
    label: 'Atendimento',
    icon: RotateCcw,
    iconClass: 'bg-muted/60 text-muted-foreground',
    railClass: 'bg-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
};

/** Tipo fino -> categoria. */
export const KIND_TO_CATEGORY: Record<JourneyKind, JourneyCategory> = {
  message_in: 'message',
  message_out: 'message',
  email_in: 'email',
  email_out: 'email',
  call_in: 'call',
  call_out: 'call',
  call_missed: 'call',
  note: 'note',
  task_created: 'task',
  task_started: 'task',
  task_done: 'task',
  task_overdue: 'task',
  transfer: 'transfer',
  assign: 'transfer',
  unassign: 'transfer',
  file_in: 'file',
  file_out: 'file',
  deal_created: 'deal',
  deal_activity: 'deal',
  case_closed: 'case',
  case_reopened: 'case',
};

export type JourneyTypeFilterValue = 'all' | JourneyCategory;

/** Opções do filtro de tipo, na ordem do cartão (Todos + todas as categorias). */
export const TYPE_FILTER_OPTIONS: { value: JourneyTypeFilterValue; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'message', label: 'Mensagens' },
  { value: 'email', label: 'E-mail' },
  { value: 'call', label: 'Telefone' },
  { value: 'note', label: 'Notas' },
  { value: 'task', label: 'Tarefas' },
  { value: 'transfer', label: 'Transferências' },
  { value: 'file', label: 'Arquivos' },
  { value: 'deal', label: 'Propostas' },
  { value: 'case', label: 'Atendimento' },
];

/** Instante ISO completo (`yyyy-MM-ddThh:mm...`), o formato gravado em `at`/`created_at`. */
const ISO_INSTANTE = /^\d{4}-\d{2}-\d{2}T/;

/**
 * `yyyy-MM-dd` (dia do histórico) ou instante ISO completo -> `Date` na meia-noite **local**.
 * `null` quando não dá para ler a data — quem chama decide o que mostrar.
 *
 * A leitura do instante é restrita a `yyyy-MM-ddThh:mm...`: um ISO parcial (`2026-10`) o
 * `new Date` aceita como meia-noite **UTC** e, em UTC-3, o rótulo sairia com o dia anterior.
 */
function diaLocal(dateStr: string | null | undefined): Date | null {
  const dia = parseDayKey(dateStr);
  if (dia) return dia;
  if (!dateStr || !ISO_INSTANTE.test(dateStr)) return null;
  const instante = new Date(dateStr);
  if (Number.isNaN(instante.getTime())) return null;
  const chave = localDayKey(instante);
  return chave ? parseDayKey(chave) : null;
}

/**
 * Rótulo do cabeçalho do dia: `Hoje, 7 de outubro de 2026` / `Ontem, 6 de outubro de 2026` /
 * `30 de setembro de 2026`, no fuso local do navegador.
 *
 * O "de" e o mês saem em minúscula (o "2 De Outubro De 2026" de hoje vem da classe `capitalize`
 * no rótulo da aba, que não deve mais ser usada). Data que não dá para ler devolve `''`.
 */
export function formatDayLabel(dateStr: string, now: Date = new Date()): string {
  const dia = diaLocal(dateStr);
  if (!dia) return '';
  const chave = localDayKey(dia);
  const chaveDeHoje = localDayKey(now);
  if (!chave || !chaveDeHoje) return '';

  const rotulo = format(dia, "d 'de' MMMM 'de' yyyy", { locale: ptBR });
  if (chave === chaveDeHoje) return `Hoje, ${rotulo}`;
  // "Ontem" por aritmética de calendário (e não `now - 24h`), que é o que o `localDay` já faz.
  if (chave === appShiftDayKey(chaveDeHoje, -1)) return `Ontem, ${rotulo}`;
  return rotulo;
}

/** Mesmo teto do corte de texto do histórico de hoje (`useConversationHistoryTimeline`). */
const SAFE_EVENT_TEXT_MAX = 120;

const AUDIO_MESSAGE_TYPES = new Set(['ptt', 'audio', 'audio_meme', 'voice']);
const STICKER_MESSAGE_TYPES = new Set(['sticker']);
const CONTACT_MESSAGE_TYPES = new Set(['vcard', 'contact', 'contact_card']);

function textoDe(valor: unknown): string | null {
  if (typeof valor === 'string') return valor.trim() || null;
  if (typeof valor === 'number' && Number.isFinite(valor)) return String(valor);
  return null;
}

function numeroDe(valor: unknown): number | null {
  if (typeof valor === 'number' && Number.isFinite(valor)) return valor;
  if (typeof valor === 'string' && valor.trim() !== '' && Number.isFinite(Number(valor))) return Number(valor);
  return null;
}

/** JSON de localização do WhatsApp: latitude/longitude (com nome e endereço quando existem). */
function ehLocalizacao(registro: Record<string, unknown>): boolean {
  return numeroDe(registro.latitude) !== null && numeroDe(registro.longitude) !== null;
}

/**
 * Texto seguro para a timeline — **nunca JSON cru** (decisão D07). A mensagem de localização vira
 * `Localização: <nome> — <endereço>`; áudio/ptt, sticker e contato têm rótulo próprio; qualquer
 * outro JSON (inclusive quebrado) vira `Conteúdo estruturado`; texto normal sai com espaços
 * normalizados e corte em 120 caracteres; vazio devolve `''`.
 */
export function safeEventText(raw: string | null | undefined, messageType?: string | null): string {
  const tipo = (messageType ?? '').trim().toLowerCase();
  if (AUDIO_MESSAGE_TYPES.has(tipo)) return 'Áudio';
  if (STICKER_MESSAGE_TYPES.has(tipo)) return 'Sticker';
  if (CONTACT_MESSAGE_TYPES.has(tipo)) return 'Contato compartilhado';

  const texto = (raw ?? '').trim();
  if (!texto) return '';

  if (texto.startsWith('{') || texto.startsWith('[')) {
    let dado: unknown;
    try {
      dado = JSON.parse(texto);
    } catch {
      // JSON quebrado também é dado estruturado: mostrar o pedaço cru não ajuda ninguém.
      return 'Conteúdo estruturado';
    }
    if (!dado || typeof dado !== 'object' || Array.isArray(dado)) return 'Conteúdo estruturado';

    const registro = dado as Record<string, unknown>;
    if (!ehLocalizacao(registro)) return 'Conteúdo estruturado';

    const nome = textoDe(registro.name) ?? textoDe(registro.place) ?? textoDe(registro.title);
    const endereco =
      textoDe(registro.address) ?? textoDe(registro.address_name) ?? textoDe(registro.formatted_address);
    const partes = [nome, endereco].filter((parte): parte is string => !!parte);
    return partes.length ? `Localização: ${partes.join(' — ')}` : 'Localização';
  }

  const normalizado = texto.replace(/\s+/g, ' ');
  if (normalizado.length <= SAFE_EVENT_TEXT_MAX) return normalizado;
  return `${normalizado.slice(0, SAFE_EVENT_TEXT_MAX).trimEnd()}…`;
}
