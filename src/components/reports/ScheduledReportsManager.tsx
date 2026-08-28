/**
 * ScheduledReportsManager — reports/ version
 *
 * PURPOSE: Full-page manager for the Reports section. Delegates all state
 * and side-effects to the useScheduledReports() hook and renders a rich
 * list with animations, chip-based recipient management, edit support and
 * a "send now" action.
 *
 * KEY DIFFERENCES from dashboard/ScheduledReportsManager:
 *  - Powered by useScheduledReports() hook (from @/hooks/chat/useScheduledReports)
 *    ↳ imports REPORT_TYPES, FREQUENCIES, FORMATS constants from the hook
 *  - Actions: create + edit + delete + toggle + send now  ← full CRUD
 *  - Format field: pdf / csv / etc.  ← NOT present in dashboard version
 *  - next_send_at displayed with locale date formatting
 *  - Recipients: chip/badge UI with add-by-Enter + per-chip remove button
 *    ← NOT a plain-text comma-separated Input like in dashboard version
 *  - ICON_MAP: per-report-type icon (BarChart3, Users, MessageSquare, Target)
 *  - Framer-motion AnimatePresence for card enter/exit animations
 *  - Full-page layout with <h2> header (not a Card widget)
 *  - Also renders <ScheduledReportConfigs /> at the bottom
 *
 * DO NOT merge with dashboard/ScheduledReportsManager — that file is a
 * self-contained Card widget with inline Supabase mutations, no edit support,
 * plain-text recipients input and no animations.
 */
import { ScheduledReportConfigs } from './ScheduledReportConfigs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit2, Trash2, Mail, Clock, Loader2, Send, BarChart3, Users, MessageSquare, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useScheduledReports, REPORT_TYPES, FREQUENCIES, FORMATS } from '@/hooks/chat/useScheduledReports';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  BarChart3, Users, MessageSquare, Target,
};

export function ScheduledReportsManager() {
  const mgr = useScheduledReports();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Relatórios Agendados</h2>
          <p className="text-sm text-muted-foreground">Configure envio automático de relatórios por email</p>
        </div>
        <Button onClick={mgr.openCreateDialog} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" />Novo Relatório
        </Button>
      </div>

      <div className="grid gap-4">
        {mgr.loading ? (
          <Card className="border-secondary/20"><CardContent className="p-8 text-center text-muted-foreground">Carregando relatórios...</CardContent></Card>
        ) : mgr.reports.length === 0 ? (
          <Card className="border-secondary/20"><CardContent className="p-8 text-center">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Nenhum relatório agendado</p>
            <Button variant="outline" className="mt-4" onClick={mgr.openCreateDialog}><Plus className="w-4 h-4 mr-2" />Agendar primeiro relatório</Button>
          </CardContent></Card>
        ) : (
          <AnimatePresence>
            {mgr.reports.map(report => {
              const typeInfo = REPORT_TYPES.find(t => t.value === report.report_type);
              const freqInfo = FREQUENCIES.find(f => f.value === report.frequency);
              const Icon = ICON_MAP[typeInfo?.icon || 'BarChart3'] || BarChart3;
              return (
                <motion.div key={report.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <Card className={cn('border-secondary/20 transition-all', !report.is_active && 'opacity-60')}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className={cn('p-3 rounded-xl shrink-0', report.is_active ? 'bg-primary/15' : 'bg-muted')}>
                          <Icon className={cn('w-5 h-5', report.is_active ? 'text-primary' : 'text-muted-foreground')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium">{report.name}</h3>
                            <Badge variant="secondary" className="text-xs">{report.format.toUpperCase()}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{typeInfo?.label} • {freqInfo?.label}</p>
                          <div className="flex items-center gap-2 mt-1"><Mail className="w-3 h-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">{report.recipients.join(', ')}</span></div>
                          {report.next_send_at && (
                            <div className="flex items-center gap-1 mt-1"><Clock className="w-3 h-3 text-muted-foreground" /><span className="text-xs text-muted-foreground">Próximo: {new Date(report.next_send_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Switch checked={report.is_active} onCheckedChange={(checked) => mgr.toggleActive(report.id, checked)} />
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mgr.handleSendNow(report)} aria-label="Enviar agora"><Send className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mgr.openEditDialog(report)} aria-label="Editar relatório"><Edit2 className="w-4 h-4" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => mgr.handleDelete(report.id)} aria-label="Excluir relatório"><Trash2 className="w-4 h-4" /></Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={mgr.isDialogOpen} onOpenChange={mgr.setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{mgr.editingReport.id ? 'Editar Relatório' : 'Novo Relatório Agendado'}</DialogTitle>
            <DialogDescription>Configure o envio automático de relatórios por email</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Relatório</Label>
              <Input value={mgr.editingReport.name || ''} onChange={(e) => mgr.setEditingReport(prev => ({ ...prev, name: e.target.value }))} placeholder="ex: Relatório Semanal de Performance" />
            </div>
            <div className="space-y-2">
              <Label>Tipo de Relatório</Label>
              <Select value={mgr.editingReport.report_type || 'dashboard_summary'} onValueChange={(value) => mgr.setEditingReport(prev => ({ ...prev, report_type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map(t => {
                    const TIcon = ICON_MAP[t.icon] || BarChart3;
                    return (
                      <SelectItem key={t.value} value={t.value}>
                        <div className="flex items-center gap-2"><TIcon className="w-4 h-4" /><span>{t.label}</span></div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Frequência</Label>
                <Select value={mgr.editingReport.frequency || 'weekly'} onValueChange={(value) => mgr.setEditingReport(prev => ({ ...prev, frequency: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FREQUENCIES.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Formato</Label>
                <Select value={mgr.editingReport.format || 'pdf'} onValueChange={(value) => mgr.setEditingReport(prev => ({ ...prev, format: value }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMATS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Destinatários</Label>
              <div className="flex gap-2">
                <Input value={mgr.recipientInput} onChange={(e) => mgr.setRecipientInput(e.target.value)} placeholder="email@exemplo.com" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), mgr.addRecipient())} />
                <Button variant="outline" onClick={mgr.addRecipient}><Plus className="w-4 h-4" /></Button>
              </div>
              {(mgr.editingReport.recipients?.length || 0) > 0 && (
                <div className="flex gap-1 flex-wrap mt-2">
                  {mgr.editingReport.recipients?.map(email => (
                    <Badge key={email} variant="secondary" className="gap-1">{email}<button onClick={() => mgr.removeRecipient(email)} className="ml-1 text-destructive">×</button></Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => mgr.setIsDialogOpen(false)}>Cancelar</Button>
            <Button onClick={mgr.handleSave} disabled={mgr.isSaving}>{mgr.isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}{mgr.editingReport.id ? 'Atualizar' : 'Agendar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScheduledReportConfigs />
    </div>
  );
}
