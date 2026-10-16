import { useState, useEffect, useCallback, useRef, type KeyboardEvent } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BookOpen, Plus, Edit, Trash2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Json } from '@/integrations/supabase/types';
import { fetchPlaybooks, type Playbook, type PlaybookStep } from '@/hooks/admin/usePlaybooksData';
import { useSetPlaybookActive } from '@/hooks/admin/usePlaybooksAtivos';

const CATEGORIES = [
  { value: 'sales', label: 'Vendas' },
  { value: 'support', label: 'Suporte' },
  { value: 'billing', label: 'Financeiro' },
  { value: 'complaint', label: 'Reclamação' },
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'general', label: 'Geral' },
];

const ERRO_CARGA = 'Não foi possível carregar os playbooks. Tente novamente.';

export function PlaybooksManager() {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<Playbook | null>(null);
  const [viewPlaybook, setViewPlaybook] = useState<Playbook | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Playbook | null>(null);
  const alternarAtivo = useSetPlaybookActive();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Trava síncrona: o clique duplo dispara dois handlers antes de o React
  // re-renderizar com `saving`, então o estado sozinho não barra a 2ª escrita.
  const savingRef = useRef(false);
  const deletingRef = useRef(false);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [steps, setSteps] = useState<PlaybookStep[]>([]);
  const [isActive, setIsActive] = useState(true);

  const loadPlaybooks = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await fetchPlaybooks();
    if (error) {
      setPlaybooks([]);
      setLoadError(ERRO_CARGA);
      setLoading(false);
      return;
    }
    setPlaybooks(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    loadPlaybooks();
  }, [loadPlaybooks]);

  const openCreate = () => {
    setSelectedPlaybook(null);
    setName('');
    setDescription('');
    setCategory('general');
    setSteps([{ order: 1, title: '', description: '', tips: '' }]);
    setIsActive(true);
    setDialogOpen(true);
  };

  const openEdit = (pb: Playbook) => {
    setSelectedPlaybook(pb);
    setName(pb.name);
    setDescription(pb.description || '');
    setCategory(pb.category);
    setSteps(pb.steps.length > 0 ? pb.steps : [{ order: 1, title: '', description: '', tips: '' }]);
    setIsActive(pb.is_active);
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
    if (savingRef.current) return;
    if (!name.trim()) { toast.error('Nome obrigatório'); return; }
    savingRef.current = true;
    setSaving(true);
    try {
      // Renumera depois de descartar os passos sem título: sem isso um passo
      // vazio no meio grava 1 e 3 e a leitura mostra '3' como segundo.
      const cleanSteps = steps
        .filter(s => s.title.trim())
        .map((s, i) => ({ ...s, order: i + 1 }));

      const payload = {
        name: name.trim(),
        description: description || null,
        category,
        steps: cleanSteps as unknown as Json,
        is_active: isActive,
      };

      const { error } = selectedPlaybook
        ? await supabase.from('playbooks').update(payload).eq('id', selectedPlaybook.id)
        : await supabase.from('playbooks').insert(payload);

      if (error) {
        toast.error('Erro ao salvar');
        return;
      }
      toast.success(selectedPlaybook ? 'Playbook atualizado' : 'Playbook criado');
      setDialogOpen(false);
      await loadPlaybooks();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Liga o toggle do cartão ao hook (PG-08): a escrita passa por
  // `setPlaybookActive`, que confere as linhas afetadas — RLS que barra vira
  // erro visível em vez de "sucesso" falso. O `onError` (toast único) mora no
  // hook; aqui só sincronizamos a lista local quando a escrita aconteceu.
  function alternarAtivoDoPlaybook(pb: Playbook, ativo: boolean) {
    alternarAtivo.mutate(
      { id: pb.id, ativo },
      {
        onSuccess: () =>
          setPlaybooks((lista) => lista.map((p) => (p.id === pb.id ? { ...p, is_active: ativo } : p))),
      },
    );
  }

  const confirmDelete = async () => {
    const alvo = pendingDelete;
    if (!alvo || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    try {
      const { error } = await supabase.from('playbooks').delete().eq('id', alvo.id);
      if (error) {
        toast.error('Erro ao remover');
        return;
      }
      toast.success('Playbook removido');
      setPendingDelete(null);
      await loadPlaybooks();
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  // Só o próprio card abre o detalhe: se o foco está nos botões Editar/Excluir, o
  // Enter/Espaço pertence a eles (preventDefault aqui engoliria o clique do botão).
  const openFromKeyboard = (event: KeyboardEvent<HTMLDivElement>, pb: Playbook) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setViewPlaybook(pb);
    }
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
      ) : loadError ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center">
            <AlertCircle className="w-5 h-5 text-destructive" />
            <p className="text-sm text-destructive">{loadError}</p>
            <Button variant="outline" size="sm" onClick={loadPlaybooks}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : Object.keys(grouped).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Nenhum playbook criado</CardContent></Card>
      ) : (
        Object.entries(grouped).map(([cat, pbs]) => (
          <div key={cat} className="space-y-2">
            <Badge variant="outline" className="text-xs">{CATEGORIES.find(c => c.value === cat)?.label || cat}</Badge>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pbs.map(pb => (
                <Card
                  key={pb.id}
                  // O cartão NÃO é `role="button"`: ele contém os botões de ação
                  // (Editar/Excluir) e um controle dentro de outro faz o axe
                  // acusar `nested-interactive` (mesmo caminho do WorkItemCard e do
                  // TalkXTemplates). O clique por mouse segue; a abertura por
                  // TECLADO vem do `tabIndex` + Enter/Espaço no próprio cartão.
                  role="article"
                  tabIndex={0}
                  aria-label={`Abrir playbook ${pb.name}`}
                  onKeyDown={e => openFromKeyboard(e, pb)}
                  className="hover:shadow-md transition-shadow cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  onClick={() => setViewPlaybook(pb)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-sm font-medium">{pb.name}</h3>
                        {pb.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{pb.description}</p>}
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-3xs">{pb.steps.length} passos</Badge>
                          {!pb.is_active && <Badge variant="outline" className="text-3xs text-muted-foreground">Inativo</Badge>}
                          <Switch
                            aria-label={`${pb.is_active ? 'Desativar' : 'Ativar'} playbook ${pb.name}`}
                            checked={pb.is_active}
                            disabled={alternarAtivo.isPending}
                            onClick={(e) => e.stopPropagation()}
                            onCheckedChange={(ativo) => alternarAtivoDoPlaybook(pb, ativo)}
                          />
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(pb)} aria-label="Editar playbook">
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => setPendingDelete(pb)} aria-label="Excluir playbook">
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
                          <p className="text-3xs text-primary">💡 {step.tips}</p>
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

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir playbook?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? `"${pendingDelete.name}" será removido permanentemente. Esta ação não pode ser desfeita.` : 'Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="playbook-ativo" className="text-sm font-medium">Ativo</label>
              <Switch
                id="playbook-ativo"
                checked={isActive}
                onCheckedChange={setIsActive}
                aria-label="Playbook ativo"
              />
            </div>
            <div className="space-y-3">
              <p className="text-sm font-medium">Passos</p>
              {steps.map((step, idx) => (
                <div key={idx} className="space-y-2 p-3 rounded-lg bg-muted/10 border border-border/30">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-3xs">Passo {idx + 1}</Badge>
                    {steps.length > 1 && (
                      <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => removeStep(idx)} aria-label={`Remover passo ${idx + 1}`}>
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
            <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
