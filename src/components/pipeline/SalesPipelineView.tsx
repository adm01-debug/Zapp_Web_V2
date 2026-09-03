import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';
import { AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DealCard } from './DealCard';
import { PipelineKPICards } from './PipelineKPICards';
import type { Deal } from './DealCard';

interface PipelineStage { id: string; name: string; color: string; position: number; }

export function SalesPipelineView() {
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDealDialog, setShowDealDialog] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [contacts, setContacts] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [draggedDeal, setDraggedDeal] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formValue, setFormValue] = useState('');
  const [formStageId, setFormStageId] = useState('');
  const [formContactId, setFormContactId] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState('');
  const [formPriority, setFormPriority] = useState('medium');
  const [formCloseDate, setFormCloseDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [stagesRes, dealsRes, contactsRes, agentsRes] = await Promise.all([
      supabase.from('sales_pipeline_stages').select('*').order('position'),
      supabase.from('sales_deals').select('*, contacts(name, phone), profiles!sales_deals_assigned_to_fkey(name)').order('created_at', { ascending: false }),
      supabase.from('contacts').select('id, name, phone').limit(200),
      supabase.from('profiles').select('id, name').eq('is_active', true),
    ]);
    if (stagesRes.data) setStages(stagesRes.data);
    if (dealsRes.data) setDeals(dealsRes.data.map((d) => ({ ...d, tags: d.tags || [], contact: d.contacts, assignee: d.profiles })));
    if (contactsRes.data) setContacts(contactsRes.data);
    if (agentsRes.data) setAgents(agentsRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const channel = supabase.channel('deals-changes').on('postgres_changes', { event: '*', schema: 'public', table: 'sales_deals' }, () => fetchData()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const openNewDeal = (stageId?: string) => { setEditingDeal(null); setFormTitle(''); setFormValue(''); setFormStageId(stageId || stages[0]?.id || ''); setFormContactId(''); setFormAssignedTo(''); setFormPriority('medium'); setFormCloseDate(''); setFormNotes(''); setShowDealDialog(true); };
  const openEditDeal = (deal: Deal) => { setEditingDeal(deal); setFormTitle(deal.title); setFormValue(String(deal.value || '')); setFormStageId(deal.stage_id || ''); setFormContactId(deal.contact_id || ''); setFormAssignedTo(deal.assigned_to || ''); setFormPriority(deal.priority); setFormCloseDate(deal.expected_close_date || ''); setFormNotes(deal.notes || ''); setShowDealDialog(true); };

  const saveDeal = async () => {
    if (!formTitle.trim()) return;
    const payload = { title: formTitle, value: parseFloat(formValue) || 0, stage_id: formStageId || null, contact_id: formContactId || null, assigned_to: formAssignedTo || null, priority: formPriority, expected_close_date: formCloseDate || null, notes: formNotes || null };
    if (editingDeal) { const { error } = await supabase.from('sales_deals').update(payload).eq('id', editingDeal.id); if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; } toast({ title: 'Deal atualizado!' }); }
    else { const { error } = await supabase.from('sales_deals').insert(payload); if (error) { toast({ title: 'Erro', description: error.message, variant: 'destructive' }); return; } toast({ title: 'Deal criado!' }); }
    setShowDealDialog(false); fetchData();
  };

  const moveDeal = async (dealId: string, newStageId: string) => { await supabase.from('sales_deals').update({ stage_id: newStageId }).eq('id', dealId); await supabase.from('deal_activities').insert({ deal_id: dealId, activity_type: 'stage_change', description: `Movido para ${stages.find(s => s.id === newStageId)?.name}` }); fetchData(); };
  const deleteDeal = async (id: string) => { await supabase.from('sales_deals').delete().eq('id', id); toast({ title: 'Deal removido' }); fetchData(); };
  const markAsWon = async (deal: Deal) => { await supabase.from('sales_deals').update({ status: 'won', won_at: new Date().toISOString() }).eq('id', deal.id); toast({ title: '🎉 Deal ganho!', description: `${deal.title} - R$ ${deal.value.toLocaleString('pt-BR')}` }); fetchData(); };
  const markAsLost = async (deal: Deal) => { await supabase.from('sales_deals').update({ status: 'lost', lost_at: new Date().toISOString() }).eq('id', deal.id); toast({ title: 'Deal perdido', description: deal.title }); fetchData(); };

  const getStageDeals = (stageId: string) => deals.filter(d => d.stage_id === stageId && d.status === 'open');
  const getStageTotal = (stageId: string) => getStageDeals(stageId).reduce((sum, d) => sum + (d.value || 0), 0);
  const totalPipeline = deals.filter(d => d.status === 'open').reduce((sum, d) => sum + (d.value || 0), 0);
  const wonDeals = deals.filter(d => d.status === 'won');
  const totalWon = wonDeals.reduce((sum, d) => sum + (d.value || 0), 0);

  if (loading) return <div className="flex items-center justify-center h-full"><div className="animate-pulse text-muted-foreground">Carregando pipeline...</div></div>;

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Pipeline de Vendas" subtitle="Gerencie suas oportunidades de negócio" actions={<Button onClick={() => openNewDeal()} className="gap-2"><Plus className="w-4 h-4" /> Novo Deal</Button>} />
      <PipelineKPICards totalPipeline={totalPipeline} activeDeals={deals.filter(d => d.status === 'open').length} totalWon={totalWon} conversionRate={deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0} />

      <div className="flex-1 overflow-x-auto px-6 pb-6">
        <div className="flex gap-4 h-full min-w-max">
          {stages.map((stage) => {
            const stageDeals = getStageDeals(stage.id);
            const isOver = dragOverStage === stage.id;
            return (
              <div key={stage.id} className={cn("flex flex-col w-72 min-w-[288px] rounded-xl border transition-all duration-200", isOver ? "border-secondary bg-secondary/5 shadow-lg shadow-secondary/10" : "border-border/30 bg-card/30")}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }} onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => { e.preventDefault(); if (draggedDeal) moveDeal(draggedDeal, stage.id); setDraggedDeal(null); setDragOverStage(null); }}>
                <div className="p-3 border-b border-border/20">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="font-semibold text-sm text-foreground">{stage.name}</span>
                      <Badge variant="secondary" className="text-xs h-5">{stageDeals.length}</Badge>
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openNewDeal(stage.id)}><Plus className="w-3.5 h-3.5" /></Button>
                  </div>
                  <p className="text-xs text-muted-foreground">R$ {getStageTotal(stage.id).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="flex-1 p-2 space-y-2 overflow-y-auto scrollbar-thin">
                  <AnimatePresence>
                    {stageDeals.map((deal) => (
                      <DealCard key={deal.id} deal={deal} isDragging={draggedDeal === deal.id}
                        onDragStart={() => setDraggedDeal(deal.id)} onDragEnd={() => { setDraggedDeal(null); setDragOverStage(null); }}
                        onEdit={openEditDeal} onMarkWon={markAsWon} onMarkLost={markAsLost} onDelete={deleteDeal} />
                    ))}
                  </AnimatePresence>
                  {stageDeals.length === 0 && <div className="text-center py-8 text-muted-foreground/50 text-xs">Arraste deals aqui</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={showDealDialog} onOpenChange={setShowDealDialog}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{editingDeal ? 'Editar Deal' : 'Novo Deal'}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Título *</Label><Input value={formTitle} onChange={(e) => setFormTitle(e.target.value)} placeholder="Nome do deal" /></div>
            <div><Label>Valor (R$)</Label><Input type="number" value={formValue} onChange={(e) => setFormValue(e.target.value)} placeholder="0,00" /></div>
            <div><Label>Etapa</Label><Select value={formStageId} onValueChange={setFormStageId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{stages.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Contato</Label><Select value={formContactId} onValueChange={setFormContactId}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{contacts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Responsável</Label><Select value={formAssignedTo} onValueChange={setFormAssignedTo}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label>Prioridade</Label><Select value={formPriority} onValueChange={setFormPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baixa</SelectItem><SelectItem value="medium">Média</SelectItem><SelectItem value="high">Alta</SelectItem></SelectContent></Select></div>
            <div><Label>Data prevista</Label><Input type="date" value={formCloseDate} onChange={(e) => setFormCloseDate(e.target.value)} /></div>
            <div className="col-span-2"><Label>Observações</Label><Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDealDialog(false)}>Cancelar</Button>
            <Button onClick={saveDeal}>{editingDeal ? 'Salvar' : 'Criar Deal'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
