# scripts/docs

`verificar-docs-realtime.mjs` — valida que as páginas de documentação do Realtime
estejam sincronizadas com código-fonte e migrations. Verifica citações
`arquivo:linha`, assinaturas de tabelas em `src/`, estado da publication
`supabase_realtime` e claims de migration.

Uso: `node scripts/docs/verificar-docs-realtime.mjs`
Falha: lista cada divergência no formato `- <doc>: <problema>`.
