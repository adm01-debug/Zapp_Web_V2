/**
 * `src/lib/zodJitless.ts` liga o `jitless` escrevendo direto no objeto global de
 * configuração do Zod (`globalThis.__zod_globalConfig`), sem importar o núcleo —
 * importar o núcleo no entry estourava o budget do bundle inicial. Este teste é a
 * trava contra uma mudança interna do Zod: se o Zod deixar de ler esse objeto, o
 * `config()` real deixa de enxergar o `jitless` e o teste falha.
 *
 * Arquivo próprio e SEM importar `@/lib/zod`: aquele módulo também chama
 * `z.config({ jitless: true })` e mascararia uma falha do `zodJitless`.
 */
import { describe, expect, it } from 'vitest';

describe('zodJitless — jitless sem importar o núcleo do Zod', () => {
  it('depois de importar zodJitless, o config() real do Zod tem jitless e é o mesmo objeto global', async () => {
    await import('@/lib/zodJitless');
    const { config } = await import('zod/v4/core');
    const global = (globalThis as { __zod_globalConfig?: object }).__zod_globalConfig;
    expect(config().jitless).toBe(true);
    expect(config()).toBe(global);
  });

  it('com jitless, definir e validar um objeto não testa new Function (CSP sem unsafe-eval)', async () => {
    await import('@/lib/zodJitless');
    const { z } = await import('zod');
    const original = globalThis.Function;
    let chamadas = 0;
    globalThis.Function = new Proxy(original, {
      construct(alvo, args) { chamadas += 1; return Reflect.construct(alvo, args); },
      apply(alvo, self, args) { chamadas += 1; return Reflect.apply(alvo, self, args); },
    });
    try {
      const schema = z.object({ a: z.string(), b: z.number().int() });
      expect(schema.safeParse({ a: 'x', b: 1 }).success).toBe(true);
      expect(schema.safeParse({ a: 1, b: 1.5 }).success).toBe(false);
    } finally {
      globalThis.Function = original;
    }
    expect(chamadas).toBe(0);
  });
});
