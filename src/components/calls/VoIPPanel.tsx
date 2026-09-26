import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, FileAudio,
  Loader2, Search, X, Save,
} from 'lucide-react';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DialPad } from './DialPad';
import { useCallSession } from '@/providers/CallSessionProvider';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCalls } from '@/hooks/communication/useCalls';
import { useCallHistory, type CallHistoryRow as Call, type CallHistoryFilters, type CallResultFilter } from '@/hooks/communication/useCallHistory';

const DIRECTION_OPTIONS: { value: 'all' | 'inbound' | 'outbound'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'inbound', label: 'Recebidas' },
  { value: 'outbound', label: 'Realizadas' },
];

const CHANNEL_OPTIONS: { value: 'all' | 'voip' | 'whatsapp'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'voip', label: 'VoIP' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const RESULT_OPTIONS: { value: 'all' | CallResultFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ended_answered', label: 'Concluída' },
  { value: 'ended_missed', label: 'Não atendida' },
  { value: 'missed', label: 'Perdida' },
  { value: 'busy', label: 'Ocupado' },
  { value: 'failed', label: 'Falhou' },
];

export function VoIPPanel() {
  const { profile } = useAuth();
  const sip = useCallSession();
  const { addCallNotes } = useCalls();

  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [direction, setDirection] = useState<'all' | 'inbound' | 'outbound'>('all');
  const [channel, setChannel] = useState<'all' | 'voip' | 'whatsapp'>('all');
  const [result, setResult] = useState<'all' | CallResultFilter>('all');
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const filters: CallHistoryFilters = {
    ...(direction !== 'all' ? { direction } : {}),
    ...(channel !== 'all' ? { channel } : {}),
    ...(result !== 'all' ? { result } : {}),
    ...(searchDebounced ? { search: searchDebounced } : {}),
  };

  const { calls, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, statsRows } = useCallHistory(profile?.id, filters);

  const selectedCall = calls.find(c => c.id === selectedCallId) ?? null;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o rascunho da anotação só quando a chamada selecionada muda, não a cada render.
    setNoteDraft(selectedCall?.notes ?? '');
  }, [selectedCall?.id, selectedCall?.notes]);

  const resetSelection = () => setSelectedCallId(null);

  const getDirectionIcon = (direction: string, status: string) => {
    if (status === 'missed') return <PhoneMissed className="w-4 h-4 text-destructive" />;
    if (direction === 'inbound') return <PhoneIncoming className="w-4 h-4 text-success" />;
    return <PhoneOutgoing className="w-4 h-4 text-primary" />;
  };

  const formatCallDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
    return formatDuration(duration, { format: ['hours', 'minutes', 'seconds'], locale: ptBR });
  };

  const getChannelLabel = (call: Call) => (call.whatsapp_connection_id ? 'WhatsApp' : 'VoIP');

  const getContactLabel = (call: Call) => call.contact?.name
    || (call.direction === 'inbound' ? 'Chamada recebida' : 'Chamada realizada');

  const getStatusBadge = (call: Call) => {
    if (call.status === 'ended') {
      return call.answered_at
        ? <Badge className="text-3xs">Concluída</Badge>
        : <Badge variant="destructive" className="text-3xs">Não atendida</Badge>;
    }
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      ringing: { variant: 'outline', label: 'Tocando' },
      answered: { variant: 'default', label: 'Em andamento' },
      missed: { variant: 'destructive', label: 'Perdida' },
      busy: { variant: 'secondary', label: 'Ocupado' },
      failed: { variant: 'destructive', label: 'Falhou' },
    };
    const s = map[call.status] || { variant: 'secondary' as const, label: call.status };
    return <Badge variant={s.variant} className="text-3xs">{s.label}</Badge>;
  };

  const callStats = {
    total: statsRows.length,
    inbound: statsRows.filter(c => c.direction === 'inbound').length,
    outbound: statsRows.filter(c => c.direction === 'outbound').length,
    missed: statsRows.filter(c => c.status === 'missed').length,
    avgDuration: (() => {
      const withDuration = statsRows.filter(c => c.duration_seconds != null);
      if (!withDuration.length) return 0;
      return withDuration.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) / withDuration.length;
    })(),
  };

  const handleSaveNote = async () => {
    if (!selectedCall) return;
    setNoteSaving(true);
    await addCallNotes(selectedCall.id, noteDraft);
    setNoteSaving(false);
  };

  return (
    <div className="space-y-6 w-full min-w-0">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Phone className="w-6 h-6 text-primary" />
          Telefonia
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Suas ligações por VoIP e WhatsApp
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: callStats.total, icon: Phone },
          { label: 'Recebidas', value: callStats.inbound, icon: PhoneIncoming },
          { label: 'Realizadas', value: callStats.outbound, icon: PhoneOutgoing },
          { label: 'Perdidas', value: callStats.missed, icon: PhoneMissed },
          { label: 'Duração Média', value: `${Math.round(callStats.avgDuration / 60)}min`, icon: Clock },
        ].map((stat, i) => (
          <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card className="border-secondary/30">
              <CardContent className="p-3 text-center">
                <stat.icon className="w-4 h-4 text-muted-foreground mx-auto mb-1" />
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
                <p className="text-3xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4 items-start">
        {/* Histórico */}
        <div className="space-y-3 min-w-0">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); resetSelection(); }}
                placeholder="Buscar por nome ou telefone..."
                className="pl-8"
              />
            </div>
            <Select value={channel} onValueChange={(v) => { setChannel(v as typeof channel); resetSelection(); }}>
              <SelectTrigger className="sm:w-32"><SelectValue placeholder="Canal" /></SelectTrigger>
              <SelectContent>
                {CHANNEL_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={direction} onValueChange={(v) => { setDirection(v as typeof direction); resetSelection(); }}>
              <SelectTrigger className="sm:w-36"><SelectValue placeholder="Direção" /></SelectTrigger>
              <SelectContent>
                {DIRECTION_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={result} onValueChange={(v) => { setResult(v as typeof result); resetSelection(); }}>
              <SelectTrigger className="sm:w-36"><SelectValue placeholder="Resultado" /></SelectTrigger>
              <SelectContent>
                {RESULT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />)}
            </div>
          ) : calls.length === 0 ? (
            <Card className="border-secondary/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <PhoneCall className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma chamada encontrada</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {calls.map((call, i) => (
                <motion.div key={call.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                  <Card
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCallId(call.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedCallId(call.id); }}
                    className={`border-secondary/30 hover:border-primary/40 transition-colors cursor-pointer ${selectedCallId === call.id ? 'border-primary' : ''}`}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {getDirectionIcon(call.direction, call.status)}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate">
                                {getContactLabel(call)}
                              </p>
                              <Badge variant="outline" className="text-3xs shrink-0">{getChannelLabel(call)}</Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-3xs text-muted-foreground">
                                {format(new Date(call.started_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                              </span>
                              {call.duration_seconds != null && (
                                <span className="text-3xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatCallDuration(call.duration_seconds)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {call.recording_url && (
                            <FileAudio className="w-3.5 h-3.5 text-primary" aria-label="Tem gravação" />
                          )}
                          {getStatusBadge(call)}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
              {hasNextPage && (
                <div className="flex justify-center pt-2">
                  <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                    {isFetchingNextPage && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
                    Carregar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Painel lateral: discador ou detalhe da chamada selecionada */}
        <div className="xl:sticky xl:top-4">
          <Card className="border-secondary/30">
            <CardContent className="p-6">
              {selectedCall ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Detalhe da chamada</h3>
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={resetSelection} aria-label="Fechar detalhe">
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div>
                    <p className="text-base font-medium text-foreground">{getContactLabel(selectedCall)}</p>
                    {selectedCall.contact?.phone && (
                      <p className="text-sm text-muted-foreground">{selectedCall.contact.phone}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-3xs">{getChannelLabel(selectedCall)}</Badge>
                    {getStatusBadge(selectedCall)}
                  </div>

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>Início: {format(new Date(selectedCall.started_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}</p>
                    {selectedCall.answered_at && (
                      <p>Atendida: {format(new Date(selectedCall.answered_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}</p>
                    )}
                    {selectedCall.ended_at && (
                      <p>Fim: {format(new Date(selectedCall.ended_at), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}</p>
                    )}
                    {selectedCall.duration_seconds != null && (
                      <p>Duração: {formatCallDuration(selectedCall.duration_seconds)}</p>
                    )}
                  </div>

                  {selectedCall.recording_url && (
                    <div>
                      <p className="text-xs font-medium text-foreground mb-1">Gravação</p>
                      <audio controls src={selectedCall.recording_url} className="w-full h-9" />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-foreground">Anotações</p>
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="Adicionar anotação sobre esta chamada..."
                      className="min-h-20 text-sm"
                    />
                    <Button size="sm" onClick={handleSaveNote} disabled={noteSaving}>
                      {noteSaving ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-2" />}
                      Salvar
                    </Button>
                  </div>
                </div>
              ) : (
                <DialPad
                  sipStatus={sip.sipStatus}
                  callStatus={sip.callStatus}
                  callDuration={sip.callDuration}
                  isMuted={sip.isMuted}
                  currentNumber={sip.currentNumber}
                  callDirection={sip.callDirection}
                  onConnect={sip.connectWithStoredCredentials}
                  onDisconnect={sip.disconnect}
                  onCall={sip.makeCall}
                  onHangUp={sip.hangUp}
                  onAcceptIncoming={sip.acceptIncomingCall}
                  onToggleMute={sip.toggleMute}
                  onDTMF={sip.sendDTMF}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
