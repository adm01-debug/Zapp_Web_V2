/**
 * Política de proteção de contatos — leitura (tabela + RPC) e escrita.
 *
 * O sujeito são as funções REAIS do contrato; a dublagem é a fronteira de rede (`supabase.from`/
 * `rpc`). Regras provadas: linha por escopo com `scope_role` nulo virando o padrão global, `origem`
 * da RPC traduzida (e origem desconhecida virando erro em vez de mentira), insert × update
 * decididos pelo id, nomes de coluna em snake_case e remoção que falha quando nada foi apagado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ tabela: string; acao: string; payload?: unknown; filtros: unknown[][] }>,
  resposta: { data: null as unknown, error: null as unknown },
  rpc: { data: null as unknown, error: null as unknown },
  rpcs: [] as Array<{ fn: string }>,
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (tabela: string) => {
      const entrada: { tabela: string; acao: string; payload?: unknown; filtros: unknown[][] } = {
        tabela,
        acao: 'select',
        filtros: [],
      };
      h.ops.push(entrada);
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = () => mesmo();
      builder.order = (...a: unknown[]) => {
        entrada.filtros.push(['order', ...a]);
        return mesmo();
      };
      builder.limit = (...a: unknown[]) => {
        entrada.filtros.push(['limit', ...a]);
        return mesmo();
      };
      builder.eq = (...a: unknown[]) => {
        entrada.filtros.push(['eq', ...a]);
        return mesmo();
      };
      builder.insert = (payload: unknown) => {
        entrada.acao = 'insert';
        entrada.payload = payload;
        return mesmo();
      };
      builder.update = (payload: unknown) => {
        entrada.acao = 'update';
        entrada.payload = payload;
        return mesmo();
      };
      builder.delete = () => {
        entrada.acao = 'delete';
        return mesmo();
      };
      builder.single = () => Promise.resolve(h.resposta);
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(h.resposta).then(ok, falhou);
      return builder;
    },
    rpc: (fn: string) => {
      h.rpcs.push({ fn });
      return Promise.resolve(h.rpc);
    },
  },
}));

import {
  CONTACT_PROTECTION_DEFAULTS,
  deleteContactProtectionPolicy,
  fetchContactProtectionPolicies,
  fetchMyContactProtectionPolicy,
  saveContactProtectionPolicy,
} from '../security/useContactProtectionPolicy';

const linhaPolicy = (over: Record<string, unknown> = {}) => ({
  id: 'pol-1',
  scope_role: null,
  bloquear_copia: true,
  bloquear_impressao: false,
  marca_dagua: true,
  mascarar_contato: false,
  limite_fichas_hora: 50,
  updated_at: '2026-11-20T10:00:00.000Z',
  ...over,
});

beforeEach(() => {
  h.ops = [];
  h.rpcs = [];
  h.resposta = { data: null, error: null };
  h.rpc = { data: null, error: null };
});

describe('fetchMyContactProtectionPolicy', () => {
  it('traduz a linha da RPC, inclusive a origem', async () => {
    h.rpc = {
      data: [
        {
          bloquear_copia: false,
          bloquear_impressao: true,
          marca_dagua: true,
          mascarar_contato: true,
          limite_fichas_hora: 20,
          origem: 'papel',
        },
      ],
      error: null,
    };

    const politica = await fetchMyContactProtectionPolicy();

    expect(h.rpcs[0].fn).toBe('get_my_protection_policy');
    expect(politica).toEqual({
      bloquearCopia: false,
      bloquearImpressao: true,
      marcaDagua: true,
      mascararContato: true,
      limiteFichasHora: 20,
      origem: 'papel',
    });
  });

  it('recusa origem que o contrato não conhece', async () => {
    h.rpc = {
      data: [
        {
          bloquear_copia: true,
          bloquear_impressao: true,
          marca_dagua: true,
          mascarar_contato: true,
          limite_fichas_hora: 100,
          origem: 'organizacao',
        },
      ],
      error: null,
    };

    await expect(fetchMyContactProtectionPolicy()).rejects.toThrow(/origem desconhecida/);
  });

  it('erro quando a RPC não devolve linha', async () => {
    h.rpc = { data: [], error: null };
    await expect(fetchMyContactProtectionPolicy()).rejects.toThrow(/não devolveu/);
  });

  it('propaga o erro do banco', async () => {
    h.rpc = { data: null, error: { message: 'permission denied' } };
    await expect(fetchMyContactProtectionPolicy()).rejects.toMatchObject({
      message: 'permission denied',
    });
  });
});

describe('fetchContactProtectionPolicies', () => {
  it('devolve o escopo global e o do papel, do global para os papéis', async () => {
    h.resposta = {
      data: [linhaPolicy(), linhaPolicy({ id: 'pol-2', scope_role: 'agent' })],
      error: null,
    };

    const politicas = await fetchContactProtectionPolicies();

    expect(politicas).toHaveLength(2);
    expect(politicas[0]).toMatchObject({ scopeRole: null, limiteFichasHora: 50 });
    expect(politicas[1].scopeRole).toBe('agent');
    expect(h.ops[0].filtros).toContainEqual(['order', 'scope_role', { ascending: true, nullsFirst: true }]);
  });
});

describe('saveContactProtectionPolicy', () => {
  it('cria a regra do papel com colunas do banco', async () => {
    h.resposta = { data: linhaPolicy({ id: 'pol-3', scope_role: 'supervisor' }), error: null };

    const salva = await saveContactProtectionPolicy({
      scopeRole: 'supervisor',
      valores: { ...CONTACT_PROTECTION_DEFAULTS, limiteFichasHora: 15 },
    });

    const op = h.ops[0];
    expect(op.acao).toBe('insert');
    expect(op.payload).toEqual({
      bloquear_copia: true,
      bloquear_impressao: true,
      marca_dagua: true,
      mascarar_contato: true,
      limite_fichas_hora: 15,
      scope_role: 'supervisor',
    });
    expect(salva.id).toBe('pol-3');
  });

  it('atualiza pelo id quando a regra já existe', async () => {
    h.resposta = { data: linhaPolicy({ id: 'pol-1' }), error: null };

    await saveContactProtectionPolicy({
      id: 'pol-1',
      scopeRole: null,
      valores: { ...CONTACT_PROTECTION_DEFAULTS, bloquearCopia: false },
    });

    const op = h.ops[0];
    expect(op.acao).toBe('update');
    expect(op.filtros).toContainEqual(['eq', 'id', 'pol-1']);
    expect((op.payload as Record<string, unknown>).bloquear_copia).toBe(false);
    expect(op.payload as Record<string, unknown>).not.toHaveProperty('scope_role');
  });
});

describe('deleteContactProtectionPolicy', () => {
  it('confirma a remoção pelo id devolvido', async () => {
    h.resposta = { data: [{ id: 'pol-2' }], error: null };
    await expect(deleteContactProtectionPolicy('pol-2')).resolves.toBe('pol-2');
    expect(h.ops[0].acao).toBe('delete');
    expect(h.ops[0].filtros).toContainEqual(['eq', 'id', 'pol-2']);
  });

  it('falha quando o banco não apagou nada', async () => {
    h.resposta = { data: [], error: null };
    await expect(deleteContactProtectionPolicy('pol-2')).rejects.toThrow(/nenhuma regra/);
  });
});
