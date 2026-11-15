# claude__feat-incidentes-pausa-investigados-261024-1640 — PERDIDA_PARCIAL

- Ref: `origin/claude/feat-incidentes-pausa-investigados-261024-1640` · tip `204ce07fb` · merge_base `1252bb5a4`
- PR com o mesmo tip: #2457 · pré-classificação mecânica: MISTO_CONFLITO · triagem 2026-11-08: DUPLICATA_PROVAVEL (confirmada em 7 de 8 arquivos)

## Propósito
IP2 — investigação de incidentes de pausa de instância de WhatsApp (filho do IP1,
`20261011183812_instance_pauses.sql`). Duas metades:
- **banco (IP2-A)**: 3 colunas aditivas em `public.instance_pauses` (`investigated_at`,
  `investigated_by` → FK `profiles(id)` ON DELETE SET NULL, `investigation_notes`), 3 CHECKs
  (investigação completa, notas ≤ 1000, notas sem HTML) e RPC `mark_pause_investigated(uuid,text)`
  restrita a admin/supervisor, com 1 linha em `audit_logs` por chamada (COALESCE: 1º ator/data congela).
- **front (IP2-B)**: aba "Pausas" no painel de monitoramento, com ação "Marcar investigada".

Commits: `75fe88cad` (db), `ad2a90e4e`/`0d884b089` (renumeração da migration), `204ce07fb` (front).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101223000_instance_pause_investigation.sql` | **INCORPORADA** — renumerada | `diff` byte-a-byte contra `origin/main:supabase/migrations/20261111181000_instance_pause_investigation.sql` → idênticos. Entrou por `bd62fc9d9` "feat(monitoring): painel investigação de pausas de instância (IP2) (#2822)" |
| `src/components/monitoring/EvolutionMonitoringDashboard.tsx` | **INCORPORADA** | main: import `PauseCircle` em `EvolutionMonitoringDashboard.tsx:8`, `TabsTrigger`/"Pausas" em `:298`, `<MonitoringInstancePauses />` em `:416`. Hunks da branch já presentes |
| `src/components/monitoring/MonitoringInstancePauses.tsx` | **INCORPORADA** — só difere tipografia | único `diff` em `:220`: branch usa aspas curvas `“Tentar de novo”`, main usa retas `"Tentar de novo"`. Nenhum comportamento |
| `src/components/monitoring/hooks/useInstancePauses.ts` | INCORPORADA | IDENTICAL_TO_MAIN |
| `src/services/instance-pauses.service.ts` | INCORPORADA | IDENTICAL_TO_MAIN |
| `.../__tests__/EvolutionMonitoringDashboard.pauses.test.tsx` | INCORPORADA | IDENTICAL_TO_MAIN |
| `.../__tests__/MonitoringInstancePauses.behavior.test.tsx` | INCORPORADA | IDENTICAL_TO_MAIN |
| `supabase/tests/instance_pause_investigation.sql` (493 linhas) | **PERDIDA** | `git ls-tree origin/main supabase/tests/` não tem o arquivo; `git grep -l "inst-invest-teste-a" origin/main` só acerta docs/relatórios. `git show --stat bd62fc9d9` prova que a #2822 levou os outros 8 arquivos e **deixou a suíte de fora** |

## Banco de produção (`tnnnlkbymytvtqngbbqh`, somente leitura)
Tudo do IP2-A está vivo:
- `schema_migrations`: `20261111181000` aplicada (a `20261101223000` da branch nunca existiu — era a versão descartada).
- `pg_proc`: `mark_pause_investigated` presente.
- `information_schema.columns`: `investigated_at`, `investigated_by`, `investigation_notes` em `public.instance_pauses`.
- `pg_constraint`: `instance_pauses_investigacao_completa`, `instance_pauses_notas_sem_html`, `instance_pauses_notas_tamanho`.
- Grants: `authenticated` EXECUTE = true, `anon` = false, **`service_role` = false**.

## Lacuna a recuperar

### `supabase/tests/instance_pause_investigation.sql` — suíte SQL do IP2 (valor médio)
Única peça do cartão que não está na main. Prova no banco local descartável, com papel real
(`request.jwt.claims` + `set_config('role')`, caminho do PostgREST), tudo desfeito no ROLLBACK final:
- **T1** investiga + audita sem copiar as notas para a auditoria;
- **T2** negado para 3 papéis (anon, agente não-staff, service_role) sem efeito e sem auditoria;
- **T3** validação da função + os 3 CHECKs; **T3b** FK × CHECK (apagar o perfil do investigador
  preserva a investigação; ator sem data segue negado) usando sub-bloco `BEGIN/EXCEPTION` como savepoint;
- **T4** `P0002`; **T5** 3 auditorias (1 por chamada), 1º ator congela; **T5b** supervisor; **T6** RLS/ACL; **T7** rollback.

Como portar (não precisa reler a branch):
```
git show origin/claude/feat-incidentes-pausa-investigados-261024-1640:supabase/tests/instance_pause_investigation.sql \
  > supabase/tests/instance_pause_investigation.sql
