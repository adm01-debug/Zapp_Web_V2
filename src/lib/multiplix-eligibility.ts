/**
 * Mapa único de ELEGIBILIDADE do Multiplix — frente do app.
 *
 * O módulo CANÔNICO vive em `supabase/functions/_shared/multiplix-eligibility.ts`
 * — é o arquivo que o runtime Deno empacota para as Edge Functions. Aqui o front
 * NÃO mantém uma segunda cópia: ele reexporta o MESMO arquivo, de modo que só
 * existe UM mapa no repositório e não há como este lado divergir do edge (o
 * defeito que o vocabulário de IA já corrigiu com o mesmo desenho). Sem isto, o
 * front compararia elegibilidade com literais PT ("apto") enquanto o banco fala
 * EN ("eligible") — a mesma classe de defeito B11/B12 (o mesmo valor significando
 * coisas diferentes dependendo de quem lê).
 *
 * Regra: qualquer mudança no mapa entra SÓ no canônico em
 * `supabase/functions/_shared/multiplix-eligibility.ts`. Este arquivo não declara
 * símbolo próprio algum — é um `export *` puro, então o front só alcança o que o
 * canônico exporta e nunca uma cópia que possa divergir.
 */
export * from '../../supabase/functions/_shared/multiplix-eligibility';
