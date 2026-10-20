# Proveniência e drift — migrations `team_chat` da branch abandonada `claude/confident-babbage-ivgmmn`

**Data:** 2026-10-20
**Repo:** `adm01-debug/Zapp_Web_V2`
**Natureza deste documento:** **diagnóstico de proveniência e drift**. Ele apenas compara dois históricos Git
(`origin/main` e `origin/claude/confident-babbage-ivgmmn`). **Nenhuma DDL foi executada**, nenhum SQL foi
rodado contra banco algum, nenhuma migration foi criada, editada ou aplicada, e nenhum arquivo de
`supabase/migrations/`, `.github/` ou `vercel.json` foi tocado. Todos os números abaixo saem de comandos
`git` reproduzíveis (anexo, seção 8).

---

## 1. Referências verificadas

| Item | Valor | Como foi verificado |
|---|---|---|
| `origin/main` no momento da análise | `d7af7a671ca2bd7005b75b0aa54c0f0c4672befc` (2026-10-19 14:54:28 -0300) | `git rev-parse origin/main` |
| Tip da branch abandonada | `0e283d06850a67739beee9cc623530619d9b2cad` | `git rev-parse origin/claude/confident-babbage-ivgmmn` |
| Merge-base | `0063e2aa76954498ab9344b35f874bca6b18d1d7` | `git merge-base 0063e2aa… origin/claude/confident-babbage-ivgmmn` |
| Commits à frente da main | **37** | `git rev-list --count 0063e2aa…..<branch>` |
| Commits atrás da main | **804** | `git rev-list --count <branch>..origin/main` |
| Migrations no escopo (branch) | **40** | `git diff --name-only <merge-base> <branch> -- supabase/migrations/` |

Fatos de contexto já apurados antes desta análise (não reverificados aqui): PR **#1151** foi fechada
**sem merge** em 29/09/2026; as **40** migrations `team_chat` versions `20260928420000..20260929440000`
**existem no ledger** (`supabase_migrations.schema_migrations`) do projeto de produção
`tnnnlkbymytvtqngbbqh`, aplicadas via MCP **fora do Git**.

---

## 2. Item 1 — existência e identidade dos 40 arquivos na `main`

Comando por arquivo:
`git rev-parse <ref>:<path>` para o hash do blob e `git diff --numstat <blob_branch> <blob_main>`
para a contagem de linhas; existência por `git cat-file -e origin/main:<path>`.

### 2.1 Tabela dos 40 arquivos

`divergencia_linhas` = soma de linhas adicionadas + removidas no `git diff --numstat` entre o blob da
branch e o blob da main (inclui o bloco de 5 linhas de cabeçalho que a main acrescenta).
`diff_semantico_token` = comparação do **fluxo de tokens SQL** depois de remover todos os comentários
(inclusive dentro de corpos `$$…$$`) e normalizar espaços em branco — ou seja, ignora formatação e
comentário e responde "o SQL executável é o mesmo?".

