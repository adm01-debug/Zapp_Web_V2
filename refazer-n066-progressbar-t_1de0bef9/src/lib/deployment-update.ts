import { getLogger } from '@/lib/logger';
import { haBloqueioRecarga, observarBloqueiosRecarga } from '@/lib/reload-blockers';

declare const __ZAPP_BUILD_ID__: string;

const log = getLogger('DeploymentUpdate');
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
let updateAlreadyAnnounced = false;
let recarregar: () => void = () => window.location.reload();
/** Uma versao nova foi detectada e espera o momento seguro (aba oculta E sem bloqueio) para recarregar. */
let recargaPendente = false;
/** Cancelamento da observacao dos bloqueios, armada enquanto existe recarga pendente. */
let pararObservadorBloqueios: (() => void) | null = null;

export type AcaoNaAtualizacao = 'recarregar-agora' | 'avisar-e-recarregar-ao-esconder';

/**
 * Decide o que fazer quando o servidor anuncia um build diferente do que esta rodando.
 *
 * **Aba escondida:** recarregar agora nao interrompe ninguem (o usuario esta noutra aba) e e o
 * unico jeito de a aba parar de servir um bundle que a producao ja apagou. Medido em 03/10: sete
 * chunks lazy em 404 na MESMA sessao (`useQueues`, `useMFA`, `TransferDialog`,
 * `CloseConversationDialog`, `HotRoutePrefetcher`, `EvolutionDisconnectBanner`,
 * `external-crm.service`) enquanto o chunk da Journey respondia 200 — o HTML carregado era de um
 * build anterior ao redeploy. Antes desta correcao o usuario ficava com a aba quebrada ate
 * apertar F5 por conta propria.
 *
 * **Aba visivel:** avisar (o toast de "Atualizar agora" continua) e recarregar no primeiro
 * instante em que a aba for escondida — quem esta escrevendo uma mensagem nao perde o texto.
 *
 * A visibilidade e so metade da regra: o monitor tambem exige que `haBloqueioRecarga()` seja falso
 * (edicao de mensagem ou sessao critica em andamento). `decidirAcaoNaAtualizacao` responde apenas
 * pela visibilidade; quem combina as duas condicoes e o proprio monitor.
 */
export function decidirAcaoNaAtualizacao(visibilidade: DocumentVisibilityState): AcaoNaAtualizacao {
  return visibilidade === 'hidden' ? 'recarregar-agora' : 'avisar-e-recarregar-ao-esconder';
}

function desarmarObservadorBloqueios() {
  pararObservadorBloqueios?.();
  pararObservadorBloqueios = null;
}

/** Recarrega uma unica vez e desarma o que esperava o momento seguro (listener e observador). */
function concluirRecargaPendente() {
  if (!recargaPendente) return;
  recargaPendente = false;
  desarmarObservadorBloqueios();
  document.removeEventListener('visibilitychange', aoEsconder);
  recarregar();
}

function aoEsconder() {
  if (document.visibilityState !== 'hidden') return;
  // Trabalho ativo em andamento: a recarga fica pendente e volta a ser avaliada quando ele terminar.
  if (haBloqueioRecarga()) return;
  concluirRecargaPendente();
}

/** O observador so avisa na transicao agregada bloqueado -> livre, ou seja, quando o ULTIMO bloqueio termina. */
function aoTransicionarBloqueios(bloqueado: boolean) {
  if (bloqueado || document.visibilityState !== 'hidden') return;
  concluirRecargaPendente();
}

async function checkForDeploymentUpdate() {
  // A checagem NAO e mais restrita a aba visivel: e justamente com a aba escondida que ela
  // permite recarregar em silencio (ver decidirAcaoNaAtualizacao). Uma requisicao a cada
  // CHECK_INTERVAL_MS nao e trafego relevante.
  if (updateAlreadyAnnounced) return;
  try {
    const response = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return;
    const payload = await response.json() as { buildId?: string };
    if (!payload.buildId || payload.buildId === __ZAPP_BUILD_ID__) return;

    updateAlreadyAnnounced = true;

    // Recarga automatica so quando ninguem esta olhando E nao ha trabalho em andamento.
    if (decidirAcaoNaAtualizacao(document.visibilityState) === 'recarregar-agora' && !haBloqueioRecarga()) {
      recarregar();
      return;
    }

    // Adiado: a versao nova fica PENDENTE. Avisa (o toast de "Atualizar agora" continua imediato),
    // observa a visibilidade e o registro de bloqueios e recarrega sozinha no primeiro instante
    // seguro — inclusive quando o ultimo bloqueio termina com a aba ja oculta.
    recargaPendente = true;
    document.addEventListener('visibilitychange', aoEsconder);
    desarmarObservadorBloqueios();
    pararObservadorBloqueios = observarBloqueiosRecarga(aoTransicionarBloqueios);

    const { toast } = await import('sonner');
    toast.info('Uma nova versão do Zapp está disponível', {
      description: 'Atualize para evitar usar conexões ou URLs temporárias de uma versão antiga.',
      duration: Infinity,
      action: {
        label: 'Atualizar agora',
        onClick: () => window.location.reload(),
      },
    });
  } catch (error) {
    log.debug('Deployment version check unavailable', error);
  }
}

export function startDeploymentUpdateMonitor(opcoes: { recarregar?: () => void } = {}) {
  recarregar = opcoes.recarregar ?? (() => window.location.reload());
  const interval = window.setInterval(() => { void checkForDeploymentUpdate(); }, CHECK_INTERVAL_MS);
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') void checkForDeploymentUpdate();
  };
  document.addEventListener('visibilitychange', handleVisibility);
  const timeout = window.setTimeout(() => { void checkForDeploymentUpdate(); }, 30_000);

  return () => {
    window.clearInterval(interval);
    window.clearTimeout(timeout); // o timer inicial tambem precisa morrer, senao dispara depois do teardown
    document.removeEventListener('visibilitychange', handleVisibility);
    document.removeEventListener('visibilitychange', aoEsconder);
    desarmarObservadorBloqueios();
    recargaPendente = false;
    updateAlreadyAnnounced = false;
  };
}

export const APP_BUILD_ID = __ZAPP_BUILD_ID__;
