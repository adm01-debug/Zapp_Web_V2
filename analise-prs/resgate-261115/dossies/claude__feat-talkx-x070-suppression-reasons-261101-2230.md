# claude/feat-talkx-x070-suppression-reasons-261101-2230 (PR #2517)

- tip `cc475ea94` · merge_base `1252bb5a4` · 2 commits · 2 arquivos novos, 357 linhas
- Propósito: X070 — criar o catálogo `talkx_suppression_reasons` (6 motivos de sistema + motivos
  personalizados por admin), trocar `talkx_blacklist.reason_code` de enum para `text` com FK no catálogo,
  recriar a view `talkx_campaign_optouts` e a função `talkx_suppress_contact` sem o enum, dropar o enum
  `talkx_blacklist_reason`; mais um teste comportamental em Postgres descartável.

## Arquivo × achado × evidência

| Arquivo da branch | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101223000_talkx_suppression_reasons.sql` | **INCORPORADA** — a mesma migration entrou na main renomeada e endurecida | `origin/main:supabase/migrations/20261108100000_talkx_suppression_reasons.sql`, linha 2: `-- Timestamp original 20261101223000 — renomeado para 20261108100000 (conflito com PR #2457).` Mesma tabela/colunas/CHECKs, mesmo seed dos 6 motivos, mesmas 3 policies, mesma FK, mesma conversão para `text`, mesmo `DROP TYPE`. A versão da main é **superset**: guarda também no INSERT (`is_system` só por migration), `is_system`/`label` de sistema imutáveis, GRANT por coluna (authenticated não escreve `is_system`), view recriada com `security_invoker=true` + REVOKE anon, gatilho novo `talkx_blacklist_reason_active_guard` (motivo inativo recusado, 23514), `talkx_blacklist_audit_trigger` corrigido para ler o catálogo em vez do cast para enum, mapa de `origin` mais conservador (`system` fica NULL de propósito, em vez do `ELSE 'manual'` da branch) e bloco de rollback executável. Reforço posterior em `20261112172000_talkx_suppression_reasons_hardening.sql` (created_by não forjável, label único, índice da FK). |
| `scripts/db-audit/talkx-suppression-reasons.test.sh` | **PERDIDA PARCIAL** — ausente na main; parte dos critérios é coberta por outros dois arquivos, 4 asserções comportamentais não | Na main existem `scripts/db-audit/talkx-suppression-reasons.smoke.sh` (10 checks **estruturais** pós-deploy, exige `PGURL`: tabela, 6 seeds, `reason_code` text, FK, enum removido, view, RLS on, SECURITY DEFINER, gatilho de motivo ativo, authenticated sem is_system) e `supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh` (comportamental em PG17 descartável, aplica a X070 real — `F_X070="$MIG_DIR/20261108100000_talkx_suppression_reasons.sql"`, linha 44 — e prova preenchimento de `reason_code` pelo catálogo, recusa de motivo inativo, ordem dos gatilhos, ACLs, DELETE barrado). `git grep -l talkx_suppression_reasons origin/main` não traz nenhum teste que exerça RLS do catálogo por papel. |

## Produção (consulta somente leitura, `tnnnlkbymytvtqngbbqh`)

`migrations = 20261108100000, 20261112160000, 20261112172000` (a `20261101223000` **nunca** foi aplicada);
`talkx_suppression_reasons` existe com 6 motivos `is_system`; policies `..._read/_write/_update`;
funções `talkx_suppression_reasons_guard`, `talkx_blacklist_reason_active_guard`, `talkx_suppress_contact`;
FK `talkx_blacklist_reason_code_fk` presente; `pg_type talkx_blacklist_reason` = 0; `reason_code` = `text`.
Ou seja: todo o efeito de negócio da branch está em produção. Reaplicar o arquivo da branch quebraria
(`CREATE TABLE` duplicado) e desfaria o endurecimento.

## Veredito

**PERDIDA_PARCIAL** — a migration está 100% incorporada (e superada); o que falta é só o teste
comportamental do catálogo. Valor médio: protege RLS/guarda que hoje só têm prova estrutural.

## Lacuna a recuperar (única)

`scripts/db-audit/talkx-suppression-reasons.test.sh` — 4 asserções sem cobertura comportamental na main.
**Não dá para portar o arquivo como está**: ele aponta para
`supabase/migrations/20261101223000_talkx_suppression_reasons.sql` (inexistente → `fail "migration nao encontrada"`),
monta harness próprio (auth mock, roles, `is_admin_or_supervisor` lendo `user_roles`) e concede
`GRANT SELECT, INSERT, UPDATE ON talkx_suppression_reasons TO authenticated` depois da migration,
o que anula o GRANT por coluna da main. Caminho recomendado: acrescentar os 4 cenários ao
`supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh`, que já aplica a X070 real com papéis reais
(`SET ROLE` + `request.jwt.claim.sub`) e ACL default do Supabase — ou criar
`supabase/tests/db-audit/talkx-suppression-reasons.test.sh` no mesmo molde, apontando para
`20261108100000_talkx_suppression_reasons.sql` e `20261112172000_talkx_suppression_reasons_hardening.sql`.

Hunks essenciais a portar (da branch, adaptando papéis/caminho):

```bash
# Critério 2: admin pode criar código personalizado
psql_sql "
  SET ROLE authenticated;
  SET request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000001';
  INSERT INTO talkx_suppression_reasons (code, label, tone, is_system, sort_order)
    VALUES ('cliente_vip', 'VIP bloqueado', 'informativo', false, 200);
"   # NOTA: na main o authenticated NÃO tem GRANT na coluna is_system — remover is_system do INSERT.
[[ "$(psql_sql "SELECT count(*) FROM talkx_suppression_reasons WHERE code = 'cliente_vip'")" == '1' ]] \
  || fail 'admin nao conseguiu inserir codigo personalizado'

# Critério 3: agente (nao admin) recebe erro RLS ao inserir
expect_failure 'agente recebe erro RLS ao inserir motivo' \
  "SET ROLE authenticated; SET request.jwt.claim.sub='aaaaaaaa-0000-0000-0000-000000000002'; INSERT INTO talkx_suppression_reasons (code, label, tone) VALUES ('teste_agente', 'Teste', 'informativo');"

# Critério 4: trigger bloqueia desativar motivo do sistema
expect_failure 'trigger bloqueia desativacao de motivo do sistema' \
  "UPDATE talkx_suppression_reasons SET active = false WHERE is_system = true AND code = 'opt_out';"

# Critério 5: FK rejeita código inexistente (23503)
fk_output="$(psql ... -c "INSERT INTO talkx_blacklist (origin, reason_code) VALUES ('manual', 'codigo_inexistente');" 2>&1)"
(( $? != 0 )) || fail 'FK deveria rejeitar codigo inexistente'
[[ "$fk_output" == *23503* ]] || fail "esperava erro 23503, recebeu: $fk_output"

# Critério 6: talkx_suppress_contact como service_role devolve uuid
result="$(psql_sql "
  SET ROLE service_role; SET request.jwt.claim.role='service_role';
  SELECT talkx_suppress_contact('cccccccc-0000-0000-0000-000000000001'::uuid, NULL,
    'Bloqueio de teste', 'manual', 'manual', NULL, NULL);
")"
[[ "$result" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]] \
  || fail "talkx_suppress_contact nao devolveu uuid valido: '$result'"
```

Cenários extras da branch (enum dropado, `reason_code` text) já estão no `smoke.sh` da main (checks 3 e 5)
— não portar.

## Branch

`apagar_branch_seguro = false`: o único conteúdo exclusivo da branch é esse teste. Apagar antes de portar
os 4 cenários perde o texto das asserções. Depois de portados (ou se o dono decidir que smoke+reconcilia
bastam), a branch pode ser apagada sem perda.

## Verificação adversarial

Parecer: **CONCORDO com PERDIDA_PARCIAL**. Tentei refutar por dois lados e os dois sustentaram a triagem.

### 1. Metade da migration: realmente INCORPORADA (superset), não há hunk perdido ali
`git diff 1252bb5a4 origin/claude/feat-talkx-x070-suppression-reasons-261101-2230 --stat` = só 2 arquivos
(357 linhas). Lendo os dois lado a lado, cada bloco da branch tem equivalente igual ou mais forte na main
em `supabase/migrations/20261108100000_talkx_suppression_reasons.sql`:
- tabela (8 colunas, CHECKs de `code`/`tone`), seed dos 6 motivos com os mesmos `label`/`tone`/`sort_order`,
  3 policies, `DROP VIEW`/recriação de `talkx_campaign_optouts`, `ALTER COLUMN reason_code TYPE text`,
  FK `talkx_blacklist_reason_code_fk` (`ON UPDATE CASCADE ON DELETE RESTRICT`), recriação de
  `talkx_suppress_contact` com `p_reason_code text`, `DROP TYPE talkx_blacklist_reason` — todos presentes.
- a main é estritamente mais forte: guarda também no INSERT (`is_system` só por migration, 42501),
  `is_system`/`label` de sistema imutáveis, `REVOKE ALL` + GRANT por coluna, view com
  `security_invoker = true`, gatilho `trg_talkx_blacklist_reason_active`, `talkx_blacklist_audit_trigger`
  reescrito sem o cast para o enum morto, mapa de `origin` conservador (`system` fica NULL de propósito,
  em vez do `ELSE 'manual'` da branch) e bloco de rollback executável no cabeçalho.
- `20261112172000_talkx_suppression_reasons_hardening.sql` acrescenta o endurecimento posterior.
Nenhum hunk da migration da branch ficou de fora. Único "a menos" da main é o `ELSE 'manual'` do passo 7,
e isso é decisão deliberada documentada no próprio arquivo — não é lacuna.

Produção (`tnnnlkbymytvtqngbbqh`, `db_query` só leitura) confirma o efeito aplicado:
`reasons_total=6, reasons_system=6, enum_restante=0, reason_code_tipo=text, fk=1, policies=3,
migs_main=2 (20261108100000 + 20261112172000), mig_branch=0 (20261101223000 ausente),
auth_insert_is_system=false`.

### 2. A lacuna do teste é real e não foi removida de propósito
- `git grep -l talkx_suppression_reasons origin/main -- scripts supabase/tests supabase/functions .github src`
  devolve só 4 arquivos: `scripts/db-audit/talkx-suppression-reasons.smoke.sh`,
  `supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh`,
  `src/components/talkx/__tests__/TalkXSuppressionReasons.test.tsx` (UI, não RLS) e `types.ts`.
- `git grep -n 23503 origin/main -- scripts supabase/tests` → nenhuma asserção de FK no catálogo
  (só 2 comentários num teste de searchbox). `git grep -n is_system origin/main -- scripts supabase/tests`
  → só o smoke.sh, e lá é `has_column_privilege` (privilégio), não o gatilho que recusa desativar
  motivo do sistema.
- O `reconcilia.test.sh` toca o catálogo em 2 pontos apenas (linhas 238-239: cria `teste_inativo` **como
  postgres** e prova `talkx_suppression_reason_inactive` no `talkx_blacklist`; linha 299: índice em
  `created_by`). Não exerce RLS do catálogo por papel, não tenta desativar motivo de sistema, não mede
  23503 e não chama `talkx_suppress_contact`.
- Não houve remoção deliberada: `git log --diff-filter=A origin/main -- scripts/db-audit/talkx-suppression-reasons.smoke.sh`
  = commit único `d5835ed8c` ("feat(talkx): catálogo talkx_suppression_reasons ... (#2817)"), cujo
  `--stat` adiciona **só** o `.smoke.sh` (69 linhas). Nenhum commit em `origin/main` jamais criou nem
  apagou um `talkx-suppression-reasons.test.sh`. Ou seja: o comportamental nunca entrou.
- Agravante encontrado na verificação: o corpo da PR #2817 afirma "Smoke-test em
  `scripts/db-audit/talkx-suppression-reasons.test.sh` cobre 8 assertions" (arquivo que não existe na main)
  e `docs/talkx/v4/etapas/F06-capacidades-novas-do-motor-e-agregacoes.md:215` credita ao `smoke.sh` os 6
  comportamentos (admin cria `cliente_vip`, agente leva erro de RLS, `active=false` em motivo de sistema
  falha, 23503, `talkx_suppress_contact` devolve uuid). O `smoke.sh` real não assere nenhum desses — é
  estrutural e exige `PGURL`. O doc de aceite está divergente da realidade.
- `git grep -n talkx-suppression-reasons origin/main -- .github scripts/ci` → **nada**: o `smoke.sh` não
  roda em CI nenhuma (é conferência manual pós-deploy). Logo não há rede de proteção automática para a X070
  além do que o `reconcilia` cobre de raspão.

### 3. O trabalho ainda encaixa na main
`is_admin_or_supervisor`, `talkx_suppression_reasons_guard`, `trg_talkx_blacklist_reason_active`,
`talkx_suppress_contact(uuid,text,text,text,text,uuid,uuid)` e a FK existem na main e em produção.
`.github/workflows/db-guard.yml:661` já roda `supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh`
via `retry-disposable-postgres-test.sh`, então um teste novo no mesmo diretório entra em CI com uma linha.
Confirmo as duas ressalvas da triagem: apontar para `20261108100000`/`20261112172000` (o
`20261101223000` não existe) e **não** repetir os `GRANT SELECT, INSERT, UPDATE` amplos nem o `is_system`
no INSERT do admin — a main só concede `INSERT (code, label, tone, active, sort_order, created_by)`, e
`has_column_privilege(authenticated, is_system, INSERT) = false` em produção.

Veredito final: **PERDIDA_PARCIAL**, valor médio, 1 lacuna (o teste comportamental).
`apagar_branch_seguro = false` até os 4 cenários estarem portados.
