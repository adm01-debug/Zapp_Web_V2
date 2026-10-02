import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTalkX, TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTalkXSegments, resolveAudience, countAudience, RULE_FIELDS, RULE_OPS, emptyRules, type SegmentRules, type SegmentRule, type SegmentRuleGroup, type RuleField, type RuleOp } from '@/hooks/integrations/useTalkXSegments';
import { useTalkXTemplates } from '@/hooks/integrations/useTalkXTemplates';
import { useTalkXEventLogger } from '@/hooks/integrations/useTalkXEvents';
import { fromTable } from '@/lib/supabaseHelpers';
import { useAuth } from '@/hooks/auth/useAuth';
import { SPEED_PROFILES, estimateSeconds, fmtDurationShort } from './talkxShared';

export const VARIABLES = [
  { key: '{{nome}}', label: 'Primeiro Nome', desc: 'Insere o primeiro nome do contato' },
  { key: '{{nome_completo}}', label: 'Nome Completo', desc: 'Insere o nome completo do contato' },
  { key: '{{apelido}}', label: 'Apelido', desc: 'Usa apelido se disponível, senão primeiro nome' },
  { key: '{{empresa}}', label: 'Empresa', desc: 'Nome da empresa do contato' },
  { key: '{{saudacao}}', label: 'Saudação', desc: 'Automático: Bom dia / Boa tarde / Boa noite' },
];

export const MESSAGE_TEMPLATES = [
  { name: 'Saudação simples', template: '{{saudacao}}, {{nome}}! Tudo bem? 😊' },
  { name: 'Promoção', template: '{{saudacao}}, {{nome}}! 🎉 Temos uma oferta especial para você! Entre em contato para saber mais.' },
  { name: 'Follow-up', template: 'Oi, {{apelido}}! Passando para saber se conseguiu ver nossa última mensagem. Fico à disposição! 🙏' },
  { name: 'Boas-vindas', template: '{{saudacao}}, {{nome}}! Seja muito bem-vindo(a) à {{empresa}}! Estamos felizes em ter você conosco. 🤝' },
  { name: 'Lembrete', template: 'Oi, {{apelido}}! Só passando para lembrar sobre nosso compromisso. Qualquer dúvida, estou por aqui! 📌' },
  { name: 'Agradecimento', template: '{{saudacao}}, {{nome}}! Muito obrigado pela confiança! Foi um prazer atender você. ⭐' },
];

export const MEDIA_TYPES = [
  { value: 'image', label: 'Imagem', icon: 'Image' as const },
  { value: 'video', label: 'Vídeo', icon: 'Video' as const },
  { value: 'document', label: 'Documento', icon: 'FileText' as const },
  { value: 'audio', label: 'Áudio', icon: 'Music' as const },
];

export type WizardStep = 1 | 2 | 3 | 4;
export type AudienceSource = 'contacts' | 'segment' | 'crm360';

export const DEFAULT_SCHEDULE_TIMEZONE = 'America/Sao_Paulo';
const DRAFT_CREATION_KEY_STORAGE = 'talkx:draft-creation-key:v1';

/**
 * A Talk X campaign can only be configured against a connection that the
 * delivery worker can actually address. The database repeats this check in
 * `save_talkx_campaign_draft`; keeping it here avoids presenting a choice
 * which is guaranteed to fail when the user saves.
 */
export function isLiveTalkXConnection(connection: {
  status: string | null;
  instance_id: string | null;
}): boolean {
  return connection.status === 'connected' && Boolean(connection.instance_id?.trim());
}

type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function parseLocalDateTime(value: string): LocalDateTimeParts {
  const match = LOCAL_DATE_TIME_PATTERN.exec(value);
  if (!match) throw new Error('Informe uma data e hora locais válidas.');

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const parts = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText),
    hour: Number(hourText), minute: Number(minuteText),
  };
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute));
  if (
    probe.getUTCFullYear() !== parts.year || probe.getUTCMonth() !== parts.month - 1
    || probe.getUTCDate() !== parts.day || probe.getUTCHours() !== parts.hour
    || probe.getUTCMinutes() !== parts.minute
  ) {
    throw new Error('Informe uma data e hora locais válidas.');
  }
  return parts;
}

function zonedParts(instantMs: number, timezone: string): LocalDateTimeParts & { second: number } {
  try {
    const values = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      calendar: 'iso8601',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instantMs)).map((part) => [part.type, part.value]));
    return {
      year: Number(values.year), month: Number(values.month), day: Number(values.day),
      hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
    };
  } catch {
    throw new Error('O fuso horário selecionado é inválido.');
  }
}

function isWizardStep(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 4;
}

/** Passo inicial: a URL manda; sem passo válido nela, vale o salvo no rascunho (V23). */
function initialWizardStep(savedStep?: number | null): WizardStep {
  const raw = new URLSearchParams(window.location.search).get('step');
  const step = Number(raw);
  if (isWizardStep(step)) return step as WizardStep;
  const saved = Number(savedStep);
  return isWizardStep(saved) ? saved as WizardStep : 1;
}

function newDraftCreationKey(): string {
  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new Error('O navegador não oferece uma fonte segura para identificar o rascunho.');
  }
  return globalThis.crypto.randomUUID();
}

/**
 * A create response can be lost after PostgreSQL committed it. Keep the key in
 * the browser tab so refresh/retry can ask the server for that exact draft,
 * rather than creating a second one. It is not an authorization credential.
 */
function restoreOrCreateDraftCreationKey(): string {
  try {
    const stored = window.sessionStorage.getItem(DRAFT_CREATION_KEY_STORAGE);
    if (stored && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(stored)) return stored;
    const key = newDraftCreationKey();
    window.sessionStorage.setItem(DRAFT_CREATION_KEY_STORAGE, key);
    return key;
  } catch {
    // Storage may be unavailable in hardened browser contexts. The server still
    // protects a retry within this mounted editor via the in-memory key.
    return newDraftCreationKey();
  }
}

