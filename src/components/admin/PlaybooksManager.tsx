import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookOpen, Plus, Edit, Trash2, ChevronRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Json } from '@/integrations/supabase/types';

interface PlaybookStep {
  order: number;
  title: string;
  description: string;
  tips: string;
}

interface Playbook {
  id: string;
  name: string;
  description: string | null;
  category: string;
  steps: PlaybookStep[];
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = [
  { value: 'sales', label: 'Vendas' },
  { value: 'support', label: 'Suporte' },
  { value: 'billing', label: 'Financeiro' },
  { value: 'complaint', label: 'Reclamação' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'general', label: 'Geral' },
];

export function PlaybooksManager() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [viewPlaybook, setViewPlaybook] = useState<Playbook | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [steps, setSteps] = useState<PlaybookStep[]>([]);

  useEffect(() => { loadPlaybooks(); }, []);

  const loadPlaybooks = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('playbooks')
      .select('*')
      .order('category', { ascending: true });
    if (data) {
      setPlaybooks(data.map(p => ({
        ...p,
        steps: Array.isArray(p.steps) ? (p.steps as unknown as PlaybookStep[]) : [],
      })));
    }
    setLoading(false);
  };

  const openCreate = () => {
    setSelectedPlaybook(null);
    setName('');
    setDescription('');
    setCategory('general');
    setSteps([{ order: 1, title: '', description: '', tips: '' }]);
    setDialogOpen(true);
  };

  const openEdit = (pb: Playbook) => {
    setSelectedPlaybook(pb);
    setName(pb.name);
    setDescription(pb.description || '');
    setCategory(pb.category);
    setSteps(pb.steps.length > 0 ? pb.steps : [{ order: 1, title: '', description: '', tips: '' }]);
    setDialogOpen(true);
  };

  const addStep = () => {
    setSteps(prev => [...prev, { order: prev.length + 1, title: '', description: '', tips: '' }]);
  };

  const updateStep = (index: number, field: keyof PlaybookStep, value: string) => {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const removeStep = (index: number) => {
    setSteps(prev => prev.filter((_, i) => i !== index).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const save = async () => {
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    const payload = {
      name: name.trim(),
      description: description || null,
      category,
      steps: steps.filter(s => s.title.trim()) as unknown as Json,
    };

    const { error } = selectedPlaybook
      ? await supabase.from('playbooks').update(payload).eq('id', selectedPlaybook.id)
      : await supabase.from('playbooks').insert(payload);

    if (!error) {
      toast.success(selectedPlaybook ? 'Playbook atualizado' : 'Playbook criado');
      setDialogOpen(false);
      loadPlaybooks();
    } else {
      toast.error('Erro ao salvar');
    }
  };

  const deletePlaybook = async (id: string) => {
    await supabase.from('playbooks').delete().eq('id', id);
    toast.success('Playbook removido');
    loadPlaybooks();
  };

  const grouped = playbooks.reduce<Record<string, Playbook[]>>((acc, pb) => {
    (acc[pb.category] = acc[pb.category] || []).push(pb);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            Playbooks Operacionais
          </h2>
          <p className="text-sm text-muted-foreground">Guias passo-a-passo por tipo de atendimento</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Playbook
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-32 bg-muted/20 rounded-xl animate-pulse" />)}
        </div>
      ) : Object.keys(grouped).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum playbook criado</CardContent></Card>
      ) : (
        Object.entries(grouped).map(([cat, pbs]) => (
          <div key={cat} className="space-y-2">
            <Badge variant="outline" className="text-xs">{CATEGORIES.find(c => c.value === cat)?.label || cat}</Badge>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pbs.map(pb => (
                <Card key={pb.id} className="hover:shadow-md transition-shadow cursor-pointer group" onClick={() => setViewPlaybook(pb)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium">{pb.name}</h3>
                        {pb.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pb.description}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-[10px]">{pb.steps.length} passos</Badge>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(pb)} aria-label="Editar playbook">
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => deletePlaybook(pb.id)} aria-label="Excluir playbook">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))
      )}

      {/* View Playbook Dialog */}
      <Dialog open={!!viewPlaybook} onOpenChange={() => setViewPlaybook(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
          {viewPlaybook && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary" />
                  {viewPlaybook.name}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {viewPlaybook.description && <p className="text-sm text-muted-foreground">{viewPlaybook.description}</p>}
                {viewPlaybook.steps.map((step, idx) => (
                  <div key={idx} className="flex gap-3 p-3 rounded-lg bg-muted/20">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-bold shrink-0">{step.order}</div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{step.title}</p>
                      {step.description && <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>}
                      {step.tips && (
                        <div className="mt-1.5 p-2 rounded bg-primary/5 border border-primary/10">
                          <p className="text-[10px] text-primary">💡 {step.tips}</p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedPlaybook ? 'Editar Playbook' : 'Novo Playbook'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome do playbook" />
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Descrição" rows={2} />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="space-y-3">
              <p className="text-sm font-medium">Passos</p>
              {steps.map((step, idx) => (
                <div key={idx} className="space-y-2 p-3 rounded-lg bg-muted/10 border border-border/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-[10px]">Passo {idx + 1}</Badge>
                    {steps.length > 1 && (
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => removeStep(idx)}>
                        <Trash2 className="w-3 h-3 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <Input value={step.title} onChange={e => updateStep(idx, 'title', e.target.value)} placeholder="Título do passo" className="h-8 text-sm" />
                  <Textarea value={step.description} onChange={e => updateStep(idx, 'description', e.target.value)} placeholder="Descrição" rows={2} className="text-sm" />
                  <Input value={step.tips} onChange={e => updateStep(idx, 'tips', e.target.value)} placeholder="Dica/tip (opcional)" className="h-8 text-sm" />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addStep} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                Adicionar passo
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
