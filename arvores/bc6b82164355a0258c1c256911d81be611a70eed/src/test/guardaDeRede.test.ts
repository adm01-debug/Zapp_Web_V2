/**
 * Guarda de rede do setup da suite (`src/test/setup.ts`).
 *
 * Por que existe: o cliente do app tem a URL e a anon key de PRODUCAO fixas no
 * codigo. Um teste que monta componente sem mockar o cliente faz request REAL
 * contra producao — e passa, porque o request falha. Medido em 03/10/2026, antes
 * da guarda: 408 requests ao projeto de producao por execucao da suite, quase
 * todos negados por RLS, ~30 mil 401/dia rodando no CI a cada push.
 *
 * Estes casos provam que a guarda barra de verdade. Sem eles, "nenhum teste
 * falou com producao" poderia significar apenas "nenhum teste tentou" — que nao
 * e medicao nenhuma.
 */
import { describe, expect, it } from 'vitest';

describe('guarda de rede — teste nao fala com o Supabase real', () => {
  it('recusa o projeto de producao do Zapp', async () => {
    await expect(
      fetch('https://tnnnlkbymytvtqngbbqh.supabase.co/rest/v1/catalog_send_events')
    ).rejects.toThrow(/guarda-de-rede/);
  });

  it('recusa qualquer outro projeto Supabase (a regra e o dominio, nao o ref)', async () => {
    await expect(fetch('https://qualqueroutroref.supabase.co/rest/v1/x')).rejects.toThrow(
      /guarda-de-rede/
    );
  });

  it('recusa tambem as edge functions (functions/v1)', async () => {
    await expect(
      fetch('https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/promogifts-catalog')
    ).rejects.toThrow(/guarda-de-rede/);
  });

  it('a mensagem diz o que mockar (a falha tem de ser acionavel)', async () => {
    await expect(fetch('https://tnnnlkbymytvtqngbbqh.supabase.co/rest/v1/x')).rejects.toThrow(
      /vi\.mock/
    );
  });

  it('NAO interfere em destino que nao e Supabase', async () => {
    // Porta discard local: falha de conexao imediata, sem trafego externo.
    // O que importa e o erro NAO ser o da guarda — ou seja, o fetch seguiu
    // adiante em vez de ser barrado.
    await expect(fetch('http://127.0.0.1:9/')).rejects.not.toThrow(/guarda-de-rede/);
  });
});
