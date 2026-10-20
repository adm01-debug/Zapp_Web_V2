import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  HelpCircle, Zap, GitBranch, Users, FileText, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CAMPAIGN_STATUS, type PillTone } from './talkxShared';

interface TalkXHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const toneDot: Record<PillTone, string> = {
  success: 'bg-success', danger: 'bg-destructive', warning: 'bg-warning',
  info: 'bg-info', violet: 'bg-violet-500', muted: 'bg-muted-foreground',
};

function HelpSection({ icon: Icon, title, children }: { icon: typeof Zap; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <h3 className="font-semibold text-sm text-foreground">{title}</h3>
      </div>
      <div className="pl-9 text-[13px] text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

const LIFECYCLE_ORDER = ['draft', 'scheduled', 'sending', 'completed'] as const;
const LIFECYCLE_BRANCHES = ['paused', 'cancelled'] as const;

export function TalkXHelp({ open, onOpenChange }: TalkXHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <HelpCircle className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">Ajuda — Campanhas (Talk X)</DialogTitle>
              <DialogDescription>Visão geral rápida de como o módulo funciona.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            <HelpSection icon={Zap} title="Visão geral">
              <p>
                O Talk X é o módulo de campanhas de WhatsApp em massa: você escolhe um público
                (segmento ou seleção manual), define uma mensagem e dispara o envio com
                controle de ritmo, acompanhamento em tempo real e métricas de entrega.
              </p>
            </HelpSection>

            <HelpSection icon={GitBranch} title="Ciclo de vida de uma campanha">
              <div className="flex flex-wrap items-center gap-1.5">
                {LIFECYCLE_ORDER.map((status, i) => (
                  <span key={status} className="flex items-center gap-1.5">
                    <Badge variant="outline" className="gap-1.5 font-normal">
                      <span className={cn('w-1.5 h-1.5 rounded-full', toneDot[CAMPAIGN_STATUS[status].tone])} />
                      {CAMPAIGN_STATUS[status].label}
                    </Badge>
                    {i < LIFECYCLE_ORDER.length - 1 && <span className="text-muted-foreground/60">→</span>}
                  </span>
                ))}
              </div>
              <p>
                Uma campanha nasce como <strong className="text-foreground">rascunho</strong>, pode ser{' '}
                <strong className="text-foreground">agendada</strong> para uma data/hora, entra em{' '}
                <strong className="text-foreground">envio</strong> quando o horário chega e termina{' '}
                <strong className="text-foreground">concluída</strong>. A qualquer momento durante o
                envio ela pode ser{' '}
                {LIFECYCLE_BRANCHES.map((status, i) => (
                  <span key={status}>
                    <strong className="text-foreground">{CAMPAIGN_STATUS[status].label.toLowerCase()}</strong>
                    {i < LIFECYCLE_BRANCHES.length - 1 ? ' ou ' : ''}
                  </span>
                ))}
                , sem perder o progresso já feito.
              </p>
            </HelpSection>

            <HelpSection icon={Users} title="Segmentos">
              <p>
                Segmentos são listas reutilizáveis de contatos — por origem ZAPP, importados do
                CRM 360° ou montados manualmente. Em vez de escolher destinatários toda vez que
                cria uma campanha, você monta o segmento uma vez e reaproveita em várias campanhas.
              </p>
            </HelpSection>

            <HelpSection icon={FileText} title="Templates de mensagem">
              <p>
                Templates são modelos de mensagem com variáveis como <code className="text-2xs bg-muted/50 px-1 py-0.5 rounded">{'{{nome}}'}</code>,{' '}
                <code className="text-2xs bg-muted/50 px-1 py-0.5 rounded">{'{{empresa}}'}</code> e{' '}
                <code className="text-2xs bg-muted/50 px-1 py-0.5 rounded">{'{{saudacao}}'}</code>, que são
                substituídas automaticamente para cada contato no envio. Passam por rascunho,
                revisão e aprovação antes de poderem ser usados em campanhas.
              </p>
            </HelpSection>

            <HelpSection icon={Building2} title="Badge de CRM 360°">
              <p>
                Quando a integração com o CRM 360° está habilitada, os destinatários de uma
                campanha podem exibir um selo com o{' '}
                <strong className="text-foreground">nome da empresa</strong> e o{' '}
                <strong className="text-foreground">score RFM</strong> do contato, direto do CRM —
                útil para priorizar quem responder primeiro durante o envio.
              </p>
            </HelpSection>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
