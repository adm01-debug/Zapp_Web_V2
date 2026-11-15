# Dossiê — `claude/chore-auditoria-supabase-final-251025-1655` (PR #2255)

- **tip**: `f5d5246` · **merge_base**: `3d0b46c` (2026-10-30) · 4 commits · 2 arquivos, +1058 linhas, 0 deleções
- **Escopo**: SOMENTE docs. 0 migrations, 0 workflows, 0 `src/`, 0 edges.

## Propósito
Versões "finais" de 2026-10-25 da auditoria Supabase (série S/CRITICAL-HIGH-MEDIUM-LOW-INFO, 28 achados):
`auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` (943 linhas) + `auditoria-supabase/progresso.json`
(115 linhas, rastreio de sessão S01–S12). Commit `f5d5246` ainda corrigiu 4 imprecisões técnicas
(CRITICAL-2 WITH CHECK, reclassificação `multiplix-voice` HIGH→INFO/design intencional, contagem 83→85 funções,
separação do que foi/não foi verificado em produção).

No merge_base o diretório `auditoria-supabase/` **não existia** (`git ls-tree -r 3d0b46c -- auditoria-supabase` → vazio).
A main recebeu o diretório depois, por outra linhagem de PRs:

| commit | data | PR |
|---|---|---|
| `6a6afde` | 2026-10-30 | #2241 auditoria exaustiva (28 achados) |
| `049094e` | 2026-10-31 | #2397 inventário + relatório |
| `c570d5d` | 2026-11-02 | #2630 arquiva prosa morta em `docs/_arquivo` |
| `f120344` | 2026-11-10 | #2844 consolida `achados.json`/RELATORIO/progresso (FASES 0 e A) — **MERGED** |

## Cadeia de supersessão (provada)
1. Comentário da própria PR #2255 (GraphQL): *"Substituída pela PR #2462 (`claude/auditoria-temp-261101`), que inclui rebase no main atual + 5 correções técnicas + reclassificação do multiplix-voice"*. #2255 ficou `dirty`/conflito.
2. #2462 também fechou sem merge — **mas seu conteúdo foi absorvido** e isso está registrado na main:
   - `origin/main:auditoria-supabase/achados.json:729` → `"#2462": "ABSORVER — docs 2026-10-25 (RELATORIO+progresso.json); 5 correções técnicas já absorvidas nos achados desta sessão"`
   - `origin/main:auditoria-supabase/achados.json:10` → `"PR #2462 (docs 2026-10-25 — absorvida, sem novos achados ZW)"`
   - `origin/main:auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md:37` → `**PR #2462 ABSORVIDA:** docs 2026-10-25 (RELATORIO+progresso.json); 5 correções técnicas absorvidas`
   - `origin/main:auditoria-supabase/progresso.json:34` → `achados.json consolida 47 ZW-nnnn de 3 fontes (...) + PR #2462 absorvida sem achados novos`
3. Main hoje tem **48 achados ZW-nnnn** em `auditoria-supabase/achados.json`, com campo `origem` mapeando os IDs antigos (S01–S12 / A/M/C / P001-P010), re-verificados em 2026-11-01 e 2026-11-08.

> A alegação "absorvida sem novos achados" é de outro agente — verifiquei achado por achado abaixo. Ela é **majoritariamente verdadeira, com 3 exceções reais**.

## Mapa achado-a-achado: branch (2026-10-25) × main (hoje)

