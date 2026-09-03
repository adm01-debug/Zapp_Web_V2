import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Calendar, Link2, CheckCircle2, Clock, Bell, ExternalLink, Settings } from 'lucide-react';

export function GoogleCalendarIntegration() {
  const [connected, setConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [reminderMinutes, setReminderMinutes] = useState('15');
  const [calendarId, setCalendarId] = useState('');

  const handleConnect = () => {
    toast.info('A integração com Google Calendar requer configuração de OAuth. Configure as credenciais nas variáveis de ambiente.');
  };

  const handleDisconnect = () => {
    setConnected(false);
    toast.success('Google Calendar desconectado');
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto w-full min-w-0">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Calendar className="w-6 h-6 text-primary" />
          Google Calendar
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sincronize agendamentos e follow-ups com seu calendário
        </p>
      </motion.div>

      {/* Connection Status */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Status da Conexão</CardTitle>
            <Badge variant={connected ? 'default' : 'secondary'}>
              {connected ? (
                <><CheckCircle2 className="w-3 h-3 mr-1" /> Conectado</>
              ) : 'Desconectado'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Link2 className="w-4 h-4" />
                Conectado ao calendário: <span className="text-foreground font-medium">{calendarId || 'Padrão'}</span>
              </div>
              <Button variant="destructive" size="sm" onClick={handleDisconnect}>
                Desconectar
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Conecte sua conta Google para sincronizar eventos e agendamentos diretamente das conversas.
              </p>
              <Button onClick={handleConnect}>
                <Calendar className="w-4 h-4 mr-2" />
                Conectar Google Calendar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Settings */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="w-4 h-4" /> Configurações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Sincronização automática</Label>
              <p className="text-xs text-muted-foreground">
                Criar eventos automaticamente ao agendar mensagens
              </p>
            </div>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </div>

          <Separator className="bg-border/30" />

          <div className="space-y-2">
            <Label>Lembrete padrão (minutos)</Label>
            <Input
              type="number"
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(e.target.value)}
              placeholder="15"
              className="w-32 bg-muted border-border"
            />
          </div>

          <Separator className="bg-border/30" />

          <div className="space-y-2">
            <Label>Calendar ID (opcional)</Label>
            <Input
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              placeholder="primary"
              className="bg-muted border-border"
            />
            <p className="text-xs text-muted-foreground">Deixe vazio para usar o calendário principal</p>
          </div>
        </CardContent>
      </Card>

      {/* Features */}
      <Card className="border-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Funcionalidades</CardTitle>
          <CardDescription className="text-xs">
            O que você pode fazer com a integração
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { icon: Calendar, title: 'Criar eventos de conversa', desc: 'Crie reuniões a partir do chat' },
              { icon: Bell, title: 'Lembretes de follow-up', desc: 'Receba alertas para retornar' },
              { icon: Clock, title: 'Disponibilidade do agente', desc: 'Mostre horários livres no chat' },
              { icon: ExternalLink, title: 'Links de agendamento', desc: 'Envie links para o cliente agendar' },
            ].map((feature, i) => (
              <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                <feature.icon className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-foreground">{feature.title}</p>
                  <p className="text-xs text-muted-foreground">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
