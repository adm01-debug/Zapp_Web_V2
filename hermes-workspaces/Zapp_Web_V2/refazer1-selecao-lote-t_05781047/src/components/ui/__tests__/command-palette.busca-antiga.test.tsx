import { describe, it, expect, vi, afterEach } from 'vitest';
import { createElement } from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '@/components/ui/command-palette';
import type { CommandItem } from '@/components/ui/command-palette';

// R2-INF-032 (#377): a paleta do ⌘K debounceia a busca do catálogo em 300 ms. Se o termo muda
// enquanto a resposta anterior ainda está em voo, a resposta ANTIGA (do termo antigo) não pode
// substituir os resultados do termo ATUAL. O defeito estava em `debouncedSearch`
// (`setSearchResults(await onSearch(q))` sem guard): quem responde por último manda, mesmo que
// seja a consulta antiga.
//
// Aqui se monta a paleta REAL (`components/ui/command-palette`) e se dispara o evento do usuário
// na caixa de busca. O `onSearch` é controlado pelo teste: digita-se "zz", depois "zzb"; a
// consulta ATUAL ("zzb") responde primeiro e a ANTIGA ("zz") responde depois — a tela tem que
// continuar mostrando o resultado do termo atual.
//
// Os termos de busca ("zz"/"zzb") não casam letra a letra com os títulos de propósito: assim o
// `highlightMatch` não quebra o título em vários <span> e o nome acessível do item sai inteiro.

const ANIMATION_PROPS = new Set([
  'initial', 'animate', 'exit', 'whileHover', 'whileTap', 'variants', 'transition', 'layout',
]);
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  // Preserva a TAG real (`motion.button` -> <button>) para o item continuar sendo um botão
  // de verdade para quem usa (e para o `getByRole` do teste).
  motion: new Proxy(
    {},
    {
      get:
        (_target, tag: string) =>
        ({ children, ...props }: Record<string, unknown>) => {
          const safe = Object.fromEntries(
            Object.entries(props).filter(([k]) => !ANIMATION_PROPS.has(k))
          );
          return createElement(tag, safe, children as React.ReactNode);
        },
    }
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const itemTermoAtual: CommandItem = {
  id: 'catalog-atual',
  title: 'Caneca Térmica',
  category: 'search',
};
const itemTermoAntigo: CommandItem = {
  id: 'catalog-antigo',
  title: 'Garrafa Antiga',
  category: 'search',
};

const resultado = (titulo: string) => screen.queryByRole('button', { name: titulo });

afterEach(() => {
  vi.clearAllMocks();
});

describe('CommandPalette — busca do catálogo não pode ser sobrescrita pela consulta antiga', () => {
  it('resposta do termo antigo não substitui os resultados da consulta atual', async () => {
    const buscaAntiga = deferred<CommandItem[]>();
    const buscaAtual = deferred<CommandItem[]>();
    const onSearch = vi.fn((q: string) => (q === 'zz' ? buscaAntiga.promise : buscaAtual.promise));

    render(<CommandPalette open onOpenChange={() => {}} onSearch={onSearch} />);

    const input = screen.getByPlaceholderText(/Buscar ou digitar comando/);

    // O usuário digita "zz" e a consulta do catálogo sai (debounce de 300 ms).
    fireEvent.change(input, { target: { value: 'zz' } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('zz'));

    // ...e continua digitando: "zzb" (consulta nova, ainda em voo junto com a antiga).
    fireEvent.change(input, { target: { value: 'zzb' } });
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('zzb'));

    // A consulta ATUAL responde primeiro: o resultado dela está na tela.
    await act(async () => {
      buscaAtual.resolve([itemTermoAtual]);
    });
    expect(resultado('Caneca Térmica')).toBeInTheDocument();

    // A consulta ANTIGA responde depois: não pode trocar o que está na tela.
    await act(async () => {
      buscaAntiga.resolve([itemTermoAntigo]);
    });
    expect(resultado('Garrafa Antiga')).not.toBeInTheDocument();
    expect(resultado('Caneca Térmica')).toBeInTheDocument();
  });
});