| Branch | Onde está na main | Evidência |
|---|---|---|
| CRITICAL-1 grants anon escrita (98 tabelas) | **ZW-0001 / ZW-0046 RESOLVIDO** | `achados.json` ZW-0046 "98 grants de escrita anon → 1 restante (INSERT apenas)" |
| CRITICAL-2 39 UPDATE sem WITH CHECK | **ZW-0007 ALTO** (42→46 policies) | `achados.json` origem `S03-006 / A-01`; RELATORIO:52 |
| CRITICAL-3 `talkx-scheduler-1min` 9,3% falha | **ZW-0004 ALTO** cron startup timeout | `achados.json` origem `S06-001 / C-02b`; RELATORIO:72 |
| HIGH-1 17 tabelas RLS sem policy | **ZW-0032 INFO** | RELATORIO:358 lista as 17 tabelas; `progresso.json:104` |
| HIGH-3 `link_preview_cache` anon write + RLS sem policy | **coberto** (ZW-0046 + ZW-0032) | `link_preview_cache` está na lista de RELATORIO:358 |
| HIGH-4 `email_threads` 418M seq reads | **ZW-0024 MEDIO** (`email_threads.is_unread` sem índice parcial) | `achados.json` origem `S05-003` |
| HIGH-6 `catalog_send_stats` sem `security_invoker` | **ZW-0017 RESOLVIDO** | `achados.json:303-304` — 13/13 views com `security_invoker`, `catalog_send_stats` nominalmente citada |
| MEDIUM-1 35 FKs sem índice | **ZW-0028 BAIXO** (32 FKs) | origem `S04-002 / P004` |
| MEDIUM-2 60 migrations `statements IS NULL` | **ZW-0012 MEDIO** (65 versões) | origem `S02-001 / A-03` |
| MEDIUM-3 `_bkp_261023.contacts` sem RLS | **main é superior**: S09-005, 9 tabelas | RELATORIO:365 e :590 ("corrigido: 9, não 3"); drop em `20261026240300_drop_bkp_261023.sql` |
| MEDIUM-4 índices duplicados | **ZW-0030 / ZW-0026 / S07-002** | `achados.json` 637 índices `idx_scan=0`; RELATORIO:319 |
| MEDIUM-5 `multiplix-voice` sem MIME | **OBSOLETO pela própria branch** | `f5d5246` reclassificou para design intencional (bucket privado = default-deny) |
| MEDIUM-6 `mcp_exec` SQL arbitrário | **ZW-0013 MEDIO** | origem `S03-002 / A-04` |
| MEDIUM-7 `rpc_queue_goal_metrics` lenta | **na main** | RELATORIO:146 (top-20, 1306ms); `progresso.json:350` |
| MEDIUM-8 `department_invites DELETE USING(true)` | **CORRIGIDO em produção** | migration `20261102012200_department_invites_restringe_escrita.sql` no ledger (`progresso.json:14`) |
| MEDIUM-9 `conversations`/`tasks`/`accounts` ausentes | **RUÍDO — achado falso** | `git grep "from('conversations'\|'tasks'\|'accounts')" origin/main -- src/ supabase/functions/` → **0 ocorrências**. Nenhum código tenta usar essas tabelas. |
| LOW-2 `contacts` 29k seq scans | **ZW-0025 MEDIO** | origem `S05-004` (índice composto `assigned_to, conversation_status`) |
| LOW-3 `_zapp_fn_before` sem PK | **na main** | RELATORIO:485 `S04-003 \| MÉDIO \| _zapp_fn_before \| Sem PK` |
| INFO-1 3 buckets públicos | **ZW-0036 INFO** | origem `S09-003` |
| INFO-2 schema `_bkp_261023` | **na main** | RELATORIO:398 (seção própria) |
| INFO-4 6 edge functions `verify_jwt=false` | **main é superior: ZW-0040 = 14 functions** | origem `S12-005` |
| **HIGH-2 autovacuum ausente** | **AUSENTE na main** | `git grep -i autovacuum origin/main -- auditoria-supabase/` → **0 linhas** |
| **HIGH-7 0 fatores MFA** | **AUSENTE na main** | `git grep -i mfa origin/main -- auditoria-supabase/` → **0 linhas**; ZW-0042 (S09-auth) registra só "10 users (10 confirmados, 1 banned, 6 ativos 30d)", sem MFA |
| **HIGH-5 índices trigram 38MB sem uso** | **só genérico na main** | ZW-0030 "637 índices com `idx_scan=0`"; `git grep -i trgm origin/main -- auditoria-supabase/` só acha a extensão `pg_trgm` em RELATORIO:360 — nenhum índice trigram nominal |
| LOW-1 `e2e_cleanup` UUID hardcoded | **parcial** | ZW-0018 cobre `e2e_cleanup` por outro ângulo (SECURITY DEFINER em produção); o UUID hardcoded não está registrado |
| LOW-4 `sicoob_service_role_key` | **ausente na auditoria atual** | só em `docs/_arquivo/auditoria-supabase/inventario/06_crons.md` e auditorias de ago/2026 |
| LOW-5 `pg_timezone_names` 380 calls | **ausente na auditoria atual** | `git grep pg_timezone_names origin/main -- auditoria-supabase/` → 0 linhas |

