import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { Zap, Plus, Trash2, Play, Pause, ExternalLink, RefreshCw, CheckCircle2, XCircle, FlaskConical } from 'lucide-react';

interface N8nWorkflow {
  id: string;
  name: string;
  webhookUrl: string;
  isActive: boolean;
  lastTriggered?: string;
  triggerEvent: string;
}

const triggerEvents = [
  { value: 'message.received', label: 'Mensagem Recebida' },
  { value: 'message.sent', label: 'Mensagem Enviada' },
  { value: 'contact.created', label: 'Contato Criado' },
  { value: 'contact.updated', label: 'Contato Atualizado' },
  { value: 'conversation.resolved', label: 'Conversa Resolvida' },
  { value: 'campaign.completed', label: 'Campanha Concluída' },
];

export function N8nIntegrationView() {
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([]);
  const [newWorkflow, setNewWorkflow] = useState({ name: '', webhookUrl: '', triggerEvent: 'message.received' });
  const [showAddForm, setShowAddForm] = useState(false);

  const handleConnect = () => {
    if (!webhookBaseUrl.trim()) {
      toast.error('Informe a URL base do n8n');
      return;
    }
    setIsConnected(true);
    toast.success('Conectado ao n8n com sucesso!');
  };

  const handleAddWorkflow = () => {
    if (!newWorkflow.name || !newWorkflow.webhookUrl) {
      toast.error('Preencha todos os campos');
      return;
    }
    const workflow: N8nWorkflow = {
      id: crypto.randomUUID(),
      ...newWorkflow,
      isActive: true,
    };
    setWorkflows(prev => [...prev, workflow]);
    setNewWorkflow({ name: '', webhookUrl: '', triggerEvent: 'message.received' });
    setShowAddForm(false);
    toast.success('Workflow adicionado!');
  };

  const toggleWorkflow = (id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, isActive: !w.isActive } : w));
  };

  const removeWorkflow = (id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id));
    toast.success('Workflow removido');
  };

  const testWorkflow = async (workflow: N8nWorkflow) => {
    try {
      toast.info(`Testando webhook: ${workflow.name}...`);
      // Simulate webhook test
      await new Promise(r => setTimeout(r, 1500));
      setWorkflows(prev => prev.map(w => w.id === workflow.id ? { ...w, lastTriggered: new Date().toISOString() } : w));
      toast.success(`Webhook "${workflow.name}" testado com sucesso!`);
    } catch {
      toast.error('Falha ao testar webhook');
    }
  };

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Integração n8n</h1>
            <p className="text-muted-foreground text-sm">Conecte workflows de automação via webhooks</p>
          </div>
          <Badge variant={isConnected ? 'default' : 'secondary'} className="ml-auto">
            {isConnected ? 'Conectado' : 'Desconectado'}
          </Badge>
        </div>
      </motion.div>

      <Alert className="border-warning/30 bg-warning/10">
        <FlaskConical className="h-4 w-4 !text-warning" />
        <AlertTitle className="text-warning">Funcionalidade em demonstração</AlertTitle>
        <AlertDescription>
          Esta tela simula a configuração de workflows n8n — a integração real com um servidor n8n ainda não foi implementada. Nenhum dado é salvo ou enviado para fora deste navegador.
        </AlertDescription>
      </Alert>

      {/* Connection Config */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Configuração de Conexão</CardTitle>
          <CardDescription>URL base da sua instância n8n</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Label htmlFor="n8n-url">URL Base n8n</Label>
              <Input
                id="n8n-url"
                placeholder="https://seu-n8n.example.com"
                value={webhookBaseUrl}
                onChange={e => setWebhookBaseUrl(e.target.value)}
              />
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="mt-auto inline-block" tabIndex={0}>
                  <Button onClick={handleConnect} disabled style={{ background: 'var(--gradient-primary)' }}>
                    {isConnected ? <RefreshCw className="w-4 h-4 mr-2" /> : <Zap className="w-4 h-4 mr-2" />}
                    {isConnected ? 'Reconectar' : 'Conectar'}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Integração real com n8n ainda não está disponível — em desenvolvimento.</TooltipContent>
            </Tooltip>
          </div>
        </CardContent>
      </Card>

      {/* Workflows */}
      {isConnected && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground">Workflows Configurados</h2>
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(!showAddForm)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar Workflow
            </Button>
          </div>

          {showAddForm && (
            <Card className="border-primary/30">
              <CardContent className="pt-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label>Nome</Label>
                    <Input placeholder="Meu Workflow" value={newWorkflow.name} onChange={e => setNewWorkflow(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Webhook URL</Label>
                    <Input placeholder="https://n8n../webhook/..." value={newWorkflow.webhookUrl} onChange={e => setNewWorkflow(p => ({ ...p, webhookUrl: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Evento Gatilho</Label>
                    <select className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" value={newWorkflow.triggerEvent} onChange={e => setNewWorkflow(p => ({ ...p, triggerEvent: e.target.value }))}>
                      {triggerEvents.map(te => <option key={te.value} value={te.value}>{te.label}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancelar</Button>
                  <Button size="sm" onClick={handleAddWorkflow}>Salvar</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {workflows.length === 0 ? (
            <Card className="border-dashed border-secondary/50">
              <CardContent className="py-8 text-center text-muted-foreground">
                <Zap className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Nenhum workflow configurado</p>
                <p className="text-xs mt-1">Adicione um workflow para começar a automatizar</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {workflows.map(wf => (
                <Card key={wf.id} className="border-secondary/30">
                  <CardContent className="py-3 flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      {wf.isActive ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-muted-foreground" />}
                      <Switch checked={wf.isActive} onCheckedChange={() => toggleWorkflow(wf.id)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{wf.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{wf.webhookUrl}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{triggerEvents.find(t => t.value === wf.triggerEvent)?.label}</Badge>
                    {wf.lastTriggered && <span className="text-xs text-muted-foreground">Último: {new Date(wf.lastTriggered).toLocaleTimeString('pt-BR')}</span>}
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => testWorkflow(wf)}><Play className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeWorkflow(wf.id)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
