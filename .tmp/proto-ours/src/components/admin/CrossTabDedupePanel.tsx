/**
 * CrossTabDedupePanel — a janela para o dedupe entre abas (V2).
 *
 * O problema real: o mesmo agente com o Zapp aberto em duas abas manda a mesma
 * mensagem em cada aba. `src/lib/crossTabSendDedupe.ts` resolve isso — as duas
 * abas publicam a própria reivindicação no canal `zapp-send-dedupe`, uma vence
 * e só ela chama o servidor; a outra adota o `clientMessageId` da dona
 * (`src/services/outbound-message.service.ts`, `claim`/`release`). Não existia
 * onde OLHAR isso acontecer. Este painel é essa janela, na tela de
 * Monitor Evolution (admin-only), ao lado do painel de webhook.
 *
 * Como o dado chega: o dedupe da V2 é um módulo puro, sem métrica e sem log.
 * O painel então ESCUTA o mesmo canal e mostra as reivindicações que chegaram
 * de outras abas — o `BroadcastChannel` não devolve a mensagem para quem a
 * publicou, então o que aparece aqui é sempre o pedido de outra aba. Duas
 * reivindicações para a mesma ação dentro da janela do dedupe são exatamente o
 * caso que o envio duplicado produziria.
 *
 * Sem PII: a chave da ação é `JSON.stringify([contato, tipo, conteúdo, ...])`
 * (`actionKey` em `src/services/outbound-message.service.ts`), ou seja carrega
 * contato e conteúdo da mensagem. Por isso esta tela NÃO mostra a chave:
 * agrupa por chave e exibe um rótulo anônimo e estável ("Ação #1"), a contagem
 * e o horário da última reivindicação.
 *
 * O painel só lê o canal: nunca publica, então não interfere no dedupe real.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Layers } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SEND_DEDUPE_CHANNEL_NAME, SEND_DEDUPE_WINDOW_MS } from '@/lib/crossTabSendDedupe';
import {
  MAX_ACOES_DISPUTADAS,
  ehReivindicacaoRival,
  rotular,
  type AcaoDisputada,
} from '@/components/admin/dedupeEntreAbas';

function formatarHora(ms: number): string {
  return new Date(ms).toLocaleTimeString('pt-BR');
}

export function CrossTabDedupePanel() {
  const suportado = useMemo(() => typeof globalThis.BroadcastChannel === 'function', []);
  const [acoes, setAcoes] = useState<AcaoDisputada[]>([]);
  const rotulos = useRef(new Map<string, string>());
  const proximo = useRef(0);

  useEffect(() => {
    if (!suportado) return;

    let canal: BroadcastChannel;
    try {
      canal = new BroadcastChannel(SEND_DEDUPE_CHANNEL_NAME);
    } catch {
      // Navegador sem canal (aba privada, contexto isolado): o dedupe degrada
      // sozinho e o painel não tem o que observar.
      return;
    }

    canal.onmessage = (evento: MessageEvent) => {
      if (!ehReivindicacaoRival(evento.data)) return;

      const rotulo = rotular(evento.data.key, rotulos.current, proximo);
      const agora = Date.now();
      setAcoes((anteriores) => {
        const existente = anteriores.find((acao) => acao.rotulo === rotulo);
        const linha: AcaoDisputada = existente
          ? { rotulo, reivindicacoes: existente.reivindicacoes + 1, ultimaEm: agora }
          : { rotulo, reivindicacoes: 1, ultimaEm: agora };
        return [linha, ...anteriores.filter((acao) => acao.rotulo !== rotulo)].slice(0, MAX_ACOES_DISPUTADAS);
      });
    };

    return () => {
      canal.onmessage = null;
      canal.close();
    };
  }, [suportado]);

  const limpar = () => {
    rotulos.current.clear();
    proximo.current = 0;
    setAcoes([]);
  };

  const totalReivindicacoes = acoes.reduce((soma, acao) => soma + acao.reivindicacoes, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="w-4 h-4 text-primary" aria-hidden="true" />
              Dedupe entre abas
            </CardTitle>
            <CardDescription className="mt-1">
              Ações pedidas em mais de uma aba do mesmo navegador: só a aba dona chama o servidor e a
              outra adota o id da dona. Aqui aparecem as reivindicações que chegaram de outras abas
              (canal <code className="font-mono text-xs">{SEND_DEDUPE_CHANNEL_NAME}</code>, janela de{' '}
              {SEND_DEDUPE_WINDOW_MS / 1000} s).
            </CardDescription>
          </div>
          {acoes.length > 0 && (
            <Button variant="outline" size="sm" onClick={limpar}>
              Limpar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!suportado ? (
          <p className="text-sm text-muted-foreground">
            Este navegador não expõe <code className="font-mono text-xs">BroadcastChannel</code>: o dedupe entre abas
            roda em modo aba única e não há atividade para exibir.
          </p>
        ) : acoes.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="Nenhuma disputa entre abas vista"
            description="Quando a mesma ação for reivindicada em outra aba deste navegador, ela aparece aqui."
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" data-testid="dedupe-acoes">
                Ações em disputa: {acoes.length}
              </Badge>
              <Badge variant="outline" data-testid="dedupe-reivindicacoes">
                Reivindicações de outra aba: {totalReivindicacoes}
              </Badge>
            </div>

            <div className="rounded-md border">
              <Table aria-label="Ações reivindicadas por outra aba">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ação</TableHead>
                    <TableHead>Reivindicações de outra aba</TableHead>
                    <TableHead>Última vez</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {acoes.map((acao) => (
                    <TableRow key={acao.rotulo} data-testid="dedupe-linha">
                      <TableCell className="font-mono text-xs">{acao.rotulo}</TableCell>
                      <TableCell data-testid="dedupe-contagem" className="text-sm">
                        {acao.reivindicacoes}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatarHora(acao.ultimaEm)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground">
              A tela mostra "Ação #n" no lugar da chave real: a chave do dedupe carrega contato e conteúdo da
              mensagem, e esta tela não expõe conversa.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
