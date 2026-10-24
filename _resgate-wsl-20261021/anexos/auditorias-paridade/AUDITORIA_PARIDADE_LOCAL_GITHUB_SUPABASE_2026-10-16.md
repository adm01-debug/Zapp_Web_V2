# Auditoria de paridade Local ↔ GitHub ↔ Supabase

Data de corte: 2026-10-16 15:04 BRT  
Repositório: `adm01-debug/Zapp_Web_V2`  
GitHub `main` auditada: `9c0a82cf426da6c61dcdc5f059d1f538ca948b89`  
Supabase canônico: `tnnnlkbymytvtqngbbqh` (`Zapp_Web_V2`, `ACTIVE_HEALTHY`, PostgreSQL 17.6)  
Natureza: auditoria somente leitura; nenhuma alteração foi aplicada ao GitHub, ao banco ou ao código do projeto.

## Veredito

**NÃO HÁ PARIDADE bidirecional. O estado não pode ser classificado como 10/10.**

O GitHub contém código, migrations e funções que não chegaram à produção; o banco contém estado de permissões, cron e funções não representado corretamente nos baselines/fontes; a árvore local ativa está quatro commits atrás e há conteúdo local não publicado em grande escala. Os gates automáticos que deveriam impedir esse estado também estão quebrados ou desativados na prática.

## Matriz executiva

| Fluxo | Resultado | Evidência principal |
|---|---:|---|
| GitHub `main` → árvore local ativa | FALHA | `HEAD 33df594c`, 4 commits atrás; 1.340 arquivos diferentes, 1.711 ausentes localmente |
| Todos os refs GitHub → banco de objetos Git local | OK | 77/77 heads e 662/662 linhas de tags/peels exatas |
| Conteúdo local → GitHub | FALHA | 919 instâncias de arquivos de trabalho (780 blobs únicos) não alcançáveis por nenhum ref remoto; 3.745 branches locais não alcançáveis por remoto |
| Migrations GitHub → ledger Supabase | FALHA | 1.036 arquivos versus 818 registros; 218 versões só no GitHub |
| Ledger Supabase → GitHub | PARCIAL | nenhuma versão só no DB, porém 4 colisões de nome e 1 versão local duplicada |
| Schema/catálogos GitHub ↔ Supabase | FALHA | catálogo commitado contém 1 tabela/7 colunas/1 função inexistentes no DB; manifesto estrutural commitado incompleto/corrompido |
| Types GitHub ↔ Supabase | FALHA | types vivo: 394.767 chars/FNV `de7d8242`; commitado: 407.651/FNV `817ec8fa` |
| Edge Functions GitHub ↔ Supabase | FALHA | 80/80 funções comuns diferem; 4 só no GitHub; 2 só no remoto |
| Grants GitHub ↔ Supabase | FALHA/SEGURANÇA | baseline de 04/10 diverge; DB concede `anon SELECT` em 4 relações WhatsApp não registradas no baseline |
| Realtime GitHub ↔ Supabase | FALHA | baseline 34 tabelas, publicação viva 32; 2 entradas inexistentes no DB |
| Cron GitHub ↔ Supabase | FALHA | baseline 14, produção 13; 1 job só no DB e 2 só no baseline |
| Storage baseline ↔ Supabase | FALHA | 4 buckets possuem limites vivos não registrados no baseline |
| GitHub `main` → frontend publicado | FALHA | produção web em `5721e4f5`, um commit atrás de `9c0a82cf` |
| CI/guards da `main` | FALHA | CI, E2E, types-sync, DB Guard e deploy Edge vermelhos; DB Guard possui YAML inválido |

## 1. Local ↔ GitHub

### Árvore ativa

- Local: `33df594cd1677ec44dc82087817cc0d7ea2440b4`.
- GitHub `main`: `9c0a82cf426da6c61dcdc5f059d1f538ca948b89`.
- Relação: `0 ahead / 4 behind`.
- Diferença do commit local para a `main`: 3.123 paths (`1.720 A`, `1.339 M`, `64 D`), 361.212 inserções e 30.526 remoções.
- Comparação material da árvore ativa contra a `main`: 4.466 arquivos iguais, 1.340 diferentes, 1.711 somente no GitHub e 67 somente no commit local.
- Working tree ativa: 40 artefatos `.merge_file_*` em estado `AD`, 12 arquivos não rastreados; não há modificação regular rastreada.
- Dos 12 não rastreados: 7 são byte a byte iguais à `main`; 2 documentos diferem da `main`; 3 são sidecars locais de backup do Graphify.
- Há `REBASE_HEAD` órfão (`6e2382a7...`), sem diretório de rebase ativo.

### Universo local completo