export function utcToLocalInTimezone(utc: string, tz: string): string {
  if (!utc) return '';
  const instantMs = new Date(utc).getTime();
  if (!Number.isFinite(instantMs)) throw new Error('O instante UTC informado é inválido.');
  const parts = zonedParts(instantMs, tz);
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}


/**
 * E69 fix: converte datetime-local string (sem TZ) para ISO UTC usando o fuso selecionado.
 * Ex: localToUTCInTimezone('2026-09-15T10:00', 'America/New_York') -> '2026-09-15T14:00:00.000Z'
 */
export function localToUTCInTimezone(localStr: string, tz: string): string {
  if (!localStr) return '';
  const parts = parseLocalDateTime(localStr);
  const localAsUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);

  // A offset único calculado no horário "equivalente em UTC" falha depois de
  // uma transição de DST. Coletamos os offsets vigentes numa janela de 72 h e
  // aceitamos somente o instante que reconstrói exatamente a parede local.
  const offsets = new Set<number>();
  for (let deltaMinutes = -2160; deltaMinutes <= 2160; deltaMinutes += 30) {
    const sampleMs = localAsUtcMs + deltaMinutes * 60_000;
    const local = zonedParts(sampleMs, tz);
    offsets.add(Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - sampleMs);
  }
  const candidates = [...offsets]
    .map((offsetMs) => localAsUtcMs - offsetMs)
    .filter((candidateMs) => utcToLocalInTimezone(new Date(candidateMs).toISOString(), tz) === localStr)
    .sort((left, right) => left - right);

  if (candidates.length === 0) {
    throw new Error('O horário selecionado não existe no fuso informado devido ao horário de verão. Escolha outro horário.');
  }
  if (candidates.length > 1) {
    throw new Error('O horário selecionado é ambíguo devido ao horário de verão. Escolha outro horário.');
  }
  return new Date(candidates[0]).toISOString();
}

/* ------------------------------------------------------------------ */
/* V24 — filtros de audiência como regras (motor dos segmentos)        */
/* ------------------------------------------------------------------ */

/** Debounce das regras antes de consultar o motor (não consultar a cada tecla). */
const AUDIENCE_FILTER_DEBOUNCE_MS = 350;
/**
 * Teto da amostra do passo 1 — mesmo teto que o motor usa em `resolveAudience`.
 * Não é o snapshot de destinatários: quem gera os recipients é `persistSave`.
 */
export const AUDIENCE_PREVIEW_LIMIT = 5000;
/** Chave do snapshot antigo (V23) que guardava a busca textual livre. */
const AUDIENCE_SEARCH_KEY = 'search';

/**
 * Converte o snapshot solto do V23 (`company`/`tag`/`city`/`state`/`status`) nas
 * regras do motor. `group`/`inactive`/`birthday` eram filtros MORTOS — as
 * colunas nunca entravam no SELECT e eles nunca filtraram nada — então são
 * descartados em vez de convertidos.
 */
function legacySnapshotToRules(snapshot: Record<string, unknown>): SegmentRules {
  const rules: SegmentRule[] = [];
  const add = (field: RuleField, op: RuleOp, value: unknown) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed || trimmed === 'all') return;
    rules.push({ id: crypto.randomUUID(), field, op, value: trimmed });
  };
  add('company', 'eq', snapshot.company);
  add('tags', 'contains', snapshot.tag);
  add('city', 'eq', snapshot.city);
  add('state', 'eq', snapshot.state);
  add('conversation_status', 'eq', snapshot.status);
  return { groups: [{ id: crypto.randomUUID(), match: 'and', rules }] };
}

/** Já está no formato de regras do motor quando traz `groups` com `rules`. */
export function isSegmentRules(value: unknown): value is SegmentRules {
  if (!value || typeof value !== 'object') return false;
  const groups = (value as { groups?: unknown }).groups;
  return Array.isArray(groups)
    && groups.every((group) => !!group && Array.isArray((group as { rules?: unknown }).rules));
}

/** Hidratação: usa as regras do V24 quando existem; senão converte o snapshot do V23. */
export function hydrateAudienceRules(filters: Record<string, unknown> | null | undefined): SegmentRules {
  // Normaliza (`{ groups }` e só): o payload do V24 carrega também a busca
  // textual como chave irmã, que não pode viajar dentro das regras.
  if (isSegmentRules(filters)) return { groups: filters.groups };
  return filters ? legacySnapshotToRules(filters) : emptyRules();
}

/**
 * A busca textual continua em estado separado: nome/apelido/telefone não são
 * campos do catálogo de regras (só empresa/e-mail/tags são), então a busca só
 * refina a lista já filtrada pelo motor, sem ir ao servidor.
 */
export function hydrateContactSearch(filters: Record<string, unknown> | null | undefined): string {
  const search = filters?.[AUDIENCE_SEARCH_KEY];
  return typeof search === 'string' ? search : '';
}

/**
 * Uma regra ainda em branco não pode ir para o motor: `rulesToPostgrest` lança
 * em regra inválida (de propósito — nunca ampliar a audiência em silêncio).
 */
function isRuleComplete(rule: SegmentRule): boolean {
  if (!RULE_FIELDS.some((field) => field.value === rule.field)) return false;
  if (rule.op === 'is_set' || rule.op === 'is_empty') return true;
  return rule.value.trim().length > 0;
}

/** Remove as regras incompletas antes de consultar e antes de persistir. */
export function completedRules(rules: SegmentRules): SegmentRules {
  return {
    groups: rules.groups.map((group) => ({ ...group, rules: group.rules.filter(isRuleComplete) })),
  };
}

/** Valor atual de uma regra simples de um campo (atalhos Empresa/Tag do seletor). */
function findRuleValue(rules: SegmentRules, field: RuleField, op: RuleOp): string | null {
  for (const group of rules.groups) {
    const found = group.rules.find((rule) => rule.field === field && rule.op === op && rule.value.trim());
    if (found) return found.value;
  }
  return null;
}

/**
 * Garante pelo menos um grupo. O id do grupo novo chega pronto de fora para que
 * a geração de id (`crypto.randomUUID`) nunca aconteça dentro do updater.
 */
