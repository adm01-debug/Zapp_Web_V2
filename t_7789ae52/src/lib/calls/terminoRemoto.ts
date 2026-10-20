/**
 * Termino sincronizado da chamada (etapa T28).
 *
 * Quando a chamada termina do OUTRO lado (o aparelho desligou, ou o webhook gravou
 * `terminate`/`timeout`), quem sabe disso e a linha de `public.calls` — nao o motor
 * SIP, que nem existe no caminho de WhatsApp. Esta regra PURA decide, a partir da
 * linha que chega por Realtime, se a sessao EM CURSO deve receber `HANGUP_REMOTE`.
 *
 * Fica fora do hook de proposito: e a decisao que precisa de teste, e ela nao
 * depende de rede nem de React.
 */

/** Linha de `public.calls` como o Realtime a entrega (so o que interessa aqui). */
export interface LinhaDeChamadaRealtime {
  id?: string | null;
  status?: string | null;
  end_reason?: string | null;
}

/**
 * Estados terminais de `calls.status` (os mesmos do CHECK do banco). `ringing` e
 * `answered` continuam em andamento — so os de baixo encerram a chamada.
 */
const STATUS_TERMINAIS: readonly string[] = [
  'ended',
  'missed',
  'busy',
  'failed',
  'cancelled',
  'declined',
];

/** O status da linha ja encerrou a chamada? */
export function ehDesfechoTerminal(status: string | null | undefined): boolean {
  return typeof status === 'string' && STATUS_TERMINAIS.includes(status);
}

/**
 * A linha que chegou por Realtime manda encerrar a sessao em curso?
 *
 * Devolve `HANGUP_REMOTE` somente quando e a MESMA chamada (`id` igual ao da sessao)
 * e o status dela ja e terminal. Chamada de outra sessao/aba e status ainda em
 * andamento devolvem `null` — encerrar a sessao errada seria pior que nao encerrar.
 */
export function terminoRemotoDaChamada(
  linha: LinhaDeChamadaRealtime | null | undefined,
  callIdEmCurso: string | null | undefined,
): 'HANGUP_REMOTE' | null {
  if (!linha || !callIdEmCurso) return null;
  if (linha.id !== callIdEmCurso) return null;
  return ehDesfechoTerminal(linha.status) ? 'HANGUP_REMOTE' : null;
}
