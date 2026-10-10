import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { fromTable } from '@/lib/supabaseHelpers';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';
import { useDebounce } from '@/hooks/performance/useTimingHooks';
import { useAuth } from '@/hooks/auth/useAuth';
// X181: "Ver contato" usa o mesmo mecanismo de produto que as Tarefas e o
// Catálogo já usam (evento `open-contact-chat` + view do inbox). O TalkXView
// pode sobrescrever passando `onOpenContact`.
import { openContactChat } from '@/components/catalog/useSendProduct';
import { toast } from 'sonner';
import { ShieldBan, Plus, Trash2, Search, UserX, ShieldCheck, Settings, ListChecks, Upload, Download, X, AlertTriangle, UserPlus, UserMinus, PencilLine, FileInput, FileOutput, Activity, Pencil, Eye, Megaphone, RotateCcw, Save } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { PrimaryButton, GhostButton, InitialsAvatar, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { IconTile, RailCard, RailAction, MetaRow, StatusPill, TalkXEmptyState, TalkXSkeletonRows, TalkXNoData, FilterBarV2, TalkXPagination, TalkXBulkBar, RowActionsMenu, TalkXConfirmDialog, SUPPRESSION_ORIGIN, Th, Td, fmtInt, fmtDateTime, fmtRelativeDay, type RowAction } from './talkxShared';
import { TalkXQueryBoundary } from './kit/states';
import { useTalkXFilterState } from './kit/useFilterState';
import {
  useTalkXSuppressionActivity, useTalkXSuppressionStats, SUPPRESSION_ACTIVITY_EVENT_TYPES,
  type SuppressionActivityAction, type SuppressionActivityEventType, type SuppressionActivityItem,
  type TalkXSuppressionStat,
} from '@/hooks/integrations/useTalkXSuppression';
import { ProtectionGauge } from './suppression/ProtectionGauge';

type ReasonCode = 'opt_out' | 'invalid_number' | 'manual' | 'lgpd' | 'no_commercial_permission' | 'bounce';
type SuppressionStatus = 'suprimido' | 'expirado' | 'removido';
type ExpiryChoice = 'never' | '30' | '90' | 'date';
type EditReasonChoice = ReasonCode | 'keep';
type EditExpiryChoice = ExpiryChoice | 'keep';

interface BlacklistEntry {
  id: string;
  contact_id: string | null;
  /** Telefone da própria supressão: preenchido quando o bloqueio é feito sem contato (eixo do telefone). */
  phone: string | null;
  reason: string | null;
  reason_code: ReasonCode | null;
  blocked_by: string | null;
  created_at: string;
  origin: string;
  campaign_id: string | null;
  expires_at: string | null;
  removed_by: string | null;
  removed_at: string | null;
  contacts: { name: string; phone: string; company: string | null; avatar_url: string | null } | null;
}

const REASONS = ['Opt-out solicitado', 'Número inválido / bounce', 'Reclamação de spam', 'Sem permissão comercial', 'LGPD / revogação de consentimento', 'Bloqueio manual', 'Outro'];

// Motivos do enum do banco (`talkx_blacklist_reason`, M:20260910090000) com os
// rótulos que esta tela já usa. A edição grava os dois: `reason_code` (enum, o
// que o motor lê) e `reason` (texto, o que a coluna Motivo mostra).
const REASON_CODES: { code: ReasonCode; label: string }[] = [
  { code: 'opt_out', label: 'Opt-out solicitado' },
  { code: 'invalid_number', label: 'Número inválido / bounce' },
  { code: 'bounce', label: 'Bounce do provedor' },
  { code: 'no_commercial_permission', label: 'Sem permissão comercial' },
  { code: 'lgpd', label: 'LGPD / revogação de consentimento' },
  { code: 'manual', label: 'Bloqueio manual' },
];

// Suprimido/Expirado/Removido — só as cores que o sistema já tem (tokens do Pill).
const SUPPRESSION_STATUS: Record<SuppressionStatus, { label: string; tone: 'danger' | 'warning' | 'muted' }> = {
  suprimido: { label: 'Suprimido', tone: 'danger' },
  expirado: { label: 'Expirado', tone: 'warning' },
  removido: { label: 'Removido', tone: 'muted' },
};

// Teto de contatos devolvidos na busca do modal (mesmo padrão do SLARuleFormDialog)
// e espera antes de ir ao servidor, para não disparar uma consulta por tecla.
const ADD_CONTACT_LIST_LIMIT = 50;
const CONTACT_SEARCH_DEBOUNCE_MS = 300;

/**
 * Situação da linha: removida (soft delete `removed_at`) vence a expiração;
 * `expires_at` no passado é Expirado (não conta como supressão ativa).
 */
function suppressionStatus(entry: Pick<BlacklistEntry, 'removed_at' | 'expires_at'>, now: number = Date.now()): SuppressionStatus {
  if (entry.removed_at) return 'removido';
  if (entry.expires_at && new Date(entry.expires_at).getTime() <= now) return 'expirado';
  return 'suprimido';
}

/** Opt-out/LGPD exige confirmação explícita na remoção (decisão N13). */
function requiresRemovalConfirmation(entry: Pick<BlacklistEntry, 'origin' | 'reason_code'>): boolean {
  return entry.origin === 'optout' || entry.origin === 'lgpd'
    || entry.reason_code === 'opt_out' || entry.reason_code === 'lgpd';
}

/** Telefone do contato vinculado; cai no telefone gravado quando a linha é avulsa. */
function displayPhone(entry: Pick<BlacklistEntry, 'phone' | 'contacts'>): string {
  const digits = (entry.contacts?.phone ?? entry.phone ?? '').replace(/\D/g, '');
  return digits ? `+${digits}` : '—';
}

function displayName(entry: Pick<BlacklistEntry, 'phone' | 'contacts'>): string {
  return entry.contacts?.name ?? displayPhone(entry);
}

function localDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayDateInput(now: number = Date.now()): string {
  return localDateInput(new Date(now));
}

function localDateFromIso(iso: string): string {
  return localDateInput(new Date(iso));
}

function parseEndOfLocalDay(date: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 23, 59, 59, 999);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isPastDateInput(date: string, now: number = Date.now()): boolean {
  return date < todayDateInput(now);
}

/** Expiração escolhida no modal → valor de `expires_at` (null = nunca expira). */
function expiryToIso(choice: ExpiryChoice, date: string, now: number = Date.now()): string | null {
  if (choice === 'never') return null;
  if (choice === 'date') {
    if (!date || isPastDateInput(date, now)) return null;
    return parseEndOfLocalDay(date)?.toISOString() ?? null;
  }
  return new Date(now + Number(choice) * 24 * 60 * 60 * 1000).toISOString();
}

function isProtectedReason(code: ReasonCode): boolean {
  return code === 'opt_out' || code === 'lgpd';
}

function editWeakensProtectedSuppression(entries: BlacklistEntry[], reason: EditReasonChoice, expiry: EditExpiryChoice): boolean {
  if (!entries.some(requiresRemovalConfirmation)) return false;
  const changesProtectedReason = reason !== 'keep' && !isProtectedReason(reason);
  const addsFiniteExpiry = expiry !== 'keep' && expiry !== 'never';
  return changesProtectedReason || addsFiniteExpiry;
}

// Telefone avulso do modal: o banco guarda só dígitos e o aceita de 10 a 15
// (trigger de talkx_blacklist), então a tela valida a mesma faixa antes de
// habilitar o envio e aplica a máscara brasileira durante a digitação.
const PHONE_MIN_DIGITS = 10;
const PHONE_MAX_DIGITS = 15;

/** Só os dígitos — é a forma que o banco guarda em `talkx_blacklist.phone`. */
function phoneDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Máscara brasileira durante a digitação: (11) 91234-5678. */
function formatPhoneMask(digits: string): string {
  const d = phoneDigits(digits).slice(0, PHONE_MAX_DIGITS);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  const base = `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
  return d.length > 11 ? `${base} ${d.slice(11)}` : base;
}

/**
 * Chave de comparação de telefone — SÓ para achar duplicado e habilitar o
 * botão; nunca é o que vai para o banco. O DDD + número são os últimos 11
 * dígitos tanto no telefone avulso quanto no telefone do contato cadastrado
 * (que vem com o +55), então comparar o fim não acusa duplicado errado nem
 * deixa passar o repetido. Abaixo de 10 dígitos não é telefone válido: não
 * gera chave.
 */
function phoneKey(value: string | null | undefined): string | null {
  const d = phoneDigits(value ?? '');
  if (d.length < PHONE_MIN_DIGITS) return null;
  return d.length >= 11 ? d.slice(-11) : d;
}

/* ------------------------------------------------------------------ */
/* X184 — Atividade recente: trilha de supressão lida dos eventos de  */
/* entidade gravados em `talkx_campaign_events`                       */
/* ------------------------------------------------------------------ */

/** Itens do rail ("os 5 últimos") e do histórico paginado do modal. */
const ACTIVITY_RAIL_LIMIT = 5;
const ACTIVITY_HISTORY_PAGE_SIZE = 20;

/** Rótulo do filtro de tipo do histórico, na linguagem da tela. */
const ACTIVITY_FILTER_LABELS: Record<SuppressionActivityEventType, string> = {
  suppression_add: 'Adicionado',
  suppression_remove: 'Removido',
  suppression_update: 'Motivo atualizado',
  suppression_import: 'Importação',
  suppression_export: 'Exportação',
};

/** Ícone e cor por ação da trilha — só tokens que o sistema já tem. */
const ACTIVITY_ICON: Record<SuppressionActivityAction | 'other', LucideIcon> = {
  add: UserPlus, remove: UserMinus, update: PencilLine, import: FileInput, export: FileOutput, other: Activity,
};
const ACTIVITY_STYLE: Record<SuppressionActivityAction | 'other', string> = {
  add: 'bg-dash-green/10 text-dash-green',
  remove: 'bg-dash-red/10 text-dash-red',
  update: 'bg-dash-amber/10 text-dash-amber',
  import: 'bg-primary/10 text-primary',
  export: 'bg-dash-violet/15 text-dash-violet',
  other: 'bg-muted/40 text-foreground-secondary',
};

const activityKey = (item: SuppressionActivityItem) => item.action ?? 'other';

/** Uma linha da trilha: ação (ícone), título, contato e data relativa. */
function ActivityLine({ item, showActor = false }: { item: SuppressionActivityItem; showActor?: boolean }) {
  const key = activityKey(item);
  const Icon = ACTIVITY_ICON[key];
  return (
    <div className="flex gap-2.5 min-w-0">
      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0', ACTIVITY_STYLE[key])}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
        <p className="text-2xs text-foreground-secondary truncate">{item.contactLabel ?? '—'}</p>
        <p className="text-2xs text-muted-foreground truncate">
          {fmtRelativeDay(item.createdAt)}{showActor && item.actorName ? ` · ${item.actorName}` : ''}
        </p>
      </div>
    </div>
  );
}

export function TalkXSuppression({ onOpenContact, onOpenCampaign }: {
  /** Abre a conversa do contato; vem do TalkXView (padrão: mecanismo do produto). */
  onOpenContact?: (contactId: string) => void;
  /** Abre a campanha de origem; vem do TalkXView. Sem ele a ação fica desabilitada. */
  onOpenCampaign?: (campaignId: string) => void;
} = {}) {
  const qc = useQueryClient();
  const { values: filterValues, setValue: setFilterValue, query: search, setQuery: setSearch, hasActive, clear: clearFilters } = useTalkXFilterState('talkx.suppression.filters', { origin: 'all', motivo: 'all' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [showAdd, setShowAdd] = useState(false);
  const [removing, setRemoving] = useState<{ ids: string[]; entries: BlacklistEntry[] } | null>(null);
  const [editing, setEditing] = useState<{ ids: string[]; bulk: boolean } | null>(null);
  const [addTab, setAddTab] = useState<'contact' | 'phone'>('contact');
  const [addContactId, setAddContactId] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addReason, setAddReason] = useState(REASONS[0]);
  const [addCustomReason, setAddCustomReason] = useState('');
  const [addOrigin, setAddOrigin] = useState<'manual'|'lgpd'>('manual');
  const [contactSearch, setContactSearch] = useState('');
  const [showReasons, setShowReasons] = useState(false);
  const [editReason, setEditReason] = useState<EditReasonChoice>('keep');
  const [editExpiry, setEditExpiry] = useState<EditExpiryChoice>('keep');
  const [editDate, setEditDate] = useState('');
  const debouncedContactSearch = useDebounce(contactSearch.trim(), CONTACT_SEARCH_DEBOUNCE_MS);

  // A seleção em massa vale para a página visitada: guardar a chave (página,
  // tamanho, busca e filtros) junto dos ids faz a marcação sumir sozinha quando
  // qualquer um muda — sem efeito de sincronização.
  const selectionKey = `${page}|${pageSize}|${search}|${filterValues.origin}|${filterValues.motivo}`;
  const [selection, setSelection] = useState<{ key: string; ids: Set<string> }>({ key: selectionKey, ids: new Set<string>() });
  const selected: ReadonlySet<string> = selection.key === selectionKey ? selection.ids : new Set<string>();
  const setSelectedIds = (ids: Set<string>) => setSelection({ key: selectionKey, ids });

  /**
   * Limpa o formulário do modal Adicionar. É o MESMO reset nos três caminhos
   * que fecham o modal: `onOpenChange` (Esc, clique fora), o botão Cancelar e o
   * sucesso do envio — antes o Cancelar fechava com `setShowAdd(false)` e
   * deixava aba, telefone e busca preenchidos para a próxima abertura.
   */
  const resetAddForm = () => {
    setAddTab('contact');
    setAddPhone('');
    setAddContactId('');
    setContactSearch('');
    setAddReason(REASONS[0]);
    setAddCustomReason('');
    setAddOrigin('manual');
  };

  // X184 — trilha da lista: os 5 últimos itens no rail e o histórico do modal.
  // O filtro e a página entram na chave da consulta, então cada recorte tem o
  // seu próprio resultado (a resposta de uma página antiga não sobrescreve a nova).
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(ACTIVITY_HISTORY_PAGE_SIZE);
  const [historyType, setHistoryType] = useState<SuppressionActivityEventType | 'all'>('all');
  const activity = useTalkXSuppressionActivity({ limit: ACTIVITY_RAIL_LIMIT });
  const history = useTalkXSuppressionActivity({
    limit: historyPageSize, page: historyPage - 1, eventType: historyType, enabled: showHistory,
  });

  const { data: blacklist = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['talkx-blacklist'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('talkx_blacklist')
        .select('*, contacts:contact_id(name, phone, company, avatar_url)')
        .is('removed_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BlacklistEntry[];
    },
  });

  const { data: availableContacts = [] } = useQuery({
    queryKey: ['contacts-for-blacklist', debouncedContactSearch],
    queryFn: async () => {
      let query = supabase.from('contacts').select('id, name, phone, company').not('phone', 'is', null);
      if (debouncedContactSearch) {
        const term = escapeOrFilterValue(`%${debouncedContactSearch}%`);
        query = query.or(`name.ilike.${term},phone.ilike.${term}`);
      }
      const { data } = await query.order('name').limit(ADD_CONTACT_LIST_LIMIT);
      return data || [];
    },
    enabled: showAdd,
  });

  const blacklistedIds = useMemo(() => new Set(blacklist.map((b) => b.contact_id)), [blacklist]);
  const nonBlocked = useMemo(() => availableContacts.filter((c) => !blacklistedIds.has(c.id)), [availableContacts, blacklistedIds]);

  // Telefone avulso: válido a partir de 10 dígitos; duplicado é o telefone que
  // já está na lista (avulso ou do contato cadastrado), antes mesmo de enviar.
  // `addPhoneKey` existe SÓ para isso — o envio grava os dígitos completos.
  const addPhoneKey = useMemo(() => phoneKey(addPhone), [addPhone]);
  const addPhoneDuplicate = useMemo(
    () => (addPhoneKey ? blacklist.some((b) => phoneKey(b.phone) === addPhoneKey || phoneKey(b.contacts?.phone) === addPhoneKey) : false),
    [blacklist, addPhoneKey],
  );

  /** Uso por motivo: quantos registros ativos da lista carregam cada rótulo. */
  const reasonUsage = useMemo(() => {
    const usage = new Map<string, number>();
    for (const b of blacklist) {
      const label = (b.reason ?? '').trim() || 'Sem motivo';
      usage.set(label, (usage.get(label) ?? 0) + 1);
    }
    return usage;
  }, [blacklist]);

  const filtered = useMemo(() => {
    let r = blacklist;
    if (filterValues.origin !== 'all') r = r.filter((b) => b.origin === filterValues.origin);
    if (filterValues.motivo !== 'all') r = r.filter((b) => (b.reason ?? '').toLowerCase().includes(filterValues.motivo.toLowerCase()));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      // Busca de telefone (só dígitos e pontuação): o número da supressão fica gravado em
      // dígitos, então é preciso normalizar o termo para encontrar um bloqueio feito só
      // por telefone — sem isso, qualquer busca com dígito casaria por acidente.
      const qDigits = q.replace(/\D/g, '');
      const phoneQuery = qDigits.length > 0 && /^[\d\s()+.-]+$/.test(q);
      r = r.filter((b) =>
        b.contacts?.name?.toLowerCase().includes(q)
        || b.contacts?.phone?.includes(q)
        || (phoneQuery && (b.phone ?? '').includes(qDigits))
        || (b.reason ?? '').toLowerCase().includes(q));
    }
    return r;
  }, [blacklist, filterValues.origin, filterValues.motivo, search]);

  const filterDefs = useMemo(() => [
    { key: 'origin', label: 'Todas as origens', allLabel: 'Todas as origens', options: Object.entries(SUPPRESSION_ORIGIN).map(([v, m]) => ({ value: v, label: m.label })) },
  ], []);

  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageIds = paged.map((b) => b.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggleAllOnPage = () => {
    const next = new Set(selected);
    if (allOnPageSelected) pageIds.forEach((id) => next.delete(id)); else pageIds.forEach((id) => next.add(id));
    setSelectedIds(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };
  const selectedEntries = blacklist.filter((b) => selected.has(b.id));


  // X179 — os quatro KPIs e o Centro de proteção leem `talkx_suppression_stats`
  // (X176): valor da janela, mini-barras da série e variação contra o período
  // anterior. A variação fica oculta quando o período anterior é zero.
  const { data: stats, isLoading: statsLoading } = useTalkXSuppressionStats();
  // Sem resposta do servidor (`stats` indefinido no carregamento ou no erro da
  // RPC, ou `data: null`) nenhum número é inventado: o ausente vira "—", nunca 0
  // — nem no rail ("0 campanhas protegidas") nem na fração do medidor.
  const fmtStat = (stat: TalkXSuppressionStat | undefined) => (stat ? fmtInt(stat.value) : '—');
  const kpiProps = (stat: TalkXSuppressionStat | undefined) => ({
    value: fmtStat(stat),
    delta: stat && stat.previous > 0
      ? { pct: Math.round(((stat.value - stat.previous) / stat.previous) * 100), label: 'vs. período anterior' }
      : null,
    bars: stat && stat.series.length >= 2 ? stat.series : null,
  });
  const protectedCount = stats?.protected?.value ?? null;
  const protectedStarted = stats?.protected?.total_started ?? null;
  const railNumbers = [
    { label: 'Suprimidos', value: fmtStat(stats?.active), icon: UserX, color: 'red' as const },
    { label: 'Opt-outs', value: fmtStat(stats?.optouts), icon: ShieldBan, color: 'red' as const },
    { label: 'Manuais', value: fmtStat(stats?.manual), icon: UserMinus, color: 'amber' as const },
    { label: 'Protegidas', value: fmtStat(stats?.protected), icon: ShieldCheck, color: 'green' as const },
  ];

  // Autoria sai do perfil ativo (profiles.id), como em useTalkXSegments: as
  // colunas blocked_by/removed_by referenciam profiles(id) e o id do
  // auth.users nao e o mesmo id — 0 dos 6 perfis tem id = user_id (conferido
  // no banco canonico), entao gravar auth.uid() violava a FK e o "Adicionar
  // contato" da supressao falhava em producao (P1-4 da auditoria).
  const { profile } = useAuth();

  const invalidateList = () => {
    qc.invalidateQueries({ queryKey: ['talkx-blacklist'] });
    qc.invalidateQueries({ queryKey: ['talkx-suppression-activity'] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const finalReason = addReason === 'Outro' ? addCustomReason || 'Outro' : addReason;
      // Telefone avulso vai com TODOS os dígitos válidos (10 a 15). `addPhoneKey`
      // corta para os últimos 11 só para comparar duplicado — usá-lo aqui salvava
      // `5511998877665` truncado e a supressão não batia nas funções de banco que
      // comparam o telefone inteiro.
      const payload = addTab === 'phone'
        ? { phone: phoneDigits(addPhone), contact_id: null, reason: finalReason, blocked_by: profile?.id ?? null, origin: addOrigin }
        : { contact_id: addContactId, reason: finalReason, blocked_by: profile?.id ?? null, origin: addOrigin };
      const { error } = await fromTable('talkx_blacklist').insert(payload);
      if (error) throw error;
    },
    onSuccess: () => { invalidateList(); toast.success('Contato adicionado à lista de supressão'); setShowAdd(false); resetAddForm(); },
    onError: (e: Error & { code?: string }) => toast.error(e.code === '23505' ? 'Este contato já está na lista de supressão' : `Erro: ${e.message}`),
  });

  const addReady = addTab === 'phone' ? Boolean(addPhoneKey) && !addPhoneDuplicate : Boolean(addContactId);

  /** Toda alteração da lista é uma única atualização por ids (1 ou N linhas). */
  const updateEntries = async (ids: string[], payload: Record<string, unknown>) => {
    const { error } = await fromTable('talkx_blacklist').update(payload).in('id', ids);
    if (error) throw error;
  };

  // "Desfazer" do aviso de remoção (10 s): devolve a linha ao estado ativo.
  const restoreMutation = useMutation({
    mutationFn: async (ids: string[]) => updateEntries(ids, { removed_by: null, removed_at: null }),
    onSuccess: () => { invalidateList(); toast.success('Contato de volta à lista de supressão'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const removeMutation = useMutation({
    mutationFn: async (ids: string[]) => updateEntries(ids, { removed_by: profile?.id ?? null, removed_at: new Date().toISOString() }),
    onSuccess: (_data, ids) => {
      invalidateList();
      setRemoving(null);
      setSelectedIds(new Set<string>());
      toast.success(ids.length > 1 ? `${ids.length} contatos removidos da lista de supressão` : 'Contato removido da lista de supressão', {
        duration: 10000,
        action: { label: 'Desfazer', onClick: () => restoreMutation.mutate(ids) },
      });
    },
    onError: (e: Error) => { setRemoving(null); toast.error(`Erro: ${e.message}`); },
  });

  // Reativar vale para Removido e Expirado: volta a ativo sem prazo (nunca expira).
  const reactivateMutation = useMutation({
    mutationFn: async (entry: BlacklistEntry) => updateEntries([entry.id], { removed_by: null, removed_at: null, expires_at: null }),
    onSuccess: () => { invalidateList(); toast.success('Supressão reativada'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const editMutation = useMutation({
    mutationFn: async (input: { ids: string[]; payload: Record<string, unknown> }) => updateEntries(input.ids, input.payload),
    onSuccess: () => { invalidateList(); setEditing(null); toast.success('Supressão atualizada'); },
    onError: (e: Error) => toast.error(`Erro: ${e.message}`),
  });

  const openEdit = (entry: BlacklistEntry) => {
    setEditReason(entry.reason_code ?? 'manual');
    if (entry.expires_at) {
      setEditExpiry('date');
      setEditDate(localDateFromIso(entry.expires_at));
    } else {
      setEditExpiry('never');
      setEditDate('');
    }
    setEditing({ ids: [entry.id], bulk: false });
  };

  const openBulkEdit = () => {
    setEditReason('keep');
    setEditExpiry('keep');
    setEditDate('');
    setEditing({ ids: [...selected], bulk: true });
  };

  const saveEdit = () => {
    if (!editing) return;
    if (editExpiry === 'date' && (!editDate || isPastDateInput(editDate))) {
      toast.error('Escolha uma data de expiração de hoje em diante.');
      return;
    }
    const targets = blacklist.filter((b) => editing.ids.includes(b.id));
    if (editWeakensProtectedSuppression(targets, editReason, editExpiry)) {
      toast.error('Opt-out/LGPD não pode ser afrouxado pela edição; remova com a confirmação obrigatória.');
      return;
    }
    const payload: Record<string, unknown> = {};
    if (editReason !== 'keep') {
      const label = REASON_CODES.find((r) => r.code === editReason)?.label ?? editReason;
      payload.reason = label;
      payload.reason_code = editReason;
    }
    if (editExpiry !== 'keep') payload.expires_at = expiryToIso(editExpiry, editDate);
    if (Object.keys(payload).length === 0) { setEditing(null); return; }
    editMutation.mutate({ ids: editing.ids, payload });
  };

  const openRemove = (entries: BlacklistEntry[]) => setRemoving({ ids: entries.map((e) => e.id), entries });

  const rowActions = (b: BlacklistEntry): RowAction[] => {
    const status = suppressionStatus(b);
    const actions: RowAction[] = [
      { label: 'Editar motivo e expiração', icon: Pencil, onSelect: () => openEdit(b) },
      // Telefone avulso não tem contato para abrir.
      { label: 'Ver contato', icon: Eye, onSelect: () => (onOpenContact ?? openContactChat)(b.contact_id as string), disabled: !b.contact_id },
    ];
    if (b.campaign_id) actions.push({ label: 'Ver campanha', icon: Megaphone, onSelect: () => onOpenCampaign?.(b.campaign_id as string), disabled: !onOpenCampaign });
    if (status !== 'suprimido') actions.push({ label: 'Reativar', icon: RotateCcw, onSelect: () => reactivateMutation.mutate(b) });
    actions.push({ label: 'Remover da lista', icon: Trash2, danger: true, onSelect: () => openRemove([b]) });
    return actions;
  };

  const removingEntries = removing?.entries ?? [];
  const removingIsBulk = removingEntries.length > 1;
  const removingNeedsCheck = removingEntries.some(requiresRemovalConfirmation);
  const removingDetails = removing && !removingIsBulk
    ? [{ label: 'Telefone', value: displayPhone(removingEntries[0]) }, { label: 'Motivo', value: removingEntries[0].reason ?? '—' }]
    : [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4 min-w-0">
      <div className="min-w-0 space-y-4">
        {/* X179 — os 4 KPIs leem `talkx_suppression_stats`: valor da janela,
            mini-barras da série e variação contra o período anterior. Período
            anterior zerado esconde a variação; sem campanha iniciada,
            "Campanhas protegidas" mostra o estado "Sem dados ainda" do kit (A9). */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DashboardKpiCard size="hero" index={0} label="Contatos suprimidos" tile="red" icon={UserX} barsColor="red" isLoading={statsLoading} {...kpiProps(stats?.active)} />
          <DashboardKpiCard size="hero" index={1} label="Opt-outs 30 dias" tile="red" icon={ShieldBan} barsColor="red" isLoading={statsLoading} {...kpiProps(stats?.optouts)} />
          <DashboardKpiCard size="hero" index={2} label="Bloqueios manuais" tile="amber" icon={UserMinus} barsColor="amber" isLoading={statsLoading} {...kpiProps(stats?.manual)} />
          {stats?.protected?.total_started === 0 ? (
            <div className="min-h-[132px]"><TalkXNoData hint="Campanhas protegidas" /></div>
          ) : (
            <DashboardKpiCard size="hero" index={3} label="Campanhas protegidas" tile="green" icon={ShieldCheck} barsColor="green" isLoading={statsLoading} {...kpiProps(stats?.protected)} />
          )}
        </div>

        <FilterBarV2
          search={search} onSearch={(v) => { setSearch(v); setPage(1); }} placeholder="Buscar por contato, telefone ou e-mail…"
          filters={filterDefs} values={filterValues} onFilter={(k, v) => { setFilterValue(k as 'origin' | 'motivo', v); setPage(1); }}
          hasActive={hasActive} onClear={() => { clearFilters(); setPage(1); }}
        />

        <TalkXBulkBar
          count={selected.size}
          onClear={() => setSelectedIds(new Set<string>())}
          actions={
            <>
              <GhostButton size="sm" icon={Pencil} onClick={openBulkEdit}>Alterar motivo</GhostButton>
              <GhostButton size="sm" icon={Trash2} onClick={() => openRemove(selectedEntries)}>Remover</GhostButton>
            </>
          }
        />

        <section className="rounded-2xl bg-card border border-border/70 overflow-hidden">
          <TalkXQueryBoundary
            query={{ isLoading, isError, error }}
            entity="os contatos suprimidos"
            onRetry={() => refetch()}
            skeleton={<div className="p-4"><TalkXSkeletonRows rows={5} /></div>}
            isEmpty={blacklist.length === 0}
            empty={<div className="p-4"><TalkXEmptyState icon={ShieldCheck} title="Nenhum contato na lista de supressão" description="Contatos suprimidos são automaticamente excluídos de todos os envios de campanhas, segmentos e automações." /></div>}
          >
           {filtered.length === 0 ? (<div className="p-4"><TalkXEmptyState icon={Search} title="Nenhum resultado" /></div>)
           : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse">
                <thead className="bg-muted/20 border-b border-border/60"><tr>
                  <Th className="w-10"><input type="checkbox" checked={allOnPageSelected} onChange={toggleAllOnPage} aria-label="Selecionar todos os contatos da página" className="w-3.5 h-3.5 accent-primary cursor-pointer" /></Th>
                  <Th>Contato</Th><Th>Telefone</Th><Th>Origem</Th><Th>Motivo</Th><Th>Campanha</Th><Th>Data</Th><Th>Status</Th><Th className="text-right">Ações</Th>
                </tr></thead>
                <tbody>
                  {paged.map((b) => {
                    const om = SUPPRESSION_ORIGIN[b.origin] ?? { label: b.origin, tone: 'muted' as const };
                    const status = SUPPRESSION_STATUS[suppressionStatus(b)];
                    const name = displayName(b);
                    return (
                      <tr key={b.id} className={cn('border-b border-border/40 transition-colors', selected.has(b.id) ? 'bg-primary/5' : 'hover:bg-muted/20')}>
                        <Td><input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)} aria-label={`Selecionar ${name}`} className="w-3.5 h-3.5 accent-primary cursor-pointer" /></Td>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-dash-red/10 flex items-center justify-center text-xs font-bold text-dash-red shrink-0">{b.contacts?.avatar_url ? <img src={b.contacts.avatar_url} alt="" className="w-full h-full rounded-full object-cover" loading="lazy" decoding="async" /> : (b.contacts?.name || '?')[0].toUpperCase()}</div>
                            <div className="min-w-0"><p className="text-[13px] font-medium text-foreground truncate">{b.contacts?.name ?? 'Sem contato vinculado'}</p><p className="text-2xs text-foreground-secondary truncate">{b.contacts?.company}</p></div>
                          </div>
                        </Td>
                        <Td><span className="text-xs text-foreground-secondary">{displayPhone(b)}</span></Td>
                        <Td><Pill label={om.label} tone={om.tone} /></Td>
                        <Td><span className="text-xs text-foreground-secondary max-w-[180px] block truncate">{b.reason || '—'}</span></Td>
                        <Td><span className="text-2xs text-foreground-secondary">{b.campaign_id ? 'Campanha' : '—'}</span></Td>
                        <Td><span className="text-xs text-foreground-secondary">{fmtDateTime(b.created_at)}</span></Td>
                        <Td><Pill label={status.label} tone={status.tone} dot /></Td>
                        <Td className="text-right">
                          <div className="flex justify-end"><RowActionsMenu actions={rowActions(b)} label={`Ações de ${name}`} /></div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </TalkXQueryBoundary>
          {filtered.length > 0 && <div className="px-4 pb-4 pt-2 border-t border-border/50"><TalkXPagination page={page} pageSize={pageSize} total={filtered.length} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(1); }} noun="contatos suprimidos" /></div>}
        </section>
      </div>

      {/* Rail: ações da lista (SH:242) + proteção + trilha */}
      <div className="space-y-4 min-w-0">
        <RailCard icon={ListChecks} color="violet" title="Ações da lista" subtitle="Importar, exportar e personalizar a supressão">
          <div className="flex flex-col gap-2">
            <RailAction icon={Plus} color="blue" title="Adicionar contato" subtitle="Inserir manualmente" onClick={() => setShowAdd(true)} />
            <RailAction icon={Settings} color="violet" title="Gerenciar motivos" subtitle="Personalizar categorias" onClick={() => setShowReasons(true)} />
            <RailAction icon={Upload} color="amber" title="Importar contatos" subtitle="CSV, XLSX ou TXT" disabled />
            <RailAction icon={Download} color="amber" title="Exportar lista" subtitle="Baixar lista em CSV" disabled />
          </div>
          <p className="text-2xs text-muted-foreground">Importar e exportar ainda não estão disponíveis nesta tela.</p>
        </RailCard>

        <RailCard icon={ShieldCheck} color="green" title="Centro de proteção" subtitle="Mais segurança para suas campanhas" glow>
          <div className="rounded-xl bg-dash-green/10 border border-dash-green/30 p-3 text-center">
            <ProtectionGauge protectedCount={protectedCount} totalStarted={protectedStarted} />
            <p data-testid="rail-protected-value" className="text-4xl font-bold text-foreground tabular-nums">{protectedCount === null ? '—' : fmtInt(protectedCount)}</p>
            <p className="text-xs text-foreground-secondary">campanhas protegidas</p>
            <p className="text-2xs text-foreground-secondary leading-snug mt-1.5">Contatos da lista de supressão são automaticamente excluídos de todos os envios.</p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            {railNumbers.map(({ value, label, icon, color }) => (
              <div key={label} className="rounded-xl bg-muted/30 border border-border/50 py-2 flex flex-col items-center gap-1.5 min-w-0">
                <IconTile icon={icon} color={color} size={32} soft />
                <p className="text-sm font-bold text-foreground tabular-nums">{value}</p>
                <p className="text-3xs text-foreground-secondary truncate max-w-full">{label}</p>
              </div>
            ))}
          </div>
        </RailCard>
        <div className="rounded-xl border border-dash-amber/30 bg-dash-amber/10 p-3 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-dash-amber shrink-0 mt-0.5" />
          <p className="text-xs text-foreground-secondary">Contatos suprimidos são automaticamente excluídos de <b className="text-foreground">todos</b> os envios de campanhas, segmentos e automações. <a href="#" className="text-primary-glow hover:underline">Saiba mais →</a></p>
        </div>

        <RailCard icon={Activity} color="violet" title="Atividade recente" subtitle="Últimas mudanças na lista de supressão">
          {activity.isLoading ? (
            <TalkXSkeletonRows rows={3} variant="rail" />
          ) : activity.isError ? (
            <div role="alert" className="rounded-xl border border-dash-red/40 bg-dash-red/5 p-3">
              <p className="text-xs text-foreground">Não foi possível carregar a atividade da lista.</p>
              <button type="button" onClick={() => { void activity.refetch(); }} className="mt-1 text-2xs font-semibold text-foreground-secondary hover:text-foreground">Tentar novamente</button>
            </div>
          ) : activity.items.length === 0 ? (
            <p className="text-xs text-foreground-secondary">Nenhuma atividade ainda</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {activity.items.map((item, i) => {
                const key = activityKey(item);
                const Icon = ACTIVITY_ICON[key];
                return (
                  <li key={item.id} className="flex gap-2.5 min-w-0">
                    <div className="flex flex-col items-center shrink-0">
                      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center', ACTIVITY_STYLE[key])}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                      {i < activity.items.length - 1 && <span className="w-px flex-1 bg-border/60 my-1" aria-hidden="true" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{item.title}</p>
                      <p className="text-2xs text-foreground-secondary truncate">{item.contactLabel ?? '—'}</p>
                      <p className="text-2xs text-muted-foreground">{fmtRelativeDay(item.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          <button
            type="button"
            onClick={() => { setHistoryPage(1); setHistoryType('all'); setShowHistory(true); }}
            className="self-start text-xs font-medium text-primary-glow hover:underline"
          >
            Ver todas
          </button>
        </RailCard>
      </div>

      {/* Modal adicionar: contato existente ou telefone avulso (duas abas) */}
      <Dialog open={showAdd} onOpenChange={(o) => { setShowAdd(o); if (!o) resetAddForm(); }}>
        <DialogContent className="rounded-2xl border-border/70 max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Adicionar à Lista de Supressão</DialogTitle></DialogHeader>
          <Tabs value={addTab} onValueChange={(v) => setAddTab(v as 'contact' | 'phone')}>
            <TabsList className="grid w-full grid-cols-2 h-auto">
              <TabsTrigger value="contact">Contato existente</TabsTrigger>
              <TabsTrigger value="phone">Telefone avulso</TabsTrigger>
            </TabsList>
            <TabsContent value="contact" className="mt-3">
              <Label className="text-xs text-foreground-secondary">Buscar contato</Label>
              <Input value={contactSearch} onChange={(e) => setContactSearch(e.target.value)} placeholder="Nome ou telefone…" className="mt-1.5 bg-input/40 border-border/70" />
              <div className="max-h-40 overflow-auto mt-2 rounded-lg border border-border/60 divide-y divide-border/50">
                {nonBlocked.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Nenhum contato encontrado</p>
                  : nonBlocked.map((c) => (
                    <button key={c.id} onClick={() => setAddContactId(c.id)} className={cn('w-full text-left px-3 py-2 text-sm transition-colors', addContactId === c.id ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                      <span className="font-medium">{c.name}</span><span className="text-muted-foreground ml-2 text-xs">{c.phone}</span>
                    </button>
                  ))}
              </div>
            </TabsContent>
            <TabsContent value="phone" className="mt-3">
              <Label htmlFor="talkx-suppress-phone" className="text-xs text-foreground-secondary">Telefone</Label>
              <Input id="talkx-suppress-phone" value={addPhone} onChange={(e) => setAddPhone(formatPhoneMask(e.target.value))} inputMode="tel" placeholder="(11) 91234-5678" className="mt-1.5 bg-input/40 border-border/70" />
              <p className="text-2xs text-foreground-secondary mt-1.5">DDD + número, de 10 a 15 dígitos. O contato não precisa estar cadastrado.</p>
              {addPhoneDuplicate && <p className="mt-2 rounded-lg border border-dash-amber/30 bg-dash-amber/10 p-2.5 text-2xs text-foreground-secondary">Este contato já está na lista de supressão.</p>}
            </TabsContent>
          </Tabs>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-foreground-secondary">Origem</Label>
              <div className="flex gap-2 mt-1.5">
                {(['manual', 'lgpd'] as const).map((o) => <button key={o} type="button" onClick={() => setAddOrigin(o)} className={cn('h-8 px-3 rounded-lg border text-xs font-medium', addOrigin === o ? 'border-primary bg-primary/10 text-foreground' : 'border-border/70 text-muted-foreground hover:bg-muted/50')}>{o === 'manual' ? 'Manual' : 'LGPD'}</button>)}
              </div>
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Motivo</Label>
              <Select value={addReason} onValueChange={setAddReason}>
                <SelectTrigger className="mt-1.5 bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
                <SelectContent>{REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
              </Select>
              {addReason === 'Outro' && <Textarea value={addCustomReason} onChange={(e) => setAddCustomReason(e.target.value)} placeholder="Descreva o motivo…" className="mt-2 bg-input/40 border-border/70" rows={2} />}
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => { setShowAdd(false); resetAddForm(); }}>Cancelar</GhostButton>
            <PrimaryButton icon={ShieldBan} onClick={() => addMutation.mutate()} disabled={!addReady || addMutation.isPending}>Bloquear</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal editar motivo e expiração (1 linha ou a seleção) */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="rounded-2xl border-border/70 max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editing?.bulk ? `Editar ${editing.ids.length} contatos suprimidos` : 'Editar supressão'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs text-foreground-secondary">Motivo</Label>
              <Select value={editReason} onValueChange={(v) => setEditReason(v as EditReasonChoice)}>
                <SelectTrigger className="mt-1.5 bg-input/40 border-border/70" aria-label="Motivo"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editing?.bulk && <SelectItem value="keep">Manter atual</SelectItem>}
                  {REASON_CODES.map((r) => <SelectItem key={r.code} value={r.code}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-foreground-secondary">Expiração</Label>
              <Select value={editExpiry} onValueChange={(v) => setEditExpiry(v as EditExpiryChoice)}>
                <SelectTrigger className="mt-1.5 bg-input/40 border-border/70" aria-label="Expiração"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {editing?.bulk && <SelectItem value="keep">Manter atual</SelectItem>}
                  <SelectItem value="never">Nunca expira</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias</SelectItem>
                  <SelectItem value="date">Em uma data</SelectItem>
                </SelectContent>
              </Select>
              {editExpiry === 'date' && <Input type="date" min={todayDateInput()} value={editDate} onChange={(e) => setEditDate(e.target.value)} aria-label="Data de expiração" className="mt-2 bg-input/40 border-border/70" />}
            </div>
          </div>
          <DialogFooter>
            <GhostButton onClick={() => setEditing(null)}>Cancelar</GhostButton>
            <PrimaryButton icon={Save} onClick={saveEdit} disabled={editExpiry === 'date' && !editDate} className={cn(editMutation.isPending && 'opacity-50 pointer-events-none')}>Salvar</PrimaryButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal remover (kit) — opt-out/LGPD exige a confirmação marcada */}
      <TalkXConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && removeMutation.mutate(removing.ids)}
        icon={Trash2}
        iconColor="red"
        tone="danger"
        title={removingIsBulk ? `Remover ${removingEntries.length} contatos da lista?` : 'Remover da lista de supressão?'}
        entityName={removing && !removingIsBulk ? displayName(removingEntries[0]) : undefined}
        description="Volta a poder receber mensagens do Talk X nas próximas campanhas."
        details={removingDetails}
        checks={removingNeedsCheck ? [{ id: 'confirmacao', label: removingIsBulk ? 'Confirmo que esta seleção pediu para sair ou revogou o consentimento (LGPD).' : 'Confirmo que este contato pediu para sair ou revogou o consentimento (LGPD).' }] : []}
        confirmLabel="Remover"
        loading={removeMutation.isPending}
      />

      {/* X184 — "Ver todas": histórico paginado da trilha (20 por página) */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="rounded-2xl border-border/70 max-w-xl" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Atividade recente</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <Select value={historyType} onValueChange={(v) => { setHistoryType(v as SuppressionActivityEventType | 'all'); setHistoryPage(1); }}>
              <SelectTrigger className="bg-input/40 border-border/70"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {SUPPRESSION_ACTIVITY_EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{ACTIVITY_FILTER_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            {history.isLoading ? <TalkXSkeletonRows rows={4} />
              : history.isError ? (
                <div role="alert" className="rounded-xl border border-dash-red/40 bg-dash-red/5 p-3">
                  <p className="text-xs text-foreground">Não foi possível carregar a atividade da lista.</p>
                  <button type="button" onClick={() => { void history.refetch(); }} className="mt-1 text-2xs font-semibold text-foreground-secondary hover:text-foreground">Tentar novamente</button>
                </div>
              ) : history.items.length === 0 ? (
                <p className="py-6 text-center text-xs text-foreground-secondary">Nenhuma atividade ainda</p>
              ) : (
                <ul className="flex max-h-[45vh] flex-col divide-y divide-border/50 overflow-auto">
                  {history.items.map((item) => <li key={item.id} className="py-2.5"><ActivityLine item={item} showActor /></li>)}
                </ul>
              )}
            {history.total > 0 && (
              <TalkXPagination
                page={historyPage} pageSize={historyPageSize} total={history.total}
                onPage={setHistoryPage} onPageSize={(n) => { setHistoryPageSize(n); setHistoryPage(1); }}
                noun="atividades"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal gerenciar motivos */}
      <Dialog open={showReasons} onOpenChange={setShowReasons}>
        <DialogContent className="rounded-2xl border-border/70 max-w-md" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Motivos de supressão</DialogTitle></DialogHeader>
          <ul className="divide-y divide-border/50 rounded-lg border border-border/60 max-h-72 overflow-auto">
            {REASONS.map((r) => {
              const usos = reasonUsage.get(r) ?? 0;
              return (
                <li key={r} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{r}</p>
                    <p className="text-2xs text-foreground-secondary">{usos === 1 ? '1 registro' : `${fmtInt(usos)} registros`}</p>
                  </div>
                  <Pill label="Sistema" tone="muted" />
                </li>
              );
            })}
          </ul>
          <p className="text-2xs text-foreground-secondary">Criar, renomear e desativar categorias depende da tabela de motivos do módulo (ainda não criada).</p>
          <DialogFooter><GhostButton onClick={() => setShowReasons(false)}>Fechar</GhostButton></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
