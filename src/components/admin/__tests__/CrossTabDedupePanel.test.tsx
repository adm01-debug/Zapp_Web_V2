/**
 * CrossTabDedupePanel — prova pela TELA que o painel mostra o dedupe entre abas
 * a partir do canal REAL do dedupe (`SEND_DEDUPE_CHANNEL_NAME`, o mesmo que
 * `src/lib/crossTabSendDedupe.ts` usa para eleger a aba dona do envio):
 *  1. estado vazio antes de qualquer reivindicação de outra aba;
 *  2. reivindicação de outra aba vira uma linha "Ação #n" com a contagem;
 *  3. a mesma chave reusa o rótulo, chave nova ganha rótulo novo;
 *  4. mensagem de tipo/versão errada é ignorada;
 *  5. sem `BroadcastChannel` o painel avisa em vez de quebrar;
 *  6. o painel só ESCUTA: não publica nada no canal (não atrapalha o dedupe);
 *  7. limites de memória: rótulos guardados e linhas exibidas são limitados.
 */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';

import { FakeBroadcastChannel } from '@/test/fakeBroadcastChannel';
import { SEND_DEDUPE_CHANNEL_NAME } from '@/lib/crossTabSendDedupe';
import {
  MAX_ACOES_DISPUTADAS,
  MAX_ROTULOS,
  rotular,
} from '@/components/admin/dedupeEntreAbas';
import { CrossTabDedupePanel } from '@/components/admin/CrossTabDedupePanel';

/** Aba vizinha de verdade: publica no mesmo canal, como o dedupe da V2 publica. */
function reivindicar(key: string, clientMessageId = 'cm-1'): void {
  const vizinha = new BroadcastChannel(SEND_DEDUPE_CHANNEL_NAME);
  vizinha.postMessage({ version: 1, type: 'CLAIM', tabId: 'outra-aba', key, clientMessageId, at: Date.now() });
  vizinha.close();
}

beforeEach(() => {
  FakeBroadcastChannel.reset();
  vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

afterAll(() => {
  FakeBroadcastChannel.reset();
});

describe('CrossTabDedupePanel', () => {
  it('começa vazio, sem inventar disputa nenhuma', () => {
    render(<CrossTabDedupePanel />);

    expect(screen.getByText(/Nenhuma disputa entre abas vista/)).toBeTruthy();
    expect(screen.queryByTestId('dedupe-linha')).toBeNull();
  });

  it('mostra a reivindicação de outra aba como ação em disputa e conta as repetições', () => {
    render(<CrossTabDedupePanel />);

    act(() => {
      reivindicar('chave-A');
    });
    expect(screen.getByText('Ação #1')).toBeTruthy();
    expect(screen.getByTestId('dedupe-reivindicacoes').textContent).toContain('1');

    act(() => {
      reivindicar('chave-A');
    });
    expect(screen.getAllByTestId('dedupe-linha')).toHaveLength(1);
    expect(screen.getByTestId('dedupe-contagem').textContent).toContain('2');
    expect(screen.getByTestId('dedupe-reivindicacoes').textContent).toContain('2');
  });

  it('dá rótulo novo para chave diferente e mantém o mesmo para a chave repetida', () => {
    render(<CrossTabDedupePanel />);

    act(() => {
      reivindicar('chave-A');
      reivindicar('chave-B');
    });

    expect(screen.getByText('Ação #1')).toBeTruthy();
    expect(screen.getByText('Ação #2')).toBeTruthy();
    expect(screen.getAllByTestId('dedupe-linha')).toHaveLength(2);
    // A chave crua carrega contato e conteúdo da mensagem: não pode ir para a tela.
    expect(screen.queryByText(/chave-A/)).toBeNull();
    expect(screen.queryByText(/chave-B/)).toBeNull();
  });

  it('ignora mensagem que não é reivindicação da versão 1', () => {
    render(<CrossTabDedupePanel />);

    act(() => {
      const vizinha = new BroadcastChannel(SEND_DEDUPE_CHANNEL_NAME);
      vizinha.postMessage({ version: 1, type: 'RELEASE', tabId: 'outra-aba', key: 'chave-A' });
      vizinha.postMessage({ version: 2, type: 'CLAIM', tabId: 'outra-aba', key: 'chave-A' });
      vizinha.postMessage({ version: 1, type: 'CLAIM', tabId: 'outra-aba' });
      vizinha.postMessage(null);
      vizinha.close();
    });

    expect(screen.getByText(/Nenhuma disputa entre abas vista/)).toBeTruthy();
    expect(screen.queryByTestId('dedupe-linha')).toBeNull();
  });

  it('avisa em vez de quebrar quando o navegador não expõe BroadcastChannel', () => {
    vi.stubGlobal('BroadcastChannel', undefined);

    render(<CrossTabDedupePanel />);

    expect(screen.getByText(/não expõe/)).toBeTruthy();
    expect(screen.queryByTestId('dedupe-linha')).toBeNull();
  });

  it('só escuta: não publica nada no canal do dedupe', () => {
    const publicado: unknown[] = [];
    const original = FakeBroadcastChannel.prototype.postMessage;
    FakeBroadcastChannel.prototype.postMessage = function espiao(dado: unknown) {
      publicado.push(dado);
      return original.call(this, dado);
    };

    try {
      render(<CrossTabDedupePanel />);
      act(() => {
        reivindicar('chave-A');
      });

      // Uma única publicação: a da aba vizinha. O painel não devolve nada.
      expect(publicado).toHaveLength(1);
    } finally {
      FakeBroadcastChannel.prototype.postMessage = original;
    }
  });

  it('limpa as linhas e zera os rótulos a pedido do operador', () => {
    render(<CrossTabDedupePanel />);

    act(() => {
      reivindicar('chave-A');
    });
    expect(screen.getByText('Ação #1')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));

    expect(screen.queryByTestId('dedupe-linha')).toBeNull();
    act(() => {
      reivindicar('chave-B');
    });
    expect(screen.getByText('Ação #1')).toBeTruthy();
  });

  it('não cresce sem limite: exibe no máximo MAX_ACOES_DISPUTADAS linhas', () => {
    render(<CrossTabDedupePanel />);

    act(() => {
      for (let i = 0; i < MAX_ACOES_DISPUTADAS + 10; i += 1) reivindicar(`chave-${i}`);
    });

    expect(screen.getAllByTestId('dedupe-linha')).toHaveLength(MAX_ACOES_DISPUTADAS);
  });
});

describe('rotular', () => {
  it('rotula a mesma chave com o mesmo rótulo e nunca repete rótulo', () => {
    const mapa = new Map<string, string>();
    const contador = { current: 0 };

    expect(rotular('chave-A', mapa, contador)).toBe(rotular('chave-A', mapa, contador));
    expect(rotular('chave-B', mapa, contador)).not.toBe(rotular('chave-A', mapa, contador));
  });

  it('descarta o rótulo mais antigo quando o mapa passa de MAX_ROTULOS', () => {
    const mapa = new Map<string, string>();
    const contador = { current: 0 };

    for (let i = 0; i < MAX_ROTULOS + 5; i += 1) rotular(`chave-${i}`, mapa, contador);

    expect(mapa.size).toBe(MAX_ROTULOS);
    expect(mapa.has('chave-0')).toBe(false);
    expect(contador.current).toBe(MAX_ROTULOS + 5);
  });
});
