import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Phone, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed, Settings, Clock, FileAudio, History, Keyboard } from 'lucide-react';
import { format, formatDuration, intervalToDuration } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DialPad } from './DialPad';
import { useSipClient } from '@/hooks/communication/useSipClient';

interface Call {
  id: string;
  contact_id: string | null;
  agent_id: string | null;
  direction: string;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  recording_url: string | null;
  notes: string | null;
}

const SIP_SETTINGS_KEY = 'voip_sip_settings';

interface SipSettings {
  server: string;
  user: string;
  wsPort: number;
  sipEnabled: boolean;
  autoRecord: boolean;
}

function loadSipSettings(): SipSettings {
  try {
    const stored = localStorage.getItem(SIP_SETTINGS_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* storage unavailable */ }
  return {
    server: 'ip.b24-9441-1552764901.bitrixphone.com',
    user: 'phone1',
    wsPort: 8089,
    sipEnabled: true,
    autoRecord: true,
  };
}

export function VoIPPanel() {
  const [activeTab, setActiveTab] = useState('dialer');
  const defaults = loadSipSettings();
  const [sipEnabled, setSipEnabled] = useState(defaults.sipEnabled);
  const [autoRecord, setAutoRecord] = useState(defaults.autoRecord);
  const [sipServer, setSipServer] = useState(defaults.server);
  const [sipUser, setSipUser] = useState(defaults.user);
  const [wsPort, setWsPort] = useState(defaults.wsPort);

  const sip = useSipClient();

  const saveSipSettings = () => {
    const settings: SipSettings = { server: sipServer, user: sipUser, wsPort, sipEnabled, autoRecord };
    localStorage.setItem(SIP_SETTINGS_KEY, JSON.stringify(settings));
    toast.success('Configurações de VoIP salvas!');
  };

  const handleSipConnect = async () => {
    const { data, error } = await supabase.functions.invoke('get-sip-password');
    const password = data?.password;
    if (error || !password) {
      // FunctionsHttpError.context may be Response (status) or parsed body (code) depending on supabase-js version.
      const ctx = (error as { context?: { status?: number; code?: string } } | null)?.context;
      const isMissingSecret = error
        ? ctx?.status === 503 || ctx?.code === 'SIP_NOT_CONFIGURED'
        : true;
      toast.error(
        isMissingSecret
          ? 'Senha SIP não configurada. Adicione o segredo SIP_PASSWORD no Supabase.'
          : 'Erro ao conectar ao servidor SIP. Verifique sua sessão e tente novamente.'
      );
      return;
    }
    sip.connect({ server: sipServer, user: sipUser, password, wsPort });
  };

  const { data: calls = [], isLoading } = useQuery({
    queryKey: ['calls-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('calls')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Call[];
    },
  });

  const getDirectionIcon = (direction: string, status: string) => {
    if (status === 'missed') return <PhoneMissed className="w-4 h-4 text-destructive" />;
    if (direction === 'inbound') return <PhoneIncoming className="w-4 h-4 text-success" />;
    return <PhoneOutgoing className="w-4 h-4 text-primary" />;
  };

  const formatCallDuration = (seconds: number | null) => {
    if (!seconds) return '—';
    const duration = intervalToDuration({ start: 0, end: seconds * 1000 });
    return formatDuration(duration, { format: ['minutes', 'seconds'], locale: ptBR });
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      completed: { variant: 'default', label: 'Concluída' },
      missed: { variant: 'destructive', label: 'Perdida' },
      busy: { variant: 'secondary', label: 'Ocupado' },
      ringing: { variant: 'outline', label: 'Tocando' },
      ongoing: { variant: 'default', label: 'Em andamento' },
    };
    const s = map[status] || { variant: 'secondary' as const, label: status };
    return <Badge variant={s.variant} className="text-[10px]">{s.label}</Badge>;
  };

  const callStats = {
    total: calls.length,
    inbound: calls.filter(c => c.direction === 'inbound').length,
    outbound: calls.filter(c => c.direction === 'outbound').length,
    missed: calls.filter(c => c.status === 'missed').length,
    avgDuration: calls.filter(c => c.duration_seconds).reduce((acc, c) => acc + (c.duration_seconds || 0), 0) / (calls.filter(c => c.duration_seconds).length || 1),
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full min-w-0">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Phone className="w-6 h-6 text-primary" />
          VoIP & Chamadas
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Click-to-call, histórico de chamadas e gravações
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
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50">
          <TabsTrigger value="dialer"><Keyboard className="w-4 h-4 mr-1" /> Discador</TabsTrigger>
          <TabsTrigger value="history"><History className="w-4 h-4 mr-1" /> Histórico</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-1" /> Configurações</TabsTrigger>
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
                onConnect={handleSipConnect}
                onDisconnect={sip.disconnect}
                onCall={sip.makeCall}
                onHangUp={sip.hangUp}
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
            calls.map((call, i) => (
              <motion.div key={call.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}>
                <Card className="border-secondary/30 hover:border-primary/20 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                          {getDirectionIcon(call.direction, call.status)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {call.direction === 'inbound' ? 'Chamada recebida' : 'Chamada realizada'}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(call.started_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                            </span>
                            {call.duration_seconds && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
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
                        {getStatusBadge(call.status)}
                      </div>
                    </div>
                    {call.notes && (
                      <p className="text-xs text-muted-foreground mt-2 pl-11">{call.notes}</p>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 mt-4">
          <Card className="border-secondary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Servidor SIP / VoIP</CardTitle>
              <CardDescription className="text-xs">
                Configure a conexão com seu provedor VoIP
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Habilitar VoIP</Label>
                  <p className="text-xs text-muted-foreground">Ativar chamadas via SIP</p>
                </div>
                <Switch checked={sipEnabled} onCheckedChange={setSipEnabled} />
              </div>

              {sipEnabled && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                  <div className="space-y-2">
                    <Label>Servidor SIP</Label>
                    <Input
                      value={sipServer}
                      onChange={(e) => setSipServer(e.target.value)}
                      placeholder="sip.provedor.com.br"
                      className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Usuário SIP</Label>
                    <Input
                      value={sipUser}
                      onChange={(e) => setSipUser(e.target.value)}
                      placeholder="ramal@sip.provedor.com.br"
                      className="bg-muted border-border"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Porta WebSocket</Label>
                    <Input
                      type="number"
                      value={wsPort}
                      onChange={(e) => setWsPort(parseInt(e.target.value) || 8089)}
                      placeholder="8089"
                      className="bg-muted border-border"
                    />
                    <p className="text-[10px] text-muted-foreground">Porta WSS do servidor SIP (padrão: 8089)</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={saveSipSettings}
                  >
                    Salvar Configurações
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>

          <Card className="border-secondary/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Gravação</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Gravação automática</Label>
                  <p className="text-xs text-muted-foreground">Gravar todas as chamadas automaticamente</p>
                </div>
                <Switch checked={autoRecord} onCheckedChange={setAutoRecord} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
