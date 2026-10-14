import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Users,
  Clock,
  MessageSquare,
  Siren,
  RefreshCw,
} from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  useCrisisRoomMetrics,
  CRISIS_THRESHOLDS,
  type CrisisMetricKey,
  type CrisisMetricReadout,
  type CrisisSeverity,
} from '@/hooks/business/useCrisisRoomMetrics';

/**
 * Sala de Crise — só a tela. A medição vive no hook `useCrisisRoomMetrics`
 * (RPC `crisis_room_snapshot`, agregado no banco, só admin/supervisor).
 *
 * O que esta tela garante (PF-02 / R2-AUTH-036):
 *   1. Falha NUNCA vira "Operação normal": em erro os cartões mostram "—" e o
 *      cabeçalho anuncia "Sem medição", com botão "Tentar de novo".
 *   2. A mudança de severidade é anunciada (cabeçalho `aria-live` + banner com
 *      `role="alert"`).
 *   3. Cada cartão mostra os DOIS limiares — atenção e crítico —, não só o de
 *      atenção como antes.
 *   4. O botão "Atualizar métricas" desabilita e marca `aria-busy` enquanto mede;
 *      o esqueleto aparece só na primeira carga, não a cada recarga.
 *   5. "Atualizado há X" diz quando o último agregado bom chegou.
 */

/** Texto de cada cartão quando não há medição (erro/primeira carga). */
const METRIC_TEXT: Record<CrisisMetricKey, { label: string; unit: string }> = {
  unanswered_messages: { label: 'Msgs sem resposta (1h)', unit: 'msgs' },
  queue_ratio: { label: 'Carga por agente', unit: 'conv/agente' },
  sla_breached: { label: 'SLA estourados', unit: 'conversas' },
  online_agents: { label: 'Agentes ativos', unit: 'online' },
};

const METRIC_ICONS: Record<CrisisMetricKey, typeof MessageSquare> = {
  unanswered_messages: MessageSquare,
  queue_ratio: Users,
  sla_breached: Clock,
  online_agents: Users,
};

/** Cartões sem medição — valor `null` (nunca zero) e severidade `unknown`. */
const PLACEHOLDER_METRICS: CrisisMetricReadout[] = (
  Object.keys(CRISIS_THRESHOLDS) as CrisisMetricKey[]
).map((key) => ({
  key,
  label: METRIC_TEXT[key].label,
  unit: METRIC_TEXT[key].unit,
  value: null,
  attention: CRISIS_THRESHOLDS[key].attention,
  critical: CRISIS_THRESHOLDS[key].critical,
  lowerIsWorse: CRISIS_THRESHOLDS[key].lowerIsWorse,
  severity: 'unknown',
}));

const SEVERITY_CONFIG: Record<
  CrisisSeverity,
  { bg: string; border: string; text: string; label: string }
