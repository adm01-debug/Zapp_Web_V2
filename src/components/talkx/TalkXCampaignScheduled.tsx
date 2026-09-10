import React, { useState, useCallback } from 'react';
import {
  CalendarDays, Clock, ArrowLeft, Play, XCircle, Pencil, Save,
  Users, MessageSquare, Zap, Send, ShieldCheck, Timer, CheckCircle2,
} from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { GhostButton, PrimaryButton } from '@/components/dashboard/overview/DashboardCard';
import { IconTile, RailCard, MetaRow, fmtDateTime, fmtInt, WhatsAppBubble } from './talkxShared';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { toast } from 'sonner';

const TIMEZONES = [
  ['America/Sao_Paulo', 'America/São Paulo'],
  ['America/Manaus', 'America/Manaus'],
  ['America/Belem', 'America/Belém'],
  ['America/Fortaleza', 'America/Fortaleza'],
  ['America/Recife', 'America/Recife'],
  ['America/Cuiaba', 'America/Cuiabá'],
  ['America/Porto_Velho', 'America/Porto Velho'],
  ['America/Rio_Branco', 'America/Rio Branco'],
  ['America/New_York', 'America/New York'],
  ['America/Chicago', 'America/Chicago'],
  ['America/Los_Angeles', 'America/Los Angeles'],
  ['America/Buenos_Aires', 'America/Buenos Aires'],
  ['America/Santiago', 'America/Santiago'],
  ['America/Bogota', 'America/Bogotá'],
  ['America/Lima', 'America/Lima'],
  ['Europe/London', 'Europe/London'],
  ['Europe/Lisbon', 'Europe/Lisboa'],
  ['UTC', 'UTC'],
] as const;

function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToISO(val: string): string {
  return new Date(val).toISOString();
}

interface Props {
  campaign: TalkXCampaign;
  onBack: () => void;
  onEdit: (c: TalkXCampaign) => void;
  onLaunch: (id: string) => void;
}

