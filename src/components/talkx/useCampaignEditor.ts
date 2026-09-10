import { useState, useMemo, useCallback, useEffect } from 'react';
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

export function useCampaignEditor(campaign: TalkXCampaign | null, onClose: () => void, initial?: { segmentId?: string; templateId?: string }) {
  const { createCampaign, updateCampaign, addRecipients, startCampaign } = useTalkX();
  const { segments } = useTalkXSegments();
  const { templates, registerUse } = useTalkXTemplates();
  const logEvent = useTalkXEventLogger();

  const [step, setStep] = useState<WizardStep>(1);
  const [name, setName] = useState(campaign?.name || '');
  const [description, setDescription] = useState(campaign?.description || '');
  const [objective, setObjective] = useState(campaign?.objective || 'engajamento');
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
    campaign?.scheduled_at ? new Date(campaign.scheduled_at).toISOString().slice(0, 16) : ''
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
    if (!blacklistIds || audienceSource !== 'contacts') return 0;
    return selectedContacts.filter((id) => blacklistIds.has(id)).length;
  }, [blacklistIds, selectedContacts, audienceSource]);
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
    scheduled_at: isScheduled && scheduledAt ? new Date(scheduledAt).toISOString() : null,
    send_window_start: sendWindowEnabled ? `${sendWindowStart}:00` : null,
    send_window_end: sendWindowEnabled ? `${sendWindowEnd}:00` : null,
    business_hours_only: businessHoursOnly,
  }), [name, description, objective, messageTemplate, audienceSource, companyFilter, tagFilter, contactSearch, segmentId, templateId, typingDelay, sendInterval, speedProfile, connectionId, hasMedia, mediaUrl, mediaType, isScheduled, scheduledAt, sendWindowEnabled, sendWindowStart, sendWindowEnd, businessHoursOnly]);

  /** Salva (rascunho/agendada) e, se `launch`, dispara imediatamente. Devolve o id da campanha. */
  const handleSave = useCallback(async (mode: 'draft' | 'schedule' | 'launch' = 'draft'): Promise<string | null> => {
    setSaving(true);
    try {
      const payload = buildPayload();
      if (mode === 'schedule' && payload.scheduled_at) payload.status = 'scheduled';
      if (mode === 'draft' && campaign?.status === 'scheduled' && !payload.scheduled_at) payload.status = 'draft';

      let id: string;
      if (campaign) {
        await updateCampaign.mutateAsync({ id: campaign.id, ...payload });
        id = campaign.id;
        await logEvent(id, 'updated', 'Campanha atualizada');
      } else {
        const created = await createCampaign.mutateAsync(payload);
        if (!created) return null;
        id = created.id;
        await logEvent(id, 'created', 'Campanha criada');

        let contactIds: string[] = [];
        if (audienceSource === 'segment' && selectedSegment) {
          const audience = await resolveAudience(selectedSegment.rules as SegmentRules);
          contactIds = audience.map((c) => c.id);
          await fromTable('talkx_segments').update({ last_used_at: new Date().toISOString() }).eq('id', selectedSegment.id);
        } else {
          contactIds = selectedContacts;
        }
        if (respectSuppression && (blacklistIds || blacklistPhones)) {
          if (blacklistIds) contactIds = contactIds.filter((id) => !blacklistIds.has(id));
          if (blacklistPhones && blacklistPhones.size > 0) {
            const { data: cPhones } = await supabase.from('contacts').select('id, phone').in('id', contactIds);
            const byPhone = new Set((cPhones ?? []).filter((cp) => cp.phone && blacklistPhones.has(cp.phone.replace(/\D/g, ''))).map((cp) => cp.id));
            if (byPhone.size > 0) contactIds = contactIds.filter((id) => !byPhone.has(id));
          }
        }
        if (contactIds.length > 0) await addRecipients.mutateAsync({ campaignId: id, contactIds });
        if (selectedTemplate) await registerUse(selectedTemplate.id, selectedTemplate.use_count);
      }

      if (mode === 'schedule' && payload.scheduled_at) await logEvent(id, 'scheduled', `Agendada para ${new Date(payload.scheduled_at).toLocaleString('pt-BR')}`);
      if (mode === 'launch') {
        // A edge function talkx-send processa a fila inteira na mesma request;
        // não bloqueia a UI esperando o loop terminar (o realtime atualiza o status).
        void startCampaign(id);
        await logEvent(id, 'started', 'Envio iniciado manualmente');
      }
      return id;
    } finally {
      setSaving(false);
    }
  }, [buildPayload, campaign, updateCampaign, createCampaign, logEvent, audienceSource, selectedSegment, selectedContacts, respectSuppression, blacklistIds, blacklistPhones, addRecipients, selectedTemplate, registerUse, startCampaign]);

  const clearFilters = useCallback(() => { setCompanyFilter('all'); setTagFilter('all'); }, []);
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