| version (arquivo) | existe_na_main | identico_ou_divergente | divergencia_linhas | diff_semantico_token |
|---|---|---|---|---|
| `20260928420000_team_chat_current_profile_id_helper.sql` | SIM | DIVERGENTE | 19 | NAO |
| `20260928430000_team_chat_fix_policies_to_authenticated.sql` | SIM | DIVERGENTE | 68 | **SIM** |
| `20260928440000_team_chat_receipts_conversation_id.sql` | SIM | DIVERGENTE | 21 | NAO |
| `20260928450000_team_chat_e09_revoke_ddl_privs.sql` | SIM | DIVERGENTE | 15 | NAO |
| `20260928460000_team_chat_e10_revoke_all_anon.sql` | SIM | DIVERGENTE | 15 | NAO |
| `20260928470000_team_chat_e11_column_privs_team_messages.sql` | SIM | DIVERGENTE | 8 | NAO |
| `20260928480000_team_chat_e12_fix_update_policy_team_messages.sql` | SIM | DIVERGENTE | 15 | NAO |
| `20260928490000_team_chat_e13_receipts_hardening.sql` | SIM | DIVERGENTE | 32 | NAO |
| `20260928500000_team_chat_e14_department_invitations_schema.sql` | SIM | DIVERGENTE | 29 | NAO |
| `20260928510000_team_chat_e15_accept_department_invite_rpc.sql` | SIM | DIVERGENTE | 44 | NAO |
| `20260928520000_team_chat_e16_create_department_invite_rpc.sql` | SIM | DIVERGENTE | 41 | NAO |
| `20260928530000_team_chat_e17_department_audit_logs_hardening.sql` | SIM | DIVERGENTE | 41 | NAO |
| `20260928540000_team_chat_e18_departments_whatsapp_config.sql` | SIM | DIVERGENTE | 48 | NAO |
| `20260928550000_team_chat_e19_department_whatsapp_cred_rpc.sql` | SIM | DIVERGENTE | 40 | NAO |
| `20260928560000_team_chat_e20_storage_team_chat_files.sql` | SIM | DIVERGENTE | 25 | NAO |
| `20260928570000_team_chat_e21_team_conversations_update_policy.sql` | SIM | DIVERGENTE | 12 | NAO |
| `20260928580000_team_chat_e22_team_conversation_members_policies.sql` | SIM | DIVERGENTE | 59 | NAO |
| `20260928600000_team_chat_e25_team_messages_integrity.sql` | SIM | DIVERGENTE | 23 | NAO |
| `20260929160000_team_chat_e26_message_type_media_constraint.sql` | SIM | DIVERGENTE | 13 | NAO |
| `20260929170000_team_chat_e27_reply_to_self_ref_check.sql` | SIM | DIVERGENTE | 35 | NAO |
| `20260929180000_team_chat_e28_edit_guard_trigger.sql` | SIM | DIVERGENTE | 30 | NAO |
| `20260929190000_team_chat_e29_conversations_constraints.sql` | SIM | DIVERGENTE | 54 | NAO |
| `20260929200000_team_chat_e30_dept_conversation_constraints.sql` | SIM | DIVERGENTE | 18 | NAO |
| `20260929210000_team_chat_e31_conversation_members_constraints.sql` | SIM | DIVERGENTE | 17 | NAO |
| `20260929220000_team_chat_e32_reactions_hardening.sql` | SIM | DIVERGENTE | 65 | NAO |
| `20260929230000_team_chat_e33_receipts_consistency_check.sql` | SIM | DIVERGENTE | 37 | NAO |
| `20260929240000_team_chat_e34_drift_mirror_metadata_realtime.sql` | SIM | DIVERGENTE | 33 | NAO |
| `20260929250000_team_chat_e35_comment_on_tables.sql` | SIM | DIVERGENTE | 50 | NAO |
| `20260929260000_team_chat_e37_get_team_inbox_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929270000_team_chat_e38_get_team_messages_page_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929280000_team_chat_e39_mark_team_conversation_read_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929290000_team_chat_e40_search_team_messages_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929300000_team_chat_e41_toggle_team_reaction_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929310000_team_chat_e42_set_team_member_pref_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929320000_team_chat_e43_leave_team_group_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929330000_team_chat_e44_remove_team_member_rpc.sql` | SIM | DIVERGENTE | 7 | NAO |
| `20260929400000_team_chat_e45_transfer_conversation_department_rpc.sql` | SIM | DIVERGENTE | 66 | NAO |
| `20260929410000_team_chat_e47_e48_e49_replica_identity_deprecated_comments_drop_dup_indexes.sql` | SIM | DIVERGENTE | 15 | NAO |
| `20260929430000_team_chat_e46_leave_remove_last_owner_promotion.sql` | SIM | DIVERGENTE | 121 | NAO |
| `20260929440000_team_chat_e51_receipts_conversation_id_not_null_trigger.sql` | SIM | DIVERGENTE | 29 | NAO |

### 2.2 Resumo

- **40 / 40 existem na `main`.** Nenhum arquivo ausente.
- **0 / 40 são idênticos byte a byte.** Todos os 40 divergem do conteúdo da branch.
- **1 / 40 tem divergência de SQL executável** (fluxo de tokens): `20260928430000_team_chat_fix_policies_to_authenticated.sql`.
- **39 / 40 divergem só em formatação e comentário.**

### 2.3 Como e por que os 40 chegaram à `main`

Todos os 40 arquivos entraram na `main` no **mesmo commit**:

