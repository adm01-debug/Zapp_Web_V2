import './zodJitless';
import { z } from 'zod';

/**
 * Ponto único de importação do Zod v4 no app (`import { z } from '@/lib/zod'`).
 *
 * Por quê: ao criar o primeiro `z.object`, o Zod v4 testa se pode compilar
 * validadores com `new Function("")` (`allowsEval` em `zod/v4/core/util.js`).
 * A CSP do app não tem `'unsafe-eval'`, então esse teste gera — a cada
 * carregamento — a violação "Evaluating a string as JavaScript violates the
 * following Content Security Policy directive" (chunk `schemas-*.js`, que é o
 * `zod/v4/core/schemas.js`). O erro é engolido pelo Zod, mas a violação vai para
 * o console e para o report da CSP.
 *
 * `jitless: true` desliga o compilador e o teste: o Zod valida pelo caminho
 * interpretado (mesmo resultado; os schemas do app são pequenos, sem custo
 * perceptível). A configuração precisa rodar ANTES de qualquer schema ser
 * definido — por isso mora aqui, no módulo que os definidores importam.
 */
// A configuração em si mora em `./zodJitless` (também 1º import de `main.tsx`);
// reafirmada aqui para quem usar `@/lib/zod` fora do app (testes, scripts).
z.config({ jitless: true });

export { z };
