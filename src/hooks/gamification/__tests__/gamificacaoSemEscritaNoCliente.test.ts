import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Gamificação é SÓ LEITURA no cliente.
 *
 * Contexto: a migration 20261012233536 revogou o EXECUTE de PUBLIC/anon/authenticated
 * nas 4 RPCs de gamificação (ficam só `service_role` + gatilhos SECURITY DEFINER). O
 * `GamificationProvider` nunca era montado, então o único efeito dessas chamadas de
 * cliente era (a) falhar com 42501 depois da revogação e (b) permitir que um agente
 * logado inflasse o próprio XP antes dela. Este contrato impede que o caminho de
 * escrita volte por descuido: nenhum arquivo do cliente pode citar as RPCs de escrita
 * e o módulo/provider que as chamavam não podem existir de novo.
 *
 * `src/integrations/supabase/types.ts` é GERADO pelo Supabase (declara todas as RPCs do
 * banco) e por isso é ignorado — ele não é chamada de cliente.
 */

const RPC_ESCRITA = [
  'add_agent_xp',
  'grant_agent_achievement',
  'update_agent_streak',
  'increment_agent_messages',
  'increment_agent_resolutions',
] as const;

const GERADO = join('src', 'integrations', 'supabase', 'types.ts');

/** Todos os .ts/.tsx de `src/`, sem os arquivos de teste nem o types.ts gerado. */
function arquivosDeProducao(raiz: string): string[] {
  return (readdirSync(raiz, { recursive: true }) as string[])
    .filter((rel) => (rel.endsWith('.ts') || rel.endsWith('.tsx')) && !rel.endsWith('.d.ts'))
    .map((rel) => join(raiz, rel))
    .filter((full) => full !== GERADO)
    .filter((full) => !full.includes('__tests__'))
    .filter((full) => !/\.test\.tsx?$/.test(full));
}

describe('gamificação — o cliente não escreve (só lê)', () => {
  it('nenhum arquivo de produção em src/ cita as RPCs de escrita de gamificação', () => {
    const achados = arquivosDeProducao('src').flatMap((arquivo) =>
      readFileSync(arquivo, 'utf8')
        .split('\n')
        .map((linha, indice) => ({ linha, indice: indice + 1 }))
        .filter(({ linha }) => RPC_ESCRITA.some((rpc) => linha.includes(rpc)))
        .map(({ linha, indice }) => `${arquivo}:${indice}: ${linha.trim()}`),
    );

    expect(achados, `chamadas de escrita de gamificação encontradas:\n${achados.join('\n')}`).toEqual([]);
  });

  it('o módulo de mutações e o provider que escreviam não existem mais', () => {
    expect(existsSync(join('src', 'hooks', 'gamification', 'mutations.ts'))).toBe(false);
    expect(existsSync(join('src', 'components', 'gamification', 'GamificationProvider.tsx'))).toBe(false);
  });
});