```
c8751470180394272c192d036e751e9904004c9a | 2026-09-29 14:30:25 -0300 | adm01-debug
fix(db): recupera do ledger as 40 migrations team_chat aplicadas fora do Git (#1199)
```
(`git log --diff-filter=A origin/main -- supabase/migrations/<cada um dos 40>` devolve este mesmo commit
para os arquivos amostrados: `20260928430000…`, `20260929280000…`, `20260929440000…`.)

Cada arquivo da `main`, no topo, carrega este bloco de proveniência (5 linhas, literal):

```sql
-- Recuperada do ledger (supabase_migrations.schema_migrations) em 2026-09-29.
-- Migration 20260928430000 foi aplicada em producao sem arquivo no repositorio (DDL fora do Git);
-- o SQL abaixo e identico ao registrado no ledger. Ver DB Live Guard:
-- scripts/db-audit/check-migration-drift.mjs
```

A diferença de forma entre os dois lados é consistente e mecânica:

- a `main` **acrescenta** o cabeçalho de 5 linhas acima e **remove** os comentários autorais originais
  (ex.: o comentário `-- E39: mark_team_conversation_read() — upsert de recibos…` da branch não existe na `main`);
- a `main` **colapsa cada statement em uma única linha** e **acrescenta uma linha em branco entre
  statements** (ex.: o corpo de `current_profile_id()` vira `… AS $$ SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1 $$;`, e os `REVOKE`/`GRANT` passam a ter linha em branco antes).

Por isso a contagem de linhas divergentes é alta (até 121) mesmo quando o SQL é o mesmo.
`scripts/db-audit/check-migration-drift.mjs` existe na `main` (`git cat-file -e origin/main:scripts/db-audit/check-migration-drift.mjs` → existe), e é o script citado no cabeçalho.

**Conclusão de proveniência:** a branch abandonada nunca foi mergeada, mas o *conteúdo* do seu escopo
chegou à `main` por reconstrução do ledger no PR **#1199**, reformatado e sem os comentários originais.

---

## 3. Item 2 — migrations `202609*team_chat*` na `main` que **nunca** existiram na branch

**Resultado: nenhuma.**

```
git ls-tree -r --name-only origin/main            -- supabase/migrations/ | grep team_chat | grep /202609  → 62
git ls-tree -r --name-only origin/claude/babbage… -- supabase/migrations/ | grep team_chat | grep /202609  → 62
comm -23 main_tc.txt br_tc.txt   → (vazio)   # arquivos só na main
comm -13 main_tc.txt br_tc.txt   → (vazio)   # arquivos só na branch
```

Os dois conjuntos são **idênticos, 62 arquivos cada**. Não há, hoje, arquivo
`202609*team_chat*` na `main` sem correspondente na branch.

---

## 4. Item 3 — versions do branch que **não** existem na `main` (arquivo ausente)

**Resultado: nenhuma.** Os 40 arquivos do branch existem todos na `main` (`git cat-file -e origin/main:<path>`
retorna sucesso para os 40; coluna `existe_na_main = SIM` em todos). O conjunto de 62 `202609*team_chat*`
é idêntico dos dois lados (seção 3). Não há version do escopo presente só no branch.

---

## 5. Item 4 — regras do repo citadas (`CLAUDE.md` da `main`)

Trechos **literais** de `origin/main:CLAUDE.md` (634 linhas), com a linha.

### 5.1 DDL: rota permitida (MCP + registro no ledger no mesmo turno)

> **linha 82 (seção 1, "Regras de migration", regra 1):**
> "`supabase_apply_migration` **está bugado** (coluna `executed_at` inexistente). Procedimento: DDL via `db_query` + `INSERT INTO supabase_migrations.schema_migrations(version,name,statements)` manual. Para apply em produção com dry-run + confirmação de hash SHA-256 (**preferível** a fazer manual pelo MCP), existe `.github/workflows/db-migrate.yml` (`workflow_dispatch` na `main`, `apply=false` primeiro para o dry-run, depois `apply=true` com `confirm_runtime_sha256` do dry-run anterior). […] Antes disso o fallback rejeitava toda migration nova, e **foi por isso que o DDL passou a ir por MCP — origem dos drifts de setembro/2026**. O job exige aprovação humana no environment `producao-ddl` (PR #687)."

> **linha 83 (regra 2):**
> "Antes de registrar: `SELECT max(version)` e usar versão estritamente maior; `INSERT ... ON CONFLICT DO NOTHING` com `RETURNING`/SELECT de conferência (DO NOTHING já mascarou colisão duas vezes em 2026-09-16). `scripts/db-audit/register-migration.mjs <arquivo.sql> [--apply]` automatiza esse ritual — gera o bloco SQL pronto (dry-run) ou aplica e aborta sozinho se `RETURNING` vier vazio."

