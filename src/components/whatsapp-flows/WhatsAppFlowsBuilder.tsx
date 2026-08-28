import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from '@/hooks/ui/use-toast';
import { motion } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Plus, Workflow, Trash2, Edit, Eye, 
  Type, ListChecks, CalendarDays, ToggleLeft,
  ChevronDown, Send
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlowComponentPreview } from './FlowComponentPreview';
import type { FlowComponent } from './FlowComponentPreview';

interface FlowScreen {
  id: string;
  title: string;
  layout: FlowComponent[];
}

interface WhatsAppFlow {
  id: string;
  name: string;
  description: string | null;
  flow_json: Json;
  screens: FlowScreen[];
  status: string;
  whatsapp_flow_id: string | null;
  created_at: string;
}

const COMPONENT_TYPES = [
  { type: 'TextHeading', label: 'Título', icon: Type },
  { type: 'TextBody', label: 'Texto', icon: Type },
  { type: 'TextInput', label: 'Campo de Texto', icon: Type },
  { type: 'TextArea', label: 'Área de Texto', icon: Type },
  { type: 'DatePicker', label: 'Data', icon: CalendarDays },
  { type: 'RadioButtonsGroup', label: 'Escolha Única', icon: ToggleLeft },
  { type: 'CheckboxGroup', label: 'Múltipla Escolha', icon: ListChecks },
  { type: 'Dropdown', label: 'Dropdown', icon: ChevronDown },
  { type: 'Footer', label: 'Botão de Ação', icon: Send },
] as const;

