import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Edit2, Trash2, Copy, Play, ArrowRight } from 'lucide-react';
import { Zap } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TRIGGER_TYPES, ACTION_TYPES, OBSOLETE_AUTOMATION_LABEL, isObsoleteAutomation } from './automationConstants';
import type { AutomationRow } from './useAutomations';

interface AutomationAction {
  type: string;
  [key: string]: unknown;
}

interface AutomationCardProps {
  automation: AutomationRow;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}

export function AutomationCard({ automation, onToggle, onEdit, onDelete, onDuplicate }: AutomationCardProps) {
  // CT-70 — com "reduzir movimento" ligado, o card entra já no estado final.
  const prefersReducedMotion = useReducedMotion();
  const triggerInfo = TRIGGER_TYPES.find(t => t.type === automation.trigger_type);
  const TriggerIcon = triggerInfo?.icon || Zap;
  const actions = (Array.isArray(automation.actions) ? automation.actions : []) as unknown as AutomationAction[];
  // Registro gravado antes da remoção da função de tags: o gatilho/ação dele não
  // existe mais na lista atual. Ele continua na tela, MARCADO como obsoleto —
  // nunca apagado — para o operador ver o que ficou para trás e decidir.
  // O controle reflete o estado REAL do banco: quem ainda está ativo aparece
  // ligado e pode ser DESLIGADO (só ligar de novo é bloqueado).
  const obsolete = isObsoleteAutomation(automation);
  const active = automation.is_active && !obsolete;
  const obsoleteActive = obsolete && automation.is_active;

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      className={cn(
        'p-4 rounded-lg border transition-all',
        active ? 'bg-card border-primary/20' : 'bg-muted/30 border-border opacity-70'
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg shrink-0', active ? 'bg-primary/20' : 'bg-muted')}>
          <TriggerIcon className={cn('w-5 h-5', active ? 'text-primary' : 'text-muted-foreground')} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sm truncate">{automation.name}</h4>
            <Badge variant={obsolete ? 'destructive' : active ? 'default' : 'secondary'} className="text-xs">
              {obsolete ? OBSOLETE_AUTOMATION_LABEL : active ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{automation.description}</p>
          <div className="flex items-center gap-1 mt-2 flex-wrap">
            <Badge variant="outline" className="text-xs">{triggerInfo?.label ?? automation.trigger_type}</Badge>
            <ArrowRight className="w-3 h-3 text-muted-foreground" />
            {actions.map((action: AutomationAction, i: number) => {
              const actionInfo = ACTION_TYPES.find(a => a.type === action.type);
              return <Badge key={i} variant="secondary" className="text-xs">{actionInfo?.label ?? action.type}</Badge>;
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Play className="w-3 h-3" />{automation.trigger_count}x executado</span>
            {automation.last_triggered_at && (
              <span>Último: {new Date(automation.last_triggered_at).toLocaleDateString('pt-BR')}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            checked={automation.is_active}
            disabled={obsolete && !automation.is_active}
            onCheckedChange={onToggle}
            aria-label={
              obsoleteActive
                ? 'Automação obsoleta ativa: pode ser desativada'
                : obsolete
                  ? 'Automação obsoleta: não pode ser ativada'
                  : 'Ativar automação'
            }
            title={
              obsoleteActive
                ? 'A função de tags foi removida; esta automação ainda está ativa e pode ser desativada'
                : obsolete
                  ? 'A função de tags foi removida do sistema'
                  : undefined
            }
          />
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label="Editar automação"><Edit2 className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate} aria-label="Duplicar automação"><Copy className="w-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={onDelete} aria-label="Excluir automação"><Trash2 className="w-4 h-4" /></Button>
        </div>
      </div>
    </motion.div>
  );
}