> **linha 84 (regra 3):**
> "Toda mudança de DDL = arquivo em `supabase/migrations/` + registro no banco + `supabase/schema-catalog.json` atualizado + `scripts/db-audit/known-violations.json` se o guard mudar."

### 5.2 Ordem obrigatória: arquivo → PR → merge → deploy → apply

> **linha 87 (regra 6):** "**Ordem obrigatória: arquivo → PR → merge em `main` → deploy → apply. Nunca DDL a partir de branch paralelo.**"

> **linhas 90–101 (continuação da regra 6):**
> "Só aplique DDL em produção **depois** do merge em `main` e do deploy do código que depende dele. Única exceção: DDL **aditivo e compatível com o código atual de `main`** […] Aplicar de um branch que fica aberto foi a causa dos dois drifts de setembro/2026 (2026-09-02: 2 migrations; 2026-09-04: 5 migrations dos PRs #213/#218) — o segundo quebrou o lockout de login em produção porque o `REVOKE` entrou no banco antes do código que o acompanhava. **Se o PR não vai mergear agora, o DDL espera.**"

> **linhas 30–32 (seção 0, regra 3):**
> "**A exceção da regra 6 (DDL aditivo na produção antes do merge) deixa de valer para trabalho de agente.** […] Só o Joaquim pode autorizar um apply fora do lote."

### 5.3 Imutabilidade de migration já aplicada

> **linha 104 (regra 7):**
> "Ao registrar no ledger, `statements` é o SQL **real e completo**, um statement por elemento, sem `;` final e sem comentários — nunca resumo em prosa ("... (add guard)"). Resumo obriga exceção `pinned-replay` em `migration-evidence.json` para sempre."

> **linha 107 (regra 8):**
> "`supabase/migrations/_foreign/` e `_superseded/` são arquivo morto (cada um com seu README) — **nunca** contar com `ls supabase/migrations/` sem filtrar `*.sql`, senão a paridade arquivos↔ledger dá falso positivo (aconteceu na auditoria de 2026-09-16)."

### 5.4 O que o `db-guard` bloqueia

`.github/workflows/db-guard.yml` (nome do job/check: **"Contrato DB offline"**; comentário do passo, literal):
"ataca a causa raiz dos drifts documentados no CLAUDE.md (02/09, 04/09, 24-26/09) — um arquivo em `supabase/migrations/` editado DEPOIS de já ter sido aplicado em produção (ou já mergeado) nunca deveria voltar a mudar".

O passo "Rejeitar edicao de migration ja existente" só roda em `pull_request` (a API de arquivos do PR não
existe em push/schedule/dispatch) e **falha o PR** com:

> "Este PR edita o CONTEUDO de uma migration que ja existe, com o mesmo nome ou renomeada (regra 7 da secao 1 do CLAUDE.md — statements no ledger e o SQL real e completo; um arquivo ja aplicado nao pode mudar depois)"
> "Se o objetivo e corrigir algo ja aplicado, crie um NOVO …"

São considerados violação: `status === 'modified'` e `status === 'renamed'` com `additions>0 || deletions>0`,
sobre arquivos que casam `^supabase/migrations/\d{14}_.*\.sql$`. Duas exceções: (1) promoção de
stub *comment-only* para SQL real; (2) arquivo com `kind='ledger-only/name-and-file-pinned'` em
`migration-evidence.json`.

**Aplicação ao caso:** nenhum dos 40 arquivos aparece em `scripts/db-audit/migration-evidence.json`
(824 linhas, 65 entradas de `filename`; `grep -c` para `20260928420000`, `20260928430000`,
`20260929280000`, `20260929440000` → **0**, e apenas 4 menções a `team_chat`, todas de arquivos
diferentes). Logo a **Exceção 2 não cobre estes 40**: qualquer PR que edite o conteúdo de um deles
será barrado pelo `db-guard` — o caminho prescrito é criar migration **nova**.