- 3.278 worktrees inventariados; 152 estavam sujos no primeiro snapshot e um desapareceu durante a segunda leitura concorrente.
- 3.276 HEADs de worktree não são ancestrais da `main`; 3.046 não são alcançáveis por nenhum ref remoto.
- 4.062 branches locais; 4.048 não alcançáveis pela `main` e 3.745 não alcançáveis por refs remotos.
- 9.866 entradas sujas; 564 entradas não mescladas distribuídas em 7 worktrees.
- 919 instâncias de arquivo de trabalho, representando 780 blobs únicos (excluídos backups Graphify), não aparecem em nenhum ref remoto.
- 7 stashes, 45 entradas; 33 entradas de stash não possuem blob exato alcançável por ref remoto.

### O que está corretamente espelhado

- `git ls-remote` encontrou 77 heads e 331 tags anotadas (662 linhas incluindo peel `^{}`).
- Todos os 77 heads e todas as 662 linhas de tag/peel batem com refs locais.
- O PR #1801 está `MERGED` em `00186198...`, é ancestral da `main`, e há 148 commits posteriores na `main`.

## 2. Migrations e schema canônico

### Ledger

- GitHub `main`: 1.036 migrations SQL top-level.
- Supabase canônico: 818 registros no ledger.
- Só no GitHub: 218 versões, de `20261005095819_scope_wa_label_rpc_by_connection.sql` até `20261016115413_realtime_publication_agent_achievements.sql`.
- Só no DB: 0 versões.
- Colisões de nome para a mesma versão: 4 (`20260828000000`, `20260829020000`, `20260927450000`, `20260927510000`).
- Versão duplicada na árvore: `20261011010000`, usada por:
  - `20261011010000_fix_whatsapp_media_select_contact_scope.sql`
  - `20261011010000_talk_me_list_pending_messages.sql`

Esse resultado impede provar proveniência/replay idempotente, mesmo quando parte dos efeitos estruturais já exista por aplicação manual ou migration equivalente.

### Catálogo

O snapshot commitado é um superconjunto incorreto do banco vivo:

- banco: 168 tabelas, 1.970 colunas, 265 funções, 158 checks;
- GitHub: 169 tabelas, 1.977 colunas, 266 funções, 159 checks;
- somente no GitHub: tabela `talkx_segment_fields`, suas 7 colunas, o check de `kind` e a função `talkx_compile_segment_rules`;
- nenhum objeto dessas categorias existe apenas no banco.

### Manifesto estrutural

O `supabase/schema-manifest.json` commitado perdeu 11 seções de primeiro nível presentes no resultado vivo: `triggers`, `functions`, `constraints`, `type_grants`, `generated_at`, `column_grants`, `schema_grants`, `default_grants`, `format_version`, `routine_grants`, `relation_grants`.

Além disso, a seção `policies` do arquivo commitado contém 2.779 chaves, contra 448 policies vivas; 2.629 chaves extras têm forma de grants (`r:...`, `v:...`, `S:...`). É evidência de montagem/merge incorreto do artefato, não de simples atraso.

### Types

O `src/integrations/supabase/types.ts` não corresponde ao types gerado do projeto canônico:

- vivo: 394.767 caracteres, fingerprint FNV-1a `de7d8242`;
- commitado: 407.651 caracteres, fingerprint `817ec8fa`.

## 3. Edge Functions

- GitHub possui 84 diretórios publicáveis com `index.ts`.
- Manifesto commitado possui apenas 80 e está comprovadamente stale.
- Manifesto regenerado da `main`, em diretório temporário: 84 funções/167 fontes, digest `bd20bc53...`.
- Supabase possui 82 funções `ACTIVE`.
- Interseção: 80; **as 80 diferem em conjunto de arquivos e/ou conteúdo**.
- Em 50 das 80 há mudança no entrypoint ou módulo próprio da função; nas outras 30 a diferença vem de dependências compartilhadas.
- Sinais comuns a todas as 80: GitHub adiciona `_shared/rate-limit-log.ts` e `_shared/request-policy.ts`, remove `_shared/cors-origins.ts` da closure e altera `_shared/validation.ts`.
- Só no GitHub: `ai-usage-outbox-drain`, `automation-suggest-reply`, `invite-user`, `recover-message-media`.
- Só no Supabase: `sicoob-bridge`, `sicoob-bridge-reply` (ambas estão na allowlist de órfãs, mas continuam sem fonte gerenciada).
- `verify_jwt`: sem divergência nas 80 funções comuns.

O workflow de deploy da `main` falhou antes de publicar, exatamente porque o manifesto commitado está stale: run `38937702634`.

## 4. Permissões, Realtime, cron e Storage

### Grants

Baseline commitado: `2026-10-04`; medição viva: `2026-10-16`.

