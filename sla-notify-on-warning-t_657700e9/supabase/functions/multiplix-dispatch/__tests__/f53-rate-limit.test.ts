/**
 * BLOCO E / F53 — "Rate limit por usuario e por conexao nas edges ... com 429 e
 * Retry-After. Feito quando: header presente."
 *
 * Este teste prova a UNICA parte do F53 que da para provar sem rede: a resposta
 * de recusa carrega `Retry-After` e status 429. O que ele cobre:
 *   1. `multiplix-audience` monta o 429 com o header;
 *   2. `multiplix-dispatch` monta o 429 com o header;
 *   3. os tres arquivos continuam chamando `enforceRateLimit` (se alguem remover a
 *      trava, o teste morre — e este e o ponto: o gate nao pode virar decoracao).
 *
 * O caso do `multiplix-send` (teto por conexao) e provado por leitura estrutural
 * aqui porque a edge inteira exige banco; o comportamento funcional do limite e
 * do `_shared/validation.ts`, ja coberto pela suite do kernel.
 */

import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';

// `__tests__` -> `multiplix-dispatch` -> `functions` -> `supabase` -> raiz do repo.
const ROOT = new URL('../../../../', import.meta.url);

async function read(rel: string): Promise<string> {
  return await Deno.readTextFile(new URL(rel, ROOT));
}

Deno.test('F53: as tres edges chamam enforceRateLimit', async () => {
  const files = {
    'multiplix-dispatch': 'supabase/functions/multiplix-dispatch/index.ts',
    'multiplix-audience': 'supabase/functions/multiplix-audience/index.ts',
    'multiplix-send': 'supabase/functions/multiplix-send/index.ts',
  };
  for (const [edge, path] of Object.entries(files)) {
    const src = await read(path);
    assert(
      src.includes('enforceRateLimit('),
      `${edge} deve chamar enforceRateLimit (F53: a trava nao pode ser removida)`,
    );
  }
});

Deno.test('F53: todo 429 das edges responde com Retry-After', async () => {
  const files = [
    'supabase/functions/multiplix-dispatch/index.ts',
    'supabase/functions/multiplix-audience/index.ts',
    'supabase/functions/multiplix-send/index.ts',
  ];
  for (const path of files) {
    const lines = (await read(path)).split('\n');
    // Nao basta "existir um Retry-After no arquivo": a mutacao que apaga o header
    // de UM dos 429 sobrevivia a essa assercao frouxa (medido). A regra e por
    // ocorrencia: cada linha com 429 precisa ter o header na vizinhanca imediata.
    const hits: number[] = [];
    lines.forEach((l, i) => { if (l.includes('429')) hits.push(i); });
    assert(hits.length > 0, `${path} deveria ter ao menos um 429`);
    for (const i of hits) {
      const window = lines.slice(i, i + 8).join('\n');
      assert(
        window.includes('Retry-After'),
        `${path}:${i + 1} responde 429 sem Retry-After — F53 exige o header presente`,
      );
    }
  }
});

Deno.test('F53: o teto do multiplix-send e POR CONEXAO, nao por destinatario', async () => {
  const src = await read('supabase/functions/multiplix-send/index.ts');
  assert(
    src.includes('multiplix-send:conn:'),
    'a chave do limiter do send deve ser por conexao (F53: "por usuario e por conexao")',
  );
  assert(
    /connectionForLimit/.test(src),
    'a conexao precisa ser resolvida de whatsapp_connection_id',
  );
});
