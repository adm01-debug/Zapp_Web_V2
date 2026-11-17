/**
 * X048 (TL-106) — painel lateral com o status dos serviços que o Talk X consome.
 *
 * Fecha o fluxo que estava pela metade: `TalkXCrmUnavailableState` e
 * `TalkXWhatsAppDisconnectedState` oferecem o botão "Ver status dos serviços",
 * mas até aqui não havia painel nenhum para abrir — e, sem destino, nenhuma tela
 * passava `onViewStatus`, então o botão nunca aparecia.
 *
 * O que cada linha mostra é o que o sistema REALMENTE sabe. O
 * `useTalkXServiceStatus` só expõe `whatsapp` e diz, no próprio cabeçalho, que
 * CRM e tempo real ficaram fora por não existir sinal no código. Então esses dois
 * aparecem como "Não monitorado" em vez de "Verificando…": um "verificando" que
 * nunca termina afirmaria que há uma checagem em curso, e não há. O painel não
 * inventa sinal.
 */
import { Wifi, WifiOff, Database, Radio } from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '@/lib/utils';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import type { TalkXServiceStatus } from '@/hooks/integrations/useTalkXServiceStatus';

/** `true` operacional · `false` indisponível · `null` checando · `'off'` sem monitoração. */
export type ServiceState = boolean | null | 'off';

const TEXTO: Record<string, string> = {
  true: 'Operacional',
  false: 'Indisponível',
  null: 'Verificando…',
  off: 'Não monitorado',
};

const COR: Record<string, string> = {
  true: 'bg-emerald-500',
  false: 'bg-destructive',
  null: 'bg-amber-500 motion-safe:animate-pulse',
  off: 'bg-muted-foreground/40',
};

function chave(ok: ServiceState): string {
  return ok === 'off' ? 'off' : String(ok);
}

export function StatusRow({
  icon: Icon, label, sublabel, ok,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  sublabel?: string;
  ok: ServiceState;
}) {
  const k = chave(ok);
  return (
    <li className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-none text-foreground">{label}</p>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {/* O ponto é decoração: quem lê por leitor de tela recebe o texto ao lado. */}
        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', COR[k])} />
        <span className="text-xs text-muted-foreground">{TEXTO[k]}</span>
      </div>
    </li>
  );
}

export function ServiceStatusSheet({
  open, onOpenChange, status,
}: {
  open: boolean;
  onOpenChange: (aberto: boolean) => void;
  /**
   * Quando vem, manda. Quando não vem, o padrão é "WhatsApp indisponível" —
   * porque quem abre este painel é um estado de indisponibilidade, que só está
   * na tela porque a checagem respondeu `false`. Isso deixa o painel utilizável
   * por quem já sabe o diagnóstico sem obrigar cada tela a repassar o status.
   */
  status?: TalkXServiceStatus;
}) {
  const whatsapp = status ? status.whatsapp.connected : false;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[340px] max-w-[90vw] flex-col p-0"
        data-testid="talkx-service-status-sheet"
      >
        <SheetHeader className="px-4 pb-2 pt-4">
          <SheetTitle className="text-left text-[15px] font-bold">Status dos serviços</SheetTitle>
          <SheetDescription className="text-left text-xs">
            O que o Talk X consegue verificar agora sobre cada serviço que ele usa.
          </SheetDescription>
        </SheetHeader>

        <ul className="min-h-0 flex-1 list-none overflow-y-auto px-4 py-2">
          <StatusRow
            icon={whatsapp === false ? WifiOff : Wifi}
            label="WhatsApp"
            sublabel="Conexão com o provedor de mensagens"
            ok={whatsapp}
          />
          <StatusRow
            icon={Database}
            label="CRM 360°"
            sublabel="Sem sinal de disponibilidade no sistema"
            ok="off"
          />
          <StatusRow
            icon={Radio}
            label="Tempo real"
            sublabel="Sem sinal de disponibilidade no sistema"
            ok="off"
          />
        </ul>

        <div className="border-t border-border px-4 py-3">
          <p className="text-xs text-muted-foreground">
            Serviço indisponível pode limitar recursos do Talk X temporariamente. "Não monitorado"
            quer dizer que o sistema não checa esse serviço — não que ele esteja fora.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
