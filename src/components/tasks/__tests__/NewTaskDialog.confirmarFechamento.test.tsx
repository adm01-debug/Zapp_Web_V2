/**
 * Confirmação ao fechar o modal "Nova tarefa" com título digitado.
 *
 * O que este arquivo prova (e o que fica vermelho sem a correção):
 *  - com título digitado, o pedido de fechamento NÃO descarta: levanta o aviso
 *    e o modal só fecha depois do "Descartar" (`confirmClose`);
 *  - desistir do aviso (`cancelClose`) mantém o modal aberto e o título de pé;
 *  - sem título (vazio ou só espaços) o fechamento é direto, sem aviso;
 *  - o `aoFechar` usado é o MAIS RECENTE (o modal real troca de callback a cada
 *    render do TasksModule; callback velho fecharia com estado velho).
 *
 * O teste chama o hook REAL (o mesmo que o modal consome), sem mock do próprio
 * hook: o estado de confirmação tem de sair do código de produção.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import { useNewTaskCloseGuard } from '@/hooks/tasks/useNewTaskCloseGuard';

afterEach(() => cleanup());

function montar(titulo: string) {
  const aoFechar = vi.fn();
  const { result, rerender } = renderHook(
    ({ t, fechar }: { t: string; fechar: () => void }) =>
      useNewTaskCloseGuard({ titulo: t, aoFechar: fechar }),
    { initialProps: { t: titulo, fechar: aoFechar } },
  );
  return { aoFechar, result, rerender };
}

describe('fechamento do modal Nova tarefa — título digitado pede confirmação', () => {
  it('com título digitado só descarta DEPOIS de confirmar', () => {
    const { aoFechar, result } = montar('Ligar para o cliente às 14h');

    act(() => result.current.requestClose());

    // pediu confirmação e NADA foi descartado
    expect(result.current.confirmando).toBe(true);
    expect(aoFechar).not.toHaveBeenCalled();

    act(() => result.current.confirmClose());

    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(result.current.confirmando).toBe(false);
  });

  it('desistir do aviso mantém o modal aberto e o título intacto', () => {
    const { aoFechar, result } = montar('Ligar para o cliente às 14h');

    act(() => result.current.requestClose());
    act(() => result.current.cancelClose());

    expect(result.current.confirmando).toBe(false);
    expect(aoFechar).not.toHaveBeenCalled();

    // o pedido seguinte volta a pedir confirmação (o aviso não ficou "armado")
    act(() => result.current.requestClose());
    expect(result.current.confirmando).toBe(true);
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it('sem título fecha direto, sem aviso', () => {
    const vazio = montar('');
    act(() => vazio.result.current.requestClose());
    expect(vazio.result.current.confirmando).toBe(false);
    expect(vazio.aoFechar).toHaveBeenCalledTimes(1);

    const espacos = montar('   ');
    act(() => espacos.result.current.requestClose());
    expect(espacos.result.current.confirmando).toBe(false);
    expect(espacos.aoFechar).toHaveBeenCalledTimes(1);
  });

  it('usa o aoFechar mais recente, não o da montagem', () => {
    const { result, rerender } = montar('Ligar para o cliente às 14h');
    const novoAoFechar = vi.fn();

    rerender({ t: 'Ligar para o cliente às 14h', fechar: novoAoFechar });
    act(() => result.current.requestClose());
    act(() => result.current.confirmClose());

    expect(novoAoFechar).toHaveBeenCalledTimes(1);
  });
});
