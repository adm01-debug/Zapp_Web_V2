import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fromTable } from '@/lib/supabaseHelpers';
import { useVisiblePolling } from '@/hooks/realtime/useVisiblePolling';
import { log } from '@/lib/logger';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

/**
 * Painel da aba Admin que lê a tabela `security_acl_alerts`, alimentada pela
 * varredura horária `public.score_security_acl()` (RLS: só admin lê).
 *
 * Atualização ao vivo: a tabela não está na publicação `supabase_realtime` e a
 * guarda `scripts/db-audit/check-realtime-subscriptions.mjs` recusa assinatura
 * `postgres_changes` em tabela fora do baseline canônico — um canal fixo aqui
 * seria morto e reprovaria a guarda. O painel então se atualiza sozinho:
 * `useVisiblePolling` reconsulta a cada 30 s só com a aba visível e online, e o
 * botão Atualizar força a releitura na hora.
 */

/** Tabela lida pelo painel (nome real no banco). */
export const ACL_ALERTS_TABLE = 'security_acl_alerts';

/** Teto de linhas do painel: um acúmulo de achados não pode travar a tela. */
export const ACL_ALERTS_LIMIT = 200;

/** Intervalo do refresh automático (aba visível e online). */
export const ACL_ALERTS_REFRESH_MS = 30_000;

/** Linha de `security_acl_alerts` usada pelo painel. */
export interface AclAlert {
  id: number | string;
  alert_type: string;
  object_name: string;
  role_name: string | null;
  privilege: string | null;
  severity: string | null;
  detected_at: string;
  resolved_at: string | null;
}

/** Nomes técnicos das varreduras (migration 20261013230008) em linguagem de tela. */
const ROTULO_TIPO: Record<string, string> = {
  SECDEF_ANON_EXECUTE: 'Função SECURITY DEFINER executável por anon',
  SECDEF_SEM_SEARCH_PATH: 'Função SECURITY DEFINER sem search_path fixo',
  TABELA_SEM_RLS: 'Tabela sem RLS',
  POLICY_ESCRITA_LIBERADA: 'Policy de escrita liberada',
  BUCKET_PUBLICO: 'Bucket de storage público',
};

function rotuloTipo(tipo: string): string {
  return ROTULO_TIPO[tipo] ?? tipo;
}

function rotuloSeveridade(severidade: string | null): string {
  const mapa: Record<string, string> = {
    CRITICAL: 'Crítico',
    HIGH: 'Alto',
    MEDIUM: 'Médio',
    LOW: 'Baixo',
  };
  return severidade ? (mapa[severidade] ?? severidade) : 'Sem severidade';
}

function variantSeveridade(severidade: string | null): 'destructive' | 'warning' | 'outline' {
  if (severidade === 'CRITICAL' || severidade === 'HIGH') return 'destructive';
  if (severidade === 'MEDIUM') return 'warning';
  return 'outline';
}

function dataHora(iso: string): string {
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

export function AclAlertsPanel() {
  const [alerts, setAlerts] = useState<AclAlert[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (signal?: AbortSignal): Promise<void> => {
    const { data, error } = await fromTable(ACL_ALERTS_TABLE)
      .select(
        'id, alert_type, object_name, role_name, privilege, severity, detected_at, resolved_at',
      )
      // Abertas primeiro (resolved_at nulo), mais recentes dentro de cada grupo.
      .order('resolved_at', { ascending: true, nullsFirst: true })
      .order('detected_at', { ascending: false })
      .limit(ACL_ALERTS_LIMIT);

    if (signal?.aborted) return;

    if (error) {
      log.error('Falha ao ler alertas de ACL/RLS', error.message ?? error);
      setErro('Não foi possível carregar os alertas de regressão de permissão.');
    } else {
      setAlerts((data ?? []) as AclAlert[]);
      setErro(null);
    }
    setCarregando(false);
  }, []);

  useVisiblePolling(carregar, ACL_ALERTS_REFRESH_MS);

  const atualizar = useCallback(async () => {
    setAtualizando(true);
    try {
      await carregar();
    } finally {
      setAtualizando(false);
    }
  }, [carregar]);

  const abertas = useMemo(() => alerts.filter((a) => !a.resolved_at).length, [alerts]);
  const resolvidas = alerts.length - abertas;

  const resumo = carregando
    ? 'Carregando…'
    : `${abertas} aberta(s) · ${resolvidas} resolvida(s)`;

  return (
    <section aria-label="Regressões de permissão" aria-busy={carregando} className="min-w-0">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" aria-hidden="true" />
                Regressões de permissão (ACL/RLS)
              </CardTitle>
              <CardDescription>
                Varredura horária de funções, tabelas, policies e buckets que abriram acesso
                indevido. {resumo}
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void atualizar()}
              disabled={atualizando}
              aria-label="Atualizar alertas de permissão"
            >
              <RefreshCw
                className={cn('w-4 h-4', atualizando && 'motion-safe:animate-spin')}
                aria-hidden="true"
              />
              <span className="hidden sm:inline">Atualizar</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p role="status" className="text-sm text-muted-foreground">
              Carregando alertas de permissão…
            </p>
          ) : erro ? (
            <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 mt-0.5" aria-hidden="true" />
              <span>{erro}</span>
            </div>
          ) : alerts.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-border/60 p-3 text-sm text-muted-foreground">
              <ShieldCheck className="w-4 h-4 text-success" aria-hidden="true" />
              <span>Nenhuma regressão de permissão.</span>
            </div>
          ) : (
            <>
              <ul className="space-y-3">
                {alerts.map((alerta) => (
                  <li
                    key={alerta.id}
                    className={cn(
                      'rounded-lg border border-border/60 p-3 space-y-1',
                      alerta.resolved_at && 'opacity-60',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={variantSeveridade(alerta.severity)}>
                        {rotuloSeveridade(alerta.severity)}
                      </Badge>
                      <span className="text-sm font-medium">{rotuloTipo(alerta.alert_type)}</span>
                      <Badge variant={alerta.resolved_at ? 'subtle' : 'warning'}>
                        {alerta.resolved_at ? 'Resolvida' : 'Aberta'}
                      </Badge>
                    </div>
                    <p className="text-sm break-words">
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">
                        {alerta.object_name}
                      </code>
                      {alerta.role_name && (
                        <>
                          {' · papel '}
                          <strong>{alerta.role_name}</strong>
                        </>
                      )}
                      {alerta.privilege && (
                        <>
                          {' · privilégio '}
                          <strong>{alerta.privilege}</strong>
                        </>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Detectada{' '}
                      <time dateTime={alerta.detected_at} title={dataHora(alerta.detected_at)}>
                        {formatDistanceToNow(new Date(alerta.detected_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </time>
                      {alerta.resolved_at && ` · resolvida em ${dataHora(alerta.resolved_at)}`}
                    </p>
                  </li>
                ))}
              </ul>
              {alerts.length >= ACL_ALERTS_LIMIT && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Mostrando os {ACL_ALERTS_LIMIT} alertas mais recentes.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
