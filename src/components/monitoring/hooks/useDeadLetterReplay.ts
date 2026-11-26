/**
 * `useDeadLetterReplay` — estado da fila da dead-letter + a ação de reprocessar.
 *
 * O acesso ao banco e à Edge fica no service (`@/services/deadLetter.service`):
 * hook de componente não importa o client do Supabase. A RPC de leitura
 * (`webhook_dead_letter_fila`, migration `20261127180000`) e a Edge de replay
 * (`supabase/functions/webhook-replay`) estão descritas lá.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  fetchDeadLetterFila,
  reprocessarDeadLetter,
  type DeadLetterItem,
  type ReplayResultado,
} from '@/services/deadLetter.service';
import { motivoDeErro } from './types';

export { DEAD_LETTER_LIMITE } from '@/services/deadLetter.service';
export type { DeadLetterItem, ReplayResultado } from '@/services/deadLetter.service';

export function useDeadLetterReplay() {
  const [itens, setItens] = useState<DeadLetterItem[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [reprocessando, setReprocessando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ReplayResultado | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const fila = await fetchDeadLetterFila();
      setItens(fila.itens);
      setTotal(fila.total);
    } catch (err) {
      setErro(motivoDeErro(err));
      setItens([]);
      setTotal(0);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    void carregar();
  }, [carregar]);

  const reprocessar = useCallback(async (): Promise<ReplayResultado | null> => {
    setReprocessando(true);
    setErroAcao(null);
    setResultado(null);
    try {
      const resposta = await reprocessarDeadLetter();
      setResultado(resposta);
      await carregar();
      return resposta;
    } catch (err) {
      setErroAcao(motivoDeErro(err));
      return null;
    } finally {
      setReprocessando(false);
    }
  }, [carregar]);

  return { itens, total, carregando, erro, erroAcao, reprocessando, resultado, carregar, reprocessar };
}