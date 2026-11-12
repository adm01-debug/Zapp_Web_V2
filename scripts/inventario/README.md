# scripts/inventario

Scripts que geram snapshots do estado do repositório para o branch `contexto`:

- `gerar-banco.mjs` — schema e dados do Supabase
- `gerar-repo.mjs` — estrutura de arquivos e metadados do repo
- `gerar-rotas.mjs` — mapa de rotas do frontend
- `mudou-conteudo.mjs` — detecta drift entre snapshots consecutivos

Os snapshots são regenerados pelo workflow `contexto.yml` a cada 10 min.
Não editar a branch `contexto` manualmente.
