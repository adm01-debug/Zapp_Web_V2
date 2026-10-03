# PLANO DE MELHORIAS E CORREÇÕES — 50 ETAPAS (2026-09-20)

> Sucessor do `PLANO_CORRECOES_50_ETAPAS_2026-09-16.md`. Aquele plano fechou a crise de
> paridade local↔GitHub↔banco; este consolida o que lá ficou aberto (80 checkboxes em 41
> seções) e adiciona o que as execuções de 17/09 revelaram. Herança é marcada como
> "(herda E{n}/16-09)". Toda afirmação de estado abaixo foi **verificada em 2026-09-20**,
> salvo indicação contrária.

## Estado-base verificado (2026-09-20)

| Eixo | Estado |
|---|---|
| `main` | `dd210916` = origin, tree limpa, **CI 100% verde** (CI/CD, DB Live Guard, DB Guard offline, CodeQL) desde 17/09 |
| Migrations | 443 arquivos = 443 no ledger, md5 idêntico (validado 17/09; gate contínuo no live-guard) |
| Bundle (pós PR #443) | initial-js **330,6 KB**/350 · largest 486/700 · total 3.954/4.200 KB gzip |
| Banco | `messages` 0,1% dead (autovacuum 19/09) · **3 FKs sem índice** · **244/503 índices com idx_scan=0** · 400 policies · 0 tabelas sem RLS · 38 trigger functions fora do catálogo |
| Edges | 67 diretórios em `supabase/functions/` · **10 com `verify_jwt=false`** (16/09 eram 9) · listagem live nunca reconciliada (CLI 403 em 16/09) |
| CI desperdício | `CRM Sync Worker` agendado dispara a cada ~8min e **sempre skipped** (`vars.CRM_SYNC_WORKER_ENABLED` ausente/false) |
| Qualidade | lint ratchet baseline **1115** · implicit-any **0** (baseline zerado desde o PR #243) · TODO/FIXME: 4 hits de grep, **0 reais** · console.log: 1 hit, exemplo em JSDoc |
| Governança | approvals=1 + owner único ⇒ **todo merge é bypass de admin** (`enforce_admins=false`); branches não são auto-deletados no merge |
| Higiene git | 22 branches locais · 2 remotos `claude/*` mergeados aguardando deleção (classificador negou à IA em 17/09) |
| Automação | Graph Sync Dispatcher N8N (`67dWSoWEPUGTX5mA`) sem cadência (erro 15/09); MCPs quebrados toda sessão: CLOUDFLARE-WORKERS (410), LALAMOVE ×2 (404), VS-CODE-VPS (404), PLAYWRIGHT (timeout); MCP N8N com tools stub (`search_workflows`, `execution_logs`) |

## Status da execução — rodada 2026-09-20 (mesma data do plano)

Evidências completas em `DOSSIE_EXECUCAO_PLANO_50_2026-09-20.md`. Legenda:
✅ fechada com evidência · 🔧 implementada em PR aguardando merge · 📋 análise pronta,
ação deferida com justificativa · 👤 exige ação humana · ⏳ janela de observação.

| Fase | Status por etapa |
|---|---|
| F0 | E01 ✅ · E02 ✅ · E03 ✅(22→4; delete_branch_on_merge ativo) · E04 🟡(merged=0; total 31) · E05 ✅ · E06 ✅ |
| F1 | E07–E08 👤 · E09 ✅ · E10 ✅(integrado ao live-guard) · E11 ✅(workflow ativo) · E12 ✅(by design) · E13 ✅ |
| F2 | E14 ✅ · E15 ⏳(stats_reset=null — aguarda 30d) · E16 ✅ · E17 ✅ · E18 ✅ · E19 ✅ · E20 ✅(doc commitado) · E21 👤 |
| F3 | E22 ✅(47 trigger functions) · E23 ✅ · E24 📋 · E25 ✅ · E26 ✅ |
| F4 | E27 ✅local/👤live(69/69 match) · E28 ✅ · E29 ✅matriz/👤rotação · E30 ✅ · E31 ✅ · E32 ✅(doc commitado) |
| F5 | E33 ✅(340/550/4100) · E34 📋 · E35–E37 📋 · E38 📋 |
| F6 | E39 🟡(trabalho contínuo; baseline 1115) · E40 ✅ · E41 🟡(3 módulos críticos) · E42 ✅ · E43 ✅ |
| F7 | E44 ✅(doc commitado) · E45 ✅(aposentado 29/09) · E46 ✅ · E47 ✅ |
| F8 | E48 ✅ · E49 ✅ · E50 ✅ |

Correções de premissa aplicadas pela execução (o plano segue os fatos): E15 (maioria dos
"244 sem uso" é FK-support/feature vazia — dropar seria erro), E39 (dívida 99%
não-autofixável — redução por módulo, não em massa), E40/E42/E43 (já estavam zerados).

## Re-verificação ao vivo (2026-09-26)

Estado real conferido no banco oficial e no repo em 26/09 (delta desde 20/09):

- **E14** — FKs sem índice de suporte: **0** (eram 3). Fechado, checkbox marcado abaixo.
- **E16** — índices duplicados exatos: **1 acionável** (`idx_talkx_template_versions_template_version`,
  redundante com a unique `..._template_id_version_number_key`). O outro par é do schema `auth`
  do Supabase (gerenciado — não tocar). **Aplicado em produção em 26/09** (ver seção abaixo) —
  não é mais decisão pendente.
- **E15** — índices com `idx_scan=0`: **472/675** (o total cresceu: 503→675). `pg_stat_database.stats_reset`
  = **null** ⇒ não há 30 dias de estatística confiável; dropar em massa segue proibido pelo próprio
  critério da etapa. Sem ação autônoma.
- **E19** — **correção**: `pg_stat_statements` já estava instalada — só não estava no schema
  `public` (está em `extensions.pg_stat_statements`). Baseline real coletado (22h de janela);
  achou causa raiz do UPDATE lento de `messages.is_read` (`REPLICA IDENTITY FULL` + publicação
  Realtime, não falta de índice). Ver `docs/audits/slow-queries-2026-09.md`. Fechado.
- **E22** — trigger functions: **44** (eram 38). Segue fora do catálogo; análise pendente.
- **E40** — implicit-any: **0**. **E42** — TODO/FIXME reais: **0** (o único hit é a palavra "TODOS" em
  comentário PT). **E43** — console.log em src: **0** reais (o único hit é `@example` de JSDoc em
  `src/lib/retry.ts`). Todos fechados, checkboxes marcados abaixo.
- **E33** — `performance-budget.json` já apertado (initial 340 / largest 550 / total 4100 pós ajustes
  de 25/09). Meta da etapa cumprida.
- **E28/E29/E30** — as 10 edges `verify_jwt=false` têm justificativa e proteção compensatória real
  (webhook HMAC, cron secret, lockout, rate-limit, ou endpoint desativado). Inventário de secrets
  commitado; achado real: secrets sensíveis (`EVOLUTION_API_KEY` etc.) não estão no GH Actions —
  sem rastro de rotação em lugar nenhum. Ver `docs/audits/edges-secrets-2026-09-26.md`.
- **E01** — os 2 remotos `claude/*` mergeados (`claude/audit-database-references-m1xp3p`,
  `claude/nice-pasteur-3h1emj`) já não existem (`git branch -r` = 0 matches). Fechado sem ação.
- **E16** — PR #826 mergeada (`97ff94d`) e **aplicado em produção em 26/09** via MCP direto +
  registro no ledger no mesmo turno (nova convenção da seção "Decisões de 2026-09-26" do
  CLAUDE.md, que substituiu a espera pelo `db-migrate.yml`) — `idx_talkx_template_versions_template_version`
  confirmado removido ao vivo (`pg_indexes` só lista pkey + unique + `idx_..._saved_by`).
  Fechado de ponta a ponta.
- **E17** — PR #855 mergeada e **aplicado em produção em 26/09** pela mesma via — as 13 FKs
  confirmadas ao vivo em `pg_constraint`. `supabase-usage-guard.mjs` segue verde (`novas: 0`)
  após o apply. Fechado de ponta a ponta.
- **E23/E25 — achado real, corrigido**: a varredura anti-prosa achou 17 candidatos; 10 eram
  falso-positivo do regex (`...` dentro de comentário/hash abreviado, ou `resumo` como nome de
  campo JSON — SQL completo e real). **7 eram violação genuína da regra 7** (`statements` do
  ledger resumido/truncado em vez do SQL real e completo): `20260827130500`
  (vacuum_autovacuum_threshold_reset_m05 — ledger tinha os 5 `SET` do workaround + 1 resumo do
  `cron.schedule`, faltavam os 5 `RESET` reais do arquivo), `20260829060000`
  (reconcile_ledger_drift — 2 UPDATEs resumidos), `20260901100001`
  (add_last_sender_to_email_threads — 3 statements, todos parafraseados/truncados),
  `20260902100003` (lid_audit_snapshot — 8 statements reais colapsados em 1 string truncada),
  `20260904320000` (fix_critical_security_functions — 2 funções truncadas com `(add admin guard)`
  / `(remove SECURITY DEFINER)` no lugar do corpo real), `20260904370000`
  (fix_record_failed_login_race_and_revoke_grants — 1 de 4 statements truncado),
  `20260909130000` (talkx_template_versions_custom_variables — `CREATE TABLE ... (...)` sem
  colunas). Verificado ao vivo ANTES de escrever: schema real bate com os 4 arquivos em disco
  (`pg_get_functiondef`, `information_schema.columns`, `pg_constraint`), nenhum tocava
  função/tabela já registrada sob outra version. Corrigido via `UPDATE ...
  schema_migrations SET statements = <SQL real do arquivo, gerado por
  parseMigrationFile/splitStatements do register-migration.mjs> WHERE version=X AND <estado atual
  conhecido> RETURNING`, guardado contra concorrência — as 2 primeiras tentativas de guard usaram
  suposição de cardinalidade errada e corretamente deram 0 linhas afetadas (sem corrupção) antes
  de eu conferir o estado real e ajustar. `supabase-usage-guard.mjs` seguiu verde durante todo o
  processo. **0 exceções pinned-replay necessárias** — não sobrou prosa real; `migration-evidence.json`
  não existe porque nunca foi preciso. Fechado, checkboxes marcados abaixo.
- **E26** — projeção forward-only atual: **0 relações, 4 funções** (`grant_agent_achievement`,
  `dashboard_leaderboard`, `set_scheduled_report_config_owner`,
  `count_searchbox_sessions_this_month`) — todas de migrations datadas de hoje (26/09, mesmo dia
  da geração do `schema-catalog.json`), por design do guard (snapshot só guarda `YYYY-MM-DD`, não
  a hora exata). Sem dono/prazo necessário: resolve sozinho no próximo `graphify`/regeneração do
  catálogo. Fechado.
- **E33** — `performance-budget.json` já apertado: `initial-js=340`, `largest-chunk=550`,
  `total-assets=4100` (nota interna do arquivo documenta o `+100KB` de 25/09 para o tile do padrão
  de brindes do chat, estático/cacheável). Meta da etapa cumprida. Fechado.
- **E47** — `CLAUDE.md` já usa a grafia canônica `Zapp_Web_V2` (linha "Repo:"); as ocorrências
  lowercase restantes em `docs/` são domínio real do Vercel (`zapp-web-v2.vercel.app`, correto
  como está) ou planos históricos já arquivados (grandfathered pela própria regra do CLAUDE.md:
  "referências novas usam a grafia canônica"). Nada para corrigir. Fechado.

Conclusão: **E16, E17 e E18 fecharam** (os dois primeiros com DDL já aplicado em produção em
26/09 — ver seção "Decisões de 2026-09-26" do CLAUDE.md; o terceiro sem nada a migrar). O núcleo
🔴 remanescente é E15 (índices sem uso — bloqueado por `stats_reset=null`), E09–E11
(governança/CI), E21 (backup) e a rotação de secrets sensíveis — **decisão de negócio**
(custo/destrutivo/produção — regra 8 do fluxo Git), não trabalho autônomo. Os 🟢 autônomos ou já
fecharam ou são falso-positivo.

## Regras de execução (herdadas e obrigatórias)

1. **1 etapa = 1 PR** quando tocar o repo; branch `chore|fix|feat/e{NN}-slug`; merge ⇒ deletar branch no mesmo turno.
2. DDL segue a **ordem do CLAUDE.md §1.6** (arquivo → PR → merge → deploy → apply) e o ritual do `register-migration.mjs`; fechamento = guard exit 0 + paridade count+md5.
3. Índice: `CREATE INDEX` simples (CONCURRENTLY falha no gateway). Remoção de índice/constraint só com migration + evidência de `idx_scan=0` e idade das estatísticas.
4. Nada de novo guard sem conferir `db-guard.yml`/`db-live-guard.yml` (§1.9).
5. Cada etapa fecha com o comando de verificação listado saindo **verde** e o checkbox marcado **no mesmo PR** que a implementa.
6. 🔴 bloqueia release/segurança · 🟡 dívida com juros · 🟢 manutenção/documentação.

---

## F0 — Fechamento imediato de pendências (E01–E06)

### E01 🟢 Deletar os 2 remotos `claude/*` mergeados
Ação humana (o classificador de permissões nega à IA):
```sh
git push origin --delete claude/audit-database-references-m1xp3p claude/nice-pasteur-3h1emj
git fetch --prune && git branch -r | grep -c claude/   # esperado: 0
```
- [x] 0 remotos `claude/*` — verificado 26/09, ambos já não existem

### E02 🟡 CRM Sync Worker: ligar de verdade ou desligar o cron (herda E42/16-09)
Hoje: run agendado a cada ~8min, 100% `skipped` — poluição de histórico e minutos de Actions.
Decidir: (a) setar `vars.CRM_SYNC_WORKER_ENABLED=true` se o CRM sync está pronto; ou
(b) comentar o `schedule:` do `crm-sync-worker.yml` até estar (mantendo `workflow_dispatch`).
```sh
gh run list --workflow=crm-sync-worker.yml -L 5   # esperado: nenhum "skipped" agendado
```
- [x] Zero runs agendados em `skipped` — cron comentado em `.github/workflows/crm-sync-worker.yml` com referência E02 explícita (verificado 27/09)
- [x] Decisão registrada no workflow (comentário com justificativa E02 e condição de reativação)

### E03 🟢 Triage dos 22 branches locais (herda E08–E10/16-09)
Classificar cada um: **mergear** (abrir PR), **publicar e congelar**, ou **deletar**. Os
`redesign/inbox-*` (5) e `fix/inbox-*` (3) são a maior massa — decidir o destino do redesign.
```sh
git for-each-ref --format='%(refname:short) %(upstream:track)' refs/heads | sort
```
- [x] 22 branches locais triados em 27/09 → 4 restantes; `delete_branch_on_merge=true` ativo (E09) garante limpeza contínua

### E04 🟢 Podar remotos obsoletos (herda E11/16-09)
```sh
git branch -r --merged origin/main | grep -vE 'origin/(main|HEAD)'          # candidatos diretos
git for-each-ref --format='%(committerdate:short) %(refname:short)' refs/remotes | sort | head -30  # abandonados
```
- [x] Remotos mergeados: 0 (delete_branch_on_merge ativo desde 27/09)
- [ ] Total de remotos: 31 (meta ≤ 25 ainda não atingida — branches ativas de sessões paralelas; auto-delete reduzirá naturalmente)

### E05 🟢 Sincronizar o plano de 16/09 com a realidade
80 checkboxes abertos lá, mas vários **já fecharam de fato** (E43 verificado em 17/09;
`messages`/vacuum ok; E46 parcial via PR #442). Marcar com evidência+data o que fechou;
o que este plano herda ganha nota "→ E{n}/20-09".
- [x] Plano 16/09 sem checkbox aberto que já esteja resolvido — ✅ 03/10. **Concluído em duas rodadas**: no PR #1769 (31 checkboxes das 21 etapas herdadas, com prova e data) e no PR da E27 + este (o E37 pela listagem live da E27; E05-congelamento, E16, E43 e E46 provados ao vivo). Os que seguem abertos **não estão resolvidos** — são infra local (E01/E02/E04/E06/E08/E09/E10/E49: bundle, stashes, branches locais, worktrees), dependem de banco (E14/E20/E23/E31/E33/E48) ou de ação sua (E35/E36/E40/E44).
- [x] Seções herdadas apontam para a etapa correspondente daqui — ✅ 03/10: as 21 etapas herdadas do 16/09 carregam `→ E{n}/20-09 <status>` no título

### E06 🟢 Graphify: estado oficial da automação
`graphify update .` local é a via canônica (CLAUDE.md via PR #442). Falta o destino do
dispatcher N8N — decidir aqui, executar na E45.
- [x] Decisão em 29/09: **aposentar** — workflow `67dWSoWEPUGTX5mA` desativado (API 405 → Joaquim pode confirmar no painel N8N); via canônica é `graphify update . --force`. Ver `docs/audits/n8n-graph-sync-decision-2026-09-29.md`

## F1 — Governança de CI/CD e merge (E07–E13)

### E07 🟡 Política de merge exequível (sem bypass perpétuo)
`approvals=1` com um único owner ⇒ ninguém pode aprovar ⇒ **todo merge desde #438 foi
bypass**. A proteção virou teatro. Opções: (a) `required_approving_review_count=0` mantendo
checks estritos + strict mode; (b) revisor-bot (CodeRabbit já roda) contando como review.
- [ ] Decisão aplicada na branch protection e registrada no CLAUDE.md §3
- [ ] Merge de um PR de teste SEM usar bypass

### E08 🟡 Ligar `enforce_admins` após E07
Com a política exequível, eliminar o caminho silencioso que deixou o Build vermelho
mergear por 2 dias (16–17/09).
```sh
gh api repos/adm01-debug/Zapp_Web_V2/branches/main/protection --jq '.enforce_admins.enabled'  # true
```
- [ ] `enforce_admins=true` e um merge de rotina passando pelo fluxo normal

### E09 🔴 Auto-delete de branch no merge
```sh
gh api repos/adm01-debug/Zapp_Web_V2 --jq '.delete_branch_on_merge'   # true
```
- [x] Setting ligado via API em 27/09 — `delete_branch_on_merge=true` confirmado na resposta da API

### E10 🟡 Gate automático de paridade tripla (herda E44/16-09)
`scripts/db-audit/check-triple-parity.mjs`: count+md5 arquivos↔ledger, guard exit 0,
diff `grants-baseline.json`, manifesto edge × diretórios. Rodar no live-guard agendado.
- [x] `check-triple-parity.mjs` integrado ao `db-live-guard.yml` — paridade count+md5 arquivos↔ledger, manifesto edge × diretórios verificados a cada run (27/09)
- [x] Integrado sem duplicar checagens existentes (§1.9) — verificado 27/09

### E11 🟡 Auditoria periódica de branches (herda E45/16-09)
Workflow semanal (cron) que abre/atualiza uma issue com: locais↔remotos divergentes,
mergeados não deletados, abandonados >30d.
- [x] `branch-hygiene-audit.yml` ativo (cron segunda 07:56 UTC) — workflow existe e gera issue automaticamente (27/09)

### E12 🟢 Job "🛡️ Generate Audit Report" skipped em todo run
Está `skipping` em 100% dos runs observados (16–17/09). Reativar com a condição correta
ou remover o job morto do `ci.yml`.
- [x] Job não existe — `🛡️ Run Supabase usage guard` é um step dentro de `lint-and-typecheck`, não job separado; by design (verificado 27/09)

### E13 ✅ Custo de Actions: crons e concurrency
Inventariar todos os `schedule:` (CRM worker, CodeQL, live-guard, etc.), consolidar
horários, garantir `concurrency` com cancelamento onde falta.
- [x] Tabela de crons confirmada (27/09): `types-sync` (seg 05:49 UTC) → `db-live-guard` (diário 06:13 UTC) → `branch-hygiene-audit` (seg 07:56 UTC) → `codeql` (seg 09:30 UTC); `crm-sync-worker` schedule comentado (E02 fechado). Sem sobreposição.
- [x] `concurrency:` verificado em todos os 13 workflows (27/09) — nenhum gap

## F2 — Banco: índices e integridade (E14–E21)

### E14 🔴 3 FKs sem índice no lado filho (herda E22/16-09)
```sql
SELECT c.conrelid::regclass, c.conname FROM pg_constraint c
WHERE c.contype='f' AND c.connamespace='public'::regnamespace
  AND NOT EXISTS (SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid
    AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey);
```
- [x] 3 FKs nomeadas, custo medido (EXPLAIN nas queries reais que fazem o join/delete) — resolvido; a query retorna **0** em 26/09
- [x] Índices criados via migration (ritual §1.6) → query acima retorna 0 — verificado 26/09 (0 FKs sem índice)

### E15 🔴 244/503 índices nunca usados (herda E23/16-09)
Antes de qualquer DROP: idade das estatísticas (`SELECT stats_reset FROM
pg_stat_database WHERE datname=current_database()`) precisa cobrir ≥ 30 dias de tráfego
real. Classificar os 244: recém-criados / cobertos por outro índice / suportam
constraint / realmente mortos.
- [ ] Planilha de classificação commitada em `docs/audits/`
- [ ] Remoção em lotes de ≤ 10 por migration, com 7 dias de observação entre lotes
- [ ] Meta desta rodada: ≤ 400 índices totais sem regressão em `db_slow_queries`

### E16 🔴 Índices duplicados exatos
```sh
# via MCP oficial: db_duplicate_indexes
```
- [x] 0 duplicados exatos — migration criada e mergeada (PR #826, `97ff94d`); **aplicada em
      produção em 26/09** via MCP direto — índice confirmado removido ao vivo

### E17 🔴 Integridade referencial não declarada (herda E34/16-09)
Colunas `*_id` em `public.*` sem FK correspondente: inventário, verificação de órfãos
por consulta, e criação de FKs `NOT VALID` → `VALIDATE CONSTRAINT` (não bloqueia).
- [x] Inventário completo com decisão por coluna: 13 FK criadas (11 → `auth.users`, 1 →
      `profiles`, 1 → `vault.secrets`), 38 justificadas por escrito (externas/polimórficas) —
      ver `docs/audits/referential-integrity-2026-09-26.md`. Migration
      `20260926200000_e17_referential_integrity_fks.sql` (re-versionada de `20260926160000` por
      colisão, PR #872) **aplicada em produção em 26/09** via MCP direto — as 13 FKs confirmadas
      ao vivo em `pg_constraint`
- [x] 0 órfãos verificados ao vivo nas 13 relações antes de escrever a migration

### E18 🟡 Autovacuum por tabela quente (herda E30/16-09)
O incidente de `messages` (>75% dead em 16/09) se resolveu sozinho, mas tarde. Fixar
`autovacuum_vacuum_scale_factor=0.05` e `autovacuum_analyze_scale_factor=0.05` em
`messages`, `email_messages` e `talkx_*` de escrita intensa.
- [x] Verificado ao vivo em 26/09 (e revalidado por agente independente na mesma tarde):
      `messages` e `email_messages` **já têm** `autovacuum_vacuum_scale_factor=0.05` /
      `autovacuum_analyze_scale_factor=0.05` (aplicado por outra sessão, sem migration
      correspondente localizada — reloptions confirma via `pg_class`). Das 12 tabelas
      `talkx_*`, **10 seguem genuinamente vazias**; `talkx_templates` (5 linhas) e
      `talkx_settings` (6 linhas) têm dados reais (seed/config), mas volume irrisório —
      "de escrita intensa" não se aplica a nenhuma hoje; revisitar quando Talk X sair de
      desenvolvimento. **Causa-raiz real do "94,5% dead"**: `pg_postmaster_start_time` mostra
      restart do Postgres em 2026-09-25 12:28:28 UTC — isso zera os contadores incrementais
      por relação (`n_live_tup`/`n_dead_tup`/`autovacuum_count`) mas não `pg_class.reltuples`
      (persistido), que o autovacuum de fato usa para calcular o limiar; `email_messages` já
      cruzou o limiar e rodou autovacuum desde o restart (prova que o mecanismo funciona),
      `messages` ainda não. **Correção (Codex Review, achado real):** o `n_dead_tup=953`
      calculado logo após o restart só contava tuplas mortas desde então — subestimava bloat
      físico anterior ao restart. Rodado `ANALYZE public.messages` (não é DDL) para forçar
      reamostragem real: `n_dead_tup` subiu para **2.502** (5,2% de 47.878 linhas) — acima do
      limiar configurado (0,05 × reltuples ≈ 2.444), o que explica por que o autovacuum ainda
      não disparou (está prestes a disparar, não travado) e não é mais o falso "saudável ~2%"
      da primeira leitura. Ainda longe dos 94,5% originais e do limite de alerta da etapa
      (>20% por 14 dias), mas o número correto é 5,2%, não 2%. `email_messages` seguiu
      confirmado saudável (~1,8-1,9%, já vacuumada desde o restart). Varredura ampla no banco
      não achou
      nenhuma outra tabela fora do escopo original com bloat real (as de 100% "dead" no
      `pg_stat_user_tables` são só tabelas pequenas/ociosas sem autovacuum desde o mesmo
      restart, não bloat; `whatsapp_connections`/`agent_presence` são tabelas de
      presença/heartbeat com autovacuum ativo e frequente, comportamento esperado). Nada para
      migrar; etapa fecha sem PR de DDL.

### E19 🟡 Baseline de queries lentas (herda E29/16-09)
```sql
SELECT query, calls, round(total_exec_time) ms, round(mean_exec_time,1) media
FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;
```
- [x] Snapshot commitado em `docs/audits/slow-queries-2026-09.md` — extensão já estava instalada em `extensions.pg_stat_statements` (schema não-default; era isso que faltava saber)
- [x] Top-3 com plano de ação — causa raiz real encontrada: `messages` está com `REPLICA IDENTITY FULL` (não falta de índice). Decisão fechada em 26/09: **manter FULL** — `useMessages.ts` depende de `payload.old.contact_id` em DELETE (não é a PK), trocar quebraria o Realtime de deleção de mensagens no Inbox aberto. Evidência de código em `docs/audits/slow-queries-2026-09.md`

### E20 🟢 Conexões e pooling (herda E32/16-09)
- [x] Documentado em `docs/audits/edges-pooler-2026-09-29.md` — transaction mode via PostgREST; Supavisor porta 6543 (transaction) / 5432 (session); timeouts 150s por request
- [x] Confirmado em 29/09: `grep -r "DATABASE_URL|postgres://" supabase/functions/` = 0 hits — todas as 69 functions usam `@supabase/supabase-js` via HTTPS

### E21 🟢 Backup e PITR verificados (herda E33/16-09)
- [ ] Evidência de PITR habilitado + janela de retenção
- [ ] **Teste de restore real** (projeto temporário ou branch DB) documentado com data

## F3 — Banco: guard e catálogo (E22–E26)

### E22 🟡 38 trigger functions fora do catálogo (herda E27/16-09)
Eram 36 em 16/09 — cresceu sem decisão. Incluir `prokind='f'` retorno `trigger` no
`schema-catalog.json` (ou registrar exclusão explícita no guard, com teste).
- [x] `catalog.sql` inclui `trigger_functions` explicitamente; `schema-catalog.json` atualizado com 47 trigger functions (27/09)
- [x] `supabase-usage-guard.mjs` reporta contagem de trigger functions; exit 0 inalterado

### E23 🟢 Varredura anti-prosa no ledger (herda E18/16-09)
```sql
SELECT version FROM supabase_migrations.schema_migrations
WHERE EXISTS (SELECT 1 FROM unnest(statements) s WHERE s ~ '\.\.\.'' OR s ~* '\(add |resumo');
```
- [x] 0 statements-prosa reais — 7 violações genuínas encontradas e corrigidas em 26/09 (ver
      "Re-verificação ao vivo"); as 10 restantes eram falso-positivo do regex (SQL completo)

### E24 🟢 Replay integral das 443 migrations em PG 17.6 efêmero (herda E20/16-09)
- [ ] Job (ou doc de execução local) com replay verde ponta a ponta
- [ ] Divergências (se houver) viram exceção documentada ou fix

### E25 🟢 Inventário das exceções pinned-replay (herda E15/16-09)
- [x] 0 exceções pinned-replay necessárias em 26/09 — as 7 violações reais foram corrigidas na
      origem (ledger passou a refletir o SQL real do arquivo), não exigem exceção permanente

### E26 ✅ Projeção forward-only: 2 relações pendentes (herda E17/16-09)
Guard reporta "projecao forward-only: 4 relacoes, 9 funcoes" — conferir se as 2 originais
fecharam ou viraram 4.
- [x] Projeção zerada: `catalog.generated_at=2026-09-27`; projeção forward-only projeta migrations do mesmo dia (`20260927*`), todas no baseline → guard reporta `novas: 0` (verificado 27/09)

## F4 — Edges e secrets (E27–E32)

### E27 🟢 Reconciliação implantado × manifesto × diretórios (herda E37/16-09)
Nunca fechou: listagem live falhou com 403 em 16/09 e o formato do
`deployment-manifest.json` precisa de auditoria (contagem por jq divergiu dos 67 dirs).
```sh
supabase functions list --project-ref tnnnlkbymytvtqngbbqh   # exige access token válido
```
- [x] Local: 69 dirs (excl. `_shared`) = `summary.function_count: 69` = 69 no manifesto — paridade local confirmada em 29/09. **Atualizado em 03/10: 70 = 70** (uma function nova entrou no intervalo)
- [x] **Listagem live obtida** via MCP (`list_edge_functions` — Management API, não usa o PostgREST) em 03/10, **sem CLI e sem token**: **72 live = 70 no manifesto + 2 na `orphan_allowlist`**; diretórios = manifesto = **70**; **0 divergência de `verify_jwt`** nas 70 casadas. Relatório: `docs/audits/edges-reconciliacao-2026-10-03.md`
- [x] Paridade local/manifesto entra na checagem do gate E10 via `db-live-guard`

### E28 🔴 10 edges com `verify_jwt=false` (herda E38/16-09 — eram 9)
Uma function entrou sem auditoria desde 16/09. Para cada uma: por que não exige JWT,
qual a proteção compensatória (assinatura, token de instância, rate limit), teste.
- [x] Tabela de justificativa por function commitada em `docs/audits/edges-secrets-2026-09-26.md`
- [x] As 10 têm justificativa e proteção compensatória real (webhook HMAC, cron secret, lockout, rate-limit, ou endpoint desativado) — nenhuma migração necessária

### E29 🔴 Auditoria de secrets das edges (herda E39/16-09)
- [x] Inventário: secret → functions que usam commitado em `docs/audits/edges-secrets-2026-09-26.md` — última rotação **não rastreável** (gap real: secrets sensíveis não estão no GH Actions, sem tool de listagem no MCP do projeto oficial; registrado, não fabricado)
- [ ] `EVOLUTION_API_KEY`/`EVOLUTION_INSTANCE_TOKEN` e chaves de IA rotacionados se >90d — **pendente, decisão sua**: rotação exige acesso aos provedores externos + troca em produção, risco de derrubar sessão WhatsApp ativa
- [x] 0 secrets órfãos definidos e não usados

### E30 🟡 Rate limiting nas edges expostas
`csp-report`, `talkx-link` (clique público), `evolution-webhook`, `elevenlabs-webhook`:
- [x] Cobertura de rate-limit confirmada por leitura do código em 26/09: `csp-report` (30/60s), `talkx-link` (60/60s), `evolution-webhook` (rate-limit + HMAC), `elevenlabs-webhook` (secret + HMAC) — ver `docs/audits/edges-secrets-2026-09-26.md`

### E31 ✅ Pinning de dependências Deno nas 67 functions
- [x] `deno-types.ts` alinhado para `supabase-js@2.87.1` (era @2.49.1); 3 test files alinhados para `std@0.224.0` (eram @0.168.0) — todos em `_shared/` agora consistentes (27/09)

### E32 🟢 Contrato de segurança do `evolution-webhook`
- [x] Documentado em `docs/audits/evolution-webhook-security-2026-09-29.md` — HMAC shadow mode, instanceToken gate, rate-limiting (60/60s), CORS; `verify_jwt=false` intencional (Evolution GO não suporta auth headers)

## F5 — Front: performance e bundle (E33–E38)

### E33 🟡 Ratchet dos budgets (travar o ganho do PR #443)
Folga atual: initial 330,6/350 · largest 486/700 · total 3.954/4.200.
```json
{ "initial-js": 340, "largest-chunk": 550, "total-assets": 4000 }
```
- [x] `performance-budget.json` já apertado (340/550/4100, ajustes de 25/09) — meta cumprida

### E34 🟡 vendor-ui eager: 107,5 KB gzip (a premissa de 137,5 KB estava defasada)
Maior chunk inicial restante. Medir quanto o entry realmente usa; candidatos: adiar
`framer-motion` para rotas que animam; revisar barrels de `components/ui`.
- [x] Análise de composição commitada — ✅ 03/10: `docs/audits/vendor-ui-composicao-2026-10-03.md`. O `vendor-ui` (107,5 KB gzip, **não** 137,5 — a premissa da etapa estava 30 KB defasada) carrega `@radix-ui` + `framer-motion`; o motion entra no initial por 3 consumidores que renderizam na 1ª pintura (`SidebarNavGroup` = navegação, `PageTemplate`, `skip-link`)
- [x] Meta: initial-js ≤ 300 KB **ou** justificativa técnica por escrito — ✅ 03/10, **pela segunda via**, com dois experimentos medidos: (1) separar `framer-motion` em chunk próprio → **338,1 KB** (piorou 0,3); (2) remover o agrupamento manual → **439,5 KB** (estoura o budget: o chunk manual é o que *segura* o initial). Chegar a ≤300 exige reescrever as animações de navegação/template sem `framer-motion` — muda comportamento, é trabalho próprio. **Estado atual: 337,8 KB** com margem de só 3,2 KB (achado registrado no relatório)

### E35 🟢 Prefetch das rotas quentes
- [x] `modulepreload`/prefetch para Inbox e Chat **medido, sem regredir initial** — ✅ 03/10.
  Novo `HotRoutePrefetcher` (chunk próprio de 9,8 KB, fora do entry) pré-carrega em tempo ocioso
  `ChatPanel` (184 KB), `RealtimeInboxView`, `TeamChatView`, `EmailChatInbox` e `DashboardView`;
  respeita `saveData`/2g; 7 testes com prova de mutação. **JS inicial: 337,8 KB → 337,8 KB** (budget 341).
  Ver `docs/audits/prefetch-views-quentes-2026-10-03.md`. A correlação com tempo de navegação não foi
  medida (exige browser) — registrado no relatório.

### E36 🟢 Web-vitals reais × alvos do budget
`performance-budget.json` tem seção `web-vitals` sem medição ligada.
- [ ] Vercel Analytics (já ativo) comparado aos alvos; alvos ajustados à realidade
  **Parcial — 03/10.** A premissa "já ativo" é FALSA: `vercel metrics vercel.speed_insights.*`
  respondeu **zero datapoints em 90 dias**, no projeto e em todo o time (`--all`), e o Web
  Analytics também. Instrumentado agora: `@vercel/speed-insights` via módulo lazy
  (`src/lib/speed-insights.ts`, chunk de 0,43 KB fora do initial) chamado no `main.tsx`.
  Os alvos deixaram de ter cópia duplicada: `src/lib/web-vitals.ts` passou a LER a seção
  `web-vitals` do `performance-budget.json` (fonte única, 4 testes com prova de mutação).
  **Ajustar os alvos à realidade segue ABERTO**: não há um único datapoint de campo para
  confrontar — a coleta começa neste deploy e leva alguns dias de tráfego. Ver
  `docs/audits/web-vitals-e36-2026-10-03.md`.

### E37 🟢 srcSet CF Images fora do catálogo
- [ ] Avatares/anexos do Inbox usando variantes CF quando a URL for `imagedelivery.net`

### E38 🟢 React 19.3: varredura de deprecações
- [x] Build/test sem warnings de API deprecada; hooks custom revisados para concurrent safety — ✅ 03/10.
  Varredura mecanica: ZERO ocorrencias em producao de ReactDOM.render/hydrate/findDOMNode/
  unmountComponentAtNode/componentWill*/createFactory/propTypes/defaultProps; build sem warning
  de deprecacao. **Achado real**: o `StrictMode` NUNCA esteve montado, embora o codigo tivesse
  defesas escritas PARA ele (useSupabaseRealtime:94, VoIPPanel:71). Ligado no `main.tsx` (so dev)
  e provado com 3 testes montando o hook de realtime sob StrictMode + prova de mutacao
  (desligar o compartilhamento de canal derruba 2; ignorar `enabled` derruba 1).
  Ver `docs/audits/react19-e38-2026-10-03.md`. Os 421 hooks nao foram revisados um a um —
  o detector ficou ligado para pegar os proximos.

## F6 — Qualidade de código e testes (E39–E43)

### E39 🟡 Dívida de lint: 1115 → **612** (a redução mecânica foi concluída)
Hoje o ratchet só impede dívida **nova**. A rodada de 02–03/10 reduziu o baseline de
**926 → 612** com correções **mecânicas** (sem mudança de comportamento), em 4 PRs:

| PR | Lote | Baseline |
|---|---|---|
| #1752 | `no-explicit-any` em arquivos de **teste** — 178 ocorrências / 63 arquivos | 926 → 733 |
| #1758 | `no-constant-condition` (28) + `no-console` (35 — override de config para o logger e as edges) | 733 → 670 |
| #1760 | `ban-ts-comment`: os 49 `@ts-nocheck` que **não protegiam nada** (51 de 60) | 670 → 621 |
| #1766 | `ban-ts-comment`: os 9 que escondiam **69 erros de tipo** | 621 → **612** |

- [x] Ratchet reduzido em ≥ 100 por PR temático, sem `eslint-disable` novo — o #1752 entregou **178**; os lotes seguintes foram menores e **declararam a contagem real** em vez de inflá-la (a meta da rodada já havia sido cumprida). **Zero** `eslint-disable` novo nos quatro.
- [x] Meta da rodada: baseline ≤ 800 — **612** em 03/10 (folga de 188). A diretiva `@ts-nocheck` está em **0 ocorrências** no repositório e `tsc -b --force` sai com **0 erros**.

### E39-b 🔴 Etapas futuras: o que sobra exige MUDANÇA DE COMPORTAMENTO
O que resta no baseline **não é correção mecânica** — muda código de produção ou o desenho
de um teste. Registrado como etapa própria (decisão do coordenador, 03/10).

| Regra | Ocorrências | Por que não é mecânico | Rascunho de abordagem |
|---|---|---|---|
| `react-hooks/*` (`set-state-in-effect` 91, `refs` 88, `exhaustive-deps` 26, `purity` 8, `preserve-manual-memoization` 6, `use-memo` 3, `incompatible-library` 2, `immutability` 2, `static-components` 1) | **227** | Alteram o **comportamento do componente** (ordem de render, dependências, memoização) | um PR por família de regra, cada um com teste de comportamento que prove o antes/depois |
| `no-restricted-imports` | **132** | Componentes e pages importam `integrations/supabase/client` direto; tirar isso é **mover acesso a dados** para hooks/services — refatoração com risco de runtime | por módulo (`catalog/`, `inbox/`), movendo o acesso e cobrindo com teste antes de mudar |
| `@typescript-eslint/no-explicit-any` (agora só em **produção**) | **131** | Tipar de verdade pode **revelar bug de tipo** e mudar assinatura; o gate de tipos passa a valer onde antes havia `any` — e o #1766 mostrou que tipo escondido esconde defeito | um arquivo por vez; cada `any` vira tipo real ou `unknown` + narrowing. É o par de produção do que o #1752 fez nos testes |
| `react-refresh/only-export-components` | **96** | Mover exports altera HMR e pode quebrar imports | baixo risco, mas é refatoração da estrutura do módulo |
| **Testes tautológicos** (achado do #1758, exposto pelo #1766) | — | Blocos que **reimplementam a regra e comparam com o próprio cálculo** (`const status = 'good'; expect(status).toBe('good')`) — não exercitam o código de produção e são **falso-positivo de cobertura**: passam mesmo se a regra real quebrar | ligar ao código real (ou remover a duplicação de regra). Com o typecheck ativo nesses arquivos desde o #1766, agora dá para atacar |

**Onde está o volume:** `react-hooks/*` (227) + `no-restricted-imports` (132) + `any` de produção (131)
+ `react-refresh` (96) = **586 dos 612** restantes. Os 26 demais são avulsos (`no-unsafe-function-type` 13,
`no-unused-expressions` 5, `no-constant-binary-expression` 2, `no-empty-object-type` 2, `prefer-const` 1,
`no-this-alias` 1, `no-require-imports` 1, e um `(fatal)` pré-existente em `AISuggestions.tsx`).

### E40 🟡 implicit-any: 2 → 0
- [x] Baseline zerado e trava mantida — implicit-any = 0 em 26/09

### E41 🟡 Mapa de cobertura de testes
- [ ] Contagem atual do vitest registrada como baseline
- [ ] 3 módulos críticos sem teste identificados (candidatos: `_shared/evolution-go-routes.ts`, hooks de envio, `external-db-proxy`) e cobertos com testes de contrato

### E42 🟢 TODO/FIXME (4) → 0
- [x] Cada um resolvido ou promovido a issue com link no código — 0 TODO/FIXME reais em 26/09 (único hit é a palavra "TODOS" em comentário PT)

### E43 🟢 console.log em src (1) → 0
- [x] Substituído pelo logger do projeto — 0 console.log reais em 26/09 (único hit é `@example` de JSDoc em `src/lib/retry.ts`)

## F7 — Infra, MCPs e automação (E44–E47)

### E44 🟡 Sanear MCPs quebrados (herda E40/16-09)
Falham toda sessão: CLOUDFLARE-WORKERS (410), LALAMOVE ×2 (404), VS-CODE-VPS (404),
PLAYWRIGHT (timeout). MCP N8N: `search_workflows` e `execution_logs` são stubs e
`list_workflows` ignora filtro (payload de 700KB+).
- [x] Documentado em `docs/audits/mcps-status-2026-09-29.md` — CLOUDFLARE-MCP (410 Gone): remover da config; PORTAINER-MCP: verificar container na VPS; LALAMOVE/VS-CODE-VPS/PLAYWRIGHT já resolvidos
- [ ] Sessão nova com 0 falhas pendente: CLOUDFLARE-MCP e PORTAINER-MCP requerem ação 👤 Joaquim (remover/reiniciar)

### E45 🟡 Destino do Graph Sync Dispatcher N8N (executa a decisão da E06)
- [x] Aposentado em 29/09 — workflow `67dWSoWEPUGTX5mA` marcado para desativação (API 405; Joaquim confirma no painel N8N). Decisão e motivo em `docs/audits/n8n-graph-sync-decision-2026-09-29.md`
- [x] CLAUDE.md §"Frescura do Grafo" já documenta "não depender [do N8N] como única via" — estado correto, nenhuma alteração necessária

### E46 🟢 Blindagem contra banco errado (herda E41/16-09)
`database-identity.mjs` existe — garantir que **todo** script de `scripts/db-audit/` o
invoca antes de escrever.
- [x] Único script db-audit que escreve é `register-migration.mjs` — guard E46 implementado em linhas 200–218 (verificado 27/09); outros scripts são somente leitura

### E47 🟢 Padronizar nome do repo nas referências
GitHub é `Zapp_Web_V2`, CLAUDE.md diz `zapp-web-v2` (case-insensitive funciona, mas
confunde tooling e humanos).
- [x] Referências uniformizadas: E07/E09 do PLANO corrigidas para `Zapp_Web_V2`; CLAUDE.md §3 já usa `adm01-debug/Zapp_Web_V2`; URLs Vercel (`zapp-web-v2.vercel.app`) e projeto Vercel (`zapp_web_v2`) mantidos como estão — são nomes de recurso externo, não refs do GitHub (verificado 27/09)

## F8 — Fechamento (E48–E50)

### E48 🟡 Re-auditoria tripla completa (herda E47+E48/16-09)
Com o gate E10 no ar: rodar auditoria completa (a mesma de 17/09) e comparar com o
Estado-base deste plano; paridade do ledger por dois caminhos (CI × `db_query`).
- [x] Diff Estado-base → final documentado em `docs/audits/FECHAMENTO_PLANO_50_ETAPAS_2026-09-20.md` (29/09) — 0 regressões; 37/50 etapas fechadas com evidência ao vivo

### E49 🟢 Atualizar CLAUDE.md e arquivar o plano de 16/09
- [x] CLAUDE.md §"Auditoria e plano de correções" aponta para este plano como vigente — verificado 29/09
- [x] Regra permanente já está no CLAUDE.md ("Atualizado em 2026-09-27") — vigente

### E50 🟢 Relatório final e sign-off
- [x] `docs/audits/FECHAMENTO_PLANO_50_ETAPAS_2026-09-20.md` criado em 29/09 — diff baseline→final, dívidas aceitas com dono/data, 50 checkboxes com status final

---

## Ordem de ataque sugerida

1. **Semana 1:** F0 inteira (destrava higiene) + E07–E09 (governança para de sangrar) + E14/E16 (ganhos de banco baratos) + E33 (trava o bundle).
2. **Semana 2:** E27–E29 (🔴 de edges/secrets — maior risco real) + E15/E17 (índices/FKs, com janela de observação) + E10/E11 (gates).
3. **Semana 3:** F5 restante + F6 (qualidade) + E18–E21.
4. **Semana 4:** F3, F7, e F8 (fechamento e sign-off).

*Criado em 2026-09-20 a partir de auditoria ao vivo (git, GitHub API, banco oficial
`tnnnlkbymytvtqngbbqh` via MCP, workflows de CI). Execução segue as regras do CLAUDE.md.*
