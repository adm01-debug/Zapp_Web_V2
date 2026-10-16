/**
 * Guarda de fechamento do modal "Nova tarefa" — o título digitado não some
 * sozinho.
 *
 * Problema: fechar o modal (X, `Esc`, clique fora, `N` de novo) descartava o
 * título já digitado sem avisar. O cartão pede confirmação só quando há algo a
 * perder.
 *
 * Como o modal fecha por VÁRIOS caminhos (todos passam pelo `onOpenChange` do
 * `<Dialog>`, em `shared/NewTaskDialog.tsx`), a decisão fica num só lugar, aqui,
 * e o modal só precisa mandar o pedido de fechamento para `requestClose` em vez
 * de fechar direto. Assim os caminhos não divergem.
 *
 * O que este hook NÃO faz: não renderiza nada. O aviso (AlertDialog do sistema,
 * com foco visível e os tokens de sempre) é montado pela tela quando
 * `confirmando` é `true` — o hook é o estado dele. Nada aqui escreve no banco.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseNewTaskCloseGuardOpts {
  /** Título digitado no modal; é o que se perde ao descartar. */
  titulo: string;
  /** Fechamento de verdade do modal (o `onOpenChange(false)` de sempre). */
  aoFechar: () => void;
}

export interface NewTaskCloseGuard {
  /** `true` enquanto o aviso de descarte está de pé (o modal continua aberto). */
  confirmando: boolean;
  /** Pedido de fechamento vindo da tela: fecha direto ou levanta o aviso. */
  requestClose: () => void;
  /** Operador confirmou o descarte: fecha e larga o aviso. */
  confirmClose: () => void;
  /** Operador desistiu: larga o aviso e mantém o modal e o título. */
  cancelClose: () => void;
}

/** Título só de espaços conta como vazio — não há o que descartar. */
export function temTituloDigitado(titulo: string): boolean {
  return titulo.trim().length > 0;
}

export function useNewTaskCloseGuard({
  titulo,
  aoFechar,
}: UseNewTaskCloseGuardOpts): NewTaskCloseGuard {
  const [confirmando, setConfirmando] = useState(false);

  // O modal real re-renderiza a cada tecla digitada e pode trocar de callback:
  // guardar o MAIS RECENTE evita fechar com estado velho na mão.
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  }, [aoFechar]);

  const requestClose = useCallback(() => {
    if (!temTituloDigitado(titulo)) {
      setConfirmando(false);
      aoFecharRef.current();
      return;
    }
    setConfirmando(true);
  }, [titulo]);

  const confirmClose = useCallback(() => {
    setConfirmando(false);
    aoFecharRef.current();
  }, []);

  const cancelClose = useCallback(() => {
    setConfirmando(false);
  }, []);

  return { confirmando, requestClose, confirmClose, cancelClose };
}
