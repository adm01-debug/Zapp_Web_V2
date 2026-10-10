import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestQueryWrapper } from '@/test/mocks/queryClient';

/**
 * O codigo do convite de departamento e uma credencial: quem digita o codigo
 * entra no departamento. Sorteado com `Math.random()` (PRNG previsivel) ele era
 * adivinhavel (#1528), e a correcao foi sortear por `crypto.getRandomValues` no
 * cliente. No contrato ATUAL (SL-069/F76) o cliente nem sorteia mais: a RPC
 * `create_department_invite` (migration 20260928520000) gera o codigo no servidor
 * com `gen_random_bytes` e grava `department_invitations` + auditoria na mesma
 * transacao; o hook so repassa o codigo que o banco devolveu.
 *
 * O que este teste continua garantindo (a intencao original, no contrato novo):
 *   - o codigo nunca nasce de PRNG previsivel — nem no cliente (o hook nao sorteia
 *     nem insere nada), nem no banco (a migration usa `gen_random_bytes`);
 *   - dois convites seguidos saem com codigos distintos, os que o banco entregou.
 */
const f = vi.hoisted(() => ({
  inserts: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  rpcs: [] as Array<{ nome: string; args: Record<string, unknown> | undefined }>,
  sequencia: 0,
}));

vi.mock('@/integrations/supabase/client', () => {
  const supabase = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
    from: (table: string) => ({
      insert: (payload: Record<string, unknown>) => {
        f.inserts.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    }),
    rpc: (nome: string, args?: Record<string, unknown>) => {
      f.rpcs.push({ nome, args });
      f.sequencia += 1;
      return Promise.resolve({
        data: { ok: true, invite_id: `inv-${f.sequencia}`, code: `SRV${String(f.sequencia).padStart(9, '0')}` },
        error: null,
      });
    },
  };
  return { supabase };
});

import { useCreateDepartmentInvite } from '@/hooks/team-chat/useDepartmentManagement';

async function criarConvite(departmentId = 'dep-1'): Promise<string> {
  const { result } = renderHook(() => useCreateDepartmentInvite(departmentId), {
    wrapper: TestQueryWrapper,
  });

  let criado: { code: string } | undefined;
  await act(async () => {
    criado = await result.current.mutateAsync('Ana');
  });
  return String(criado?.code ?? '');
}

describe('useCreateDepartmentInvite — codigo do convite', () => {
  beforeEach(() => {
    f.inserts.length = 0;
    f.rpcs.length = 0;
    f.sequencia = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('o cliente nao sorteia nem grava o codigo: ele vem da RPC do banco', async () => {
    const codigo = await criarConvite();

    expect(f.rpcs).toEqual([
      {
        nome: 'create_department_invite',
        args: { p_department_id: 'dep-1', p_max_uses: 1, p_expires_hours: 168 },
      },
    ]);
    expect(codigo).toBe('SRV000000001');
    // Nada de INSERT direto (nem em department_invites, nem em department_invitations).
    expect(f.inserts).toEqual([]);
  });

  it('o hook nao tem sorteio proprio: nem Math.random nem getRandomValues no codigo do convite', () => {
    // As libs de teste/react-query chamam Math.random por conta propria, entao um espiao
    // em runtime nao separa o hook delas: a prova e na fonte do hook.
    const fonte = readFileSync(join(process.cwd(), 'src', 'hooks', 'team-chat', 'useDepartmentManagement.ts'), 'utf-8');

    expect(fonte).not.toMatch(/Math\.random/);
    expect(fonte).not.toMatch(/getRandomValues|secureRandomChars/);
  });

  it('o banco sorteia com CSPRNG: a RPC usa gen_random_bytes e nao random()', () => {
    const migration = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260928520000_team_chat_e16_create_department_invite_rpc.sql'),
      'utf-8',
    );

    expect(migration).toContain('gen_random_bytes');
    // `\brandom\(` nao casa com `gen_random_bytes(`; pega `random()` puro.
    expect(migration).not.toMatch(/\brandom\s*\(/i);
  });

  it('o hook nao sorteia o codigo no cliente: nem crypto.getRandomValues nem Math.random', async () => {
    // Prova em RUNTIME (a cerca na fonte, abaixo, e o complemento): o sorteio saiu do
    // cliente de vez. No contrato anterior o hook chamava crypto.getRandomValues 8 vezes
    // por convite; agora nao chama nenhuma vez, e o codigo entregue e o do banco.
    const espiaoCrypto = vi.spyOn(globalThis.crypto, 'getRandomValues');
    const espiaoMath = vi.spyOn(Math, 'random');

    const codigo = await criarConvite();

    expect(espiaoCrypto).not.toHaveBeenCalled();
    expect(espiaoMath).not.toHaveBeenCalled();
    expect(codigo).toBe('SRV000000001');
  });

  it('dois convites seguidos saem com codigos distintos, os que o banco entregou', async () => {
    const primeiro = await criarConvite();
    const segundo = await criarConvite();

    expect(primeiro).not.toBe('');
    expect(segundo).not.toBe('');
    expect(primeiro).not.toBe(segundo);
    expect(f.rpcs).toHaveLength(2);
  });
});
