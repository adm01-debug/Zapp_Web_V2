# Inventário do estado real do repositório

Gera `inventario/estado/*.json`, fonte de consulta dos agentes — tudo lido de
comando/código, nada escrito à mão.

- `gerar-banco.mjs` — inventário do banco oficial → `inventario/estado/banco.json`.
  Dois modos: com `SUPABASE_ACCESS_TOKEN` (lê a Management API direto) ou
  `--entrada arquivo.json` (resposta salva do MCP oficial, `db_query` com
  `banco.sql`). Sem token, `edge_functions.publicadas` fica `null`. Recusa
  gravar saída com cara de credencial.
- `gerar-repo.mjs` — inventário do lado do repositório (sem acesso ao banco) →
  `inventario/estado/edges.json`: linhas, segredos lidos e quem invoca cada
  edge function. Com `stdin` (lista de nomes de tabela), também escreve
  `tabelas-uso.json`.
- `gerar-rotas.mjs` — inventário das rotas do front → `inventario/estado/rotas.json`:
  lê `AppRoutes.tsx`, `ViewRouter.tsx`, `lazyViews.ts`,
  `navigation.service.ts` e os imports de cada tela.
- `mudou-conteudo.mjs` — compara cada arquivo de `inventario/estado/` com a
  versão do HEAD (ignorando carimbos `medido_em`/`gerado_em`); imprime
  `true`/`false`, usado por `inventario-estado-semanal.yml` para decidir se
  abre PR.
- `banco.sql` — a consulta de leitura usada por `gerar-banco.mjs`.

```bash
node scripts/inventario/gerar-repo.mjs
node scripts/inventario/gerar-rotas.mjs
SUPABASE_ACCESS_TOKEN=... node scripts/inventario/gerar-banco.mjs
node scripts/inventario/mudou-conteudo.mjs
```
