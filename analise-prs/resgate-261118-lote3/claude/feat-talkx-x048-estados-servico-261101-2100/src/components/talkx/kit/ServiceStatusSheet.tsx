/**
 * X048 (TL-106) — painel lateral de status dos serviços consumidos pelo Talk X.
 * Abre quando o usuário clica em "Ver status dos serviços" em qualquer estado de
 * indisponibilidade (CRM, WhatsApp).
 */
import { Wifi, WifiOff, Database, DatabaseZap, Radio, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TalkXServiceStatus } from '@/hooks/integrations/useTalkXServiceStatus';

interface ServiceStatusSheetProps {
  status: TalkXServiceStatus;
  onClose: () => void;
}

interface StatusRowProps {
  icon: React.ElementType;
  label: string;
  sublabel?: string;
  ok: boolean | null;
}

function StatusRow({ icon: Icon, label, sublabel, ok }: StatusRowProps) {
  const dotClass = ok === true
    ? 'bg-green-500'
    : ok === false
      ? 'bg-red-500'
      : 'bg-yellow-500 animate-pulse';

  const statusText = ok === true ? 'Operacional' : ok === false ? 'Indisponível' : 'Verificando…';

  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground leading-none">{label}</p>
        {sublabel && <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={cn('h-2 w-2 rounded-full', dotClass)} />
        <span className="text-xs text-muted-foreground">{statusText}</span>
      </div>
    </div>
  );
}

export function ServiceStatusSheet({ status, onClose }: ServiceStatusSheetProps) {
  const waOk = status.whatsapp.connected;
  const crmOk = status.crm === 'ok' ? true : status.crm === 'not_configured' ? null : false;

  return (
    <div
      data-testid="service-status-sheet"
      className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col bg-background shadow-xl border-l border-border"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">Status dos serviços</h2>
        <button
          type="button"
          aria-label="Fechar painel de status"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        <StatusRow
          icon={waOk === false ? WifiOff : Wifi}
          label="WhatsApp"
          sublabel="Conexão com o provedor de mensagens"
          ok={waOk}
        />
        <StatusRow
          icon={crmOk === false ? DatabaseZap : Database}
          label="CRM 360°"
          sublabel="Integração com contatos e histórico"
          ok={crmOk}
        />
        <StatusRow
          icon={Radio}
          label="Tempo real"
          sublabel="Canal de atualização automática"
          ok={null}
        />
      </div>

      <div className="border-t border-border px-4 py-3">
        <p className="text-xs text-muted-foreground">
          Serviços indisponíveis podem limitar recursos do Talk X temporariamente.
        </p>
      </div>
    </div>
  );
}
