/**
 * Vocabulário canônico de IA — frente do app (IA-021/IA-022).
 *
 * O módulo CANÔNICO vive em `supabase/functions/_shared/ai-vocabulary.ts` — é o
 * arquivo que o runtime Deno empacota para as Edge Functions. Aqui o front NÃO
 * mantém uma segunda cópia: ele reexporta o MESMO arquivo, de modo que só existe
 * UM vocabulário no repositório e não há como este lado divergir do edge (era o
 * defeito B11/B12: o mesmo sentimento/urgência significando coisas diferentes
 * dependendo de quem lia). O SonarCloud flagrava as duas cópias byte-idênticas
 * como 454 linhas de duplicação do bloco — o reexport as elimina sem mudar a API.
 *
 * Regra: qualquer mudança no vocabulário entra SÓ no canônico em
 * `supabase/functions/_shared/ai-vocabulary.ts`. Este arquivo não declara
 * símbolo próprio algum; `tests/contracts/ai-vocabulary-parity.contract.test.ts`
 * prova que cada símbolo exportado aqui é a MESMA referência do canônico.
 */
export * from '../../supabase/functions/_shared/ai-vocabulary';
