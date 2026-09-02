import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/hooks/ui/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch'; import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'; import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Plus, Activity, Send, CheckCircle, XCircle, BarChart3, Zap,
  MousePointer, ShoppingCart, CreditCard, UserPlus, Eye, Settings, FlaskConical
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface CAPIEvent {
  id: string;
  event_name: string;
  event_time: string;
  contact_id: string | null;
  pixel_id: string | null;
  action_source: string;
  custom_data: Json;
  sent_to_meta: boolean;
  created_at: string;
}

const EVENT_TYPES = [
  { name: 'Purchase', label: 'Compra', icon: CreditCard, color: 'text-success' },
  { name: 'Lead', label: 'Lead', icon: UserPlus, color: 'text-info' },
  { name: 'InitiateCheckout', label: 'Checkout', icon: ShoppingCart, color: 'text-warning' },
  { name: 'AddToCart', label: 'Carrinho', icon: ShoppingCart, color: 'text-warning' },
  { name: 'ViewContent', label: 'Visualização', icon: Eye, color: 'text-primary' },
  { name: 'Contact', label: 'Contato', icon: MousePointer, color: 'text-info' },
];

export function MetaCAPIView() {
  const [events, setEvents] = useState<CAPIEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [pixelId, setPixelId] = useState('');
  const [autoTrack, setAutoTrack] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('meta_capi_events')
      .select('*')
      .order('event_time', { ascending: false })
      .limit(100);
    if (data) setEvents(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Load config from global_settings
  useEffect(() => {
    const loadConfig = async () => {
      const { data } = await supabase
        .from('global_settings')
        .select('key, value')
        .in('key', ['meta_pixel_id', 'meta_capi_auto_track']);
      if (data) {
        const pixel = data.find(d => d.key === 'meta_pixel_id');
        const auto = data.find(d => d.key === 'meta_capi_auto_track');
        if (pixel?.value) setPixelId(pixel.value);
        if (auto?.value) setAutoTrack(auto.value === 'true');
      }
    };
    loadConfig();
  }, []);

  const saveConfig = async () => {
    const upsert = async (key: string, value: string) => {
      const { data: existing } = await supabase.from('global_settings').select('id').eq('key', key).maybeSingle();
      if (existing) {
        await supabase.from('global_settings').update({ value }).eq('key', key);
      } else {
        await supabase.from('global_settings').insert({ key, value });
      }
    };
    await upsert('meta_pixel_id', pixelId);
    await upsert('meta_capi_auto_track', String(autoTrack));
    toast({ title: 'Configurações salvas!' });
    setShowConfig(false);
  };

  // Não conectado à UI enquanto o envio para a Meta CAPI não for implementado de verdade
  // (ver aviso de demonstração acima) — mantido aqui para quando a integração real existir.
  const sendTestEvent = async (eventName: string) => {
    const { error } = await supabase.from('meta_capi_events').insert({
      event_name: eventName,
      pixel_id: pixelId || null,
      action_source: 'chat',
      custom_data: { test: true, value: 0 },
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `Evento "${eventName}" registrado!` });
    fetchEvents();
  };

  const totalEvents = events.length;
  const sentEvents = events.filter(e => e.sent_to_meta).length;
  const eventCounts = EVENT_TYPES.map(et => ({
    ...et,
    count: events.filter(e => e.event_name === et.name).length,
  }));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Meta Conversions API"
        subtitle="Rastreie eventos de conversão para otimização de anúncios"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowConfig(true)} className="gap-2">
              <Settings className="w-4 h-4" /> Configurar
            </Button>
          </div>
        }
      />

      <div className="px-6 pt-4">
        <Alert className="border-warning/30 bg-warning/10">
          <FlaskConical className="h-4 w-4 !text-warning" />
          <AlertTitle className="text-warning">Funcionalidade em demonstração</AlertTitle>
          <AlertDescription>
            Os eventos ficam registrados apenas neste sistema — o envio para a Meta Conversions API (graph.facebook.com) ainda não foi implementado. Em desenvolvimento.
          </AlertDescription>
        </Alert>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-6 pb-4">
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Activity className="w-3.5 h-3.5" /> Total Eventos
            </div>
            <p className="text-lg font-bold">{totalEvents}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Send className="w-3.5 h-3.5" /> Enviados ao Meta
            </div>
            <p className="text-lg font-bold text-success">{sentEvents}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <Zap className="w-3.5 h-3.5" /> Pixel ID
            </div>
            <p className="text-sm font-mono truncate">{pixelId || 'Não configurado'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card/50 border-border/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <BarChart3 className="w-3.5 h-3.5" /> Auto-tracking
            </div>
            <p className="text-lg font-bold">{autoTrack ? 'Ativo' : 'Inativo'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Event Type Cards */}
      <div className="px-6 pb-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Eventos por Tipo</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {eventCounts.map(({ name, label, icon: Icon, color, count }) => (
            <Tooltip key={name}>
              <TooltipTrigger asChild>
                <div tabIndex={0}>
                  <Card className="bg-card/50 border-border/30 opacity-60 cursor-not-allowed">
                    <CardContent className="p-3 text-center">
                      <Icon className={cn("w-6 h-6 mx-auto mb-1", color)} />
                      <p className="text-xs font-medium">{label}</p>
                      <p className="text-lg font-bold mt-1">{count}</p>
                    </CardContent>
                  </Card>
                </div>
              </TooltipTrigger>
              <TooltipContent>Envio de eventos de teste para a Meta CAPI ainda não está disponível — em desenvolvimento.</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Events Timeline */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <h3 className="text-sm font-semibold text-foreground mb-3">Eventos Recentes</h3>
        <div className="space-y-2">
          {events.map(event => {
            const eventType = EVENT_TYPES.find(et => et.name === event.event_name);
            const EventIcon = eventType?.icon || Activity;
            return (
              <Card key={event.id} className="bg-card/50 border-border/30">
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10")}>
                    <EventIcon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{event.event_name}</span>
                      <Badge variant={event.sent_to_meta ? 'default' : 'secondary'} className="text-[10px] h-4">
                        {event.sent_to_meta ? 'Enviado' : 'Pendente'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {event.action_source} • {new Date(event.event_time).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  {event.sent_to_meta
                    ? <CheckCircle className="w-4 h-4 text-success" />
                    : <XCircle className="w-4 h-4 text-muted-foreground" />}
                </CardContent>
              </Card>
            );
          })}
          {events.length === 0 && !loading && (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Nenhum evento registrado</p>
              <p className="text-xs">Clique em um tipo de evento acima para testar</p>
            </div>
          )}
        </div>
      </div>

      {/* Config Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Configurar Meta CAPI</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Meta Pixel ID</Label>
              <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="Ex: 123456789" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-tracking</Label>
                <p className="text-xs text-muted-foreground">Rastrear automaticamente eventos de conversa</p>
              </div>
              <Switch checked={autoTrack} onCheckedChange={setAutoTrack} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfig(false)}>Cancelar</Button>
            <Button onClick={saveConfig}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
