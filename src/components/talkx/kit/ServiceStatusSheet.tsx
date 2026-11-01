/**
 * X048 — painel "Ver status dos serviços" do Talk X.
 *
 * Mostra 3 linhas: WhatsApp (por conexão), CRM 360 (com hora da última
 * sincronização, se disponível) e Tempo real. Abre como Sheet lateral.
 */
import React from 'react';
import { Wifi, DatabaseZap, MessageSquare, CheckCircle2, XCircle, HelpCircle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader } from '@/components/ui/sheet';

export interface ServiceStatusSheetProps {
  open: boolean;
  onClose: () => void;
  whatsappConnected: boolean | null;
  /** `ok` | `unavailable` | `not_configured` | `null` = ainda checando */
  crmStatus?: 'ok' | 'unavailable' | 'not_configured' | null;
  realtimeOk?: boolean | null;
  lastCrmSync?: string | null;
}

function StatusIcon({ ok }: { ok: boolean | null }) {
  if (ok === null) return <HelpCircle className="w-4 h-4 text-muted-foreground" />;
  return ok
    ? <CheckCircle2 className="w-4 h-4 text-success" />
    : <XCircle className="w-4 h-4 text-destructive" />;
}

function StatusRow({ icon: Icon, label, ok, detail }: {
  icon: React.ElementType;
  label: string;
  ok: boolean | null;
  detail?: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border border-border/60 bg-card">
      <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-foreground-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {detail && <p className="text-2xs text-muted-foreground mt-0.5">{detail}</p>}
      </div>
      <StatusIcon ok={ok} />
    </div>
  );
}

export function ServiceStatusSheet({
  open, onClose,
  whatsappConnected,
  crmStatus = null,
  realtimeOk = null,
  lastCrmSync,
}: ServiceStatusSheetProps) {
  const crmOk = crmStatus === 'ok' ? true : crmStatus === 'unavailable' ? false : null;
  const crmDetail = crmStatus === 'not_configured'
    ? 'CRM 360 não configurado'
    : lastCrmSync
    ? `Última sincronização: ${lastCrmSync}`
    : undefined;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-80 max-w-full">
        <SheetHeader>
          <p className="text-sm font-semibold text-foreground">Status dos serviços</p>
          <p className="text-xs text-muted-foreground">Dependências do Talk X neste momento.</p>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          <StatusRow
            icon={MessageSquare}
            label="WhatsApp"
            ok={whatsappConnected}
            detail={whatsappConnected === false ? 'Nenhuma conexão ativa' : whatsappConnected === null ? 'Verificando…' : 'Conectado'}
          />
          <StatusRow
            icon={DatabaseZap}
            label="CRM 360"
            ok={crmOk}
            detail={crmDetail}
          />
          <StatusRow
            icon={Wifi}
            label="Tempo real"
            ok={realtimeOk}
            detail={realtimeOk === null ? 'Verificando…' : realtimeOk ? 'Conectado' : 'Desconectado'}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
