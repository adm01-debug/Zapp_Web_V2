import { useCallback, useEffect, useState } from 'react';
import { PhoneCall, X, Save, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { formatClock } from '@/lib/calls/duration';
import { dispatchStartCall } from '@/lib/calls/events';
import { useCallSession } from '@/providers/CallSessionProvider';
import { useCalls } from '@/hooks/communication/useCalls';
import { useQueryClient } from '@tanstack/react-query';

/** Quanto tempo o resumo fica na tela antes de a sessao voltar para `idle`. */
export const POS_CHAMADA_MS = 3000;


/**
 * Resumo pos-chamada (T64), no lugar da ligacao encerrada.
 *
 * Tres segundos e um meio-termo explicito: tempo de ler o desfecho e apertar
 * "Ligar novamente", curto o bastante para nao segurar o painel quando o agente
 * so quer discar outro numero. "Fechar" encurta a espera (`RESET` na sessao).
 */
export function PostCallSummary({ segundos }: { segundos: number }) {
  const sessao = useCallSession();
  const { addCallNotes } = useCalls();
  const queryClient = useQueryClient();
  const [anotacao, setAnotacao] = useState('');
  const [salvando, setSalvando] = useState(false);

  const idDaChamada = sessao.currentCallId ?? sessao.session.sessionId;
  const numero = sessao.session.phone || sessao.currentNumber || '';
  // Aqui nao ha portao de papel: quem esta saindo da ligacao E o agente dela, e a RPC
  // confere o dono da chamada no banco de qualquer forma.
  const podeAnotar = true;

  const fechar = useCallback(() => sessao.dispatch({ type: 'RESET' }), [sessao]);

  useEffect(() => {
    const t = setTimeout(fechar, POS_CHAMADA_MS);
    return () => clearTimeout(t);
  }, [fechar]);

  const salvar = useCallback(async () => {
    if (!idDaChamada || !anotacao.trim()) return;
    setSalvando(true);
    try {
      const salvou = await addCallNotes(idDaChamada, anotacao);
      if (salvou) {
        await queryClient.invalidateQueries({ queryKey: ['calls'] });
        setAnotacao('');
      }
    } finally {
      setSalvando(false);
    }
  }, [idDaChamada, anotacao, addCallNotes, queryClient]);

  const ligarDeNovo = useCallback(() => {
    if (!numero) return;
    dispatchStartCall({ channel: sessao.session.channel, phone: numero, source: 'other', autoDial: true });
  }, [numero, sessao.session.channel]);

  return (
    <Card className="border-border bg-card" data-testid="tel-post-call">
      <CardContent className="flex flex-col items-center gap-3 p-4">
        <p className="text-sm font-medium text-foreground" aria-live="polite" data-testid="tel-post-call-summary">
          Ligação encerrada{segundos > 0 ? ` · ${formatClock(segundos)}` : ''}
        </p>
        {numero && <p className="font-mono text-xs text-muted-foreground">{numero}</p>}

        {podeAnotar && idDaChamada && (
          <div className="w-full space-y-1.5">
            <Textarea
              value={anotacao}
              onChange={(e) => setAnotacao(e.target.value)}
              placeholder="Anotação rápida sobre esta ligação..."
              className="min-h-16 text-sm"
              data-testid="tel-post-call-notes"
            />
            <Button size="sm" className="w-full" onClick={salvar} disabled={salvando || !anotacao.trim()} data-testid="tel-post-call-save">
              {salvando ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Salvar anotação
            </Button>
          </div>
        )}

        <div className="flex w-full gap-2">
          <Button variant="outline" className="flex-1" onClick={ligarDeNovo} disabled={!numero} data-testid="tel-redial">
            <PhoneCall className="mr-2 h-4 w-4" /> Ligar novamente
          </Button>
          <Button variant="ghost" className="flex-1" onClick={fechar} data-testid="tel-post-call-close">
            <X className="mr-2 h-4 w-4" /> Fechar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