> **linhas 110–112 (regra 9):** "Antes de propor um novo guard/script de CI, conferir se `.github/workflows/db-guard.yml` (por-PR) ou `db-live-guard.yml` (push em `main` **e agendado**) já cobre: este último já compara migrations com o ledger, regenera catálogo e manifesto contra o commitado, e verifica frescor de `types.ts` — reconstruir isso do zero é retrabalho."

---

## 6. Item 5(b) — o que exige migration corretiva

Critério estrito: só entram aqui os casos em que a divergência **altera o efeito no schema/RLS**, não
formatação nem comentário. **Só um arquivo passa no critério.**

### 6.1 `20260928430000_team_chat_fix_policies_to_authenticated.sql` — RLS de `team_message_receipts`

**Justificativa (1 linha):** a versão da branch e a versão registrada na `main` criam as policies
`Members can insert own receipts` (INSERT) e `Conversation members can read receipts` (SELECT) de
`public.team_message_receipts` com expressões **diferentes**, ou seja, o efeito de autorização muda.

Diff de SQL executável (tokens), comando `git diff <blob_branch> <blob_main>`:

| policy | branch (`0e283d06`) | main (reconstruída do ledger em `c8751470`) |
|---|---|---|
| `Members can insert own receipts` (INSERT) | `WITH CHECK ( profile_id = current_profile_id() AND EXISTS ( SELECT 1 FROM public.team_conversation_members mem JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id WHERE mem.conversation_id = tm.conversation_id AND mem.profile_id = team_message_receipts.profile_id ) )` | `WITH CHECK ( profile_id = current_profile_id() )` |
| `Conversation members can read receipts` (SELECT) | `USING ( is_admin_or_supervisor(auth.uid()) OR EXISTS ( SELECT 1 FROM public.team_conversation_members mem JOIN public.team_messages tm ON tm.id = team_message_receipts.message_id WHERE mem.conversation_id = tm.conversation_id AND mem.profile_id = current_profile_id() ) )` | `USING ( is_team_conversation_member(auth.uid(), conversation_id) )` |

Dois efeitos concretos (derivados apenas do texto das duas versões):

1. **INSERT mais permissivo na `main`:** a versão registrada deixa `authenticated` inserir recibo para
   qualquer `message_id`, bastando `profile_id = current_profile_id()`. A versão da branch exigia
   vínculo com a conversa dona da mensagem. Ou seja, a policy em vigor (pelo ledger) **perdeu a checagem
   de vínculo** que a branch declarava na própria linha `-- Members can insert own receipts`.
2. **SELECT mais restritivo na `main`:** a versão registrada não tem mais a alternativa
   `is_admin_or_supervisor(auth.uid())`; admin/supervisor que **não** seja membro da conversa deixa de
   ler os recibos.

Coerência das funções envolvidas (verificado no próprio repo): `is_team_conversation_member(_user_id, _conversation_id)`
resolve o vínculo via `JOIN profiles p ON p.id = tcm.profile_id WHERE p.user_id = _user_id` — recebe o
id de `auth.users`, então `auth.uid()` é o argumento correto; `is_admin_or_supervisor(_user_id)` consulta
`user_roles WHERE user_id = _user_id AND role IN ('admin','supervisor')` — também recebe `auth.uid()`.
Ambas as formas são sintaticamente coerentes; o que diverge é **o conjunto de linhas autorizadas**.

**Corroboração de que o efeito divergente é real (e não um artefato da reconstrução):**
`supabase/migrations/20261003272707_reconcile_local_replay_with_canonical.sql` (na `main`) declara como
**canônico** exatamente o texto da branch — `Members can insert own receipts` com
"`and exists ( … mem.conversation_id = tm.conversation_id and mem.profile_id = team_message_receipts.profile_id )`"
e `Conversation members can read receipts` com "`public.is_admin_or_supervisor(auth.uid()) or exists ( … )`".
Ou seja: o arquivo registrado para a version `20260928430000` e o canônico declarado depois
**discordam entre si** — o que é, por definição, drift de conteúdo entre ledger e intenção.

**Observação de alcance (não verificável sem banco):** esse arquivo em `20261003272707…` só aplica cada
policy dentro de um `if not exists ( select 1 from pg_policies … )`; como a policy já existe com
`roles = '{authenticated}'` depois de `20260928430000`, o bloco tende a ser pulado. **Não tenho acesso ao
banco**: não afirmo qual é a expressão viva em produção — apenas que os dois históricos Git discordam e
que o caminho para corrigir, dado o `db-guard`, é uma migration **nova** que recrie as duas policies com
a expressão canônica.

