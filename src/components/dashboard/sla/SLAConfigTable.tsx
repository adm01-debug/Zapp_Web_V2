import { SlidersHorizontal, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import { DashboardCard, SectionHeader } from '../overview/DashboardCard';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useSLAConfigurations, PRIORITY_CONFIG } from '@/hooks/sla/useSLAConfigurations';
import { formatSLAMinutes } from '@/components/settings/sla/sla-utils';

const PRIORITY_DOT_CLASS: Record<string, string> = {
  critical: 'bg-dash-red',
  high: 'bg-dash-amber',
  medium: 'bg-dash-yellow',
  low: 'bg-dash-green',
};

export function SLAConfigTable() {
  const {
    configs, isLoading, form, setForm, showDialog, setShowDialog, editingId,
    saveMutation, toggleMutation, deleteMutation, openEdit, openCreate,
  } = useSLAConfigurations();

  return (
    <DashboardCard testid="sla-config-table-card">
      <SectionHeader
        icon={SlidersHorizontal}
        title="Configurações Globais de SLA"
        subtitle="Defina metas padrão de tempo de primeira resposta por nível de prioridade"
        tileSize={34}
        right={(
          <button
            type="button"
            onClick={openCreate}
            className="h-8 px-2.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold flex items-center gap-1 shrink-0 hover:bg-primary/90"
          >
            <Plus className="w-3.5 h-3.5" /> Novo SLA
          </button>
        )}
      />

      {isLoading ? (
        <p className="text-[12px] text-muted-foreground py-4 text-center">Carregando…</p>
      ) : configs.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 py-8 text-center">
          <p className="text-[12px] text-muted-foreground">Nenhuma configuração de SLA</p>
        </div>
      ) : (
        <table className="table-auto w-full text-[13px]">
          <thead>
            <tr className="text-left">
              <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Prioridade</th>
              <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Tempo de 1ª resposta</th>
              <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Status</th>
              <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Ações</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((cfg) => {
              const pCfg = PRIORITY_CONFIG[cfg.priority] || PRIORITY_CONFIG.medium;
              return (
                <tr key={cfg.id} className="h-11 border-t border-border/60">
                  <td className="pr-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT_CLASS[cfg.priority] ?? 'bg-dash-blue'}`} />
                      <span className="font-medium text-foreground">{cfg.name}</span>
                      <span className="text-[11px] text-muted-foreground">({pCfg.label})</span>
                    </div>
                  </td>
                  <td className="pr-2 text-foreground-secondary">{formatSLAMinutes(cfg.first_response_minutes)}</td>
                  <td className="pr-2">
                    <Switch checked={cfg.is_active} onCheckedChange={(checked) => toggleMutation.mutate({ id: cfg.id, is_active: checked })} />
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(cfg)}><Pencil className="w-3.5 h-3.5" /></Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir configuração de SLA</AlertDialogTitle>
                            <AlertDialogDescription>Tem certeza que deseja excluir <strong>"{cfg.name}"</strong>? Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteMutation.mutate(cfg.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar SLA' : 'Nova Configuração de SLA'}</DialogTitle>
            <DialogDescription>{editingId ? 'Atualize o prazo de primeira resposta e o nível de prioridade desta configuração.' : 'Defina metas de tempo de primeira resposta para um nível de prioridade.'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs font-medium">Nome</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex: SLA Crítico" className="mt-1" />
            </div>
            <div>
              <Label className="text-xs font-medium">Prioridade</Label>
              <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_default} onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: v }))} />
              <Label className="text-xs">SLA padrão (fallback global)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={() => saveMutation.mutate({ ...form, id: editingId || undefined })} disabled={!form.name || saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardCard>
  );
}