> = {
  ok: { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success', label: 'Normal' },
  warning: { bg: 'bg-warning/10', border: 'border-warning/30', text: 'text-warning', label: 'Atenção' },
  critical: {
    bg: 'bg-destructive/10',
    border: 'border-destructive/30',
    text: 'text-destructive',
    label: 'Crítico',
  },
  // "Sem dado": nunca verde. O que não foi medido não pode parecer normal.
  unknown: {
    bg: 'bg-muted/40',
    border: 'border-border',
    text: 'text-muted-foreground',
    label: 'Sem dado',
  },
};

/** Sinal do limiar: em métrica de piso (agentes) MENOR é pior. */
function sinalLimiar(m: CrisisMetricReadout): string {
  return m.lowerIsWorse ? '<' : '>';
}

function textoAtualizadoHa(updatedAt: number, agora: number): string {
  if (!updatedAt) return 'Ainda sem medição';
  const segundos = Math.max(0, Math.round((agora - updatedAt) / 1000));
  if (segundos < 10) return 'Atualizado agora';
  if (segundos < 60) return `Atualizado há ${segundos} s`;
  return `Atualizado há ${Math.floor(segundos / 60)} min`;
}

/** Relógio de 30 s só para o "Atualizado há X" (a medição é do hook). */
function useAgora(): number {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return agora;
}

export function CrisisRoom() {
  const {
    metrics,
    isCrisis,
    isError,
    error,
    isFirstLoad,
    isRefreshing,
    dataUpdatedAt,
    refetch,
  } = useCrisisRoomMetrics();
  const agora = useAgora();
  const reduzirMovimento = useReducedMotion();

  // Nunca "normal" com dado ausente: sem medição (erro ou primeira carga) o selo
  // é neutro; só um agregado bom pode pintar verde.
  const status = isError
    ? { label: '⚠️ Sem medição', variant: 'destructive' as const, text: 'text-destructive' }
    : isFirstLoad
      ? { label: 'Medindo…', variant: 'outline' as const, text: 'text-muted-foreground' }
      : isCrisis === true
        ? { label: '🔴 MODO CRISE ATIVO', variant: 'destructive' as const, text: 'text-destructive' }
        : { label: '🟢 Operação normal', variant: 'outline' as const, text: 'text-success' };

  const cartoes = metrics ?? PLACEHOLDER_METRICS;
  const mostrarEsqueleto = isFirstLoad && !isError;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Siren
              className={`w-5 h-5 ${
                isCrisis === true ? 'text-destructive motion-safe:animate-pulse' : 'text-primary'
              }`}
            />
            Sala de Crise
          </h2>
          <p className="text-sm text-muted-foreground">Monitor em tempo real da operação</p>
        </div>
        {/* Região viva: anuncia a troca de severidade (normal ↔ crise ↔ sem medição). */}
        <div aria-live="polite" aria-atomic="true">
          <Badge variant={status.variant} className={`text-xs ${status.text}`}>
            {status.label}
          </Badge>
        </div>
      </div>

      {isError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 flex items-center justify-between gap-3"
        >
          <div>
            <p className="text-sm font-bold text-destructive">Não foi possível medir a operação</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error?.message ?? 'Falha ao ler o agregado da Sala de Crise.'}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={refetch}
            disabled={isRefreshing}
            aria-busy={isRefreshing}
            className="text-xs shrink-0"
          >
            Tentar de novo
          </Button>
        </div>
      )}

      {/* Banner de crise: `role="alert"` faz o leitor de tela anunciar na hora. */}
      {isCrisis === true && (
        <motion.div
          role="alert"
          initial={reduzirMovimento ? false : { opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-destructive/10 border border-destructive/30 text-center"
        >
          <AlertTriangle className="w-8 h-8 mx-auto text-destructive mb-2" />
          <p className="text-sm font-bold text-destructive">Operação em estado crítico!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Uma ou mais métricas excederam limites aceitáveis
          </p>
        </motion.div>
      )}

      {mostrarEsqueleto ? (
        // Esqueleto SÓ na primeira carga; recarga de fundo mantém os cartões.
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-muted/20 rounded-xl motion-safe:animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {cartoes.map((m, idx) => {
            const cfg = SEVERITY_CONFIG[m.severity];
            const Icon = METRIC_ICONS[m.key];
            const sinal = sinalLimiar(m);
            return (
              <motion.div
                key={m.key}
                initial={reduzirMovimento ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduzirMovimento ? 0 : idx * 0.1 }}
              >
                <Card className={`border ${cfg.border} ${cfg.bg}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Icon className={`w-5 h-5 ${cfg.text}`} />
                      <Badge variant="outline" className={`text-3xs ${cfg.text}`}>
                        {cfg.label}
                      </Badge>
                    </div>
                    <div>
                      <p className={`text-3xl font-bold ${cfg.text}`}>{m.value ?? '—'}</p>
                      <p className="text-3xs text-muted-foreground">{m.label}</p>
                    </div>
                    <div className="text-3xs text-muted-foreground space-y-0.5">
                      <div>
                        Atenção: {sinal} {m.attention} {m.unit}
                      </div>
                      <div>
                        Crítico: {sinal} {m.critical} {m.unit}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          onClick={refetch}
          disabled={isRefreshing}
          aria-busy={isRefreshing}
          className="text-xs"
        >
          <RefreshCw className={`w-3 h-3 mr-1 ${isRefreshing ? 'motion-safe:animate-spin' : ''}`} />
          Atualizar métricas
        </Button>
        <span className="text-3xs text-muted-foreground">
          {textoAtualizadoHa(dataUpdatedAt, agora)}
        </span>
      </div>
    </div>
  );
}
