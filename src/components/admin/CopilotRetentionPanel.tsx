import { useState } from 'react';
import { AlertTriangle, BarChart3, Gauge, RefreshCw, RotateCcw, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  JANELAS_DIAS,
  useCopilotRetention,
  type JanelaDias,
} from '@/hooks/copilot/useCopilotRetention';

const numero = new Intl.NumberFormat('pt-BR');

function formatarDia(dia: string): string {
  const [ano, mes, d] = dia.split('-');
  if (!ano || !mes || !d) return dia;
  return `${d}/${mes}`;
}

function formatarTemperatura(valor: number | null): string {
  if (valor === null) return '—';
  return valor.toFixed(1);
}

interface CopilotRetentionPanelProps {
  /** Janela inicial em dias; a tela permite trocar entre 7, 14 e 30. */
  diasIniciais?: JanelaDias;
}

export function CopilotRetentionPanel({ diasIniciais = 14 }: CopilotRetentionPanelProps) {
  const [dias, setDias] = useState<JanelaDias>(diasIniciais);
  const {
    resumo,
    porAtendente,
    porDia,
    desde,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    recalcular,
  } = useCopilotRetention(dias);

  const executarRecalculo = () => {
    recalcular.mutate(undefined, {
      onSuccess: (diasRecalculados) => {
        toast.success(
          `Retenção recalculada: ${numero.format(diasRecalculados)} dia(s) a partir das sessões do copiloto.`,
        );
      },
      onError: (falha: unknown) => {
        toast.error(
          falha instanceof Error
            ? falha.message
            : 'Não foi possível recalcular a retenção do copiloto.',
        );
      },
    });
  };

  return (
    <Card data-testid="retencao-copiloto">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Gauge className="h-5 w-5" aria-hidden />
              Retenção do copiloto
            </CardTitle>
            <CardDescription>
              Quantas sessões do copiloto RADAR cada atendente abriu, quantos ticks foram processados e
              quantos insights nasceram — agregado diário a partir de {formatarDia(desde)}.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1" role="group" aria-label="Janela de dias">
              {JANELAS_DIAS.map((opcao) => (
                <Button
                  key={opcao}
                  size="sm"
                  variant={dias === opcao ? 'default' : 'outline'}
                  aria-pressed={dias === opcao}
                  onClick={() => setDias(opcao)}
                  data-testid={`retencao-janela-${opcao}`}
                >
                  {opcao}d
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
              data-testid="retencao-atualizar"
            >
              <RefreshCw className={isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden />
              Atualizar
            </Button>
            <Button
              size="sm"
              onClick={executarRecalculo}
              disabled={recalcular.isPending}
              data-testid="retencao-recalcular"
            >
              <RotateCcw
                className={recalcular.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                aria-hidden
              />
              Recalcular
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground" data-testid="retencao-carregando">
            Carregando a retenção do copiloto…
          </p>
        ) : isError ? (
          <Alert variant="destructive" data-testid="retencao-erro">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            <AlertTitle>Não foi possível ler a retenção</AlertTitle>
            <AlertDescription>
              {error instanceof Error ? error.message : 'Erro desconhecido ao consultar o agregado.'}
            </AlertDescription>
          </Alert>
        ) : porAtendente.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="retencao-vazio">
            Nenhum agregado nos últimos {dias} dias. Use “Recalcular” para reconstruir a janela a partir
            das sessões registradas.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="retencao-resumo">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Atendentes com sessão</p>
                <p className="text-lg font-semibold" data-testid="retencao-total-atendentes">
                  {numero.format(resumo.atendentes)}
                </p>
                <p className="text-xs text-muted-foreground">{resumo.diasComDados} dia(s) com dados</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Sessões abertas</p>
                <p className="text-lg font-semibold" data-testid="retencao-total-sessoes">
                  {numero.format(resumo.sessoes)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {resumo.brindes} com brinde completo
                </p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ticks processados</p>
                <p className="text-lg font-semibold" data-testid="retencao-total-ticks">
                  {numero.format(resumo.ticks)}
                </p>
                <p className="text-xs text-muted-foreground">apenas execuções bem-sucedidas</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Insights gerados</p>
                <p className="text-lg font-semibold" data-testid="retencao-total-insights">
                  {numero.format(resumo.insights)}
                </p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  temperatura média {formatarTemperatura(resumo.temperaturaMedia)}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="retencao-por-atendente">
                <caption className="sr-only">
                  Retenção do copiloto por atendente nos últimos {dias} dias
                </caption>
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="py-2 pr-3">Atendente</th>
                    <th scope="col" className="py-2 pr-3">Sessões</th>
                    <th scope="col" className="py-2 pr-3">Ticks</th>
                    <th scope="col" className="py-2 pr-3">Insights</th>
                    <th scope="col" className="py-2 pr-3">Brindes</th>
                    <th scope="col" className="py-2 pr-3">Temp. média</th>
                    <th scope="col" className="py-2">Dias</th>
                  </tr>
                </thead>
                <tbody>
                  {porAtendente.map((linha) => (
                    <tr key={linha.profileId} className="border-t" data-testid="retencao-linha-atendente">
                      <td className="py-2 pr-3 font-medium">{linha.atendente}</td>
                      <td className="py-2 pr-3">{numero.format(linha.sessoes)}</td>
                      <td className="py-2 pr-3">{numero.format(linha.ticks)}</td>
                      <td className="py-2 pr-3">{numero.format(linha.insights)}</td>
                      <td className="py-2 pr-3">{numero.format(linha.brindes)}</td>
                      <td className="py-2 pr-3">{formatarTemperatura(linha.temperaturaMedia)}</td>
                      <td className="py-2">{linha.diasComDados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
                <BarChart3 className="h-4 w-4" aria-hidden />
                Últimos dias
              </h3>
              <ul className="space-y-1 text-sm" data-testid="retencao-por-dia">
                {porDia.map((linha) => (
                  <li key={linha.dia} className="flex flex-wrap gap-x-4 border-b py-1 last:border-b-0">
                    <span className="w-14 font-medium">{formatarDia(linha.dia)}</span>
                    <span>{numero.format(linha.sessoes)} sessões</span>
                    <span>{numero.format(linha.ticks)} ticks</span>
                    <span>{numero.format(linha.insights)} insights</span>
                    <span className="text-muted-foreground">
                      {linha.atendentes} atendente(s)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
