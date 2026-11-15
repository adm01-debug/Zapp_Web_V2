# claude/infra-c121-ddl-261101-1350 (PR #2471) — IP2: investigação de pausas de instância

tip `14d1417a7` · merge_base `1252bb5a4` · 2 arquivos novos, 662 linhas (+0 remoções)

## Propósito
Migration aditiva IP2 (filha do IP1 `20261011183812_instance_pauses.sql`): 3 colunas em
`public.instance_pauses` (`investigated_at`, `investigated_by` FK→profiles ON DELETE SET NULL,
`investigation_notes`), 3 CHECKs (investigação completa, notas ≤1000, notas sem HTML) e a RPC
`public.mark_pause_investigated(uuid,text)` (SECURITY DEFINER, admin/supervisor, 1 linha em
`audit_logs` por chamada), mais uma suíte de teste de banco de 509 linhas (T1–T7).

Commits: `a3d899dc1` (migration), `e66c92b4f` (fix: não reatribui investigador original após
exclusão do perfil), `81479b9d4` (fix: service_role no REVOKE; ajuste T2/T6), 5 merges de main.

## Arquivo × achado × evidência

| Arquivo da branch | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101140000_instance_pause_investigation.sql` (159 l.) | **Incorporada quase byte a byte** na main com outro timestamp: `supabase/migrations/20261111181000_instance_pause_investigation.sql`, trazida por `bd62fc9d9 feat(monitoring): painel investigação de pausas de instância (IP2) (#2822)` (2026-11-11). `diff` branch×main = **apenas 2 linhas** (125 e 149). | `git log -1 origin/main -- supabase/migrations/20261111181000_instance_pause_investigation.sql`; `diff <(git show …:20261101140000…) <(git show origin/main:20261111181000…)` |
| idem, linha 125 | **LACUNA** — `investigated_by = CASE WHEN investigated_at IS NULL THEN v_profile ELSE investigated_by END` (fix `e66c92b4f`). Main usa `COALESCE(investigated_by, v_profile)`. Main **nunca** teve o CASE (não foi rejeição deliberada). | `git log -S'CASE WHEN investigated_at IS NULL' origin/main -- supabase/migrations/` → vazio |
| idem, linha 149 | **LACUNA cosmética** — branch revoga também `service_role`; main não. Sem efeito prático: em produção a ACL da função é `{postgres=X/postgres,authenticated=X/postgres}`, `service_role` não tem EXECUTE de qualquer forma. | `select proacl from pg_proc … proname='mark_pause_investigated'` (produção, leitura) |
| `supabase/tests/instance_pause_investigation.sql` (515 l.) | **LACUNA integral** — ausente na main; `supabase/tests/instance_pauses.sql` (IP1) tem **0** menções a `mark_pause_investigated`; nenhum outro teste de banco cobre a RPC. | `git grep -c mark_pause_investigated origin/main -- supabase/tests/instance_pauses.sql` → ZERO; `git grep -l mark_pause_investigated origin/main -- supabase/` → só migrations/schema-*.json |

## Estado em produção (`tnnnlkbymytvtqngbbqh`, somente leitura)
- `supabase_migrations.schema_migrations`: existe **`20261111181000`** (a da main); `20261101140000` (a da branch) não existe — correto, é a mesma DDL.
- Colunas `investigated_at, investigated_by, investigation_notes`: presentes.
- Constraints: `instance_pauses_investigated_by_fkey`, `instance_pauses_investigacao_completa`, `instance_pauses_notas_tamanho`, `instance_pauses_notas_sem_html`: presentes.
- Corpo vivo de `mark_pause_investigated`: `position('CASE WHEN investigated_at IS NULL' …)=0`, `position('COALESCE(investigated_by' …)=1389` → **produção roda a variante da main, sem o fix**.
- Front já consome a RPC: `src/services/instance-pauses.service.ts:141` e `src/components/monitoring/MonitoringInstancePauses.tsx` (ponta a ponta na main).

## Veredito: PERDIDA_PARCIAL
A DDL inteira entrou (prova acima). Faltam: (1) o fix de autoria na RPC e (2) a suíte de teste de banco.
`apagar_branch_seguro = false`.

## Lacunas a recuperar

### 1. Fix de autoria na RPC (valor médio — integridade do "quem investigou")
Cenário: o perfil do investigador é excluído → a FK `ON DELETE SET NULL` zera `investigated_by` e
`investigated_at` sobrevive. Numa chamada seguinte, o `COALESCE` da main grava o **novo** chamador como
autor da investigação **original** (a data continua congelada na antiga) — atribui a investigação a quem
não a fez. O CHECK `instance_pauses_investigacao_completa` não impede (ator+data preenchidos).

Patch (um só ponto, `supabase/migrations/20261111181000_instance_pause_investigation.sql:125` — na prática,
nova migration `CREATE OR REPLACE FUNCTION` com o corpo da main e esta linha trocada; a migration antiga
já foi aplicada, não se reescreve):

```sql
  UPDATE public.instance_pauses
     SET investigated_at     = COALESCE(investigated_at, now()),
-        investigated_by     = COALESCE(investigated_by, v_profile),
+        investigated_by     = CASE WHEN investigated_at IS NULL THEN v_profile ELSE investigated_by END,
         investigation_notes = COALESCE(v_notes, investigation_notes)
   WHERE id = p_pause_id
  RETURNING * INTO v_row;
```

### 2. Suíte de teste de banco (valor médio — protege permissão, CHECKs e auditoria)
Portar `supabase/tests/instance_pause_investigation.sql` da branch
(`git show origin/claude/infra-c121-ddl-261101-1350:supabase/tests/instance_pause_investigation.sql`),
509 linhas, padrão das demais suítes de `supabase/tests/` (papel real via `request.jwt.claims` +
`set_config('role')`, tudo desfeito em `ROLLBACK` no T7). Cobertura: T1 investiga+audita sem copiar notas;
T2 negado para agente/anon/service_role sem efeito nem auditoria; T3 validações da função e dos 3 CHECKs
(22023 na função, 23514 no banco); T3b FK×CHECK; T4 `P0002`; T5 reinvestigação (3 auditorias, 1 por
chamada, ator/data congelados); T5b supervisor; T6 RLS/ACL; T7 rollback.

**Atenção ao portar:** o T3b (linhas 329–337) **só passa com a lacuna 1 aplicada** — ele afirma
exatamente o comportamento do fix:

```sql
  -- reinvestigar depois da exclusao NAO transfere a autoria ao novo chamador
  PERFORM pg_temp.t_auth(v_admin_user);
  PERFORM public.mark_pause_investigated(v_pause_5, NULL);
  PERFORM set_config('role', 'none', true);
  SELECT count(*) INTO v_n FROM public.instance_pauses
   WHERE id = v_pause_5 AND investigated_at IS NOT NULL AND investigated_by IS NULL;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'T3b FALHOU: reinvestigar apos excluir o perfil atribuiu a investigacao original a outro ator';
  END IF;
```

O T6 (linhas 431–432, `service_role` sem EXECUTE) **passa como está** contra a main — a ACL de produção
já não dá EXECUTE a `service_role`; a linha 149 da branch (REVOKE explícito) é dispensável.

Rodar: `zapp-db-local psql . <versão> -v ON_ERROR_STOP=1 < supabase/tests/instance_pause_investigation.sql`
(Postgres descartável, nunca produção — cabeçalho do arquivo, linha 8).

## Verificação adversarial

Veredito mantido: **PERDIDA_PARCIAL**. Tentei refutar as duas lacunas e não consegui — ambas conferem.

**Lacuna 1 (linha 125 da RPC) — confirmada, e é a única diferença real de DDL.**
- `diff` branch×main das duas migrations (`20261101140000` na branch, `20261111181000` na main) dá
  exatamente 2 linhas: 125 (`CASE WHEN investigated_at IS NULL THEN v_profile ELSE investigated_by END`
  na branch vs `COALESCE(investigated_by, v_profile)` na main) e 149 (`service_role` no REVOKE).
- O bug é real e o CHECK não barra: `instance_pauses_investigacao_completa` em produção é
  `CHECK ((investigated_by IS NULL) OR (investigated_at IS NOT NULL))` — proíbe ator sem data, não
  data+ator novo. Com a FK `investigated_by → profiles ON DELETE SET NULL` zerando só o ator, a
  chamada seguinte grava o novo chamador com a data antiga congelada (`investigated_at = COALESCE(investigated_at, now())`),
  e passa o CHECK. Autoria falsa.
- Não foi rejeição deliberada: `git log -S'CASE WHEN investigated_at IS NULL' origin/main -- supabase/`
  → vazio; nenhuma outra migration da main faz `CREATE OR REPLACE FUNCTION public.mark_pause_investigated`
  (único hit: `20261111181000:66`). As 33 migrations posteriores a `20261111181000` não tocam a função
  (só `20261112160000`, e só em privilégio).
- Produção (leitura, `tnnnlkbymytvtqngbbqh`) confirma: migration `20261111181000` em
  `schema_migrations`, 3 colunas e 3 CHECKs presentes, e `pg_get_functiondef` →
  `position('CASE WHEN investigated_at IS NULL')=0`, `position('COALESCE(investigated_by')=1389`.
- Atenuante de urgência (não muda o veredito): `SELECT count(*) FROM public.instance_pauses` = **0 linhas**
  hoje, logo nenhuma autoria está falsificada ainda — é bug latente numa função de produção, não dano em curso.
  Severidade "médio" se sustenta.
- Correção de rótulo no cartão: o campo `arquivo` da lacuna 1 cita `20261111181000_...`, que é o arquivo
  **da main** (o da branch é `20261101140000_...`). A descrição está certa — o fix tem de vir em
  migration nova com `CREATE OR REPLACE FUNCTION`, não reescrevendo a migration já aplicada.

**Linha 149 (service_role no REVOKE) — NÃO é lacuna, está incorporada.** `20261112160000_talkx_blacklist_reconcilia_e_higiene.sql:181`
faz `REVOKE EXECUTE ... FROM service_role` com pós-condição nas linhas 226–227, e o próprio arquivo diz
(linha 179) que "substitui a PR #2973". ACL de produção: `{postgres=X/postgres,authenticated=X/postgres}`.
A triagem já tratava a linha como cosmética — sem divergência.

**Lacuna 2 (suíte de 509 linhas) — confirmada ausente, sem substituto, e ainda encaixa na main.**
- Ausente: `supabase/tests/instance_pause_investigation.sql` não existe em `origin/main` (`ls-tree`);
  `git grep -l investigated_by origin/main -- supabase/tests/` só devolve
  `db-audit/talkx-blacklist-reconcilia.test.sh` (que testa o privilégio, não a RPC);
  `supabase/tests/instance_pauses.sql` da main não cita `investigat`/`mark_pause` nenhuma vez.
- Sem substituto em outro lugar: a única cobertura da RPC na main é de front
  (`src/components/monitoring/__tests__/MonitoringInstancePauses.behavior.test.tsx:121,138`), que só
  checa o payload do `rpc(...)` com mock — não exercita autorização, CHECKs, FK, auditoria nem congelamento de ator.
- Ainda encaixa: a suíte usa só `public.profiles`, `public.user_roles`, `public.instance_pauses`,
  `public.audit_logs` e `public.mark_pause_investigated`, todos presentes. As fixtures inserem
  `(instance, paused_until, reason, paused_by, auto[, resumed_at, resumed_by])` — bate com o shape atual
  de produção (12 colunas, `auto` default false, `paused_by` nullable) e com os 10 constraints da tabela;
  **nenhum trigger** não-interno em `instance_pauses`. `reason` ('manutencao', 'limite de envio') passa o
  `instance_pauses_reason_nao_vazio`.
- T3b (320–337) de fato só passa com a lacuna 1 aplicada: a linha 336 falha com
  "reinvestigar apos excluir o perfil atribuiu a investigacao original a outro ator". T6 (427–436) passa
  contra a main como está.

**Branch não pode ser apagada** (`apagar_branch_seguro=false`): é o único lugar com as duas peças.
PR #2471 (mesmo tip) está CLOSED sem merge desde 2026-11-01T23:49:05Z, sem comentário de rejeição.
Nenhuma PR aberta hoje (#3139, #3140) toca `supabase/migrations/` nem `supabase/tests/` — caminho livre
para a PR de resgate.