export function TalkXCampaignScheduled({ campaign, onBack, onEdit, onLaunch }: Props) {
  const { updateCampaign, startCampaign } = useTalkX();

  const [localDate, setLocalDate] = useState<string>(isoToLocalInput(campaign.scheduled_at));
  const [localTz, setLocalTz] = useState<string>(Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [windowEnabled, setWindowEnabled] = useState<boolean>(!!campaign.send_window_start);
  const [windowStart, setWindowStart] = useState<string>(campaign.send_window_start?.slice(0, 5) ?? '08:00');
  const [windowEnd, setWindowEnd] = useState<string>(campaign.send_window_end?.slice(0, 5) ?? '18:00');
  const [bizHours, setBizHours] = useState<boolean>(campaign.business_hours_only ?? false);
  const [saving, setSaving] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  const calDate = localDate ? new Date(localDate) : undefined;

  const handleSave = useCallback(async () => {
    if (!localDate) { toast.error('Defina a data e hora do agendamento.'); return; }
    setSaving(true);
    try {
      await updateCampaign.mutateAsync({
        id: campaign.id,
        scheduled_at: localInputToISO(localDate),
        send_window_start: windowEnabled ? `${windowStart}:00` : null,
        send_window_end: windowEnabled ? `${windowEnd}:00` : null,
        business_hours_only: bizHours,
      });
      toast.success('Agendamento atualizado.');
    } catch {
      toast.error('Erro ao salvar agendamento.');
    } finally {
      setSaving(false);
    }
  }, [campaign.id, localDate, windowEnabled, windowStart, windowEnd, bizHours, updateCampaign]);

  const handleLaunch = useCallback(async () => {
    setLaunchOpen(false);
    setLaunching(true);
    try {
      await startCampaign(campaign.id);
      onLaunch(campaign.id);
    } catch {
      toast.error('Erro ao iniciar campanha.');
    } finally {
      setLaunching(false);
    }
  }, [campaign.id, startCampaign, onLaunch]);

  const handleCancelSchedule = useCallback(async () => {
    setCancelOpen(false);
    try {
      await updateCampaign.mutateAsync({ id: campaign.id, scheduled_at: null, status: 'draft' });
      toast.info('Agendamento cancelado. Campanha voltou para Rascunhos.');
      onBack();
    } catch {
      toast.error('Erro ao cancelar agendamento.');
    }
  }, [campaign.id, updateCampaign, onBack]);

  const scheduledLabel = campaign.scheduled_at
    ? fmtDateTime(campaign.scheduled_at)
    : localDate ? fmtDateTime(localInputToISO(localDate)) : '—';

  return (
    <div className="min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 flex items-center gap-1.5 text-[12.5px] font-medium text-foreground-secondary hover:bg-muted/50"
        >
          <ArrowLeft className="w-4 h-4" />Voltar às campanhas
        </button>
        <span className="text-[11.5px] text-muted-foreground hidden sm:inline">
          Campanhas / <span className="text-foreground">{campaign.name}</span>
        </span>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <IconTile icon={CalendarDays as never} size={40} className="bg-success/15 border-success/30 text-success" />
          <div>
            <p className="text-[13px] font-semibold text-foreground">Talk X · Agendamento de campanha</p>
            <p className="text-[11.5px] text-muted-foreground">{campaign.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <GhostButton icon={Pencil} onClick={() => onEdit(campaign)}>Editar no wizard</GhostButton>
          <PrimaryButton icon={Save} onClick={handleSave}>{saving ? 'Salvando…' : 'Salvar agendamento'}</PrimaryButton>
        </div>
      </div>

      {/* Status pill */}
      <div className="rounded-xl border border-success/30 bg-success/8 px-4 py-3 flex items-center gap-3">
        <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
        <p className="text-[13px] text-foreground">
          <span className="font-semibold text-success">Agendada para {scheduledLabel}</span>
          {' '}— Campanha pronta para ser enviada.
        </p>
      </div>

      {/* 3 colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Col 1 — Configurações de Agendamento */}
        <RailCard title="Configurações de Agendamento" icon={Clock}>
          <div className="space-y-4 pt-1">
            <div>
              <Label className="text-[11.5px] text-muted-foreground mb-1.5 block">Data e hora</Label>
              <Input
                type="datetime-local"
                value={localDate}
                min={new Date().toISOString().slice(0, 16)}
                onChange={(e) => setLocalDate(e.target.value)}
                className="h-10 bg-input/40 border-border/70 text-[13px]"
              />
            </div>

            <div>
              <Label className="text-[11.5px] text-muted-foreground mb-1.5 block">Fuso horário</Label>
              <Select value={localTz} onValueChange={setLocalTz}>
                <SelectTrigger className="h-10 bg-input/40 border-border/70 text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(([tz, label]) => (
                    <SelectItem key={tz} value={tz}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12.5px] font-medium text-foreground">Janela de envio</p>
                <p className="text-[11px] text-muted-foreground">Envia somente neste intervalo</p>
              </div>
              <Switch checked={windowEnabled} onCheckedChange={setWindowEnabled} />
            </div>

            {windowEnabled && (
              <div className="grid grid-cols-2 gap-2 pl-2 border-l-2 border-border/50">
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">Início</Label>
                  <Input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className="h-9 bg-input/40 border-border/70 text-[13px]" />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground mb-1 block">Fim</Label>
                  <Input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className="h-9 bg-input/40 border-border/70 text-[13px]" />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[12.5px] font-medium text-foreground">Somente horário comercial</p>
                <p className="text-[11px] text-muted-foreground">Seg–Sex, 08:00–18:00</p>
              </div>
              <Switch checked={bizHours} onCheckedChange={setBizHours} />
            </div>
          </div>
        </RailCard>

        {/* Col 2 — Calendário + Resumo */}
        <RailCard title="Selecionar Data" icon={CalendarDays}>
          <div className="flex flex-col gap-3">
            <Calendar
              mode="single"
              selected={calDate}
              onSelect={(d) => {
                if (!d) return;
                const existingTime = localDate.split('T')[1] || '09:00';
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                setLocalDate(`${y}-${m}-${day}T${existingTime}`);
              }}
              className="rounded-lg border border-border/60 bg-card/50 mx-auto"
            />
            <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-2">
              <p className="text-[11.5px] font-semibold text-foreground-secondary uppercase tracking-wide">Resumo da Programação</p>
              <div className="space-y-1.5">
                <MetaRow icon={CalendarDays} label="Data" value={calDate ? calDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : '—'} />
                <MetaRow icon={Clock} label="Hora" value={localDate.split('T')[1] || '—'} />
                <MetaRow icon={Timer} label="Fuso" value={localTz} />
                {windowEnabled && <MetaRow icon={ShieldCheck} label="Janela" value={`${windowStart} – ${windowEnd}`} />}
                <MetaRow icon={Users} label="Destinatários" value={`${fmtInt(campaign.total_recipients)} contatos`} />
              </div>
            </div>
          </div>
        </RailCard>

        {/* Col 3 — Resumo da Campanha */}
        <RailCard title="Resumo da Campanha" icon={Zap}>
          <div className="space-y-3">
            {campaign.media_url ? (
              <div className="h-20 rounded-lg overflow-hidden border border-border/60">
                {(campaign.media_type ?? '').startsWith('image') ? (
                  <img src={campaign.media_url} alt="banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="h-full bg-gradient-to-br from-primary/20 to-success/20 flex items-center justify-center">
                    <Send className="w-6 h-6 text-primary/60" />
                  </div>
                )}
              </div>
            ) : (
              <div className="h-16 rounded-lg bg-gradient-to-br from-primary/10 to-success/10 border border-border/40 flex items-center justify-center">
                <Zap className="w-5 h-5 text-primary/40" />
              </div>
            )}
            <div className="space-y-1.5">
              <MetaRow icon={Zap} label="Campanha" value={campaign.name} />
              <MetaRow icon={Users} label="Público" value={`${fmtInt(campaign.total_recipients)} contatos`} />
              <MetaRow icon={Send} label="Canal" value={campaign.whatsapp_connection_id ? 'Linha WhatsApp conectada' : 'Sem linha'} />
              {campaign.speed_profile && (
                <MetaRow icon={Timer} label="Velocidade" value={{ slow: 'Lenta', moderate: 'Moderada', fast: 'Rápida' }[campaign.speed_profile] ?? campaign.speed_profile} />
              )}
            </div>
            {campaign.message_template && (
              <div>
                <p className="text-[11px] text-muted-foreground mb-1.5 font-medium">Mensagem</p>
                <WhatsAppBubble text={campaign.message_template.slice(0, 120) + (campaign.message_template.length > 120 ? '…' : '')} />
              </div>
            )}
            <div className="rounded-xl border border-primary/30 bg-primary/8 px-3 py-2.5 flex items-start gap-2.5">
              <MessageSquare className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-[12.5px] font-semibold text-primary">Tudo pronto para o envio!</p>
                <p className="text-[11px] text-muted-foreground">Aguardando {scheduledLabel}.</p>
              </div>
            </div>
          </div>
        </RailCard>

      </div>

      {/* Ações inferiores */}
      <div className="flex items-center justify-between pt-2 border-t border-border/50">
        <GhostButton icon={XCircle} onClick={() => setCancelOpen(true)} className="text-destructive hover:bg-destructive/10 border-destructive/30">
          Cancelar agendamento
        </GhostButton>
        <PrimaryButton icon={Play} onClick={() => setLaunchOpen(true)} className="shadow-[var(--shadow-glow-primary)]">
          {launching ? 'Iniciando…' : 'Iniciar agora'}
        </PrimaryButton>
      </div>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar agendamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha voltará para Rascunhos. Você pode reagendar ou editar a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter agendamento</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelSchedule} className="bg-destructive hover:bg-destructive/90">
              Cancelar agendamento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Iniciar campanha agora?</AlertDialogTitle>
            <AlertDialogDescription>
              A campanha será disparada imediatamente para <strong>{fmtInt(campaign.total_recipients)} contatos</strong>.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleLaunch}>
              Confirmar e iniciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
