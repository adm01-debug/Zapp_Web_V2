/**
 * Contrato numérico da IA — frente do app (etapa IA-023).
 *
 * O módulo CANÔNICO vive em `supabase/functions/_shared/ai-values.ts` — é o
 * arquivo que o runtime Deno empacota para as Edge Functions. Aqui o front NÃO
 * mantém uma segunda cópia: ele reexporta o MESMO arquivo, de modo que a regra
 * dura ("número ausente ou inválido NÃO vira número") e a API (`normalizeScore`,
 * `aggregateScores`) são exatamente as do edge, sem duas fontes para divergirem
 * (o SonarCloud flagrava as cópias byte-idênticas como duplicação do bloco).
 *
 * Regra: qualquer mudança entra SÓ no canônico em
 * `supabase/functions/_shared/ai-values.ts`. Este arquivo não declara símbolo
 * próprio algum; `tests/contracts/ai-values.contract.test.ts` prova que cada
 * símbolo exportado aqui é a MESMA referência do canônico.
 */
export * from '../../supabase/functions/_shared/ai-values';