### 6.2 Os outros 39 arquivos: **não** exigem corretiva

Nos 39 restantes, a comparação de tokens SQL (após remover todos os comentários, inclusive dentro dos
corpos `$$…$$`, e normalizar espaços) resulta **idêntica**. Toda a divergência observada é:

- o bloco de 5 linhas de proveniência que a `main` acrescenta;
- a remoção dos comentários autorais da branch (`-- E02: …`, `-- E39: …`, `-- Rollback: …` etc.);
- reformatação: statement colapsado em uma linha e linha em branco inserida entre statements.

Formatação e comentário não alteram o efeito do DDL. Nenhum deles entra nesta seção.

---

## 7. Item 5(d) — proposta de guarda *(PROPOSTA em texto — NÃO implementada)*

> Esta seção é **proposta**. Nenhum workflow foi criado ou alterado: mudança de CI exige aprovação do dono
> (o próprio `CLAUDE.md`, regra 9, manda antes conferir se `db-guard.yml`/`db-live-guard.yml` já cobrem).
> Nada em `.github/` foi tocado por este PR.

### 7.1 Objetivo

Avisar (não bloquear) quando **uma branch `claude/*`**:

- **(A)** fica **mais de 14 dias** sem merge — heurística de abandono —, ou
- **(B)** é **reutilizada numa segunda PR** — a mesma ref vira head de duas PRs, o que é sinal de
  trabalho paralelo sobre um branch já "parado".