function ensureGroups(rules: SegmentRules, freshGroupId: string): SegmentRuleGroup[] {
  return rules.groups.length > 0 ? rules.groups : [{ id: freshGroupId, match: 'and', rules: [] }];
}

/** Acrescenta (ou substitui) a regra de um campo no primeiro grupo. */
function upsertFieldRule(rules: SegmentRules, rule: SegmentRule, freshGroupId: string): SegmentRules {
  const [first, ...rest] = ensureGroups(rules, freshGroupId);
  const alreadyPresent = first.rules.some((item) => item.field === rule.field && item.op === rule.op && item.value === rule.value);
  const kept = first.rules.filter((item) => item.field !== rule.field);
  return { groups: [{ ...first, rules: alreadyPresent ? kept : [...kept, rule] }, ...rest] };
}

/** Acrescenta a regra informada ao primeiro grupo (sem deduplicar). */
function appendFieldRule(rules: SegmentRules, rule: SegmentRule, freshGroupId: string): SegmentRules {
  const [first, ...rest] = ensureGroups(rules, freshGroupId);
  return { groups: [{ ...first, rules: [...first.rules, rule] }, ...rest] };
}

/** Remove todas as regras de um campo. */
function removeFieldRules(rules: SegmentRules, field: RuleField): SegmentRules {
  return {
    groups: rules.groups.map((group) => ({ ...group, rules: group.rules.filter((rule) => rule.field !== field) })),
  };
}

