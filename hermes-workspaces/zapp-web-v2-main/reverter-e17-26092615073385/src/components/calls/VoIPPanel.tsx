import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, FileAudio, History, Keyboard, Loader2 } from 'lucide-react';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DialPad } from './DialPad';
import { useCallSession } from '@/providers/CallSessionProvider';
import { useAuth } from '@/hooks/auth/useAuth';
import { useCallHistory, type CallHistoryRow as Call } from '@/hooks/communication/useCallHistory';

export function VoIPPanel() {
  const [activeTab, setActiveTab] = useState('dialer');
  const { profile } = useAuth();
  const sip = useCallSession();
  const { calls, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage, statsRows } = useCallHistory(profile?.id);

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

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full min-w-0">
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

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="dialer"><Keyboard className="w-4 h-4 mr-1" /> Discador</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-1" /> Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dialer" className="mt-4">
          <Card className="border-secondary/30">
            <CardContent className="p-6">
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-3 mt-4">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />)}
            </div>
          ) : calls.length === 0 ? (
            <Card className="border-secondary/30 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <PhoneCall className="w-12 h-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhuma chamada registrada</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {calls.map((call, i) => (
                <motion.div key={call.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }}>
                  <Card className="border-secondary/30 hover:border-primary/20 transition-colors">
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                            {getDirectionIcon(call.direction, call.status)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">
                                {call.direction === 'inbound' ? 'Chamada recebida' : 'Chamada realizada'}
                              </p>
                              <Badge variant="outline" className="text-3xs">{getChannelLabel(call)}</Badge>
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
                        <div className="flex items-center gap-2">
                          {call.recording_url && (
                            <Button variant="ghost" size="icon" className="w-7 h-7" title="Gravação">
                              <FileAudio className="w-3.5 h-3.5 text-primary" />
                            </Button>
                          )}
                          {getStatusBadge(call)}
                        </div>
                      </div>
                      {call.notes && (
                        <p className="text-xs text-muted-foreground mt-2 pl-11">{call.notes}</p>
                      )}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