export function WhatsAppFlowsBuilder() {
  const [flows, setFlows] = useState<WhatsAppFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFlow, setSelectedFlow] = useState<WhatsAppFlow | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingScreen, setEditingScreen] = useState<number>(0);
  const [previewMode, setPreviewMode] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('whatsapp_flows').select('*').order('created_at', { ascending: false });
    if (data) {
      setFlows(data.map((f) => ({
        ...f,
        screens: (Array.isArray(f.screens) ? f.screens : []) as unknown as FlowScreen[],
      })) as WhatsAppFlow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const createFlow = async () => {
    if (!formName.trim()) return;
    const defaultScreens: FlowScreen[] = [{
      id: crypto.randomUUID(), title: 'Tela 1',
      layout: [
        { id: crypto.randomUUID(), type: 'TextHeading', text: 'Bem-vindo' },
        { id: crypto.randomUUID(), type: 'TextBody', text: 'Preencha o formulário abaixo.' },
        { id: crypto.randomUUID(), type: 'Footer', label: 'Continuar' },
      ],
    }];
    const { error } = await supabase.from('whatsapp_flows').insert({
      name: formName, description: formDescription || null,
      screens: defaultScreens as unknown as Json,
    });
    if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Flow criado!' });
    setShowCreateDialog(false); setFormName(''); setFormDescription('');
    fetchFlows();
  };

  const deleteFlow = async (id: string) => {
    await supabase.from('whatsapp_flows').delete().eq('id', id);
    if (selectedFlow?.id === id) setSelectedFlow(null);
    toast({ title: 'Flow removido' }); fetchFlows();
  };

  const updateFlowScreens = async (screens: FlowScreen[]) => {
    if (!selectedFlow) return;
    setSelectedFlow({ ...selectedFlow, screens });
    await supabase.from('whatsapp_flows').update({ screens: screens as unknown as Json }).eq('id', selectedFlow.id);
  };

  const addScreen = () => {
    if (!selectedFlow) return;
    updateFlowScreens([...selectedFlow.screens, {
      id: crypto.randomUUID(), title: `Tela ${selectedFlow.screens.length + 1}`,
      layout: [
        { id: crypto.randomUUID(), type: 'TextHeading' as const, text: 'Nova Tela' },
        { id: crypto.randomUUID(), type: 'Footer' as const, label: 'Continuar' },
      ],
    }]);
  };

  const addComponent = (type: string) => {
    if (!selectedFlow) return;
    const screens = [...selectedFlow.screens];
    const newComp: FlowComponent = {
      id: crypto.randomUUID(), type: type as FlowComponent['type'],
      label: type === 'Footer' ? 'Enviar' : undefined,
      name: ['TextInput', 'TextArea', 'DatePicker', 'RadioButtonsGroup', 'CheckboxGroup', 'Dropdown'].includes(type) ? `field_${Date.now()}` : undefined,
      text: ['TextHeading', 'TextSubheading', 'TextBody'].includes(type) ? 'Texto aqui' : undefined,
      options: ['RadioButtonsGroup', 'CheckboxGroup', 'Dropdown'].includes(type) ? [{ id: '1', title: 'Opção 1' }, { id: '2', title: 'Opção 2' }] : undefined,
    };
    const footerIdx = screens[editingScreen].layout.findIndex(c => c.type === 'Footer');
    if (footerIdx >= 0) screens[editingScreen].layout.splice(footerIdx, 0, newComp);
    else screens[editingScreen].layout.push(newComp);
    updateFlowScreens(screens);
  };

  const removeComponent = (compIdx: number) => {
    if (!selectedFlow) return;
    const screens = [...selectedFlow.screens];
    screens[editingScreen].layout.splice(compIdx, 1);
    updateFlowScreens(screens);
  };

  if (!selectedFlow) {
    return (
      <div className="flex flex-col h-full">
        <PageHeader title="WhatsApp Flows" subtitle="Crie formulários e fluxos interativos nativos do WhatsApp"
          actions={<Button onClick={() => setShowCreateDialog(true)} className="gap-2"><Plus className="w-4 h-4" /> Novo Flow</Button>} />
        <div className="flex-1 overflow-y-auto px-6 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {flows.map((flow) => (
              <motion.div key={flow.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                <Card className="bg-card/50 border-border/30 hover:border-secondary/30 transition-all cursor-pointer group"
                  onClick={() => { setSelectedFlow(flow); setEditingScreen(0); }}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center"><Workflow className="w-5 h-5 text-primary" /></div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={(e) => { e.stopPropagation(); deleteFlow(flow.id); }} aria-label="Excluir flow"><Trash2 className="w-3 h-3" /></Button>
                      </div>
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{flow.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2">{flow.description || 'Sem descrição'}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Badge variant="outline" className="text-[10px]">{flow.screens.length} telas</Badge>
                      <Badge variant={flow.status === 'published' ? 'default' : 'secondary'} className="text-[10px]">{flow.status === 'published' ? 'Publicado' : 'Rascunho'}</Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
          {flows.length === 0 && !loading && (
            <div className="text-center py-16 text-muted-foreground">
              <Workflow className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">Nenhum WhatsApp Flow</p>
              <p className="text-sm">Crie formulários nativos para coletar dados no WhatsApp</p>
            </div>
          )}
        </div>
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo WhatsApp Flow</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Nome *</Label><Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: Cadastro de Lead" /></div>
              <div><Label>Descrição</Label><Textarea value={formDescription} onChange={(e) => setFormDescription(e.target.value)} rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
              <Button onClick={createFlow}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  const currentScreen = selectedFlow.screens[editingScreen];

  return (
    <div className="flex flex-col h-full">
      <PageHeader title={selectedFlow.name} subtitle="Editor de WhatsApp Flow"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setSelectedFlow(null)}>← Voltar</Button>
            <Button variant="outline" onClick={() => setPreviewMode(!previewMode)} className="gap-2">
              {previewMode ? <Edit className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              {previewMode ? 'Editar' : 'Preview'}
            </Button>
            <Button onClick={addScreen} variant="outline" className="gap-2"><Plus className="w-4 h-4" /> Tela</Button>
          </div>
        } />
      <div className="flex-1 flex overflow-hidden px-6 pb-6 gap-4">
        <div className="w-48 flex-shrink-0 space-y-2 overflow-y-auto">
          {selectedFlow.screens.map((screen, idx) => (
            <button key={screen.id} onClick={() => setEditingScreen(idx)}
              className={cn("w-full text-left p-3 rounded-lg border transition-all text-sm",
                idx === editingScreen ? "border-secondary bg-secondary/10 text-secondary" : "border-border/30 bg-card/30 text-muted-foreground hover:border-border")}>
              <div className="font-medium">{screen.title}</div>
              <div className="text-[10px] mt-0.5">{screen.layout.length} componentes</div>
            </button>
          ))}
        </div>
        <div className="flex-1 flex gap-4">
          {!previewMode && (
            <div className="w-52 flex-shrink-0 space-y-1 overflow-y-auto">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Componentes</p>
              {COMPONENT_TYPES.map(({ type, label, icon: Icon }) => (
                <button key={type} onClick={() => addComponent(type)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg text-left text-sm hover:bg-muted/50 transition-colors text-foreground">
                  <Icon className="w-4 h-4 text-muted-foreground" />{label}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 flex items-start justify-center">
            <div className="w-[320px] bg-card border border-border/30 rounded-token-2xl p-2 shadow-xl">
              <div className="bg-background rounded-token-2xl overflow-hidden">
                <div className="h-8 bg-primary/10 flex items-center justify-center">
                  <span className="text-[10px] text-muted-foreground font-medium">{currentScreen?.title}</span>
                </div>
                <div className="p-4 space-y-3 min-h-[400px]">
                  {currentScreen?.layout.map((comp, idx) => (
                    <FlowComponentPreview key={comp.id} comp={comp} preview={previewMode} onRemove={() => removeComponent(idx)} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