- `anon_execute`: vivo 1, baseline 2; o vivo contém `multiplix_audiences_validate_shared_roles()`, enquanto o baseline lista duas rotinas que já não representam o estado vivo.
- `anon_table_select`: vivo 123, baseline 119.
- Grants `anon SELECT` presentes no DB e ausentes do baseline: `whatsapp_connections`, `whatsapp_connections_agent`, `whatsapp_connections_public`, `whatsapp_connections_safe`.
- `service_role_execute_count`: 267 vivo vs. 252 baseline.
- `authenticated_execute_count`: 142 vivo vs. 134 baseline.

### Realtime

- Publicação viva: 32 tabelas.
- Baseline: 34.
- Só no baseline: `public.agent_achievements`, `public.talkx_blacklist`.

### pg_cron

- Vivo: 13 jobs; baseline: 14.
- Só no vivo: `searchbox-budget-alert` (`0 12 * * *`).
- Só no baseline: `expire-orphan-user-sessions` e `security-acl-score`.
- O baseline ainda usa `project_ref: "placeholder"`.

### Storage

Os 8 IDs de bucket batem, mas o baseline omite limites que existem no DB em quatro buckets:

- `audio-memes`: 52.428.800 bytes;
- `audio-messages`: 52.428.800 bytes;
- `stickers`: 5.242.880 bytes;
- `whatsapp-media`: 104.857.600 bytes.

## 5. CI, proteção da main e deploy web

- `bun install --frozen-lockfile --ignore-scripts` falha localmente na cópia exata da `main`: o lockfile mudaria.
- A mesma causa derrubou CI, E2E e types-sync no GitHub.
- `actionlint` reprova `.github/workflows/db-guard.yml` em duas etapas sem `run` nem `uses` (linhas 1521 e 1794); o run da `main` nasceu sem jobs/logs (`38937700605`).
- O DB Live Guard deixou de rodar em push e passou a ser apenas semanal/manual; portanto não mediu o merge `9c0a82cf`.
- Runs vermelhos do SHA auditado:
  - DB Guard: `38937700605`;
  - Deploy Edge: `38937702634`;
  - CI: `38937702663`;
  - E2E autenticado/deslogado: `38937702659`;
  - types-sync: `38937702655`.
- A branch `main` não possui branch protection e o repositório não possui rulesets.
- Os três domínios (`zapp-web-v2.vercel.app`, `app.zapp.com.br`, `zapp.com.br`) servem build `5721e4f5000c242bc7cfa984a7ffa44bf27768e5`, ancestral direto e um commit atrás da `main` auditada.

## 6. Bancos locais

- 15 containers PostgreSQL Supabase locais estavam ativos no corte, ligados a stacks/worktrees distintos.
- Os schemas variavam entre 89, 140 e 171 tabelas; a maioria das previews tinha 170.
- Nenhum desses bancos locais mantinha linhas no ledger `supabase_migrations` (dois sequer tinham a relação), portanto eles são ambientes de replay/preview, não réplicas auditáveis do canônico.
- A fixture local tem 114 linhas, hash `c5df5f96580649ced70144dbfb4835ae5e64e310f304a9c751c0e6436adfd8c3` e declara explicitamente não conter dados reais de cliente.
- Dados transacionais de clientes não foram exportados nem comparados com GitHub: eles não devem ser versionados. A auditoria cobriu metadados, schema, ledger, grants, funções, configurações, baselines e fixtures sintéticas.

## Prioridade de reconciliação

1. Congelar merges/deploys até corrigir `bun.lock`, o YAML do DB Guard e proteger a `main` com checks obrigatórios.
2. Classificar as 218 migrations em: realmente pendentes, já aplicadas com outro identificador ou redundantes; corrigir a versão duplicada antes de qualquer `db push`.
3. Fazer backup e plano de rollback; só então aplicar/reconciliar migrations em lotes verificáveis.
4. Corrigir o baseline de grants e revisar imediatamente os quatro grants de `anon SELECT` em relações WhatsApp.
5. Regenerar catálogo, manifesto, types, grants, Realtime, cron e Storage a partir do estado canônico reconciliado.
6. Regenerar o manifesto Edge e publicar as 84 funções com atestado pós-deploy; decidir formalmente o destino das duas órfãs Sicoob.
7. Revalidar os 80 hashes/closures remotos, `verify_jwt`, smokes e o build web no mesmo SHA.
8. Preservar e triagem dos 780 blobs locais únicos e 33 entradas de stash antes de limpar worktrees/branches.

## Critério para declarar paridade

Só declarar concluído quando: árvore local limpa e no SHA da `main`; zero blob funcional não publicado; ledger sem versões pendentes/duplicadas/colididas; todos os derivados byte-equivalentes ao banco; Edge set e closure equivalentes; grants/Realtime/cron/Storage equivalentes; build web no mesmo SHA; CI, DB Guard, DB Live Guard, types-sync, E2E e deploy Edge verdes; branch protection/rulesets impedindo regressão.
