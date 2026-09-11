import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTalkX, TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { useTalkXSegments, resolveAudience, countAudience, type SegmentRules } from '@/hooks/integrations/useTalkXSegments';
import { useTalkXTemplates } from '@/hooks/integrations/useTalkXTemplates';
import { useTalkXEventLogger } from '@/hooks/integrations/useTalkXEvents';
import { fromTable } from '@/lib/supabaseHelpers';
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

const DEFAULT_SCHEDULE_TIMEZONE = 'America/Sao_Paulo';

function initialWizardStep(): WizardStep {
  const raw = new URLSearchParams(window.location.search).get('step');
  const step = Number(raw);
  return step >= 1 && step <= 4 && Number.isInteger(step) ? step as WizardStep : 1;
}

function utcToLocalInTimezone(utc: string, tz: string): string {
  if (!utc) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(utc));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}


/**
 * E69 fix: converte datetime-local string (sem TZ) para ISO UTC usando o fuso selecionado.
 * Ex: localToUTCInTimezone('2026-09-15T10:00', 'America/New_York') -> '2026-09-15T14:00:00.000Z'
 */
function localToUTCInTimezone(localStr: string, tz: string): string {
  if (!localStr) return '';
  const [datePart, timePart] = localStr.split('T');
  const [yr, mo, da] = datePart.split('-').map(Number);
  const [hr, mi] = timePart.split(':').map(Number);
  // Tratamos o input como UTC provisorio para obter o offset do fuso naquele instante
  const approxMs = Date.UTC(yr, mo - 1, da, hr, mi, 0);
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(approxMs)).map(x => [x.type, x.value]));
  const tzLocalMs = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  // offset = diferenca entre o instante UTC provisorio e o que o fuso le nele
  const offsetMs = approxMs - tzLocalMs; // positivo = fuso atras do UTC
  return new Date(approxMs + offsetMs).toISOString();
}
export function useCampaignEditor(campaign: TalkXCampaign | null, onClose: () => void, initial?: { segmentId?: string; templateId?: string }) {
  const { createCampaign, updateCampaign, replaceDraftRecipients, startCampaign } = useTalkX();
  const { segments } = useTalkXSegments();
  const { templates, registerUse } = useTalkXTemplates();
  const logEvent = useTalkXEventLogger();

  const [step, setStep] = useState<WizardStep>(initialWizardStep);
  const [name, setName] = useState(campaign?.name || '');
  const [description, setDescription] = useState(campaign?.description || '');
  const [objective, setObjective] = useState(campaign?.objective || 'engajamento');
  const [suppressedByPhoneCount, setSuppressedByPhoneCount] = useState(0); // E63 phone-based
  const [lastAutosave, setLastAutosave] = useState<Date | null>(null); // E68
  const [scheduleTimezone, setScheduleTimezone] = useState(DEFAULT_SCHEDULE_TIMEZONE); // E69
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // E68
  const handleSaveRef = useRef<((mode?: 'draft' | 'schedule' | 'launch') => Promise<string | null>) | null>(null); // E68
  const autosaveInitialRef = useRef<string | null>(null); // E68: snapshot de abertura
  const [audienceSource, setAudienceSource] = useState<AudienceSource>(campaign?.audience_source || (initial?.segmentId ? 'segment' : 'contacts'));
  const [segmentId, setSegmentId] = useState(campaign?.segment_id || initial?.segmentId || '');
  const [templateId, setTemplateId] = useState(campaign?.template_id || initial?.templateId || '');
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
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const restoredRecipientCampaignRef = useRef<string | null>(null);
  // Estado React sozinho não é suficiente para saves enfileirados: o callback
  // seguinte pode ter capturado o render anterior, ainda sem o ID recém-criado.
  const draftCampaignIdRef = useRef<string | null>(campaign?.id ?? null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [showPreview, setShowPreview] = useState(true);
  const [contactSearch, setContactSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [companyFilter, setCompanyFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [cityFilter, setCityFilter] = useState('all');      // E63
  const [groupFilter, setGroupFilter] = useState('all');    // E63
  const [inactiveFilter, setInactiveFilter] = useState(false); // E63: sem interacao nos ultimos N dias
  const [birthdayFilter, setBirthdayFilter] = useState(''); // E63: 'this_month' | 'next_30d' | ''
  const [mediaUrl, setMediaUrl] = useState(campaign?.media_url || '');
  const [mediaType, setMediaType] = useState(campaign?.media_type || '');
  const [hasMedia, setHasMedia] = useState(!!campaign?.media_url);
  const [isScheduled, setIsScheduled] = useState(!!campaign?.scheduled_at);
  const [scheduledAt, setScheduledAt] = useState(
    campaign?.scheduled_at ? utcToLocalInTimezone(campaign.scheduled_at, DEFAULT_SCHEDULE_TIMEZONE) : ''
  );
  const [sendWindowEnabled, setSendWindowEnabled] = useState(!!campaign?.send_window_start);
  const [sendWindowStart, setSendWindowStart] = useState(campaign?.send_window_start?.slice(0, 5) || '08:00');
  const [sendWindowEnd, setSendWindowEnd] = useState(campaign?.send_window_end?.slice(0, 5) || '18:00');
  const [businessHoursOnly, setBusinessHoursOnly] = useState(!!campaign?.business_hours_only);
  const [respectSuppression, setRespectSuppression] = useState(true);
  const [confirmConsent, setConfirmConsent] = useState(false);
  const [confirmContent, setConfirmContent] = useState(false);
  const [confirmSuppression, setConfirmSuppression] = useState(false);

  // Template inicial (vindo da galeria) preenche a mensagem uma vez.
  useEffect(() => {
    if (!campaign && templateId && !messageTemplate) {
      const t = templates.find((x) => x.id === templateId);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (t) { setMessageTemplate(t.content); if (t.media_url) { setHasMedia(true); setMediaUrl(t.media_url); setMediaType(t.media_type || 'image'); } }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, templates.length]);

  const { data: connections } = useQuery({
    queryKey: ['wa-connections-talkx'],
    queryFn: async () => {
      const { data } = await supabase.from('whatsapp_connections')
        .select('id, name, phone_number, status').eq('status', 'connected');
      return data || [];
    },
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!connectionId && connections && connections.length > 0) setConnectionId(connections[0].id);
  }, [connections, connectionId]);



  const { data: contacts } = useQuery({
    queryKey: ['contacts-talkx'],
    queryFn: async () => {
      const { data } = await supabase.from('contacts')
        .select('id, name, nickname, phone, company, avatar_url, tags')
        .not('phone', 'is', null).order('name');
      return data || [];
    },
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
    if (!campaign?.id || !persistedRecipientIds || restoredRecipientCampaignRef.current === campaign.id) return;
    restoredRecipientCampaignRef.current = campaign.id;
    setSelectedContacts(persistedRecipientIds);
  }, [campaign?.id, persistedRecipientIds]);

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
    return { companies: Array.from(companySet).sort(), tags: Array.from(tagSet).sort() };
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    if (!contacts) return [];
    let result = contacts;
    if (companyFilter !== 'all') result = result.filter((c) => c.company === companyFilter);
    if (tagFilter !== 'all') result = result.filter((c) => c.tags && Array.isArray(c.tags) && c.tags.includes(tagFilter));
    if (cityFilter !== 'all') result = result.filter((c) => (c as Record<string,unknown>).city === cityFilter); // E63
    if (groupFilter !== 'all') result = result.filter((c) => (c as Record<string,unknown>).group === groupFilter); // E63
    if (inactiveFilter) result = result.filter((c) => {
      const lastContact = (c as Record<string,unknown>).last_contact as string | null | undefined;
      if (!lastContact) return true; // sem contato = inativo
      return new Date().getTime() - new Date(lastContact).getTime() > 30 * 24 * 60 * 60 * 1000;
    }); // E63
    if (birthdayFilter) {
      const now = new Date(); const mm = now.getMonth() + 1;
      result = result.filter((c) => {
        const bm = (c as Record<string,unknown>).birth_month as number | null | undefined;
        if (!bm) return false;
        if (birthdayFilter === 'this_month') return bm === mm;
        if (birthdayFilter === 'next_30d') return bm === mm || bm === (mm % 12) + 1;
        return false;
      });
    } // E63
    if (contactSearch.trim()) {
      const q = contactSearch.toLowerCase();
      result = result.filter((c) =>
        c.name?.toLowerCase().includes(q) || c.nickname?.toLowerCase().includes(q) ||
        c.phone?.includes(q) || c.company?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [contacts, contactSearch, companyFilter, tagFilter, cityFilter, groupFilter, inactiveFilter, birthdayFilter]); // E63

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
      if (t.media_url) { setHasMedia(true); setMediaUrl(t.media_url); setMediaType(t.media_type || 'image'); }
    }
  }, [templates]);

  const toggleContact = useCallback((id: string) => {
    setSelectedContacts((prev) => prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]);
  }, []);

  const changeScheduleTimezone = useCallback((nextTimezone: string) => {
    setScheduledAt((current) => {
      if (!current) return current;
      return utcToLocalInTimezone(localToUTCInTimezone(current, scheduleTimezone), nextTimezone);
    });
    setScheduleTimezone(nextTimezone);
  }, [scheduleTimezone]);

  const selectAll = useCallback(() => {
    const ids = filteredContacts.map((c) => c.id);
    const allSelected = ids.every((id) => selectedContacts.includes(id));
    setSelectedContacts((prev) => allSelected ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  }, [filteredContacts, selectedContacts]);

  const canProceed = useMemo(() => ({
    1: name.trim().length > 0 && !!connectionId && (audienceSource === 'segment' ? !!segmentId : audienceSource === 'contacts' ? selectedContacts.length > 0 || !!campaign : false),
    2: messageTemplate.trim().length > 0,
    3: !isScheduled || !!scheduledAt,
    4: confirmConsent && confirmContent && confirmSuppression,
  }), [name, connectionId, audienceSource, segmentId, selectedContacts.length, campaign, messageTemplate, isScheduled, scheduledAt, confirmConsent, confirmContent, confirmSuppression]);

  const buildPayload = useCallback((): Partial<TalkXCampaign> => ({
    name, description: description || null, objective, message_template: messageTemplate,
    audience_source: audienceSource,
    audience_filters: audienceSource === 'contacts' ? { company: companyFilter, tag: tagFilter, city: cityFilter, group: groupFilter, inactive: inactiveFilter, birthday: birthdayFilter, search: contactSearch } : {}, // E63
    segment_id: audienceSource === 'segment' ? segmentId || null : null,
    template_id: templateId || null,
    typing_delay_min: Math.round(typingDelay[0] * 1000), typing_delay_max: Math.round(typingDelay[1] * 1000),
    send_interval_min: Math.round(sendInterval[0] * 1000), send_interval_max: Math.round(sendInterval[1] * 1000),
    speed_profile: speedProfile,
    whatsapp_connection_id: connectionId || null,
    media_url: hasMedia ? mediaUrl || null : null,
    media_type: hasMedia ? mediaType || null : null,
    scheduled_at: isScheduled && scheduledAt ? localToUTCInTimezone(scheduledAt, scheduleTimezone) : null,
    send_window_start: sendWindowEnabled ? `${sendWindowStart}:00` : null,
    send_window_end: sendWindowEnabled ? `${sendWindowEnd}:00` : null,
    business_hours_only: businessHoursOnly,
  }), [name, description, objective, messageTemplate, audienceSource, companyFilter, tagFilter, cityFilter, groupFilter, inactiveFilter, birthdayFilter, contactSearch, segmentId, templateId, typingDelay, sendInterval, speedProfile, connectionId, hasMedia, mediaUrl, mediaType, isScheduled, scheduledAt, scheduleTimezone, sendWindowEnabled, sendWindowStart, sendWindowEnd, businessHoursOnly]);

  /** Salva (rascunho/agendada) e, se `launch`, dispara imediatamente. Devolve o id da campanha. */
  const persistSave = useCallback(async (mode: 'draft' | 'schedule' | 'launch' = 'draft'): Promise<string | null> => {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (mode === 'schedule' && payload.scheduled_at) payload.status = 'scheduled';
      if (mode === 'draft' && campaign?.status === 'scheduled' && !payload.scheduled_at) payload.status = 'draft';

      let id: string;
      const persistedCampaignId = campaign?.id ?? draftCampaignIdRef.current;
      if (persistedCampaignId) {
        await updateCampaign.mutateAsync({ id: persistedCampaignId, ...payload });
        id = persistedCampaignId;
        await logEvent(id, 'updated', 'Campanha atualizada');
      } else {
        const created = await createCampaign.mutateAsync(payload);
        if (!created) return null;
        id = created.id;
        draftCampaignIdRef.current = id;
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
      if (!persistedCampaignId && selectedTemplate) await registerUse(selectedTemplate.id, selectedTemplate.use_count);

      if (mode === 'schedule' && payload.scheduled_at) await logEvent(id, 'scheduled', `Agendada para ${new Date(payload.scheduled_at).toLocaleString('pt-BR')}`);
      if (mode === 'launch') {
        // A trilha de auditoria só é gravada após a Edge Function confirmar a
        // solicitação; isso impede um falso "iniciado" quando o invoke falha.
        const started = await startCampaign(id);
        if (!started) throw new Error('A campanha não foi iniciada. Verifique a conexão e tente novamente.');
        await logEvent(id, 'started', 'Envio iniciado manualmente');
      }
      return id;
    } finally {
      setSaving(false);
    }
  }, [buildPayload, campaign?.id, campaign?.status, updateCampaign, createCampaign, logEvent, audienceSource, selectedSegment, selectedContacts, respectSuppression, blacklistIds, blacklistPhones, replaceDraftRecipients, selectedTemplate, registerUse, startCampaign]);

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

  // E68: autosave debounce 3s -- dispara apenas apos mudanca real (nao na abertura)
  const autosaveFields = JSON.stringify({
    name, description, objective, messageTemplate, mediaUrl, hasMedia, mediaType,
    audienceSource, segmentId, templateId, connectionId, speedProfile,
    typingDelay, sendInterval, sendWindowEnabled, sendWindowStart, sendWindowEnd, businessHoursOnly,
    isScheduled, scheduledAt, respectSuppression, selectedContacts,
  });
  useEffect(() => {
    // Registrar snapshot inicial (abertura da campanha) para nao salvar antes de mudancas
    if (autosaveInitialRef.current === null) { autosaveInitialRef.current = autosaveFields; return; }
    if (!name.trim()) return;
    if (autosaveFields === autosaveInitialRef.current) return; // sem mudanca
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      // handleSaveRef.current e sempre o callback mais recente (nao sofre de closure stale)
      const id = await handleSaveRef.current?.('draft').catch(() => null);
      if (id) setLastAutosave(new Date());
    }, 3000);
    return () => { if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveFields]); // name e intencional fora dos deps: snapshot inicial no useRef, nao re-trigger

  const clearFilters = useCallback(() => { setContactSearch(''); setCompanyFilter('all'); setTagFilter('all'); setCityFilter('all'); setGroupFilter('all'); setInactiveFilter(false); setBirthdayFilter(''); }, [setCityFilter, setGroupFilter, setInactiveFilter, setBirthdayFilter]);
  const toggleMedia = useCallback((v: boolean) => { setHasMedia(v); if (!v) { setMediaUrl(''); setMediaType(''); } }, []);
  const toggleSchedule = useCallback((v: boolean) => { setIsScheduled(v); if (!v) setScheduledAt(''); }, []);

  return {
    step, setStep, canProceed,
    name, setName, description, setDescription, objective, setObjective,
    audienceSource, setAudienceSource, segmentId, setSegmentId, segments, selectedSegment, segmentEstimate,
    templateId, applyTemplate, templates, selectedTemplate,
    messageTemplate, setMessageTemplate,
    typingDelay, setTypingDelay, sendInterval, setSendInterval, speedProfile, setSpeedProfile, messagesPerMinute,
    connectionId, setConnectionId, selectedContacts, showPreview, setShowPreview,
    contactSearch, setContactSearch, saving, companyFilter, setCompanyFilter,
    tagFilter, setTagFilter, cityFilter, setCityFilter, groupFilter, setGroupFilter, // E63
    inactiveFilter, setInactiveFilter, birthdayFilter, setBirthdayFilter, // E63
    lastAutosave, // E68
    scheduleTimezone, setScheduleTimezone: changeScheduleTimezone, // E69
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