O caso que motivou o desenho: `claude/confident-babbage-ivgmmn`, tip `0e283d06` (29/09/2026), PR **#1151**
fechada **sem merge**, enquanto o conteúdo do mesmo escopo de 40 migrations entrou na `main` por outra
rota (`c8751470`, PR #1199). Um aviso de "branch claude/* parada há N dias" teria apontado a duplicidade
no mesmo dia.

### 7.2 Desenho proposto (texto)

1. **Novo workflow, agendado e leve:** `on: schedule` (ex.: `cron: '0 12 * * *'`) + `workflow_dispatch`.
   **Sem** gatilho `pull_request`, para não concorrer com o check obrigatório `Contrato DB offline` nem
   entrar na fila de merge (`merge_group`). Não usa `DESTINO_URL`, não roda código de PR, não precisa de
   segredo — só a API de leitura de PRs/branches.
2. **Passo 1 — dias sem merge (regra A):** listar PRs abertas cujo head casa `claude/*`; para cada uma,
   calcular `hoje − updatedAt` (ou `− createdAt`, parametrizável) e emitir **aviso** quando `> 14` dias.
   Saída: `::warning` com `branch`, `PR#`, `dias`, `autor`.
3. **Passo 2 — branch reutilizada (regra B):** para cada ref `claude/*`, listar **todas** as PRs (abertas
   e fechadas, incluindo as fechadas sem merge, que é o ponto cego do #1151) que a usaram como `head`;
   emitir **aviso** quando o mesmo `head.ref` aparece em `≥ 2` PRs. Reportar os números e o estado de cada
   uma (`merged`/`closed`/`open`) para deixar visível "branch X já foi head de #1151 (fechada sem merge)".
4. **Passo 3 — resumo em `$GITHUB_STEP_SUMMARY`:** tabela de alertas (branch, idade, PRs, estado,
   `ahead/behind` vs `main` via `git rev-list --count`), para o dono decidir.
5. **Severidade:** começar como **aviso informativo em job não-obrigatório**, justamente porque
   `CLAUDE.md` (seção 5, linhas 247–248) fixa hoje **6** required checks e `strict=true`; introduzir um
   7º check obrigatório muda a política de branch protection e é decisão do dono, não de agente. Se um
   dia virar bloqueante, deve ser como check por-PR, e aí exige `settings-guard` + `CLAUDE.md` atualizados
   **no mesmo PR**.
6. **Sobreposição a conferir antes de implementar (regra 9):** `db-live-guard.yml` já compara migrations
   com o ledger em push na `main` **e agendado**; `settings-guard.yml` já audita branch protection. O
   valor deste guard é **específico de higiene de branch `claude/*`** (idade e reuso de ref), não
   duplicando paridade de banco. Se o dono preferir, a alternativa de custo menor é **não criar workflow**:
   registrar a checagem como item de revisão manual no ritual de auditoria (é o que este documento faz
   para o caso concreto).
7. **Não-objetivos:** não fecha PR, não deleta branch, não comenta em PR de terceiros, não faz push —
   apenas notifica. Qualquer ação automática sobre branch alheia contraria as regras duras vigentes.

---

## 8. Anexo — comandos de reprodução

```bash
# setup (worktree próprio; nunca na working tree de ~/projetos/Zapp_Web_V2)
cd ~/projetos/Zapp_Web_V2 && git fetch origin main && rm -rf /tmp/wt-drift
git worktree add --detach /tmp/wt-drift origin/main && cd /tmp/wt-drift

# referências
git rev-parse origin/main
git rev-parse origin/claude/confident-babbage-ivgmmn
git merge-base 0063e2aa76954498ab9344b35f874bca6b18d1d7 origin/claude/confident-babbage-ivgmmn
git rev-list --count 0063e2aa76954498ab9344b35f874bca6b18d1d7..origin/claude/confident-babbage-ivgmmn   # 37
git rev-list --count origin/claude/confident-babbage-ivgmmn..origin/main                            # 804

# item 1: existência + identidade + linhas divergentes
git diff --name-only 0063e2aa76954498ab9344b35f874bca6b18d1d7 origin/claude/confident-babbage-ivgmmn -- supabase/migrations/
git cat-file -e origin/main:supabase/migrations/<arquivo>            # existe?
git diff --numstat origin/claude/confident-babbage-ivgmmn:<p> origin/main:<p>   # identidade/linhas

# item 2 e 3: conjuntos de 202609*team_chat* nos dois lados
git ls-tree -r --name-only origin/main -- supabase/migrations/ | grep team_chat | grep /202609 | sort > /tmp/main_tc.txt
git ls-tree -r --name-only origin/claude/confident-babbage-ivgmmn -- supabase/migrations/ | grep team_chat | grep /202609 | sort > /tmp/br_tc.txt
comm -23 /tmp/main_tc.txt /tmp/br_tc.txt ; comm -13 /tmp/main_tc.txt /tmp/br_tc.txt   # ambos vazios

# proveniência na main
git log --format='%H|%ci|%an|%s' --diff-filter=A origin/main -- supabase/migrations/20260928430000_team_chat_fix_policies_to_authenticated.sql
git log --format='%H|%ci|%an|%s' -S 'Recuperada do ledger' origin/main

# item 4
git show origin/main:CLAUDE.md | sed -n '82,112p'
git show origin/main:.github/workflows/db-guard.yml

# existência na main dos scripts citados / cobertura de evidência
git cat-file -e origin/main:scripts/db-audit/check-migration-drift.mjs
git show origin/main:scripts/db-audit/migration-evidence.json | grep -c 20260928430000   # 0
```

Comparação de SQL executável (tokens, ignorando comentário — inclusive dentro de `$$…$$` — e espaços):
script Python que remove `--`/`/* */` recursivamente nos corpos dollar-quoted, tokeniza e compara.
Resultado: **39 idênticos, 1 divergente** (`20260928430000…`).

---

## 9. Escopo e limites deste diagnóstico

- **Verificado:** conteúdo dos dois históricos Git, para os 40 arquivos do escopo e para os conjuntos de
  `202609*team_chat*`; a regra de DDL/imutabilidade no `CLAUDE.md` da `main`; o que o `db-guard` bloqueia;
  o commit `c8751470` que trouxe os 40 à `main`; a cobertura de `migration-evidence.json`.
- **Não verificado (fora de alcance):** o estado **vivo** do banco de produção. Não houve acesso ao banco,
  nenhuma consulta, nenhuma DDL. As afirmações sobre "o que está em produção" derivam do texto dos
  arquivos que se declaram cópia do ledger e do ledger descrito no `CLAUDE.md`, **não** de inspeção do
  banco. Os defeitos de schema já apurados antes (`profiles.id != profiles.user_id`; `profiles.is_admin`
  inexistente; `department_audit_logs.actor_id` inexistente) foram tratados como **dado de entrada**,
  não reverificados aqui.
- **Não incluído:** os 22 arquivos `202609*team_chat*` adicionais que não fazem parte do diff de merge-base
  → branch (o escopo pedido são os 40), e qualquer arquivo fora de `supabase/migrations/`.