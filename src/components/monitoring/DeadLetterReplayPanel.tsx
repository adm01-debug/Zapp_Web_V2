/**
 * DeadLetterReplayPanel ? a fila dos eventos de webhook que NAO foram processados.
 *
 * Por que existe: quando o `ingest_inbound_message` falha, o `evolution-webhook`
 * grava o evento em `webhook_failures` e responde 5xx. Se o provedor desistir do
 * reenvio, a edge `webhook-replay` e o caminho de volta ? mas so existia a acao,
 * nao a JANELA: `webhook_failures` e service_role-only (payload truncado com PII)
 * e a funcao devolve apenas contadores depois de agir. O admin apertava o botao
 * sem saber o tamanho da fila nem o que havia nela.
 *
 * Como o dado chega: RPC `webhook_dead_letter_fila` (SECURITY DEFINER, guarda
 * `is_admin_or_supervisor` no WHERE, sem payload/PII) ? migration
 * `20261127180000_dead_letter_fila_rpc.sql`. A acao continua sendo a mesma edge
 * admin-only: este painel nao reprocessa nada por conta propria.
 *
 * Fica na tela de Monitor Evolution, logo abaixo do painel de webhook.
 */
import { AlertTriangle, Inbox, Loader2, RefreshCw, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDeadLetterReplay } from './hooks/useDeadLetterReplay';

function formatarQuando(iso: string): string {
  const quando = new Date(iso);
  return Number.isNaN(quando.getTime()) ? iso : quando.toLocaleString('pt-BR');
}

export function DeadLetterReplayPanel() {
  const { itens, total, carregando, erro, erroAcao, reprocessando, resultado, carregar, reprocessar } =
    useDeadLetterReplay();
  const prontos = itens.filter((item) => item.tem_payload).length;

  const aoReprocessar = async () => {
    const resposta = await reprocessar();
    if (resposta) {
      toast.success(`Fila reprocessada: ${resposta.resolvidos} resolvido(s), ${resposta.falhas} ainda falhando`);
    } else {
      toast.error('Nao foi possivel reprocessar a fila');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <RotateCcw className="w-4 h-4" />Fila da dead-letter
        </CardTitle>
        <CardDescription>
          Eventos de webhook que falharam e ficaram na fila. Reprocessar chama a mesma RPC do webhook ? o
          `ux_messages_dedup` impede mensagem duplicada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {carregando && (
          <p className="text-sm text-muted-foreground" role="status">
            Carregando a fila...
          </p>
        )}

        {!carregando && erro && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-destructive/10 p-3" role="alert">
            <span className="text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              Nao foi possivel ler a fila ({erro}).
            </span>
            <Button size="sm" variant="outline" onClick={() => void carregar()}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />Tentar de novo
            </Button>
          </div>
        )}

        {!carregando && !erro && itens.length === 0 && (
          <EmptyState
            icon={Inbox}
            title="Nenhum evento na fila"
            description="Todos os webhooks recebidos foram processados."
            actionLabel="Atualizar"
            onAction={() => void carregar()}
          />
        )}

        {!carregando && !erro && itens.length > 0 && (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evento</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Tentativas</TableHead>
                    <TableHead>Falhou em</TableHead>
                    <TableHead>Replay</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">{item.external_id ?? '-'}</TableCell>
                      <TableCell className="text-xs">{item.event_type ?? '-'}</TableCell>
                      <TableCell className="text-xs">{item.retry_count}</TableCell>
                      <TableCell className="text-xs">{formatarQuando(item.error_at)}</TableCell>
                      <TableCell>
                        {item.tem_payload ? (
                          <Badge variant="outline">pronto</Badge>
                        ) : (
                          <Badge variant="destructive">sem payload</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {total} evento{total === 1 ? '' : 's'} na fila
              {total > itens.length ? ` - mostrando os ${itens.length} mais antigos` : ''}.
              {prontos < itens.length
                ? ` ${itens.length - prontos} sem payload de replay: precisam de conferencia manual.`
                : ''}
            </p>
          </>
        )}

        {erroAcao && !carregando && (
          <p className="text-xs text-destructive" role="alert">
            Falha ao reprocessar ({erroAcao}).
          </p>
        )}

        {resultado && !carregando && (
          <p className="text-xs" role="status">
            Lidos {resultado.lidas}: {resultado.reprocessados} reprocessados, {resultado.resolvidos} resolvidos,{' '}
            {resultado.falhas} falharam de novo, {resultado.ignorados} ignorados por payload incompleto.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => void carregar()} disabled={carregando || reprocessando}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />Atualizar
          </Button>
          <Button size="sm" onClick={() => void aoReprocessar()} disabled={reprocessando || carregando || prontos === 0}>
            {reprocessando ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
            )}
            {reprocessando ? 'Reprocessando...' : prontos > 0 ? `Reprocessar (${prontos})` : 'Reprocessar'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
