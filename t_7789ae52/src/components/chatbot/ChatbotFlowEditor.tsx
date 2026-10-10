import { useState, useCallback, useMemo } from 'react';
import { ChatbotFlow, ChatbotNode, ChatbotEdge } from '@/hooks/integrations/useChatbotFlows';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Save, Plus, Trash2, MessageSquare, Clock, ArrowRight, Bot, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { StepProgress, Step } from '@/components/ui/step-progress';
import { nodeTypes, AddNodeDialog, EditNodeDialog } from './ChatbotNodeDialogs';

const flowSteps: Step[] = [{ label: 'Início' }, { label: 'Nós' }, { label: 'Conexões' }, { label: 'Salvar' }];

interface Props {
  flow: ChatbotFlow;
  onSave: (nodes: ChatbotNode[], edges: ChatbotEdge[]) => void;
  onClose: () => void;
}

export function ChatbotFlowEditor({ flow, onSave, onClose }: Props) {
  const [nodes, setNodes] = useState<ChatbotNode[]>(Array.isArray(flow.nodes) ? flow.nodes : []);
  const [edges, setEdges] = useState<ChatbotEdge[]>(Array.isArray(flow.edges) ? flow.edges : []);
  const [selectedNode, setSelectedNode] = useState<ChatbotNode | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);
  const [editingNode, setEditingNode] = useState<ChatbotNode | null>(null);

  const currentFlowStep = useMemo(() => {
    if (!nodes.some(n => n.type === 'start')) return 0;
    if (nodes.length < 2) return 1;
    if (edges.length < 1) return 2;
    return 3;
  }, [nodes, edges]);

  const addNode = useCallback((type: ChatbotNode['type']) => {
    const newNode: ChatbotNode = {
      id: `node-${Date.now()}`, type,
      data: { label: nodeTypes[type]?.label || type, content: '', options: type === 'question' ? ['Opção 1', 'Opção 2'] : undefined, delaySeconds: type === 'delay' ? 5 : undefined },
      position: { x: 250, y: nodes.length * 120 + 100 },
    };
    setNodes(prev => [...prev, newNode]);
    setShowAddNode(false);
    if (nodes.length > 0) {
      const lastNode = nodes[nodes.length - 1];
      setEdges(prev => [...prev, { id: `edge-${Date.now()}`, source: lastNode.id, target: newNode.id }]);
    }
  }, [nodes]);

  const updateNode = useCallback((updated: ChatbotNode) => { setNodes(prev => prev.map(n => n.id === updated.id ? updated : n)); setEditingNode(null); }, []);
  const removeNode = useCallback((nodeId: string) => { setNodes(prev => prev.filter(n => n.id !== nodeId)); setEdges(prev => prev.filter(e => e.source !== nodeId && e.target !== nodeId)); if (selectedNode?.id === nodeId) setSelectedNode(null); }, [selectedNode]);
  const connectNodes = useCallback((sourceId: string, targetId: string) => { if (sourceId === targetId) return; if (edges.some(e => e.source === sourceId && e.target === targetId)) return; setEdges(prev => [...prev, { id: `edge-${Date.now()}`, source: sourceId, target: targetId }]); }, [edges]);
  const removeEdge = useCallback((edgeId: string) => { setEdges(prev => prev.filter(e => e.id !== edgeId)); }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col gap-2 p-4 border-b border-secondary/30 bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Voltar"><ArrowLeft className="w-5 h-5" /></Button>
            <div>
              <h2 className="font-display font-bold text-foreground flex items-center gap-2"><Bot className="w-5 h-5 text-primary" />{flow.name}</h2>
              <p className="text-xs text-muted-foreground">{nodes.length} nós · {edges.length} conexões</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowAddNode(true)} className="gap-2"><Plus className="w-4 h-4" /> Adicionar Nó</Button>
            <Button onClick={() => onSave(nodes, edges)} className="gap-2"><Save className="w-4 h-4" /> Salvar</Button>
          </div>
        </div>
        <StepProgress steps={flowSteps} currentStep={currentFlowStep} className="px-2 pt-1" />
      </div>

      <div className="flex-1 flex">
        <ScrollArea className="flex-1 p-6">
          <div className="min-h-full space-y-3">
            <AnimatePresence mode="popLayout">
              {nodes.map((node, index) => {
                const config = nodeTypes[node.type] || nodeTypes.message;
                const NodeIcon = config.icon;
                const outEdges = edges.filter(e => e.source === node.id);
                const isSelected = selectedNode?.id === node.id;
                return (
                  <motion.div key={node.id} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="flex items-start gap-3">
                    <div className="flex flex-col items-center pt-4">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2', config.color)}>{index + 1}</div>
                      {index < nodes.length - 1 && <div className="w-0.5 h-8 bg-secondary/50 mt-1" />}
                    </div>
                    <Card className={cn('flex-1 max-w-xl cursor-pointer transition-all border-2', config.color, isSelected && 'ring-2 ring-primary')} onClick={() => setSelectedNode(node)}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <NodeIcon className="w-4 h-4" /><span className="font-medium text-sm text-foreground">{node.data.label}</span><Badge variant="outline" className="text-xs">{config.label}</Badge>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={e => { e.stopPropagation(); setEditingNode(node); }} aria-label="Editar nó"><MessageSquare className="w-3 h-3" /></Button>
                            {node.type !== 'start' && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={e => { e.stopPropagation(); removeNode(node.id); }} aria-label="Remover nó"><Trash2 className="w-3 h-3" /></Button>}
                          </div>
                        </div>
                        {node.data.content && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{node.data.content}</p>}
                        {node.data.options && node.data.options.length > 0 && <div className="flex flex-wrap gap-1 mt-2">{node.data.options.map((opt, i) => <Badge key={i} variant="secondary" className="text-xs">{opt}</Badge>)}</div>}
                        {node.data.delaySeconds && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Aguardar {node.data.delaySeconds}s</p>}
                        {outEdges.length > 0 && (
                          <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                            <ArrowRight className="w-3 h-3" />
                            {outEdges.map(e => { const target = nodes.find(n => n.id === e.target); return <Badge key={e.id} variant="outline" className="text-xs cursor-pointer" onClick={ev => { ev.stopPropagation(); removeEdge(e.id); }}>→ {target?.data.label || '?'}<XCircle className="w-2.5 h-2.5 ml-1" /></Badge>; })}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {nodes.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Bot className="w-12 h-12 mb-4 opacity-30" /><p className="font-medium">Fluxo vazio</p><p className="text-sm mb-4">Adicione nós para construir o fluxo</p>
                <Button variant="outline" onClick={() => setShowAddNode(true)} className="gap-2"><Plus className="w-4 h-4" /> Adicionar Nó</Button>
              </div>
            )}
          </div>
        </ScrollArea>

        {selectedNode && (
          <div className="w-64 border-l border-secondary/30 p-4 bg-secondary/5">
            <h3 className="font-semibold text-sm text-foreground mb-3">Conectar a:</h3>
            <div className="space-y-1">
              {nodes.filter(n => n.id !== selectedNode.id).map(n => {
                const isConnected = edges.some(e => e.source === selectedNode.id && e.target === n.id);
                return <Button key={n.id} variant={isConnected ? "default" : "outline"} size="sm" className="w-full justify-start text-xs" onClick={() => { if (isConnected) { const edge = edges.find(e => e.source === selectedNode.id && e.target === n.id); if (edge) removeEdge(edge.id); } else connectNodes(selectedNode.id, n.id); }}><ArrowRight className="w-3 h-3 mr-1" />{n.data.label}</Button>;
              })}
            </div>
          </div>
        )}
      </div>

      <AddNodeDialog open={showAddNode} onOpenChange={setShowAddNode} onAdd={addNode} />
      <EditNodeDialog node={editingNode} onClose={() => setEditingNode(null)} onSave={updateNode} onChange={setEditingNode} />
    </div>
  );
}
