/**
 * Liga o modo `jitless` do Zod v4 — e SÓ isso. É o PRIMEIRO import de `main.tsx`.
 *
 * O Zod lê `jitless` ao DEFINIR cada `z.object` e guarda em cache o teste
 * `new Function("")` (`allowsEval`). A CSP do app não tem `'unsafe-eval'`: se um
 * único schema for definido antes desta configuração, o teste roda e a violação
 * vai para o console e para o report da CSP. Rodar aqui, antes de qualquer outro
 * módulo do app ser avaliado, garante a ordem para todo o bundle — inclusive
 * código que importe o Zod por outro caminho.
 *
 * Importa só `config` do núcleo (`zod/v4/core`, a mesma configuração global que o
 * `zod` usa), não a API `z` inteira: o entry não ganha o peso da biblioteca.
 */
import { config } from 'zod/v4/core';

config({ jitless: true });
