/**
 * Avisos globais de conexao — cartao "avisos globais de conexao degradada e de
 * servidor fora do ar / restaurado".
 *
 * Duas faixas, com problemas DIFERENTES (criterio de pronto: o usuario sempre
 * sabe se o problema e a rede, o servidor ou o numero):
 *
 *   1. `BackendStatusBanner` — o servidor (Supabase) nao responde.
 *      "Servidor indisponivel, tentando reconectar…" + aviso "Conexao
 *      restaurada" quando volta. A falta de internet do NAVEGADOR ja e coberta
 *      por `offline-indicator.tsx` ("Voce esta offline") — sao avisos distintos
 *      e por isso tem `data-testid` proprio.
 *
 *   2. `DegradedConnectionsBanner` — o NUMERO esta instavel: a saude da conexao
 *      esta `degraded` e a ultima checagem e recente (10 min), lido do banco
 *      pelo hook `useDegradedConnections`. Conexao que continua DESCONECTADA nao
 *      entra aqui: essa e do `EvolutionDisconnectBanner`
 *      (`whatsapp_connections.status = 'disconnected'`). Assim "instavel" e
 *      saude degradada, sem aviso duplicado. So para staff (`admin`/`supervisor`,
 *      o mesmo gate da entrada Conexoes da Sidebar) e com atalho para Conexoes.
 */
import { AlertTriangle, RefreshCw, ServerCrash, Wifi } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDegradedConnections } from '@/hooks/connections/useDegradedConnections';
import { useBackendHealth } from '@/hooks/system/useBackendHealth';
import { useUserRole } from '@/hooks/system/useUserRole';

interface DegradedConnectionsBannerProps {
  /** Troca a view para Conexões (staff). Sem a prop, o atalho nao aparece. */
  onOpenConnections?: () => void;
}

export function DegradedConnectionsBanner({ onOpenConnections }: DegradedConnectionsBannerProps) {
  const { degraded } = useDegradedConnections();
  const { isSupervisor } = useUserRole();

  if (!isSupervisor || degraded.length === 0) return null;

  const text =
    degraded.length === 1
      ? `Conexão "${degraded[0].label}" está instável`
      : `${degraded.length} conexões estão instáveis`;

  return (
    <div
      data-testid="degraded-connections-banner"
      role="region"
      aria-label="Conexões instáveis do WhatsApp"
      aria-live="polite"
      // Contraste: `bg-amber-500` + `text-amber-950` da 6.96:1 (WCAG AA para
      // texto normal). Branco sobre amber-500 daria 2.2:1, reprovado.
      className="pointer-events-auto flex items-center gap-3 rounded-lg bg-amber-500 px-4 py-2.5 text-amber-950 shadow-lg"
    >
      <AlertTriangle className="w-5 h-5 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">{text}</span>{' '}
        <span className="text-xs">Saúde degradada nos últimos 10 minutos.</span>
      </div>
      {onOpenConnections && (
        <button
          type="button"
          data-testid="degraded-connections-open"
          onClick={onOpenConnections}
          className="shrink-0 rounded-md bg-amber-950/10 px-3 py-1 text-xs font-medium transition-colors hover:bg-amber-950/20"
        >
          Ver Conexões
        </button>
      )}
    </div>
  );
}

export function BackendStatusBanner() {
  const { status, restored, checking, checkNow } = useBackendHealth();

  if (status === 'up' && restored) {
    return (
      <div
        data-testid="backend-restored"
        role="region"
        aria-label="Conexão restaurada"
        aria-live="polite"
        className="pointer-events-auto mx-auto flex items-center gap-2 rounded-full bg-success px-4 py-2 text-success-foreground shadow-lg"
      >
        <Wifi className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span className="text-sm font-medium">Conexão restaurada</span>{' '}
        <span className="text-xs opacity-90">O servidor voltou a responder.</span>
      </div>
    );
  }

  if (status !== 'down') return null;

  return (
    <div
      data-testid="backend-status-banner"
      role="region"
      aria-label="Servidor indisponível"
      aria-live="polite"
      // Mesmo padrao de contraste do EvolutionDisconnectBanner: branco sobre
      // `bg-destructive` do tema padrao da 3.78:1 (reprovado no WCAG AA);
      // `bg-red-700` da 6.47:1 (medidos no navegador, E100-2).
      className="pointer-events-auto flex items-center gap-3 rounded-lg bg-red-700 px-4 py-2.5 text-white shadow-lg"
    >
      <ServerCrash className="w-5 h-5 shrink-0 motion-safe:animate-pulse" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold">Servidor indisponível, tentando reconectar…</span>{' '}
        <span className="text-xs">Os dados podem não atualizar enquanto isso.</span>
      </div>
      <button
        type="button"
        data-testid="backend-status-retry"
        onClick={() => {
          void checkNow();
        }}
        disabled={checking}
        className="flex shrink-0 items-center gap-1.5 rounded-md bg-white px-3 py-1 text-xs font-medium text-red-800 transition-colors hover:bg-red-100 disabled:opacity-50"
      >
        <RefreshCw className={cn('w-3 h-3', checking && 'animate-spin')} aria-hidden="true" />
        Tentar agora
      </button>
    </div>
  );
}

interface GlobalConnectionBannersProps {
  onOpenConnections?: () => void;
}

/**
 * Empilha as duas faixas no rodape, ACIMA dos outros avisos globais
 * (`EvolutionDisconnectBanner` em `bottom-24 z-[90]`, `MfaAdminNudge` em
 * `z-[80]`, `ConnectionToast` em `z-50`): `bottom-40` deixa o conjunto novo
 * fora da area deles e o wrapper `pointer-events-none` nao engole clique
 * nenhum fora do proprio aviso (licao do SL-076).
 */
export function GlobalConnectionBanners({ onOpenConnections }: GlobalConnectionBannersProps) {
  return (
    <div className="pointer-events-none fixed bottom-40 left-0 right-0 z-[95] mx-auto flex w-[min(28rem,calc(100%_-_2rem))] flex-col gap-2">
      <BackendStatusBanner />
      <DegradedConnectionsBanner onOpenConnections={onOpenConnections} />
    </div>
  );
}
