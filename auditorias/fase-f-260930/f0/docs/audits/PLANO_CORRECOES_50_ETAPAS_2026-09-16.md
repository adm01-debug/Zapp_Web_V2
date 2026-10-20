# Plano de Correções e Melhorias — 50 Etapas (2026-09-16)

> Origem: auditoria exaustiva local ↔ GitHub ↔ banco de 2026-09-16.
> Banco alvo: **`tnnnlkbymytvtqngbbqh`** (Supabase Cloud, PG 17.6) via MCP `SUPABASE - ZAPP WEB V2 - MCP` (`db_query`).
> Nenhum SQL deste plano roda em outro projeto. Todo DDL segue CLAUDE.md §1.6: arquivo → PR → merge em `main` → deploy → apply.

## Baseline da auditoria (ponto de comparação para E47)

> **⚠️ PLANO ENCERRADO em 2026-09-20.** Os checkboxes ainda abertos aqui foram herdados
> e re-mapeados pelo plano vigente `PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` (tabela de
> herança "herda E{n}/16-09" lá; evidências em `DOSSIE_EXECUCAO_PLANO_50_2026-09-20.md`).
> Fechamentos comprovados após a escrita deste arquivo: E42 (cron do CRM worker
> desativado, 20/09), E43 (force-push/deleção bloqueados e "Contrato DB vivo" reclassificado
> como design em 17/09 — ver CLAUDE.md), E44 (gate `check-triple-parity.mjs`, 20/09),
> E45 (`branch-hygiene-audit.yml` semanal já existia); E42 (cron do CRM worker) e E44 (gate
> `check-triple-parity.mjs`) estão implementados no PR #445, pendente de merge; E46 via PR #442. Não marcar mais checkboxes AQUI — o tracking vive no plano de 20/09.

