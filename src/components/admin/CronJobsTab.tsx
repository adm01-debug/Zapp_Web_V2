import { useState } from 'react';
import { AlertCircle, CalendarClock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTarefasAgendadas, type TarefaAgendada } from './useTarefasAgendadas';

// `pt-BR` com formatador único (nada de data "na mão"): a última execução vem do
// banco em ISO/UTC e é o navegador que converte para o fuso do operador.
const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatarExecucao(iso: string | null): string {
  if (!iso) return 'Nunca executada';
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? 'Data indisponível' : formatadorDataHora.format(data);
}

// Os status são os do pg_cron (`cron.job_run_details.status`). Um valor fora
// desta lista nunca é ecoado cru: cai no rótulo neutro.
const STATUS: Record<string, { texto: string; variante: BadgeProps['variant'] }> = {
  succeeded: { texto: 'Sucesso', variante: 'success' },
  failed: { texto: 'Falha', variante: 'destructive' },
  running: { texto: 'Em execução', variante: 'info' },
  starting: { texto: 'Iniciando', variante: 'info' },
};

function rotuloResultado(tarefa: TarefaAgendada) {
  const status = tarefa.last_status;
  if (!status) return { texto: 'Sem execução', variante: 'subtle' as const };
  return STATUS[status] ?? { texto: 'Desconhecido', variante: 'subtle' as const };
}

export function CronJobsTab() {
  const { tarefas, carregando, erro, alterando, recarregar, alternar } = useTarefasAgendadas();
  const [confirmacao, setConfirmacao] = useState<TarefaAgendada | null>(null);

  const confirmar = async () => {
    const alvo = confirmacao;
    if (!alvo) return;
    setConfirmacao(null);
    await alternar(alvo.jobname, !alvo.active);
  };

  if (carregando) {
    return (
      <div role="status" aria-live="polite" className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
        <p>Carregando tarefas agendadas…</p>
      </div>
    );
  }

  if (erro) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertCircle className="w-8 h-8 text-destructive" aria-hidden="true" />
          <p role="alert" className="text-foreground">{erro}</p>
          <Button variant="outline" onClick={() => void recarregar()}>
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" /> Tentar de novo
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="w-5 h-5 text-primary" aria-hidden="true" /> Tarefas agendadas
          </CardTitle>
          <p className="text-sm text-muted-foreground">Agendadores do banco que a aplicação usa. Pausar um deles interrompe a rotina até ser reativado.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void recarregar()} disabled={alterando !== null}>
          <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" /> Atualizar
        </Button>
      </CardHeader>
      <CardContent>
        {tarefas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <CalendarClock className="w-8 h-8" aria-hidden="true" />
            <p>Nenhuma tarefa agendada encontrada.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-0">Nome</TableHead>
                <TableHead>Agenda</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Última execução</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead className="w-[1%] text-right">Pausar/ativar</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tarefas.map((tarefa) => {
                const resultado = rotuloResultado(tarefa);
                const emAlteracao = alterando === tarefa.jobname;
                return (
                  <TableRow key={tarefa.jobname}>
                    <TableCell className="font-medium min-w-0 break-words">{tarefa.jobname}</TableCell>
                    <TableCell className="font-mono text-xs">{tarefa.schedule}</TableCell>
                    <TableCell>
                      {tarefa.active ? (
                        <Badge variant="success">Ativo</Badge>
                      ) : (
                        <Badge variant="warning">Pausado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatarExecucao(tarefa.last_run_at)}</TableCell>
                    <TableCell className="max-w-[22rem]">
                      <Badge variant={resultado.variante}>{resultado.texto}</Badge>
                      {tarefa.last_return_message && (
                        <span className="block text-xs text-muted-foreground line-clamp-2 mt-1" title={tarefa.last_return_message}>
                          {tarefa.last_return_message}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={tarefa.active}
                        disabled={alterando !== null}
                        aria-label={tarefa.active ? `Pausar a tarefa ${tarefa.jobname}` : `Ativar a tarefa ${tarefa.jobname}`}
                        onCheckedChange={() => setConfirmacao(tarefa)}
                      />
                      {emAlteracao && <span className="sr-only" role="status">Alterando {tarefa.jobname}…</span>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <AlertDialog open={confirmacao !== null} onOpenChange={(aberto) => { if (!aberto) setConfirmacao(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmacao?.active ? 'Pausar tarefa' : 'Ativar tarefa'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmacao?.active
                ? `A tarefa "${confirmacao?.jobname}" deixa de rodar na agenda até ser ativada de novo.`
                : `A tarefa "${confirmacao?.jobname}" volta a rodar na agenda definida.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmar()}>
              {confirmacao?.active ? 'Pausar' : 'Ativar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
