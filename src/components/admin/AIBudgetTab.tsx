import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  JANELAS_ORCAMENTO,
  desvioEstimativa,
  formatarTokensCompacto,
  rotuloStatus,
  taxaDevolucao,
  useAIBudgetSummary,
} from '@/hooks/analytics/useAIBudgetSummary';

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--popover-foreground))',
};

export function AIBudgetTab() {
  const [dias, setDias] = useState<number>(30);
  const { data, isLoading, isError, error, refetch, isFetching } = useAIBudgetSummary(dias);

  const janela = data?.janela;
  const devolucao = janela ? taxaDevolucao(janela.devolvido, janela.reservado) : null;
  const desvio = janela ? desvioEstimativa(janela.consumido, janela.reservado) : null;

  const seletor = (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Janela do orçamento de IA">
      {JANELAS_ORCAMENTO.map(opcao => (
        <Button
          key={opcao}
          size="sm"
          variant={dias === opcao ? 'default' : 'outline'}
          onClick={() => setDias(opcao)}
          data-testid={`orcamento-dias-${opcao}`}
          aria-pressed={dias === opcao}
        >
          {opcao} dias
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isFetching} data-testid="orcamento-atualizar">
        {isFetching ? 'Atualizando…' : 'Atualizar'}
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <Card data-testid="orcamento-carregando">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Orçamento de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {seletor}
          <p className="text-sm text-muted-foreground">Carregando o ledger de reservas de IA…</p>
        </CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card data-testid="orcamento-erro">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Orçamento de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {seletor}
          <p className="text-sm text-destructive" role="alert">
            O resumo do orçamento não pôde ser carregado: {error instanceof Error ? error.message : 'erro desconhecido'}.
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Tentar novamente</Button>
        </CardContent>
      </Card>
    );
  }

  if (!janela || janela.execucoes === 0) {
    return (
      <Card data-testid="orcamento-vazio">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Orçamento de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {seletor}
          <p className="text-sm text-muted-foreground">Nenhuma reserva de orçamento registrada nos últimos {dias} dias.</p>
        </CardContent>
      </Card>
    );
  }

  const kpis = [
    { rotulo: 'Execuções com reserva', valor: janela.execucoes.toLocaleString('pt-BR') },
    { rotulo: 'Tokens reservados', valor: formatarTokensCompacto(janela.reservado) },
    { rotulo: 'Tokens consumidos', valor: formatarTokensCompacto(janela.consumido) },
    { rotulo: 'Devolvidos sem uso', valor: devolucao === null ? '—' : `${devolucao.toFixed(1)}%` },
    { rotulo: 'Usuários', valor: janela.usuarios.toLocaleString('pt-BR') },
  ];

  return (
    <div className="space-y-4" data-testid="orcamento-conteudo">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Orçamento de IA</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {seletor}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {kpis.map(item => (
              <div key={item.rotulo} className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">{item.rotulo}</p>
                <p className="text-lg font-semibold text-foreground">{item.valor}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Reservado é a estimativa prometida a cada chamada; consumido é o gasto real registrado no fechamento.
            {desvio !== null && (
              <> Nesta janela o consumo ficou {(desvio >= 0 ? 'acima' : 'abaixo')} da estimativa em {Math.abs(desvio).toFixed(1)}%.</>
            )}
          </p>
          {janela.travadas > 0 && (
            <p className="text-xs text-destructive" role="alert" data-testid="orcamento-travadas">
              {janela.travadas} reserva(s) passaram do prazo sem fechamento — o reconcilio do orçamento precisa ser executado.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Reservado x consumido por dia</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="sr-only">
              {`Série diária do orçamento de IA em ${dias} dias: ${data.por_dia
                .map(dia => `${dia.dia} reservado ${dia.reservado} consumido ${dia.consumido}`)
                .join('; ')}.`}
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.por_dia}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="dia" fontSize={11} className="fill-muted-foreground" />
                <YAxis fontSize={11} className="fill-muted-foreground" tickFormatter={(v: number) => formatarTokensCompacto(v)} />
                <Tooltip
                  formatter={(v) => `${Number(v).toLocaleString('pt-BR')} tokens`}
                  contentStyle={tooltipStyle}
                />
                <Legend />
                <Bar dataKey="reservado" name="Reservado" fill="hsl(var(--muted-foreground))" radius={[2, 2, 0, 0]} />
                <Bar dataKey="consumido" name="Consumido" fill="hsl(var(--primary))" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribuição por situação</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {data.por_status.map(item => (
                <li key={item.status} className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">{rotuloStatus(item.status)}</span>
                  <span className="font-medium text-foreground">
                    {item.execucoes.toLocaleString('pt-BR')}
                    <span className="text-xs text-muted-foreground ml-1">({formatarTokensCompacto(item.consumido)})</span>
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Orçamento por função de IA</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm" aria-label="Orçamento de IA por função" data-testid="orcamento-tabela">
              <thead>
                <tr className="border-b bg-muted/40 text-muted-foreground">
                  <th scope="col" className="text-left px-3 py-2 font-medium">Função</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium">Execuções</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium">Reservado</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium">Consumido</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium">Desvio</th>
                  <th scope="col" className="text-right px-3 py-2 font-medium">Devolvidas</th>
                </tr>
              </thead>
              <tbody>
                {data.por_funcao.map(item => {
                  const desvioFuncao = desvioEstimativa(item.consumido, item.reservado);
                  return (
                    <tr key={item.function_name} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium text-foreground">{item.function_name}</td>
                      <td className="px-3 py-2 text-right">{item.execucoes.toLocaleString('pt-BR')}</td>
                      <td className="px-3 py-2 text-right">{formatarTokensCompacto(item.reservado)}</td>
                      <td className="px-3 py-2 text-right">{formatarTokensCompacto(item.consumido)}</td>
                      <td className="px-3 py-2 text-right">
                        {desvioFuncao === null ? '—' : `${desvioFuncao >= 0 ? '+' : ''}${desvioFuncao.toFixed(1)}%`}
                      </td>
                      <td className="px-3 py-2 text-right">{item.devolvidas.toLocaleString('pt-BR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
