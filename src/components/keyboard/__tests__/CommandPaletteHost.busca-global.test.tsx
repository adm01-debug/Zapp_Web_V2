import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// R2-INF-035: a paleta passa a devolver contatos e conversas, com as MESMAS tabelas
// que a busca global da inbox usa. A prova abaixo alimenta o cliente com o formato de
// resposta do PostgREST e confere o que a paleta exibe e o que o clique executa.
const estado = vi.hoisted(() => ({
  contatos: [] as unknown[],
  mensagens: [] as unknown[],
  tabelas: [] as string[],
}));

vi.mock('@/integrations/supabase/client', () => {
  const cadeia = (resultado: unknown) => {
    const api: Record<string, unknown> = {};
    for (const metodo of ['select', 'eq', 'or', 'ilike', 'order', 'limit']) {
      api[metodo] = () => api;
    }
    api.then = (resolve: (valor: unknown) => unknown) => Promise.resolve(resultado).then(resolve);
    return api;
  };
  return {
    supabase: {
      from: (tabela: string) => {
        estado.tabelas.push(tabela);
        return cadeia(tabela === 'contacts' ? { data: estado.contatos } : { data: estado.mensagens });
      },
    },
  };
});

import { limparTermoBusca, nomeDoContato, usePaletteGlobalSearch } from '@/hooks/ui/usePaletteGlobalSearch';

beforeEach(() => {
  estado.tabelas.length = 0;
  estado.contatos = [
    { id: 'c1', name: 'Contato', surname: 'de teste', phone: '+55 11 90000-0000', email: null },
  ];
  estado.mensagens = [
    { id: 'm1', content: 'mensagem de teste', contacts: { id: 'c1', name: 'Contato', surname: 'de teste' } },
  ];
});

describe('usePaletteGlobalSearch', () => {
  it('devolve contato e conversa, cada um com o seu tipo', async () => {
    const { result } = renderHook(() => usePaletteGlobalSearch());

    const hits = await result.current('contato de teste');

    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ tipo: 'contato', titulo: 'Contato de teste', id: 'contato-c1' });
    expect(hits[1]).toMatchObject({ tipo: 'conversa', id: 'conversa-m1', titulo: 'Contato de teste' });
    expect(estado.tabelas).toEqual(['contacts', 'messages']);
  });

  it('não consulta o banco para termo com menos de 2 caracteres', async () => {
    const { result } = renderHook(() => usePaletteGlobalSearch());

    expect(await result.current('a')).toEqual([]);
    expect(estado.tabelas).toEqual([]);
  });

  it('trata a resposta sem contato embutido na conversa', async () => {
    estado.contatos = [];
    estado.mensagens = [{ id: 'm2', content: null, contacts: null }];
    const { result } = renderHook(() => usePaletteGlobalSearch());

    const hits = await result.current('teste');

    expect(hits).toEqual([
      { id: 'conversa-m2', tipo: 'conversa', titulo: 'Contato', descricao: 'Abrir a caixa de entrada' },
    ]);
  });
});

describe('limparTermoBusca', () => {
  it('tira a sintaxe do filtro do PostgREST do que o usuário digitou', () => {
    expect(limparTermoBusca('50%, (a) \\ b')).toBe('50 a b');
  });
});

describe('nomeDoContato', () => {
  it('junta nome e sobrenome e nunca devolve vazio', () => {
    expect(nomeDoContato({ id: 'c1', name: 'Ana', surname: 'Silva' })).toBe('Ana Silva');
    expect(nomeDoContato(null)).toBe('Contato');
  });
});