```

**Um ajuste obrigatório antes de rodar** — a suíte nasceu antes de `2ae0de787`
"fix(db): reconcilia talkx_blacklist com a 20261011003007 e higieniza acls (#3027)", que **tirou o
EXECUTE de `service_role`** em `mark_pause_investigated` (confirmado em produção acima). O bloco T2
de service_role espera parar *dentro* do corpo da função; hoje para no ACL, com outra mensagem:

`supabase/tests/instance_pause_investigation.sql:191-206` (numeração do arquivo da branch):
```sql
  -- service_role: sem usuario humano, nao substitui o ator
  PERFORM set_config('role', 'service_role', true);
  ...
  IF v_errcode IS DISTINCT FROM '42501' THEN            -- segue valendo: ACL também é 42501
    RAISE EXCEPTION 'T2 FALHOU: service_role sem ator deveria dar 42501 (deu %)', coalesce(v_errcode, 'sem erro');
  END IF;
  IF v_errmsg IS DISTINCT FROM 'sem_permissao_para_investigar_pausa' THEN   -- <<< QUEBRA HOJE
    RAISE EXCEPTION 'T2 FALHOU: service_role sem ator deveria receber sem_permissao_para_investigar_pausa (deu %)',
      coalesce(v_errmsg, 'sem erro');
  END IF;
```
Hoje `v_errmsg` vem `permission denied for function mark_pause_investigated`. Corrigir como o bloco de
`anon` logo acima (linhas 185-189 da branch), que já aceita a mensagem de ACL:
```sql
  IF v_errmsg = 'sem_permissao_para_investigar_pausa'
     OR v_errmsg !~ '(function|fun[uç][ãa]o) mark_pause_investigated' THEN
    RAISE EXCEPTION 'T2 FALHOU: service_role deveria parar no ACL do EXECUTE (mensagem=%)',
      coalesce(v_errmsg, 'sem erro');
  END IF;
