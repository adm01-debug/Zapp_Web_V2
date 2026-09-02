import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Wrench, ChevronDown, RefreshCw } from 'lucide-react';

const LAST_PURGE_KEY = 'zapp:sw:lastCachePurge';

type SwStatus = {
  supported: boolean;
  registered: boolean;
  activeUrl: string | null;
  waitingUrl: string | null;
  installingUrl: string | null;
  controllerUrl: string | null;
  scope: string | null;
};

function formatTs(ts: number | null): string {
  if (!ts) return 'nunca';
  try {
    return new Date(ts).toLocaleString('pt-BR');
  } catch {
    return String(ts);
  }
}

async function readSwStatus(): Promise<SwStatus> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return {
      supported: false,
      registered: false,
      activeUrl: null,
      waitingUrl: null,
      installingUrl: null,
      controllerUrl: null,
      scope: null,
    };
  }
  const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
  const reg = regs[0];
  return {
    supported: true,
    registered: regs.length > 0,
    activeUrl: reg?.active?.scriptURL ?? null,
    waitingUrl: reg?.waiting?.scriptURL ?? null,
    installingUrl: reg?.installing?.scriptURL ?? null,
    controllerUrl: navigator.serviceWorker.controller?.scriptURL ?? null,
    scope: reg?.scope ?? null,
  };
}

/**
 * Painel de diagnóstico do Service Worker exibido na tela de login.
 * Ajuda a destravar o app quando um SW antigo (ex.: Workbox precache) fica
 * servindo bundle obsoleto. Mostra hostname, status do SW, caches ativas e
 * data da última limpeza, e permite forçar `unregister + caches.delete()`.
 */
export function AuthDiagnosticsPanel() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<SwStatus | null>(null);
  const [cacheKeys, setCacheKeys] = useState<string[]>([]);
  const [lastPurge, setLastPurge] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [sw, keys] = await Promise.all([
      readSwStatus(),
      typeof caches !== 'undefined' ? caches.keys().catch(() => []) : Promise.resolve([]),
    ]);
    setStatus(sw);
    setCacheKeys(keys);
    const raw = localStorage.getItem(LAST_PURGE_KEY);
    setLastPurge(raw ? Number(raw) : null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handlePurge = useCallback(async () => {
    setBusy(true);
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys().catch(() => [] as string[]);
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      }
      const now = Date.now();
      localStorage.setItem(LAST_PURGE_KEY, String(now));
      setLastPurge(now);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const handlePurgeAndReload = useCallback(async () => {
    await handlePurge();
    window.location.reload();
  }, [handlePurge]);

  const hostname = typeof window !== 'undefined' ? window.location.hostname : '—';
  const swLabel = !status
    ? '…'
    : !status.supported
      ? 'não suportado'
      : status.activeUrl
        ? 'ativo'
        : status.installingUrl
          ? 'instalando'
          : status.waitingUrl
            ? 'aguardando'
            : status.registered
              ? 'registrado'
              : 'não registrado';

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Wrench className="h-3 w-3" />
          Diagnóstico
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="rounded-lg border border-border bg-muted/40 p-3 text-left text-xs text-muted-foreground">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt className="font-medium text-foreground">Hostname</dt>
            <dd className="truncate font-mono">{hostname}</dd> {/* @technical */}

            <dt className="font-medium text-foreground">Service Worker</dt>
            <dd>
              <span className="font-mono">{swLabel}</span> {/* @technical */}
              {status?.activeUrl && (
                <div className="mt-0.5 truncate font-mono text-[10px] opacity-70"> {/* @technical */}
                  {status.activeUrl}
                </div>
              )}
              {!status?.activeUrl && status?.installingUrl && (
                <div className="mt-0.5 truncate font-mono text-[10px] opacity-70"> {/* @technical */}
                  {status.installingUrl}
                </div>
              )}
            </dd>

            <dt className="font-medium text-foreground">Caches</dt>
            <dd className="font-mono"> {/* @technical */}
              {cacheKeys.length === 0 ? 'nenhuma' : `${cacheKeys.length} (${cacheKeys.join(', ')})`}
            </dd>

            <dt className="font-medium text-foreground">Última limpeza</dt>
            <dd className="font-mono">{formatTs(lastPurge)}</dd> {/* @technical */}
          </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={refresh}
              disabled={busy}
              className="h-7 text-xs"
            >
              Atualizar
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handlePurge}
              disabled={busy}
              className="h-7 text-xs"
            >
              Limpar caches
            </Button>
            <Button
              type="button"
              size="sm"
              variant="default"
              onClick={handlePurgeAndReload}
              disabled={busy}
              className="h-7 gap-1 text-xs"
            >
              <RefreshCw className="h-3 w-3" />
              Limpar e recarregar
            </Button>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export default AuthDiagnosticsPanel;
