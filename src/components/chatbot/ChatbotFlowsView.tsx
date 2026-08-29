import { useState, useCallback, lazy, Suspense } from 'react';
import { useChatbotFlows, ChatbotFlow, ChatbotNode } from '@/hooks/integrations/useChatbotFlows';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Bot, Plus, Edit2, Trash2, Play, Pause, Copy, Zap, MessageSquare,
  GitBranch, Clock, ArrowRight, Loader2, Settings, BarChart3,
  HelpCircle, Tag, Users, Send, ChevronRight, Activity,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChatbotFlowEditor } from './ChatbotFlowEditor';
const ChatbotExecutionsDashboard = lazy(() => import('./ChatbotExecutionsDashboard').then(m => ({ default: m.ChatbotExecutionsDashboard })));

const triggerLabels: Record<string, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  keyword: { label: 'Palavra-chave', icon: Tag },
  first_message: { label: 'Primeira mensagem', icon: MessageSquare },
  menu: { label: 'Menu', icon: GitBranch },
  webhook: { label: 'Webhook', icon: Zap },
  schedule: { label: 'Agendado', icon: Clock },
};

export function ChatbotFlowsView() {
  const { flows, isLoading, createFlow, updateFlow, deleteFlow, toggleFlow } = useChatbotFlows();
  const [showCreate, setShowCreate] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [search, setSearch] = useState('');

  type TriggerType = 'keyword' | 'first_message' | 'menu' | 'webhook' | 'schedule';
  const [form, setForm] = useState({
    name: '',
    description: '',
    trigger_type: 'keyword' as TriggerType,
    trigger_value: '',
  });

  const filtered = flows.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: flows.length,
    active: flows.filter(f => f.is_active).length,
    totalExecutions: flows.reduce((sum, f) => sum + (f.execution_count || 0), 0),
  };

  const handleCreate = useCallback(() => {
    createFlow.mutate(form, {
      onSuccess: () => {
        setShowCreate(false);
        setForm({ name: '', description: '', trigger_type: 'keyword', trigger_value: '' });
      },
    });
  }, [form, createFlow]);

  const handleDuplicate = useCallback((flow: ChatbotFlow) => {
    createFlow.mutate({
      name: `${flow.name} (cópia)`,
      description: flow.description,
      trigger_type: flow.trigger_type,
      trigger_value: flow.trigger_value,
      nodes: flow.nodes,
      edges: flow.edges,
    });
  }, [createFlow]);

  if (editingFlow) {
    return (
      <ChatbotFlowEditor
        flow={editingFlow}
        onSave={(nodes, edges) => {
          updateFlow.mutate({ id: editingFlow.id, nodes, edges });
          setEditingFlow(null);
        }}
        onClose={() => setEditingFlow(null)}
      />
    );
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Bot className="w-7 h-7 text-primary" />
            Chatbot Flows
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Crie e gerencie fluxos de automação de chatbot</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Novo Fluxo
        </Button>
      </div>

      <Tabs defaultValue="flows" className="flex-1 flex flex-col min-h-0">
        <TabsList className="bg-muted/50 w-fit">
          <TabsTrigger value="flows" className="gap-2"><Bot className="w-4 h-4" />Fluxos</TabsTrigger>
          <TabsTrigger value="executions" className="gap-2"><Activity className="w-4 h-4" />Execuções</TabsTrigger>
        </TabsList>

        <TabsContent value="flows" className="flex-1 min-h-0 space-y-6 mt-4">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total de Fluxos', value: stats.total, icon: Bot, color: 'text-primary' },
          { label: 'Ativos', value: stats.active, icon: Play, color: 'text-success' },
          { label: 'Execuções', value: stats.totalExecutions, icon: BarChart3, color: 'text-info' },
        ].map(stat => (
          <Card key={stat.label} className="border-secondary/30">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn('p-2 rounded-lg bg-secondary/20', stat.color)}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search */}
      <Input
        placeholder="Buscar fluxo..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="max-w-xs"
      />

      {/* Flow List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Bot className="w-12 h-12 mb-4 opacity-30" />
            <p className="font-medium">Nenhum fluxo encontrado</p>
            <p className="text-sm">Crie seu primeiro fluxo de chatbot</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AnimatePresence mode="popLayout">
              {filtered.map(flow => {
                const trigger = triggerLabels[flow.trigger_type] || triggerLabels.keyword;
                const TriggerIcon = trigger.icon;
                const nodeCount = Array.isArray(flow.nodes) ? flow.nodes.length : 0;

                return (
                  <motion.div
                    key={flow.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                  >
                    <Card className={cn(
                      'border-secondary/30 hover:border-primary/30 transition-all',
                      flow.is_active && 'border-success/30 shadow-success/5'
                    )}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-semibold text-foreground truncate">{flow.name}</h3>
                              <Badge variant={flow.is_active ? 'default' : 'outline'} className="text-xs">
                                {flow.is_active ? 'Ativo' : 'Inativo'}
                              </Badge>
                            </div>
                            {flow.description && (
                              <p className="text-sm text-muted-foreground truncate">{flow.description}</p>
                            )}
                          </div>
                          <Switch
                            checked={flow.is_active}
                            onCheckedChange={checked => toggleFlow.mutate({ id: flow.id, is_active: checked })}
                          />
                        </div>

                        <div className="flex items-center gap-3 mb-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <TriggerIcon className="w-3 h-3" /> {trigger.label}
                          </span>
                          {flow.trigger_value && (
                            <span className="bg-secondary/30 px-2 py-0.5 rounded text-xs font-mono">
                              {flow.trigger_value}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" /> {nodeCount} nós
                          </span>
                          <span className="flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" /> {flow.execution_count || 0} exec.
                          </span>
                        </div>

                        {/* Node preview */}
                        <div className="flex items-center gap-1 mb-3 overflow-hidden">
                          {(Array.isArray(flow.nodes) ? flow.nodes : []).slice(0, 4).map((node: ChatbotNode, i: number) => (
                            <div key={node.id || i} className="flex items-center gap-1">
                              <span className="bg-secondary/30 px-2 py-1 rounded text-xs text-foreground truncate max-w-20">
                                {node.data?.label || node.type}
                              </span>
                              {i < Math.min((flow.nodes as ChatbotNode[]).length - 1, 3) && (
                                <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              )}
                            </div>
                          ))}
                          {nodeCount > 4 && (
                            <span className="text-xs text-muted-foreground">+{nodeCount - 4}</span>
                          )}
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(flow.created_at), "dd/MM/yyyy", { locale: ptBR })}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => setEditingFlow(flow)}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7"
                              onClick={() => handleDuplicate(flow)}>
                              <Copy className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                              onClick={() => deleteFlow.mutate(flow.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>
        </TabsContent>

        <TabsContent value="executions" className="flex-1 min-h-0 mt-4">
          <Suspense fallback={<Skeleton className="h-96 w-full" />}>
            <ChatbotExecutionsDashboard />
          </Suspense>
        </TabsContent>
      </Tabs>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" /> Novo Fluxo de Chatbot
            </DialogTitle>
            <DialogDescription>Configure o gatilho e informações básicas</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome do fluxo</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Boas-vindas" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="O que este fluxo faz..." rows={2} />
            </div>
            <div>
              <Label>Tipo de gatilho</Label>
              <Select value={form.trigger_type} onValueChange={(v: string) => setForm(f => ({ ...f, trigger_type: v as TriggerType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="first_message">Primeira mensagem</SelectItem>
                  <SelectItem value="menu">Menu</SelectItem>
                  <SelectItem value="webhook">Webhook</SelectItem>
                  <SelectItem value="schedule">Agendado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.trigger_type === 'keyword' && (
              <div>
                <Label>Palavra-chave</Label>
                <Input value={form.trigger_value} onChange={e => setForm(f => ({ ...f, trigger_value: e.target.value }))}
                  placeholder="Ex: menu, ajuda, oi" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!form.name || createFlow.isPending}>
              {createFlow.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Criar Fluxo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