```
O resto da suíte casa com a produção atual: **T6** (linhas 415-419) exige `anon` sem EXECUTE e
`authenticated` com EXECUTE — exatamente o que o banco tem.

Rodar: `zapp-db-local psql . <tarefa> -v ON_ERROR_STOP=1 < supabase/tests/instance_pause_investigation.sql`.
Nunca em produção.

## Veredito
**PERDIDA_PARCIAL** · confiança **alta**. 7 de 8 arquivos (migration + todo o front + 2 testes de
componente) estão na main pela #2822 (`bd62fc9d9`); só a suíte SQL do banco ficou fora.

`apagar_branch_seguro = false` — a branch é a única cópia das 493 linhas da suíte. Apagar só depois
de a suíte entrar na main (ou de o dono dispensá-la).

## Verificação adversarial

**Concordo com PERDIDA_PARCIAL**, com duas ressalvas que reduzem o valor da lacuna e uma que a reforça.

Confirmado (contra `origin/main` de hoje):
- `git ls-tree --name-only origin/main supabase/tests/` NÃO lista `instance_pause_investigation.sql`;
  a branch lista. `git grep -l 'inst-invest-teste-a' origin/main` só acerta docs/relatórios. A suíte
  (493 linhas) realmente não está na main.
- Migration byte-idêntica: `git diff <branch>:supabase/migrations/20261101223000_instance_pause_investigation.sql
  origin/main:supabase/migrations/20261111181000_instance_pause_investigation.sql` → vazio (rc=0).
- `git show --stat bd62fc9d9` (#2822) levou 8 arquivos (migration + front + hooks + service + 2 testes de
  componente) e não levou a suíte SQL.
- Front: único diff real `MonitoringInstancePauses.tsx:220` (aspas curvas vs retas) e a main está à frente
  com `DeviceChatsPanel` em `EvolutionMonitoringDashboard.tsx` (import + render) — nada da branch falta.
- Produção `tnnnlkbymytvtqngbbqh` (SELECT somente): 3 colunas de investigação presentes,
  migrations `20261111181000` e `20261112160000` aplicadas, `has_function_privilege` →
  authenticated=true, anon=false, service_role=false.

**Ressalva 1 — a suíte já esteve na main e saiu por revert deliberado, mas o motivo caducou.**
`git log --oneline origin/main -- supabase/tests/instance_pause_investigation.sql` →
`db7dc362c` (adicionou migration+suíte) e `e9da73ad4` `revert(db): desfaz squash C121 — IP2 migration
incompleta`. O revert tirou os dois arquivos porque a feature estava pela metade (sem front, sem
chamador, migration não aplicada). Hoje essas 5 pendências listadas no corpo do revert estão todas
resolvidas na main/produção (#2822 + apply), então o revert não é uma rejeição da suíte: é a razão
pela qual ela ficou órfã. Portar não contraria decisão vigente.

**Ressalva 2 — a main já cobre T6 e o caminho feliz; a lacuna real é menor que 493 linhas.**
`origin/main:supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh` (da #3027) cobre, em banco:
- `:269-277` B5 — `service_role` sem EXECUTE, chamada real recusada com
  `permission denied for function mark_pause_investigated`; `authenticated` com EXECUTE; admin
  autenticado investiga e `investigated_by` volta o perfil correto.
- `:299+` B8 — índice da FK `instance_pauses:investigated_by`.
Ou seja T6 (ACL) e um smoke do caminho feliz **já têm teste de banco automatizado na main**.
Continua sem cobertura nenhuma: negativa por papel (`sem_permissao_para_investigar_pausa` para
agente), auditoria 1 linha por chamada sem copiar notas, congelamento do 1º ator/data (COALESCE),
os 3 CHECKs (notas > 1000, HTML, ator sem data), P0002, FK × CHECK na exclusão do perfil, supervisor
e rollback. Isso é o que justifica o veredito — não "a autorização e a auditoria não têm teste
nenhum", que é exagero do dossiê.

**Ressalva 3 — o ajuste apontado é necessário e suficiente.** Linhas 191-206 da suíte põem
`service_role` em `set_config('role')` e exigem `v_errmsg = 'sem_permissao_para_investigar_pausa'`
(linha 203-206). Desde a `20261112160000` (`:181 REVOKE EXECUTE ... FROM service_role`, confirmado em
produção) a chamada morre no ACL, não no corpo: `SQLSTATE` 42501 continua batendo (linha 200), só a
assertiva de mensagem quebra. Trocar esse bloco pelo padrão de `anon` (linhas 182-189, que aceitam a
mensagem do Postgres com regex de locale) resolve. T6 (415-419) casa com a produção sem toque.

Veredito mantido: **PERDIDA_PARCIAL**, valor médio, `apagar_branch_seguro = false` (a branch é a única
cópia das 493 linhas).