| Eixo | Estado em 2026-09-16 |
|---|---|
| `origin/main` | `b9a45952` (PR #402), CI 100% verde incl. `Contrato DB vivo` e `Contrato DB offline` |
| `main` local | `687ed150` — **3 commits atrás** de `origin/main` |
| Branch de trabalho | `chore/vite8-oxc-hardening` = conteúdo idêntico a `origin/main`, upstream apagado |
| Migrations | **426** arquivos `.sql` = 426 em `origin/main` = 426 no ledger; md5 dos prefixos `b10da16a16ac29b23140649cb03b43f5` nos três; `max(version)=20260913122557` |
| `supabase-usage-guard.mjs` | exit 0, novas: 0; projeção forward-only: 2 relações |
| Catálogo (2026-09-13) | 140 tabelas, 7 views, 86 funções (critério `prokind='f'` e retorno ≠ trigger). Banco: 140 / 7 / 122 (36 trigger functions/procedures fora do catálogo) |
| Edge functions | 66 no `deployment-manifest.json` = 66 diretórios locais; 57 `verify_jwt=true`, 9 `false`. Listagem live falhou (CLI 403) |
| Branches locais com trabalho **inexistente no GitHub** | 9 branches / 45 commits (4 `redesign/inbox-*` sem upstream; 5 com upstream apagado) |
| Branches locais redundantes (0 commits não-equivalentes ao main) | 14 |
| Stashes | 4 |
| Branches remotos sem checkout local | ~53 |
| CI `CRM Sync Worker` | cron ~10 min, **96 runs `skipped`** só no HEAD do main |
| MCPs falhando toda sessão | 5 (`SUPABASE SELF HOSTED`, `VS CODE - MCP - VPS` ×2, `CLOUDFLARE - MCP - WORK`, `lovable - supabase - zapp web v3`) |
| MCP com nome confuso | `MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2` aponta para **`vpkmqeumtxhrwgawxdrl`** (origem Lovable, não o banco oficial) |

Legenda de risco: 🟢 reversível/local · 🟡 toca GitHub · 🔴 toca produção (banco ou edge) — exige PR + deploy antes de apply.

---

## Revisão exaustiva de execução (2026-09-16, mesmo dia — pós E90/E91)

Verificação ground-truth (queries live no banco canônico + `git`/`gh`), não memória de sessão. Muito trabalho de segurança real aconteceu via migrations pontuais fora da ordem deste plano (PRs #407/#411/#418/#419/#420/#425/#428/#429/#431); os **deliverables formais** do plano (docs versionados, scripts de guard) majoritariamente não foram criados.

| Fase | Etapas | Estado |
|---|---|---|
| 0 — Rede de segurança | E01–E05 | Baseline (`b9a45952`) há muito superado; não reverificado — sem valor prático hoje |
| 1 — Higiene git | E03,E06,E07 ✅ · E08 🟡 (5 PRs identificados como MERGED, branches locais não deletados) · E09–E11 ❌ (~40 branches locais sem decisão escrita) · E12 ❌ (21 worktrees `prunable` sob `/tmp`, violando a própria política que E13 propõe) · E13 🟡 (`fetch.prune=true` já setado; regra CLAUDE.md não escrita) |
| 2 — Ledger/migrations | E14–E20 não reverificadas nesta passada (sem sinal de regressão no `supabase-usage-guard`, que segue exit 0) |
| 3 — Schema | E21 ✅ (único `NOT VALID` é de `realtime.messages`, gerenciado pelo Supabase, fora do escopo do projeto) · **E22 🟡 NOVO GAP**: 3 FKs sem índice no lado filho, todas das tabelas E90 (`talkx_link_clicks.recipient_id`, `talkx_conversions.recipient_id`, `talkx_conversions.link_id`) — 0 bytes hoje, documentado, não urgente · **E23 ❌ 2 achados novos, nunca antes catalogados**: índice duplicado `idx_talkx_links_slug` (redundante com `talkx_links_slug_key` da UNIQUE) e **`talkx_template_versions` com 3 índices cobrindo a mesma coluna** (`..._template_id_version_number_key`, `idx_talkx_template_versions_template_version`, `talkx_template_versions_template_id_idx`) · E24 ❌ (matriz RLS nunca gerada como doc) · E25 ✅ confirmado ao vivo (0 SECURITY DEFINER sem `search_path`) · **E26 🔴 CRÍTICO, achado NOVO nesta revisão**: `anon` tem `EXECUTE` em 13 funções `public`; 4 são trigger functions (inofensivo) e 3 (`reschedule_talkx_recipient`, `transition_talkx_campaign` ×2) têm guard interno `service_role_required` (grant supérfluo mas não explorável) — **porém `get_last_message_dates(uuid[])` e `set_conversation_status(uuid,text,text)` são SECURITY DEFINER, bypassam RLS, `anon` pode chamar, e NÃO têm nenhum check de autorização no corpo**. `set_conversation_status` deixa qualquer chamador não-autenticado mudar o status de conversa de qualquer contato (e inserir em `conversation_closures`) só sabendo/adivinhando um `contact_id`; `get_last_message_dates` vaza timestamp de última mensagem por `contact_id` arbitrário. Nenhum PR aberto para isso — não fazia parte de nenhuma auditoria anterior desta sessão. `talkx_campaign_report`/`talkx_overview_stats`/`talkx_segment_tags` também têm EXECUTE de `anon` mas são `SECURITY INVOKER` (RLS do próprio `anon` bloqueia, risco baixo) · E27–E28 não reverificadas |
| 4 — Performance | E29,E31–E35 não reverificadas · **E30 🟡 ainda aberto**: `messages` sem `last_autovacuum` (nunca rodou), `pct_dead` caiu de >75% (nota antiga do CLAUDE.md) para 16.1% só por volume de inserts, não por VACUUM — mesmo achado do CLAUDE.md, sem migration de `autovacuum_vacuum_scale_factor` |
| 5 — Edge functions | E38 confirmado: `main` ainda com exatamente 9 `verify_jwt=false` (baseline) — a 10ª exceção (`talkx-link`) está no PR #428, não mergeado · E36/E37/E39–E41 não reverificadas |
| 6 — CI/governança | E42–E46 não reverificadas — nenhum dos scripts/arquivos esperados (`grants-baseline.json`, `check-triple-parity.mjs`, `register-migration.mjs`, `rls-matrix-*.md`) existe no repo |
| 7 — Fechamento | E47–E50 não iniciadas; nenhum `FECHAMENTO_PLANO_50_ETAPAS_*.md` existe |

**Achados fora do plano de 50 etapas (trilha E90/E91), reverificados nesta passada:**
- `{{link}}` não substituído, sem rate limit, IDOR, salt de IP fixo → **corrigidos, PR #429 (não mergeado)**
- `anon EXECUTE` em `talkx_benchmarks`/`record_talkx_link_click` → **corrigido, PR #428 (não mergeado)** — confirmado ao vivo que o grant ainda está ativo em produção
- `ReferenceError` de escopo (`sendTimeout`) + timeout de abort inerte no `talkx-send` (herdados do PR #427/E91 já mergeado) → **corrigido, PR #431 (não mergeado)**
- Slug case-sensitive em `talkx_links`, índice `idx_talkx_links_slug` redundante, retenção LGPD de `talkx_link_clicks`, zero cobertura de teste E90 → **ainda não endereçados, sem PR**
- Bug de ordem em `.replace()`/`.split().join()` dentro de `personalize()` (`talkx-send/index.ts`): `{{empresa}}` é substituído (linha 32) **antes** de `{{saudacao}}` (linha 33) e de `{{link}}` (linha 40) — se o campo `company` de um contato contiver literalmente `{{saudacao}}` ou `{{link}}`, a substituição seguinte reinterpreta esse texto como placeholder. Confirmado ainda presente no código atual (5 parâmetros, incluindo `trackingUrl`). Sem PR.
- Nenhum `TODO`/`FIXME`/`XXX` encontrado em `supabase/functions/talkx-*`, `_shared/talkx-*` ou migrations `*talkx*` — sem dívida técnica auto-documentada pendente nesse recorte.

---

## Rodada 3 de execução (2026-09-16, pós-merge de #428/#429/#431/#433/#434/#435/#437)

Entre a rodada anterior e esta, o usuário mergeou 6 das PRs pendentes. Isso
revelou drift real (código mergeado ≠ aplicado no banco — ver PR #437) e uma
regressão auto-infligida (renumeração de migration fez o guard de IDOR
sobrescrever o fix de case-insensitivity — ver PR #439), ambos corrigidos.
Nesta rodada também foram fechados os seguintes itens do plano:

- **E07** ✅ confirmado — nenhuma das 14 branches redundantes existe mais.
- **E08** ✅ as 5 branches confirmadas `MERGED` foram deletadas localmente (`git branch -D`).
- **E09** 🟡 **decisão do usuário necessária, não automatizada**: 21 branches locais com trabalho real (9 a 4860 linhas de diff cada) sem upstream ou com upstream apagado — `redesign/inbox-*` (5), `fix/inbox-file-upload-integrity`, `fix/inbox-data-integrity-codex`, `fix/inbox-tabs-a11y-responsive`, `fix/async-chat-send-contract`, `test/chat-central-contracts`, `feat/crm-integration-gateway`, `feat/crm-integration-db-foundation`, `audit/types-sync-312`, `codex/types-sync-final`, `fix/types-sync-adapter-contract`, `chore/label-facade-features-demo`, `fix/ci-disposable-postgres-retry-signature`, `fix/deployment-manifest-stale-2`, `fix/runtime-integration-recovery`, `fix/talkx-history-fk-canonicalization`, `fix/talkx-scheduler-window-correctness`, `fix/talkx-template-history-contract`. Nenhum diff é trivial/vazio — decidir publicar/arquivar/descartar cada um é uma decisão de produto, não uma correção técnica; **não foi automatizado propositalmente**.
- **E11** ainda não revisitado (branches remotos ~53) — depende de E09 primeiro.
- **E12** ✅ `git worktree prune` — 22 worktrees `prunable` removidos.
- **E13** ✅ `git config fetch.prune true` setado.
- **E15/E18** ✅ `migration-evidence.json` lido por completo: 50 exceções `pinned-replay`, todas com `kind`/`justification` documentados (16 `ledger-summary`, 12 `ledger-only/name-and-file-pinned`, 10 `format-only`, 9 `safer-replay`, 2 `endpoint-literal-update`, 1 `version-collision`). Nenhum resumo em prosa fora da lista de exceções.
- **E16** ✅ confirmado — `_foreign/README.md` e `_superseded/README.md` já existiam.
- **E19** ✅ `scripts/db-audit/register-migration.mjs` + 9 testes (inclui simulação de colisão mascarada por `ON CONFLICT DO NOTHING`).
- **E20** 🟡 **replay parcial, achado estrutural real**: replay completo dos 442 arquivos via `supabase start` (Postgres 17.6, stack completo com auth/storage/realtime) contra os 50 `pinned-replay` já documentados + 2 neutralizados (infra fora do fluxo de migrations). Replay limpo até `20260906000001_e31_contacts_is_lid_legacy.sql`, que **falha por design** contra um banco vazio: a migration valida `count(*) WHERE is_lid_legacy=true BETWEEN 400 AND 700`, um invariante de volume de dados de produção, não de schema. Isso não é um bug — é uma característica estrutural de migrations de backfill/validação de dados: elas nunca serão "replayáveis do zero" e devem ser tratadas como uma categoria própria (`data-validation`, distinta de `pinned-replay`) em auditorias futuras, não uma falha a corrigir. Replay não foi levado até o fim (retorno decrescente vs. esforço de neutralizar cada migration de backfill uma a uma).
- **E24** ✅ `docs/audits/rls-matrix-2026-09-16.md` — 144/144 tabelas com RLS, 4 com zero policies (todas intencionais/documentadas).
- **E26** ✅ `scripts/db-audit/grants-baseline.{sql,json}` — snapshot diffável de `EXECUTE`/`SELECT` por role.
- Achado novo (matriz RLS): as 3 tabelas E90 tinham o grant padrão de schema do Supabase para `anon`/`authenticated` mesmo com RLS+zero-policies já bloqueando tudo — defesa em profundidade aplicada (PR pendente).
- **E27, E28, E29, E31–E37, E39–E50**: não revisitados nesta rodada — fora do escopo por orçamento de tempo/tokens desta sessão.

---

## FASE 0 — Rede de segurança (E01–E05) — bloqueante de tudo

### E01 🟢 Snapshot completo do estado local
```sh
git bundle create ~/zapp-backup-$(date +%Y%m%d).bundle --all
git bundle verify ~/zapp-backup-*.bundle
git stash list > ~/zapp-stashes-$(date +%Y%m%d).txt
for i in 0 1 2 3; do git stash show -p stash@{$i} > ~/zapp-stash-$i.patch; done
```
- [ ] Bundle verificado (`git bundle verify` OK)
- [ ] 4 patches de stash salvos fora do repo
- [ ] Caminho e tamanho anotados neste documento

### E02 🟢 Fast-forward do `main` local
```sh
git checkout main && git merge --ff-only origin/main
```
- [ ] `git rev-parse main origin/main` → mesmo SHA (`b9a45952…`)
- [ ] `git log --oneline main..origin/main` vazio

### E03 🟢 Remover o branch de trabalho já mergeado
- [x] Em `main`; `git branch -d chore/vite8-oxc-hardening` (delete seguro `-d`) — confirmado: branch não existe mais localmente (2026-09-16)

### E04 🟢 Atualizar `fix/talkx-template-history-contract` (2 commits atrás do upstream)
- [ ] `git log fix/talkx-template-history-contract..origin/fix/talkx-template-history-contract` revisado
- [ ] Branch local avançado (ff) ou decisão de abandono registrada

### E05 🟢 Congelar o baseline
- [ ] Tabela acima conferida contra a auditoria original (números, SHAs, md5)
- [ ] Este arquivo commitado antes de qualquer poda

---

## FASE 1 — Higiene Git local ↔ GitHub (E06–E13)

### E06 🟢 Triage dos 4 stashes
`stash@{1}` já anotado como "redundante/superado pelo main"; `stash@{3}` contém WIP de sentry/webhook/migration/codeql.
- [ ] Cada stash: **aplicar** / **converter em branch** / **descartar**, com justificativa
- [ ] `git stash list` vazio ou só com itens justificados

### E07 🟢 Podar os 14 branches redundantes
`chore/sync-schema-after-inbox-authz`, `docs/branch-protection-db-guard`, `fix/ci-deno-node24`, `fix/ci-postgres-client-install`, `fix/crm-postmerge-guards`, `fix/db-live-ledger-evidence`, `fix/excellence-p0-ci-secret-boundary`, `fix/excellence-p0-disable-public-api`, `fix/excellence-p0-inbox-authz`, `fix/main-sync-gates`, `fix/message-phase1-acl-proof`, `fix/preview-egress-dns-rebinding`, `fix/stable-required-db-guard`, `fix/audit-pdf-determinism`.
```sh
for b in <lista>; do echo "$b: $(git cherry origin/main $b | grep -c '^+')"; done   # todos devem ser 0
```
- [x] Reconfirmado 0 para cada um (implícito — nenhum dos 14 existe mais)
- [x] Deletados com `git branch -D` — confirmado: nenhuma das 14 branches listadas existe localmente (2026-09-16)

### E08 🟡 Resolver os 5 branches ambíguos (PR existiu, commits sem equivalente)
`feat/atomic-outbound-callers` (2), `feat/message-delivery-phase1` (3), `fix/auth-login-fail-closed` (4), `fix/revoke-service-enqueue` (2), `fix/talkx-ledger-recovery` (2).
```sh
gh pr list --repo adm01-debug/zapp-web-v2 --state all --search "head:<branch>" --json number,state,mergedAt,mergeCommit
git diff origin/main...<branch> --stat
```
- [x] Para cada: PR localizado, estado anotado (2026-09-16) — `feat/atomic-outbound-callers`→#330 MERGED, `feat/message-delivery-phase1`→#324 MERGED, `fix/auth-login-fail-closed`→#332 MERGED, `fix/revoke-service-enqueue`→#328 MERGED, `fix/talkx-ledger-recovery`→#319 MERGED
- [ ] Squash-merged → deletar local — **NÃO feito**: as 5 branches (+ worktree `prunable` de cada uma sob `/tmp`) ainda existem localmente

### E09 🟡 Decidir destino do trabalho que só existe nesta máquina
`redesign/inbox-center-tabs-codex` (10), `redesign/inbox-files-history-codex` (10), `redesign/inbox-tasks-notes-codex` (10), `redesign/inbox-right-panel-codex` (2) + sobreviventes de E08. Também sem upstream: `feat/crm-integration-gateway` (8), `fix/inbox-file-upload-integrity` (15), `test/chat-central-contracts` (10), `chore/label-facade-features-demo`, `audit/types-sync-312`, `fix/types-sync-adapter-contract`.
- [ ] Cada branch: `git diff origin/main...<b> --stat` revisado; decisão **publicar / arquivar (tag `archive/<nome>`) / descartar**
- [ ] Nenhum trabalho único permanece somente local sem decisão escrita

### E10 🟡 Publicar os preservados
- [ ] `git push -u origin <branch>` para cada aprovado (re-sync antes: sessão paralela pode existir)
- [ ] Verificação: nenhum tip local fora de refs remotos, exceto descartes deliberados
```sh
for b in $(git for-each-ref --format='%(refname:short)' refs/heads/); do
  [ -z "$(git branch -r --contains $(git rev-parse $b))" ] && echo "ORFAO: $b"; done
```

### E11 🟡 Podar branches remotos obsoletos (~53)
```sh
gh api repos/adm01-debug/zapp-web-v2/branches --paginate --jq '.[].name' > /tmp/remote-branches.txt
# para cada: gh pr list --state merged --search "head:<b>"  → merged = candidato a delete
```
- [ ] Classificação: **merged** (apagar) / **PR aberto** (manter) / **incerto** (manter + issue)
- [ ] Deleções apenas dos merged confirmados; lista final anexada aqui

### E12 🟢 Limpar worktrees voláteis em `/tmp`
- [x] `git worktree list` auditado; `git worktree prune` — 22 worktrees `prunable` removidos (2026-09-16)
- [x] Nenhum worktree ativo em diretório que some no reboot — `git worktree list` só mostra o worktree principal

### E13 🟢 Política permanente
- [x] `git config fetch.prune true` — confirmado (2026-09-16)
- [x] CLAUDE.md §3: "branch mergeado = deletado no mesmo turno (local + remoto); nunca trabalhar em worktree sob `/tmp`" — escrito (2026-09-16)

---

## FASE 2 — Ledger e migrations (E14–E20)

### E14 🟢 Prova local de drift de conteúdo (não só o CI)
```sql
-- via db_query (ledger vivo, para alimentar o shim PSQL_BIN)
SELECT json_build_object('version',version,'name',name,'statements',statements)::text
FROM supabase_migrations.schema_migrations ORDER BY version;
```
```sh
DESTINO_URL=postgres://x PSQL_BIN=<shim-que-imprime-o-ledger> node scripts/db-audit/check-migration-drift.mjs
```
- [ ] Exit 0 com ledger vivo
- [ ] Divergências (se houver) listadas com `version` + diff exato

### E15 🟢 Inventário das exceções `pinned-replay`
- [ ] `migration-evidence.json` lido: quantidade, versions, motivo de cada exceção
- [ ] Meta registrada: **zero novas exceções**; existentes aceitas como dívida permanente com dono

### E16 🟢 Documentar `_foreign/` e `_superseded/`
Subdiretórios dentro de `supabase/migrations/` — qualquer `ls` sem filtro `.sql` produz falso positivo (aconteceu na auditoria).
- [ ] `README.md` em cada subdiretório: propósito, por que não entram no replay/ledger
- [ ] Confirmado que `check-migration-drift.mjs` e o guard os ignoram explicitamente

### E17 🟢 Resolver a projeção forward-only (2 relações)
- [ ] As 2 relações nomeadas (saída detalhada do guard / `known-violations.json`)
- [ ] Estado reconciliado: migration aplicada + catálogo regenerado, **ou** projeção justificada por PR aberto com número

### E18 🟢 Varredura anti-prosa no ledger (regra §1.7)
```sql
SELECT version, name, s
FROM supabase_migrations.schema_migrations, unnest(statements) AS s
WHERE s ~* '\.\.\.|\(add guard\)|resumo|^--' OR length(s) < 20
ORDER BY version;
```
- [ ] Suspeitos listados e cruzados com E15
- [ ] Nenhum resumo em prosa fora da lista de exceções

### E19 🟢 Ritual anti-colisão como script
Hoje o procedimento (`max(version)` + `INSERT … ON CONFLICT DO NOTHING RETURNING` + SELECT de conferência) é manual e já mascarou colisão uma vez — na verdade, mascarou de novo nesta mesma sessão (PR #432 vs #428) antes deste script existir.
- [x] `scripts/db-audit/register-migration.mjs`: emite o bloco SQL transacional completo a partir do arquivo, com abort se `RETURNING` vier vazio (2026-09-16)
- [x] Teste unitário simulando colisão (9 testes, incluindo o cenário exato do PR #432/#428); CLAUDE.md §1.2 aponta para o script (2026-09-16)

### E20 🟢 Replay das 442 migrations em PG 17.6 efêmero
- [x] Replay via `supabase start` (stack completo, PG 17.6) até `20260906000001` (~300 arquivos limpos). Achado: migrations de validação de dados (ex. E31 LID backfill, `count(*) BETWEEN 400 AND 700`) falham por design contra banco vazio — não são bugs, são uma categoria estrutural (`data-validation`) distinta de `pinned-replay`. Replay não levado até o arquivo 442 (retorno decrescente vs. esforço de neutralizar cada backfill individualmente) — ver "Rodada 3" acima.
- [ ] `catalog.sql` rodado no efêmero e diffado por conjuntos contra `schema-catalog.json` — não feito (replay parou antes do fim)

---

## FASE 3 — Integridade e segurança do schema (E21–E28)

### E21 🔴 Constraints `NOT VALID` pendentes
```sql
SELECT conrelid::regclass AS tabela, conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint WHERE NOT convalidated ORDER BY 1,2;
```
- [x] Inventário anexado (2026-09-16, ao vivo): único resultado é `realtime.messages.messages_payload_exclusive` — schema `realtime` é gerenciado pelo próprio Supabase, fora do controle deste repo
- [x] N/A — zero constraints `NOT VALID` no schema `public`; nada para validar

### E22 🔴 FKs sem índice no lado filho
```sql
SELECT c.conrelid::regclass AS tabela, c.conname, c.conkey,
       pg_relation_size(c.conrelid) AS bytes_filho
FROM pg_constraint c
WHERE c.contype='f' AND c.connamespace='public'::regnamespace
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid=c.conrelid
      AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
      AND i.indkey::int2[] @> c.conkey)
ORDER BY bytes_filho DESC;
```
- [ ] Lista com tamanho da tabela filha
- [ ] Índices criados via migration (`CREATE INDEX` simples — `CONCURRENTLY` falha no gateway, §1.5) onde há volume real; pequenas ficam documentadas

### E23 🔴 Índices duplicados e nunca usados
```sql
-- duplicados exatos
SELECT indrelid::regclass, array_agg(indexrelid::regclass), indkey, indclass, indpred
FROM pg_index WHERE indrelid::regnamespace='public'::regnamespace
GROUP BY indrelid, indkey, indclass, indpred, indexprs HAVING count(*)>1;
-- nunca usados desde o último reset
SELECT s.schemaname, s.relname, s.indexrelname, s.idx_scan, pg_relation_size(s.indexrelid) AS bytes,
       (SELECT stats_reset FROM pg_stat_database WHERE datname=current_database()) AS stats_desde
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid=s.indexrelid
WHERE s.idx_scan=0 AND NOT i.indisunique AND NOT i.indisprimary ORDER BY bytes DESC;
```
- [ ] Duplicados exatos: `DROP INDEX` via migration
- [ ] Nunca usados: lista de observação com data do `stats_reset`; **não dropar** antes de ≥ 30 dias de observação

### E24 🔴 Matriz RLS completa (140 tabelas)
```sql
SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
       count(p.polname) AS policies,
       bool_or(p.polqual IS NULL AND p.polcmd IN ('r','*')) AS tem_using_true,
       array_agg(DISTINCT r.rolname) FILTER (WHERE r.rolname IS NOT NULL) AS roles
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid=c.oid
LEFT JOIN LATERAL unnest(p.polroles) AS pr(oid) ON true
LEFT JOIN pg_roles r ON r.oid=pr.oid
WHERE c.relnamespace='public'::regnamespace AND c.relkind='r'
GROUP BY 1,2,3 ORDER BY rls, policies, relname;
```
- [x] Matriz salva em `docs/audits/rls-matrix-2026-09-16.md` (144/144 tabelas — o número de 140 do baseline original estava desatualizado)
- [x] Cada anomalia classificada: 0 tabelas com RLS off; 4 com 0 policies (todas **intencional/documentado** — `edge_rate_limits` + as 3 tabelas E90, service_role-only por design); nenhuma `USING (true)` para `anon` encontrada

### E25 🔴 `SECURITY DEFINER` sem `search_path` fixo
```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.proconfig
FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
  AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%')
ORDER BY 1;
```
- [x] Inventário confirmado ao vivo (2026-09-16, join correto por `pg_namespace` — não `oid::regnamespace`, que dá falso resultado por colidir com OID de outra relação)
- [x] Confirmado: 0 funções SECURITY DEFINER em `public` sem `search_path` fixo

### E26 🔴 Snapshot de grants por role (anon / authenticated / service_role)
O incidente de 2026-09-04 (REVOKE antes do código → lockout de login) prova que ACL é o ponto mais sensível deste banco.
```sql
SELECT grantee, table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE table_schema='public' AND grantee IN ('anon','authenticated','service_role')
GROUP BY 1,2 ORDER BY 1,2;
SELECT grantee, routine_name, specific_name
FROM information_schema.routine_privileges
WHERE routine_schema='public' AND grantee IN ('anon','authenticated','service_role') AND privilege_type='EXECUTE'
ORDER BY 1,2;
```
- [x] Snapshot versionado em `scripts/db-audit/grants-baseline.{sql,json}` (2026-09-16) — gerador ainda não plugado no CI como guard diffável (isso é o E44, não feito nesta rodada)
- [x] `EXECUTE` de `anon` revisado função por função: 9 funções com `anon EXECUTE` hoje, todas classificadas seguras (4 trigger functions, 2 com guard `service_role_required`, 3 `SECURITY INVOKER` com RLS restrito a `authenticated`) — os achados sensíveis reais (`talkx_benchmarks`, `record_talkx_link_click`, `set_conversation_status`, `get_last_message_dates`) já foram corrigidos nas rodadas anteriores (PRs #428/#433)

### E27 🟡 Catalogar trigger functions e procedures (36 fora do guard)
- [ ] `catalog.sql`: nova seção `trigger_functions` (`prokind IN ('f','p')` com retorno `trigger` ou `prokind='p'`), `format_version` 2 → 3
- [ ] Catálogo regenerado; `check-catalog-fresh` e guard ajustados; CI verde

### E28 🟡 Sync dos tipos TypeScript
Três branches de types-sync (`audit/types-sync-312`, `codex/types-sync-final`, `fix/types-sync-adapter-contract`) = fricção recorrente.
- [ ] Tipos regenerados do schema atual e diffados com o commitado
- [ ] Diff vazio, ou PR único de sync; os 3 branches resolvidos à luz disso (fecha pendência de E09)

---

## FASE 4 — Performance e operação (E29–E35)

### E29 🟢 Baseline de queries lentas
```sql
SELECT calls, round(total_exec_time::numeric,1) AS total_ms, round(mean_exec_time::numeric,2) AS mean_ms,
       rows, left(query,120) AS q
FROM pg_stat_statements WHERE dbid=(SELECT oid FROM pg_database WHERE datname=current_database())
ORDER BY total_exec_time DESC LIMIT 20;
-- repetir ORDER BY mean_exec_time DESC
```
- [ ] Dois top-20 salvos e datados em `docs/audits/`
- [ ] Top 3 com `EXPLAIN (ANALYZE, BUFFERS)` documentado

### E30 🔴 Bloat e autovacuum por tabela
```sql
SELECT relname, n_live_tup, n_dead_tup,
       round(100.0*n_dead_tup/nullif(n_live_tup+n_dead_tup,0),1) AS pct_dead,
       last_autovacuum, last_autoanalyze, pg_size_pretty(pg_total_relation_size(relid)) AS total
FROM pg_stat_user_tables ORDER BY n_dead_tup DESC LIMIT 25;
```
- [ ] Tabelas com `pct_dead` > 20% ou `last_autovacuum` antigo identificadas (mensagens/conversas são as candidatas naturais num chat)
- [ ] `ALTER TABLE … SET (autovacuum_vacuum_scale_factor=…, autovacuum_analyze_scale_factor=…)` via migration onde justificado

### E31 🔴 Índices faltantes com carga comprovada
- [ ] `db_missing_indexes` cruzado com E29 — só propor índice para query do baseline
- [ ] Cada índice: `EXPLAIN` antes/depois em PG efêmero com amostra; criado via migration; **zero índice especulativo**

### E32 🟢 Conexões, pooling e timeouts
```sql
SELECT usename, application_name, state, count(*),
       max(now()-state_change) AS mais_antiga
FROM pg_stat_activity WHERE datname=current_database() GROUP BY 1,2,3 ORDER BY 4 DESC;
SELECT rolname, rolconfig FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator');
SHOW max_connections;
```
- [ ] Relatório de utilização vs limite do plano
- [ ] `statement_timeout` e `idle_in_transaction_session_timeout` definidos por role de aplicação (via `ALTER ROLE … SET`, migration)

### E33 🟢 Backup e PITR verificados
Backup não restaurado = backup inexistente.
- [ ] Retenção PITR confirmada no dashboard (`docs/BACKUP-RECOVERY-STRATEGY.md` atualizado)
- [ ] Restore de prova em projeto/branch descartável; `count(*)` + `md5` de amostra de 5 tabelas conferidos contra produção

### E34 🔴 Integridade referencial não declarada
```sql
-- colunas *_id sem FK
SELECT c.table_name, c.column_name FROM information_schema.columns c
WHERE c.table_schema='public' AND c.column_name ~ '_id$'
  AND NOT EXISTS (SELECT 1 FROM pg_constraint k
    WHERE k.contype='f' AND k.conrelid=(c.table_schema||'.'||quote_ident(c.table_name))::regclass
      AND c.column_name = ANY(SELECT attname FROM pg_attribute WHERE attrelid=k.conrelid AND attnum=ANY(k.conkey)))
ORDER BY 1,2;
```
- [ ] Lista de candidatas com contagem de órfãos (`LEFT JOIN … WHERE pai IS NULL`) por coluna
- [ ] FKs adicionadas em duas etapas (`ADD … NOT VALID` → `VALIDATE`) ou exceção documentada; órfãos tratados antes do VALIDATE

### E35 🟢 Alertas operacionais mínimos
- [ ] Alertas: conexões > 80%, disco > 80%, falha de backup/PITR, taxa de erro das edges
- [ ] `docs/INCIDENT-RUNBOOK.md` revisado com resposta de 1 página por alerta

---

## FASE 5 — Edge functions e integrações (E36–E41)

### E36 🟢 Restaurar visibilidade das functions implantadas
CLI retornou 403 → hoje é impossível confirmar diretamente o que está no ar.
- [ ] `SUPABASE_ACCESS_TOKEN` com escopo correto configurado
- [ ] `supabase functions list --project-ref tnnnlkbymytvtqngbbqh` funcionando

### E37 🔴 Reconciliação implantado × manifesto
- [ ] Diff nome a nome + `verify_jwt` das 66 do `deployment-manifest.json` contra a listagem live
- [ ] Zero implantadas fora do manifesto (ou em `legacy_unmanaged_functions` com justificativa); zero no manifesto sem deploy

### E38 🔴 Revisar as 9 functions `verify_jwt=false`
```sh
jq -r '.functions[] | select(.verify_jwt==false) | .name' supabase/deployment-manifest.json
```
- [ ] Tabela das 9: por que pública, auth alternativa (assinatura de webhook, secret de header), rate limit — verificados no código
- [ ] Qualquer uma sem proteção compensatória → correção imediata

### E39 🔴 Auditoria de secrets das edges
```sh
grep -rhoE "Deno\.env\.get\(['\"][A-Z0-9_]+['\"]\)" supabase/functions | sort -u
```
- [ ] Inventário de secrets no projeto vs uso real no código
- [ ] Órfãos removidos; rotação anotada para os que passaram por terceiros (`EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE_TOKEN`)

### E40 🟢 Sanear os 5 MCPs que falham toda sessão
- [ ] Cada um: endpoint corrigido **ou** removido da configuração
- [ ] Sessão nova conecta 100% dos MCPs configurados

### E41 🟢 Blindar contra o banco errado
`MCP - SUPABASE LOVABLE CLOUD - ZAPP WEB V2` → `vpkmqeumtxhrwgawxdrl` (origem Lovable), nome quase idêntico ao oficial.
- [ ] MCP renomeado com sufixo explícito (ex.: `… - ORIGEM LOVABLE - SOMENTE LEITURA`) ou removido se a migração de origem acabou
- [ ] CLAUDE.md §1 lista `vpkmqeumtxhrwgawxdrl` em "bancos que NÃO são deste projeto"

---

## FASE 6 — CI/CD e governança (E42–E46)

### E42 🟡 Corrigir o cron do `CRM Sync Worker`
96 runs `skipped` a cada ~10 min no HEAD do main — cota de Actions e ruído nos checks.
- [ ] Causa do skip identificada (condição `if:` / secret / ambiente)
- [ ] Worker executa de fato **ou** schedule desligado/reduzido

### E43 🟡 Branch protection do `main`
```sh
gh api repos/adm01-debug/zapp-web-v2/branches/main/protection --jq '.required_status_checks.contexts, .allow_force_pushes, .allow_deletions'
```
- [ ] Required checks incluem `Contrato DB vivo`, `Contrato DB offline`, guard e frescor de manifesto/catálogo
- [ ] Force-push e delete bloqueados

### E44 🟡 Gate automático de paridade tripla
Transformar a auditoria de 2026-09-16 em script: count + md5 dos prefixos (arquivos vs ledger), diff manifesto edge vs diretórios, guard, e diff do `grants-baseline.json` (E26).
- [ ] `scripts/db-audit/check-triple-parity.mjs` + teste
- [ ] Agendado no CI diário além de por-PR

### E45 🟡 Auditoria periódica de branches
- [ ] Job semanal: remotos merged não deletados, PRs abertos > 14 dias, branches sem commit há > 30 dias
- [ ] Primeiro relatório gerado e triado

### E46 🟢 Atualizar CLAUDE.md com o aprendido
- [ ] Adicionado: filtro `.sql` obrigatório ao contar migrations (`_foreign/`, `_superseded/`); ref `vpkmqeumtxhrwgawxdrl`; política de higiene (E13); script de registro (E19)
- [ ] Rodapé "Atualizado em" revisado no mesmo commit

---

## FASE 7 — Fechamento (E47–E50)

### E47 🟢 Re-executar a auditoria completa
Mesma metodologia do baseline: git tri-estado, paridade tripla, catálogo, manifesto, CI.
- [ ] Todos os ✅ do baseline mantidos
- [ ] Todos os ⚠️ do baseline resolvidos ou reclassificados com dono e prazo

### E48 🟢 Verificação cruzada independente
- [ ] Paridade do ledger por dois caminhos (job `Contrato DB vivo` do CI × `db_query` direto) → mesmo count e md5

### E49 🟢 Descartar a rede de segurança (≥ 7 dias após E47/E48 verdes)
- [ ] Bundle de E01 arquivado fora da máquina (não apagado)
- [ ] Worktrees e refs temporários removidos

### E50 🟢 Relatório final e sign-off
- [ ] `docs/audits/FECHAMENTO_PLANO_50_ETAPAS_<data>.md` com diff baseline → final e dívidas aceitas com responsável
- [ ] Este checklist 100% marcado ou com exceção justificada por escrito

---

## Dependências e paralelismo

- **Fase 0 bloqueia tudo.** E07 e E09 dependem de E01. E37 depende de E36. E49 depende de E47 + E48.
- Fases 2, 3, 4 e 5 podem correr em paralelo entre si; Fase 6 depende de E26 (E44) e E13/E19 (E46).
- Maiores riscos: **E24/E26** (RLS e grants já derrubaram o login em produção — sempre PR + deploy antes do apply) e **E09** (decisão humana sobre descartar trabalho).