### `auditoria-supabase/progresso.json`
Artefato de rastreio da sessão de 2026-10-25 (13 chaves `S01_*`…`S_INTEGRIDADE_ADICIONAL`, todas `CONCLUIDO`).
A versão da main tem 60+ chaves cobrindo as fases 0/A de 2026-11-08, re-verificações de 01/11 e 08/11, EXPLAIN do top-20 etc.
**Valor nenhum**: restaurar é regredir o arquivo.

### Re-verificação ao vivo (produção, SOMENTE LEITURA, 2026-11-15)
```sql
select (select count(*) from auth.users) users,
       (select count(*) from auth.mfa_factors) mfa_factors,
       (select count(*) from pg_stat_user_tables where schemaname='public' and last_autovacuum is null) sem_autovacuum,
       (select count(*) from pg_stat_user_indexes where schemaname='public' and indexrelname like '%trgm%' and idx_scan=0) trgm_zero,
       (select count(*) from pg_stat_user_indexes where schemaname='public' and indexrelname like '%trgm%') trgm_total;
-- users=10 | mfa_factors=0 | sem_autovacuum=207 | trgm_zero=8 | trgm_total=8
```
Os 3 achados ausentes **continuam verdadeiros hoje**.

## Veredito
**PERDIDA_PARCIAL.** O documento em si está obsoleto (snapshot de 2026-10-25 substituído pela consolidação
ZW-nnnn mergeada em #2844 em 2026-11-10; restaurá-lo seria regressão e conflito). Dos 28 achados, 25 estão
na main (quase sempre com evidência mais fresca), 1 é ruído comprovado (MEDIUM-9) e **3 nunca chegaram à main
e seguem válidos em produção**: 0 MFA, autovacuum ausente e os índices trigram nominais.

`apagar_branch_seguro = false` — não por causa do relatório, mas porque esses 3 achados só existem aqui.
Depois de portá-los para `auditoria-supabase/achados.json` (3 entradas ZW novas), a branch pode ser apagada.

## Lacunas a recuperar — hunks prontos para portar
Destino: **`auditoria-supabase/achados.json`** (array `achados`, 3 entradas ZW novas) + 1 linha cada em
`auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md`. **NÃO** restaurar o relatório nem o `progresso.json` da branch.

### 1) MFA = 0 (segurança) — `br_rel.md:229-249`
```md
### HIGH-7 — 0 fatores MFA em todos os 10 usuários
**Objeto**: `auth.mfa_factors` — todos os usuários
**Evidência** (2026-10-24T22:16 UTC; re-confirmada 2026-11-15):
SELECT (SELECT count(*) FROM auth.users) AS total_users,
       (SELECT count(*) FROM auth.mfa_factors) AS total_mfa_factors,
       (SELECT string_agg(DISTINCT provider, ', ' ORDER BY provider) FROM auth.identities) AS providers;
-- total_users: 10, total_mfa_factors: 0, providers: email, google
**Impacto**: nenhum usuário tem segundo fator. Comprometer uma credencial Google/email dá acesso total.
Com `is_admin_or_supervisor()` como única barreira de autorização em boa parte do app, um admin
comprometido alcança todos os dados do tenant.
**Correção**: MFA obrigatório no dashboard Supabase (Authentication → Policies → "Require MFA");
TOTP para email/senha, passkey para Google.
```
Severidade sugerida: **ALTO** (segurança de acesso). Seção A.9. Classe: APROVAÇÃO (ação é no painel, não DDL).

### 2) autovacuum ausente — `br_rel.md:144-166`
```md
### HIGH-2 — autovacuum ausente em tabelas com alta rotatividade
**Objeto**: pg_stat_user_tables
SELECT relname, n_dead_tup, n_live_tup, last_autovacuum
FROM pg_stat_user_tables WHERE schemaname='public' ORDER BY n_dead_tup DESC LIMIT 10;
Tabelas com `last_autovacuum IS NULL` e dead_pct alto:
- `user_devices`: 93% dead (9 dead / 1 live)
- `agent_stats`: 90% dead (9/1)
- `user_sessions`: 73% dead (7/2), NUNCA sofreu autovacuum
- `gmail_accounts`: 83% dead
- `crm_sync_outbox`: 16 dead / 0 live, sem autovacuum
**Impacto**: bloat crescente, degradação de performance, risco de wraparound de XID em tabelas de alta escrita.
**Correção**: `VACUUM ANALYZE` manual via SQL editor do dashboard (não roda via MCP — transaction block);
depois revisar config de autovacuum por tabela.
```
Severidade sugerida: **MEDIO** — ao vivo são 207 tabelas `public` com `last_autovacuum IS NULL`, mas as citadas
têm 1–2 linhas vivas (bloat irrelevante). Quem portar deve rodar antes:
`select relname,n_dead_tup,n_live_tup,last_autovacuum from pg_stat_user_tables where schemaname='public' and n_live_tup>1000 order by n_dead_tup desc limit 10;`
e registrar só as tabelas grandes — senão repete o erro de inflar severidade com tabelas de 10 linhas.

### 3) índices trigram nominais sem uso — `br_rel.md:209-227`
```md
### HIGH-5 — Índices trigram gigantes sem uso (38MB+)
**Objeto**: `pg_stat_user_indexes`
email_messages_body_text_trgm_idx: 17MB, 0 scans
email_attachments_filename_trgm_idx: 11MB, 0 scans
idx_messages_content_trgm: 5MB, 0 scans
idx_messages_media_url_trgm: 4.4MB, 0 scans
**Impacto**: ~38MB de índices nunca usados; custo de manutenção em todo INSERT/UPDATE nessas tabelas.
**Correção**: `propostas/03_drop_unused_indexes.sql` (existe em `docs/_arquivo/auditoria-supabase/propostas/`).
```
Severidade sugerida: **BAIXO**. Ao vivo: 8/8 índices `%trgm%` com `idx_scan=0`. Entra como detalhamento
nominal de **ZW-0030** (637 índices sem uso), não como achado novo independente.

### Descartar (não portar)
- `progresso.json` da branch (valor nenhum — a main tem versão muito mais rica)
- MEDIUM-9 `conversations`/`tasks`/`accounts` (achado falso: 0 referências no código da main)
- MEDIUM-5 `multiplix-voice` (a própria branch reclassificou para design intencional em `f5d5246`)
- LOW-1 / LOW-4 / LOW-5 (`e2e_cleanup` UUID, `sicoob_service_role_key`, `pg_timezone_names`): cosméticos;
  portar só se o dono quiser completude do inventário

---

## Verificação adversarial

**Discordo: veredito_final = OBSOLETA, `apagar_branch_seguro = true`.** As 3 lacunas alegadas não sustentam
`PERDIDA_PARCIAL`: 2 já estão na `main` e a 3ª é achado falso. `origin/main` em `dac285f` (2026-11-15).

A triagem grepou **apenas `auditoria-supabase/`**. Fora desse diretório, a `main` cobre os 3 itens.

### Lacuna 1 — MFA = 0 (a única com valor alegado "medio") → **JÁ ESTÁ NA MAIN, em dois lugares**
1. `origin/main:PENDENCIAS.md:312` seção datada **2026-11-15** (hoje, mais fresca que a branch de 25/10):
   - `:347` → `## 8. Nenhum dos 10 usuários tem segundo fator (MFA) ativo`
   - `:349` → `**Prova:** select count(1) from auth.users → 10; select count(1) from auth.mfa_factors → 0`
   - `:351-353` → impacto de negócio ("o risco aberto mais relevante que encontrei")
   - `:357-363` → já **escalado ao dono** com menu de decisão (a) obrigatório p/ todos, (b) só admin, (c) opcional
2. `origin/main:docs/_arquivo/auditoria-supabase/inventario/07_auth.md` — **mesmo ID `HIGH-7`**:
   - `:11` → `| MFA factors cadastrados | **0** (HIGH-7) |`
   - `:37` → `## MFA (0 factors) — HIGH-7`; `:41` a consulta; `:45` o impacto; `:47` a correção (painel, sem migration)
   - `:83` → `**HIGH-7**: 0 usuários com MFA ativo em sistema de produção com 10 usuários`

Portar isso para `achados.json` criaria a **terceira** cópia do mesmo achado — e a versão de `PENDENCIAS.md`
é superior: está na fila de decisão do dono, não num relatório de auditoria.

### Lacuna 2 — autovacuum ausente → **ausente da main, mas é ACHADO FALSO**
Confirmei que não está na `main` (`git grep -iln autovacuum origin/main` não retorna nada em
`auditoria-supabase/` nem em `docs/_arquivo/auditoria-supabase/` além de 1 comentário solto em
`propostas/03_drop_unused_indexes.sql:11`). Mas o achado não resiste à medição (produção, 2026-11-15, SELECT):

```sql
select datname, stats_reset, (select count(*) from pg_stat_user_tables where schemaname='public') total,
       (select count(*) from pg_stat_user_tables where schemaname='public' and last_autovacuum is not null) com_av
from pg_stat_database where datname = current_database();
-- stats_reset = NULL (contadores nunca zerados) | total = 212 | com_av = 5

select count(*) from pg_stat_user_tables
where schemaname='public' and last_autovacuum is null and n_dead_tup > 1000;  -- 0

select relname, n_live_tup, n_dead_tup from pg_stat_user_tables
where schemaname='public' and last_autovacuum is null and n_live_tup > 1000 order by n_dead_tup desc;
-- connection_health_logs: 2016 live / 332 dead (14%)  ← única; abaixo do gatilho de 20%
```

`last_autovacuum IS NULL` em 207 de 212 tabelas **não é defeito**: o gatilho padrão do Postgres é
`50 + 20% das linhas vivas`, e as tabelas citadas pela branch têm 1–2 linhas vivas (`user_devices` 9 dead / 1 live).
Nenhuma tabela em produção tem `n_dead_tup > 1000`. `stats_reset IS NULL` elimina a hipótese de artefato de
contador. Registrar isso em `achados.json` seria inserir ruído num arquivo que o dono usa para decidir —
exatamente o erro que a própria triagem receou ("senão repete o erro de inflar severidade com tabelas de 10 linhas").

### Lacuna 3 — índices trigram nominais → **JÁ ESTÁ NA MAIN, com SQL pronto**
`origin/main:docs/_arquivo/auditoria-supabase/propostas/03_drop_unused_indexes.sql` nomeia os **4 índices com
os mesmos tamanhos** da branch, mais `DROP` e `ROLLBACK` prontos (`:38-52`):
`email_messages_body_text_trgm_idx` 17MB · `email_attachments_filename_trgm_idx` 11MB ·
`idx_messages_content_trgm` 5MB · `idx_messages_media_url_trgm` 4,4MB — e no cabeçalho `:8-9`
"38MB+ em índices GIN/trigram (pg_trgm) com idx_scan = 0". A triagem já classificara como valor **baixo**;
sendo cópia do que a main tem (em forma executável, não prosa), o valor é **zero**.

### Nenhuma remoção proposital, e a cadeia de supersessão confere
- `git log -S'mfa_factors' --oneline origin/main -- auditoria-supabase/` → vazio: o conteúdo nunca esteve no
  diretório vigente, logo não houve remoção/revert a investigar.
- Conferi na main as linhas que a triagem citou como substituição: `auditoria-supabase/achados.json:10` e `:729`
  (`"#2462": "ABSORVER — docs 2026-10-25 …"`), `RELATORIO_AUDITORIA_SUPABASE.md:37`, `progresso.json:34`.
  Existem e dizem o que ela afirmou.
- `docs/_arquivo/auditoria-supabase/RELATORIO_AUDITORIA_SUPABASE.md` (745 linhas) é de outra linhagem
  (2026-10-30, re-verificado 31/10) — não é a cópia arquivada desta branch; mas seu `inventario/07_auth.md`
  carrega o HIGH-7 com a mesma numeração, o que mostra que a série da branch foi absorvida por essa via.

### Conclusão
Os 25 achados mapeados pela triagem estão na main (concordo com o mapa) e as 3 "exceções" caem:
2 duplicam material vigente da main, 1 é ruído estatístico. **Não resta nenhum hunk de valor ≥ médio.**
Restaurar o `RELATORIO` (943 linhas) ou o `progresso.json` da branch seria regressão — nisso a triagem está certa.
Nada a portar; a branch pode ser apagada.

**Lacuna adicional que encontrei (fora desta branch, não bloqueia nada):** a `main` tem o achado de MFA em
`PENDENCIAS.md:347` e em `docs/_arquivo/.../07_auth.md:37`, mas **não** em `auditoria-supabase/achados.json`
(48 ZW-nnnn, zero menções a MFA). Quem ler só a auditoria vigente não vê o risco. É divergência interna da
main, não trabalho perdido desta branch.