/** Debounce de um valor qualquer (as regras mudam a cada tecla digitada). */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useCampaignEditor(campaign: TalkXCampaign | null, onClose: () => void, initial?: { segmentId?: string; templateId?: string; step?: WizardStep }) {
  const { saveDraftCampaign, updateCampaign, replaceDraftRecipients, startCampaign } = useTalkX();
  const { segments } = useTalkXSegments();
  const { templates, fetchVersionHistory } = useTalkXTemplates();
  const logEvent = useTalkXEventLogger();
  const { profile } = useAuth();

  const [step, setStep] = useState<WizardStep>(() => initial?.step ?? initialWizardStep(campaign?.draft_step));
  const [name, setName] = useState(campaign?.name || '');
  const [description, setDescription] = useState(campaign?.description || '');
  const [objective, setObjective] = useState(campaign?.objective || 'engajamento');
  const [suppressedByPhoneCount, setSuppressedByPhoneCount] = useState(0); // E63 phone-based
  const [lastAutosave, setLastAutosave] = useState<Date | null>(null); // E68
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'error' | 'offline'>('idle');
  const [autosaveError, setAutosaveError] = useState<string | null>(null);
  const [persistedAutosaveSnapshot, setPersistedAutosaveSnapshot] = useState<string | null>(null);
  const initialScheduleTimezone = campaign?.schedule_timezone || DEFAULT_SCHEDULE_TIMEZONE;
  const [scheduleTimezone, setScheduleTimezone] = useState(initialScheduleTimezone); // E69
  const [scheduleConfigError, setScheduleConfigError] = useState<string | null>(null);
  const [scheduleNowMs, setScheduleNowMs] = useState(() => Date.now());
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // E68
  const handleSaveRef = useRef<((mode?: 'draft' | 'schedule' | 'launch') => Promise<string | null>) | null>(null); // E68
  const autosaveInitialRef = useRef<string | null>(null); // E68: snapshot de abertura
  const [audienceSource, setAudienceSource] = useState<AudienceSource>(campaign?.audience_source || (initial?.segmentId ? 'segment' : 'contacts'));
  const [segmentId, setSegmentId] = useState(campaign?.segment_id || initial?.segmentId || '');
  const [templateId, setTemplateId] = useState(campaign?.template_id || initial?.templateId || '');
  // V26 — versão do template que originou a mensagem (talkx_template_versions.id).
  const [templateVersionId, setTemplateVersionId] = useState<string | null>(campaign?.template_version_id ?? null);
  const [messageTemplate, setMessageTemplate] = useState(campaign?.message_template || '');
  const [typingDelay, setTypingDelay] = useState([
    (campaign?.typing_delay_min || 1500) / 1000,
    (campaign?.typing_delay_max || 4000) / 1000,
  ]);
  const [sendInterval, setSendInterval] = useState([
    (campaign?.send_interval_min || 8000) / 1000,
    (campaign?.send_interval_max || 20000) / 1000,
  ]);
  const [speedProfile, setSpeedProfileState] = useState<'slow' | 'moderate' | 'fast'>(campaign?.speed_profile || 'moderate');
  const [connectionId, setConnectionId] = useState(campaign?.whatsapp_connection_id || '');
  // V25 — responsável da campanha (profiles.id). Hidrata do rascunho; sem
  // responsável gravado, cai no perfil do usuário logado (efeito abaixo).
  const [owner, setOwner] = useState<string | null>(campaign?.owner ?? null);
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [hydratedRecipientCampaignId, setHydratedRecipientCampaignId] = useState<string | null>(null);
  // Estado React sozinho não é suficiente para saves enfileirados: o callback
  // seguinte pode ter capturado o render anterior, ainda sem o ID recém-criado.
  const draftCampaignIdRef = useRef<string | null>(campaign?.id || null);
  const [draftCampaignId, setDraftCampaignId] = useState<string | null>(campaign?.id || null);
  const draftRevisionRef = useRef<number>(campaign?.revision ?? 1);
  const [draftRevision, setDraftRevision] = useState<number>(campaign?.revision ?? 1);
  const [draftCreationKey] = useState<string | null>(() => campaign?.id ? null : restoreOrCreateDraftCreationKey());
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [showPreview, setShowPreview] = useState(true);
  // V24: o recorte do passo 1 é um conjunto de REGRAS do mesmo motor dos
  // segmentos (antes era um snapshot solto, em parte com filtros mortos).
  // A hidratação aceita o formato novo e converte o rascunho antigo do V23.
  const savedFilters = (campaign?.audience_filters ?? null) as Record<string, unknown> | null;
  const [audienceRules, setAudienceRules] = useState<SegmentRules>(() => hydrateAudienceRules(savedFilters));
  // A busca textual não tem campo no catálogo (nome/apelido/telefone não são
  // regra), por isso continua como estado próprio — só refina a lista.
  const [contactSearch, setContactSearch] = useState(() => hydrateContactSearch(savedFilters));
  const [saving, setSaving] = useState(false);
  const [mediaUrl, setMediaUrl] = useState(campaign?.media_url || '');
  const [mediaType, setMediaType] = useState(campaign?.media_type || '');
  const [hasMedia, setHasMedia] = useState(!!campaign?.media_url);
  const [isScheduled, setIsScheduled] = useState(!!campaign?.scheduled_at);
  const [scheduledAt, setScheduledAtState] = useState(
    campaign?.scheduled_at ? utcToLocalInTimezone(campaign.scheduled_at, initialScheduleTimezone) : ''
  );
  const [sendWindowEnabled, setSendWindowEnabled] = useState(!!campaign?.send_window_start);
  const [sendWindowStart, setSendWindowStart] = useState(campaign?.send_window_start?.slice(0, 5) || '08:00');
  const [sendWindowEnd, setSendWindowEnd] = useState(campaign?.send_window_end?.slice(0, 5) || '18:00');
  const [businessHoursOnly, setBusinessHoursOnly] = useState(!!campaign?.business_hours_only);
  const [respectSuppression, setRespectSuppression] = useState(campaign?.respect_suppression ?? true);
  const [confirmConsent, setConfirmConsent] = useState(!!campaign?.confirm_consent);
  const [confirmContent, setConfirmContent] = useState(false);
  const [confirmSuppression, setConfirmSuppression] = useState(false);

  useEffect(() => {
    if (!isScheduled) return undefined;
    const timer = window.setInterval(() => setScheduleNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [isScheduled]);

  /**
   * V26 — resolve a versão mais recente registrada para o template (mesma
   * consulta que o histórico do editor de template já usa) e a guarda em
   * `template_version_id` para auditar de qual versão a campanha saiu.
   *
   * Observação: `update_talkx_template_with_snapshot` arquiva em
   * talkx_template_versions o estado ANTERIOR à edição (é um histórico), então
   * a linha de maior `version_number` é o último estado ARQUIVADO e pode ficar
   * uma edição atrás do conteúdo ao vivo do template. Como `talkx_templates`
   * não tem coluna de versão corrente e a FK exige um id existente, este é o id
   * mais próximo de "versão aplicada" que o banco oferece hoje.
   */
  const resolveTemplateVersion = useCallback(async (id: string) => {
    try {
      const versions = await fetchVersionHistory(id);
      setTemplateVersionId(versions[0]?.id ?? null);
    } catch {
      setTemplateVersionId(null);
    }
  }, [fetchVersionHistory]);

  // Template inicial (vindo da galeria) preenche a mensagem uma vez.
  useEffect(() => {
    if (!campaign && templateId && !messageTemplate) {
      const t = templates.find((x) => x.id === templateId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (t) { setMessageTemplate(t.content); if (t.media_url) { setHasMedia(true); setMediaUrl(t.media_url); setMediaType(t.media_type || 'image'); } void resolveTemplateVersion(templateId); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates.length]);

  const { data: connectionCandidates } = useQuery({
    queryKey: ['wa-connections-talkx'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_connections')
        .select('id, name, phone_number, status, instance_id')
        .eq('status', 'connected')
        .not('instance_id', 'is', null)
        .neq('instance_id', '');
      return data || [];
    },
  });

  // The query excludes the common bad states. This in-memory guard covers
  // whitespace-only instance IDs and protects callers/tests that hydrate a
  // stale query result while the connection changes in real time.
  const connections = useMemo(
    () => (connectionCandidates ?? []).filter(isLiveTalkXConnection),
    [connectionCandidates],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!connectionId && connections && connections.length > 0) setConnectionId(connections[0].id);
  }, [connections, connectionId]);

  // V25 — responsáveis elegíveis: perfis ativos. Exibimos `name` (fallback
  // e-mail) e gravamos `id` (uuid de profiles.id), como em TalkXSuppression.
  const { data: ownerProfiles } = useQuery({
    queryKey: ['talkx-owner-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles')
        .select('id, name, email')
        .eq('is_active', true)
        .order('name');
      return (data ?? []) as { id: string; name: string | null; email: string | null }[];
    },
  });

  // Sem responsável gravado no rascunho, assume o perfil do usuário logado.
  // Nunca sobrescreve uma escolha explícita (owner já definido).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!owner && profile?.id) setOwner(profile.id);
  }, [owner, profile?.id]);



  // V24 — o passo 1 consulta o MESMO motor dos segmentos: a lista e a contagem
  // passam a respeitar cidade/UF/grupo/última interação (antes o SELECT não
  // trazia essas colunas e os filtros correspondentes nunca filtravam nada).
  // Debounce nas regras para não consultar a cada tecla.
  const debouncedAudienceRules = useDebouncedValue(audienceRules, AUDIENCE_FILTER_DEBOUNCE_MS);
  const effectiveAudienceRules = useMemo(() => completedRules(debouncedAudienceRules), [debouncedAudienceRules]);
  const audienceRulesKey = JSON.stringify(effectiveAudienceRules);

  // `resolveAudience`/`countAudience` ainda não aceitam AbortSignal; o
  // cancelamento é aplicado aqui, no ponto de uso (sem tocar no arquivo do
  // motor): o resultado de uma consulta já substituída não hidrata a lista.
  const { data: contacts } = useQuery({
    queryKey: ['talkx-audience-contacts', audienceRulesKey],
    queryFn: async ({ signal }) => {
      const rows = await resolveAudience(effectiveAudienceRules, AUDIENCE_PREVIEW_LIMIT);
      if (signal.aborted) throw new DOMException('Consulta de audiência cancelada', 'AbortError');
      return rows;
    },
    enabled: audienceSource === 'contacts',
  });

  const { data: audienceCount } = useQuery({
    queryKey: ['talkx-audience-count', audienceRulesKey],
    queryFn: async ({ signal }) => {
      const total = await countAudience(effectiveAudienceRules);
      if (signal.aborted) throw new DOMException('Consulta de audiência cancelada', 'AbortError');
      return total;
    },
    enabled: audienceSource === 'contacts',
  });

  // Um draft existente precisa reabrir a sua audiência real. Sem este
  // round-trip, um autosave posterior poderia substituir destinatários por uma
  // seleção vazia mesmo sem o usuário ter alterado o público.
  const { data: persistedRecipientIds } = useQuery({
    queryKey: ['talkx-draft-recipient-ids', campaign?.id],
    enabled: !!campaign?.id && (campaign.status === 'draft' || campaign.status === 'scheduled'),
    queryFn: async () => {
      const { data, error } = await supabase.from('talkx_recipients')
        .select('contact_id').eq('campaign_id', campaign!.id);
      if (error) throw error;
      return [...new Set((data ?? []).map((recipient) => recipient.contact_id))];
    },
  });

  useEffect(() => {
    if (!campaign?.id || !persistedRecipientIds || hydratedRecipientCampaignId === campaign.id) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrates a remote snapshot only when its query key changes.
    setSelectedContacts(persistedRecipientIds);
    setHydratedRecipientCampaignId(campaign.id);
  }, [campaign?.id, persistedRecipientIds, hydratedRecipientCampaignId]);

  // A ausência de `data` é diferente de uma audiência vazia: antes da
  // hidratação, um save poderia substituir um snapshot existente por `[]`.
  // A referência só é marcada depois que o efeito aplicou o resultado ao estado.
  const recipientSnapshotReady = !campaign?.id
    || (campaign.status !== 'draft' && campaign.status !== 'scheduled')
    || hydratedRecipientCampaignId === campaign.id;

  // E54: filtragem por phone + contact_id com soft-delete e expiração
  const { data: blacklistData } = useQuery({
    queryKey: ['talkx-blacklist-ids'],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data } = await supabase.from('talkx_blacklist')
        .select('contact_id, phone').is('removed_at', null)
        .or('expires_at.is.null,expires_at.gt.' + now);
      return {
        ids: new Set((data || []).map((b) => b.contact_id).filter(Boolean) as string[]),
        phones: new Set((data || []).map((b) => b.phone?.replace(/\D/g, '') || null).filter(Boolean) as string[]),
      };
    },
  });
  const blacklistIds = blacklistData?.ids;
  const blacklistPhones = blacklistData?.phones;

  const selectedSegment = useMemo(() => segments.find((s) => s.id === segmentId) ?? null, [segments, segmentId]);
  const selectedTemplate = useMemo(() => templates.find((t) => t.id === templateId) ?? null, [templates, templateId]);

  const { data: segmentEstimate } = useQuery({
    queryKey: ['talkx-wizard-segment-count', segmentId, JSON.stringify(selectedSegment?.rules ?? null)],
    queryFn: () => countAudience(selectedSegment?.rules as SegmentRules),
    enabled: audienceSource === 'segment' && !!selectedSegment,
  });

  const { companies, tags } = useMemo(() => {
    if (!contacts) return { companies: [] as string[], tags: [] as string[] };
    const companySet = new Set<string>();
    const tagSet = new Set<string>();
    contacts.forEach((c) => {
      if (c.company) companySet.add(c.company);
      if (c.tags && Array.isArray(c.tags)) c.tags.forEach((t: string) => tagSet.add(t));
    });
    return { companies: Array.from(companySet).sort((a, b) => a.localeCompare(b)), tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)) };
  }, [contacts]);

  // V24 — os filtros de Empresa/Tag do seletor viram atalhos para regras do
  // motor: o valor é lido das próprias regras e a lista já chega filtrada.
  const companyFilter = findRuleValue(audienceRules, 'company', 'eq') ?? 'all';
  const setCompanyFilter = useCallback((value: string) => {
    const rule: SegmentRule = { id: crypto.randomUUID(), field: 'company', op: 'eq', value };
    const freshGroupId = crypto.randomUUID();
    setAudienceRules((prev) => (value === 'all' ? removeFieldRules(prev, 'company') : upsertFieldRule(prev, rule, freshGroupId)));
  }, []);
  const tagFilter = findRuleValue(audienceRules, 'tags', 'contains') ?? 'all';
  const setTagFilter = useCallback((value: string) => {
    const rule: SegmentRule = { id: crypto.randomUUID(), field: 'tags', op: 'contains', value };
    const freshGroupId = crypto.randomUUID();
    setAudienceRules((prev) => (value === 'all' ? removeFieldRules(prev, 'tags') : upsertFieldRule(prev, rule, freshGroupId)));
  }, []);

  // A busca textual refina a lista recebida do motor (nome/apelido/telefone não
  // são campos do catálogo de regras), sem ir ao servidor.
  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    const query = contactSearch.trim().toLowerCase();
    if (!query) return contacts;
    return contacts.filter((c) =>
      c.name?.toLowerCase().includes(query) || c.nickname?.toLowerCase().includes(query) ||
      c.phone?.includes(query) || c.company?.toLowerCase().includes(query)
    );
  }, [contacts, contactSearch]);

  const addAudienceRule = useCallback((field: RuleField = 'city') => {
    const kind = RULE_FIELDS.find((definition) => definition.value === field)?.kind ?? 'text';
    const op = RULE_OPS[kind]?.[0]?.value ?? 'eq';
    const rule: SegmentRule = { id: crypto.randomUUID(), field, op, value: '' };
    const freshGroupId = crypto.randomUUID();
    setAudienceRules((prev) => appendFieldRule(prev, rule, freshGroupId));
  }, []);

  const updateAudienceRule = useCallback((id: string, patch: Partial<Omit<SegmentRule, 'id'>>) => {
    setAudienceRules((prev) => ({
      groups: prev.groups.map((group) => ({
        ...group,
        rules: group.rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
      })),
    }));
  }, []);

  const removeAudienceRule = useCallback((id: string) => {
    setAudienceRules((prev) => ({
      groups: prev.groups.map((group) => ({ ...group, rules: group.rules.filter((rule) => rule.id !== id) })),
    }));
  }, []);

  const setGroupMatch = useCallback((groupId: string, match: 'and' | 'or') => {
    setAudienceRules((prev) => ({
      groups: prev.groups.map((group) => (group.id === groupId ? { ...group, match } : group)),
    }));
  }, []);

  /** Público total antes da supressão. */
  const audienceTotal = audienceSource === 'segment' ? (segmentEstimate ?? selectedSegment?.estimated_count ?? 0) : selectedContacts.length;
  /** Bloqueados por supressão dentro do público selecionado (só calculável para seleção manual). */
  const suppressedCount = useMemo(() => {
    if (audienceSource !== 'contacts') return 0;
    const byId = blacklistIds ? selectedContacts.filter((id) => blacklistIds.has(id)).length : 0;
    return byId + suppressedByPhoneCount; // E63: inclui phone-based
  }, [blacklistIds, selectedContacts, audienceSource, suppressedByPhoneCount]);
  const eligibleCount = Math.max(0, audienceTotal - suppressedCount);

  const previewMessage = useMemo(() => {
    const sample = contacts?.[0] || { name: 'João Silva', nickname: 'Joãozinho', company: 'Acme' };
    const firstName = (sample.name || '').split(' ')[0];
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return messageTemplate
      .replace(/\{\{nome\}\}/gi, firstName)
      .replace(/\{\{nome_completo\}\}/gi, sample.name || '')
      .replace(/\{\{apelido\}\}/gi, sample.nickname || firstName)
      .replace(/\{\{empresa\}\}/gi, sample.company || '')
      .replace(/\{\{saudacao\}\}/gi, greeting);
  }, [messageTemplate, contacts]);

  const estimatedSeconds = useMemo(() => estimateSeconds(eligibleCount, typingDelay[0] * 1000, typingDelay[1] * 1000, sendInterval[0] * 1000, sendInterval[1] * 1000), [eligibleCount, typingDelay, sendInterval]);
  const estimatedTime = eligibleCount > 0 ? fmtDurationShort(estimatedSeconds) : null;
  const messagesPerMinute = useMemo(() => {
    const avg = (typingDelay[0] + typingDelay[1]) / 2 + (sendInterval[0] + sendInterval[1]) / 2;
    return avg > 0 ? Math.round((60 / avg) * 10) / 10 : 0;
  }, [typingDelay, sendInterval]);

  const setSpeedProfile = useCallback((p: 'slow' | 'moderate' | 'fast') => {
    setSpeedProfileState(p);
    const prof = SPEED_PROFILES.find((s) => s.value === p);
    if (prof) setSendInterval([prof.interval[0], prof.interval[1]]);
  }, []);

  const insertVariable = useCallback((v: string) => setMessageTemplate((prev) => prev + v), []);
  const applyTemplate = useCallback((id: string) => {
    const t = templates.find((x) => x.id === id);
    setTemplateId(id);
    if (t) {
      setMessageTemplate(t.content);
      if (t.media_url) {
        setHasMedia(true);
        setMediaUrl(t.media_url);
        setMediaType(t.media_type || 'image');
      } else {
        setHasMedia(false);
        setMediaUrl('');
        setMediaType('');
      }
      // V26 — grava a versão do template aplicada (sem bloquear a UI).
      void resolveTemplateVersion(id);
    }
  }, [templates, resolveTemplateVersion]);

  const toggleContact = useCallback((id: string) => {
    setSelectedContacts((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }, []);

  const setScheduledAt = useCallback((nextScheduledAt: string) => {
    setScheduledAtState(nextScheduledAt);
    setScheduleConfigError(null);
  }, []);

  const changeScheduleTimezone = useCallback((nextTimezone: string) => {
    if (!scheduledAt) {
      setScheduleTimezone(nextTimezone);
      setScheduleConfigError(null);
      return;
    }
    try {
      const instant = localToUTCInTimezone(scheduledAt, scheduleTimezone);
      setScheduledAtState(utcToLocalInTimezone(instant, nextTimezone));
      setScheduleTimezone(nextTimezone);
      setScheduleConfigError(null);
    } catch (error) {
      setScheduleConfigError(error instanceof Error ? error.message : 'Não foi possível converter o horário no fuso selecionado.');
    }
  }, [scheduleTimezone, scheduledAt]);

  const scheduleConfigIsValid = useMemo(() => {
    if (!isScheduled) return true;
    if (!scheduledAt) return false;
    if (sendWindowEnabled && sendWindowStart >= sendWindowEnd) return false;
    try {
      return new Date(localToUTCInTimezone(scheduledAt, scheduleTimezone)).getTime() > scheduleNowMs;
    } catch {
      return false;
    }
  }, [isScheduled, scheduledAt, scheduleTimezone, sendWindowEnabled, sendWindowStart, sendWindowEnd, scheduleNowMs]);

  const minimumScheduledAt = useMemo(
    () => utcToLocalInTimezone(new Date(scheduleNowMs).toISOString(), scheduleTimezone),
    [scheduleNowMs, scheduleTimezone],
  );

  const selectAll = useCallback(() => {
    const ids = filteredContacts.map((c) => c.id);
    const allSelected = ids.every((id) => selectedContacts.includes(id));
    setSelectedContacts((prev) => allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  }, [filteredContacts, selectedContacts]);

  const canProceed = useMemo(() => ({
    1: name.trim().length >= 3 && !!connectionId && (audienceSource === 'segment' ? !!segmentId : audienceSource === 'contacts' ? selectedContacts.length > 0 : false),
    // V26 — só-mídia passa: aceita texto OU uma mídia real (URL preenchida; a RPC
    // exige media_url e media_type juntos, então um tipo sem URL não pode avançar).
    2: messageTemplate.trim().length > 0 || (hasMedia && mediaUrl.trim().length > 0),
    3: scheduleConfigIsValid,
    4: confirmConsent && confirmContent && confirmSuppression,
  }), [name, connectionId, audienceSource, segmentId, selectedContacts.length, messageTemplate, hasMedia, mediaUrl, scheduleConfigIsValid, confirmConsent, confirmContent, confirmSuppression]);

  const buildPayload = useCallback((): Partial<TalkXCampaign> => ({
    name, description: description || null, objective, message_template: messageTemplate,
    audience_source: audienceSource,
    // V24: as regras vão no MESMO JSON do motor de segmentos. `search` é o
    // único resto do snapshot antigo (busca livre não existe no catálogo).
    audience_filters: audienceSource === 'contacts'
      ? { ...completedRules(audienceRules), search: contactSearch }
      : {},
    segment_id: audienceSource === 'segment' ? segmentId || null : null,
    template_id: templateId || null,
    // V26 — versão do template usada (auditoria do que a campanha enviou).
    template_version_id: templateVersionId || null,
    typing_delay_min: Math.round(typingDelay[0] * 1000), typing_delay_max: Math.round(typingDelay[1] * 1000),
    send_interval_min: Math.round(sendInterval[0] * 1000), send_interval_max: Math.round(sendInterval[1] * 1000),
    speed_profile: speedProfile,
    whatsapp_connection_id: connectionId || null,
    owner: owner || null,
    media_url: hasMedia ? mediaUrl || null : null,
    media_type: hasMedia ? mediaType || null : null,
    scheduled_at: isScheduled && scheduledAt ? localToUTCInTimezone(scheduledAt, scheduleTimezone) : null,
    schedule_timezone: scheduleTimezone,
    send_window_start: sendWindowEnabled ? `${sendWindowStart}:00` : null,
    send_window_end: sendWindowEnabled ? `${sendWindowEnd}:00` : null,
    business_hours_only: businessHoursOnly,
    respect_suppression: respectSuppression,
    confirm_consent: confirmConsent,
    // V23: o passo atual do wizard é persistido para reabrir o rascunho no mesmo passo.
    draft_step: step,
  }), [name, description, objective, messageTemplate, audienceSource, audienceRules, contactSearch, segmentId, templateId, templateVersionId, typingDelay, sendInterval, speedProfile, connectionId, owner, hasMedia, mediaUrl, mediaType, isScheduled, scheduledAt, scheduleTimezone, sendWindowEnabled, sendWindowStart, sendWindowEnd, businessHoursOnly, respectSuppression, confirmConsent, step]);

  /** Salva (rascunho/agendada) e, se `launch`, dispara imediatamente. Devolve o id da campanha. */
  const persistSave = useCallback(async (mode: 'draft' | 'schedule' | 'launch' = 'draft'): Promise<string | null> => {
    setSaving(true);
    try {
      if (!recipientSnapshotReady) {
        throw new Error('A audiência deste rascunho ainda está carregando. Aguarde antes de salvar.');
      }
      if (mode === 'launch' && (!canProceed[1] || !canProceed[2] || !canProceed[3] || !canProceed[4])) {
        throw new Error('Revise público, mensagem, agendamento e confirmações antes de lançar.');
      }
      if (mode === 'schedule' && (!canProceed[1] || !canProceed[2] || !canProceed[3])) {
        throw new Error('Revise público, mensagem e agendamento antes de salvar a programação.');
      }
      const payload = buildPayload();
      if (mode === 'draft' && campaign?.status === 'scheduled' && !payload.scheduled_at) payload.status = 'draft';

      const persistedCampaignId = campaign?.id || draftCampaignIdRef.current;
      const savedDraft = await saveDraftCampaign.mutateAsync({
        campaignId: persistedCampaignId,
        expectedRevision: persistedCampaignId ? draftRevisionRef.current : null,
        creationKey: persistedCampaignId ? null : draftCreationKey,
        payload,
      });
      const id = savedDraft.campaignId;
      draftRevisionRef.current = savedDraft.revision;
      setDraftRevision(savedDraft.revision);
      if (persistedCampaignId) {
        await logEvent(id, 'updated', 'Campanha atualizada');
      } else {
        draftCampaignIdRef.current = id;
        setDraftCampaignId(id);
        await logEvent(id, 'created', 'Campanha criada');
      }

      let contactIds: string[] = [];
      if (audienceSource === 'segment' && selectedSegment) {
        const audience = await resolveAudience(selectedSegment.rules as SegmentRules);
        contactIds = audience.map((c) => c.id);
        await fromTable('talkx_segments').update({ last_used_at: new Date().toISOString() }).eq('id', selectedSegment.id);
      } else {
        contactIds = selectedContacts;
      }
      if (respectSuppression && (blacklistIds || blacklistPhones)) {
        if (blacklistIds) contactIds = contactIds.filter((contactId) => !blacklistIds.has(contactId));
        if (blacklistPhones && blacklistPhones.size > 0) {
          const { data: cPhones } = await supabase.from('contacts').select('id, phone').in('id', contactIds);
          const byPhone = new Set((cPhones ?? []).filter((cp) => cp.phone && blacklistPhones.has(cp.phone.replace(/\D/g, ''))).map((cp) => cp.id));
          if (byPhone.size > 0) { setSuppressedByPhoneCount(byPhone.size); contactIds = contactIds.filter((contactId) => !byPhone.has(contactId)); }
        }
      }
      await replaceDraftRecipients.mutateAsync({ campaignId: id, contactIds });

      if (mode === 'schedule' && payload.scheduled_at) {
        await updateCampaign.mutateAsync({ id, status: 'scheduled' });
      }
      if (mode === 'launch') {
        // V12: a trilha (started) é gravada pelo servidor na transição; o cliente
        // não insere o evento para não duplicar.
        const started = await startCampaign(id);
        if (!started) throw new Error('A campanha não foi iniciada. Verifique a conexão e tente novamente.');
      }
      return id;
    } finally {
      setSaving(false);
    }
  }, [recipientSnapshotReady, canProceed, buildPayload, campaign?.id, campaign?.status, draftCreationKey, saveDraftCampaign, updateCampaign, logEvent, audienceSource, selectedSegment, selectedContacts, respectSuppression, blacklistIds, blacklistPhones, replaceDraftRecipients, startCampaign]);

  // Serializa autosave, salvar manual e lançamento. Uma falha não bloqueia a
  // próxima operação, mas nenhuma mutação posterior começa antes do término da
  // anterior — eliminando create/create ou update fora de ordem.
  const handleSave = useCallback((mode: 'draft' | 'schedule' | 'launch' = 'draft'): Promise<string | null> => {
    const task = saveQueueRef.current.then(
      () => persistSave(mode),
      () => persistSave(mode),
    );
    saveQueueRef.current = task.then(() => undefined, () => undefined);
    return task;
  }, [persistSave]);

  // E68: sincronizar ref -- useEffect garante nao acessa ref durante render
  useEffect(() => { handleSaveRef.current = handleSave; }, [handleSave]);

  useEffect(() => {
    if (!draftCampaignId) return;
    try { window.sessionStorage.removeItem(DRAFT_CREATION_KEY_STORAGE); } catch { /* storage is optional */ }
  }, [draftCampaignId]);

  // E68: autosave debounce 3s -- dispara apenas apos mudanca real (nao na abertura)
  const autosaveFields = JSON.stringify({
    name, description, objective, messageTemplate, mediaUrl, hasMedia, mediaType,
    audienceSource, segmentId, templateId, connectionId, owner, speedProfile,
    typingDelay, sendInterval, sendWindowEnabled, sendWindowStart, sendWindowEnd, businessHoursOnly,
    isScheduled, scheduledAt, scheduleTimezone, respectSuppression, selectedContacts,
    audienceRules, contactSearch,
    templateVersionId, // V26: a versão resolvida do template também precisa ser persistida.
    step, // V23: o passo do wizard entra no autosave — sair no passo 2 e reabrir volta ao passo 2.
  });
  const autosaveIsDirty = persistedAutosaveSnapshot !== null && persistedAutosaveSnapshot !== autosaveFields;

  useEffect(() => {
    // Registrar snapshot inicial (abertura da campanha) para nao salvar antes de mudancas
    if (autosaveInitialRef.current === null) { autosaveInitialRef.current = autosaveFields; return; }
    if (!name.trim()) return;
    if (autosaveFields === autosaveInitialRef.current) return; // sem mudanca
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      // handleSaveRef.current e sempre o callback mais recente (nao sofre de closure stale)
      setAutosaveStatus('saving');
      setAutosaveError(null);
      try {
        const id = await handleSaveRef.current?.('draft');
        if (!id) return;
        // O baseline deve acompanhar o último snapshot confirmado. Caso o
        // usuário reverta um filtro ao valor de abertura, essa reversão também
        // precisa ser persistida — não pode ser tratada como "sem alteração".
        autosaveInitialRef.current = autosaveFields;
        setPersistedAutosaveSnapshot(autosaveFields);
        setLastAutosave(new Date());
        setAutosaveStatus('idle');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Não foi possível salvar automaticamente.';
        setAutosaveError(message);
        setAutosaveStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      }
    }, 3000);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveFields]); // name e intencional fora dos deps: snapshot inicial no useRef, nao re-trigger

  const retryAutosave = useCallback(async () => {
    setAutosaveStatus('saving');
    setAutosaveError(null);
    try {
      const id = await handleSave('draft');
      if (!id) return null;
      autosaveInitialRef.current = autosaveFields;
      setPersistedAutosaveSnapshot(autosaveFields);
      setLastAutosave(new Date());
      setAutosaveStatus('idle');
      return id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Não foi possível salvar automaticamente.';
      setAutosaveError(message);
      setAutosaveStatus(typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error');
      return null;
    }
  }, [autosaveFields, handleSave]);

  const clearFilters = useCallback(() => { setAudienceRules(emptyRules()); setContactSearch(''); }, []);
  const toggleMedia = useCallback((v: boolean) => { setHasMedia(v); if (!v) { setMediaUrl(''); setMediaType(''); } }, []);
  const toggleSchedule = useCallback((v: boolean) => {
    setIsScheduled(v);
    setScheduleConfigError(null);
    if (!v) setScheduledAtState('');
  }, []);

  return {
    step, setStep, canProceed, draftCampaignId, draftRevision,
    name, setName, description, setDescription, objective, setObjective,
    audienceSource, setAudienceSource, segmentId, setSegmentId, segments, selectedSegment, segmentEstimate,
    templateId, applyTemplate, templates, selectedTemplate,
    // V26 — versão do template aplicada (talkx_template_versions.id).
    templateVersionId,
    messageTemplate, setMessageTemplate,
    typingDelay, setTypingDelay, sendInterval, setSendInterval, speedProfile, setSpeedProfile, messagesPerMinute,
    connectionId, setConnectionId, selectedContacts, showPreview, setShowPreview,
    // V25 — responsável (profiles.id) e perfis ativos para o seletor do passo 1.
    owner, setOwner, owners: ownerProfiles ?? [],
    contactSearch, setContactSearch, saving, companyFilter, setCompanyFilter,
    tagFilter, setTagFilter,
    // V24 — regras de audiência (mesmo motor dos segmentos)
    audienceRules, setAudienceRules, addAudienceRule, updateAudienceRule, removeAudienceRule, setGroupMatch, audienceCount,
    lastAutosave, autosaveStatus, autosaveError, autosaveIsDirty, retryAutosave, // E68
    scheduleTimezone, setScheduleTimezone: changeScheduleTimezone, scheduleConfigError, minimumScheduledAt, // E69
    mediaUrl, setMediaUrl, mediaType, setMediaType,
    hasMedia, isScheduled, scheduledAt, setScheduledAt,
    sendWindowEnabled, setSendWindowEnabled, sendWindowStart, setSendWindowStart, sendWindowEnd, setSendWindowEnd,
    businessHoursOnly, setBusinessHoursOnly, respectSuppression, setRespectSuppression,
    confirmConsent, setConfirmConsent, confirmContent, setConfirmContent, confirmSuppression, setConfirmSuppression,
    connections, contacts, companies, tags, filteredContacts,
    previewMessage, estimatedTime, estimatedSeconds, audienceTotal, suppressedCount, eligibleCount,
    insertVariable, toggleContact, selectAll, handleSave,
    clearFilters, toggleMedia, toggleSchedule, onClose,
  };
}
