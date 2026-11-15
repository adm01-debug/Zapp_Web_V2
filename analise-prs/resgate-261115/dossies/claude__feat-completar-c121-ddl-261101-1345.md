# claude__feat-completar-c121-ddl-261101-1345 — PERDIDA_PARCIAL (só o teste SQL)

- Ref: `origin/claude/feat-completar-c121-ddl-261101-1345` (tip `edad6a6f5`), merge_base `50fc5f0e6`, PR #2470.
- Propósito (C121 / IP2-A): investigação de incidentes de pausa de instância de WhatsApp — 3 colunas em
  `public.instance_pauses` (`investigated_at`, `investigated_by`, `investigation_notes`), 3 CHECKs
  (investigação completa, notas ≤1000, notas sem HTML) e a RPC `public.mark_pause_investigated(uuid,text)`
  restrita a admin/supervisor com 1 linha em `audit_logs` por chamada; + suíte SQL de prova em banco local.
- Commits: `9fa5091cd feat: migration de investigação de pausas de instância (C121, IP2-A)`,
  `04e54ce79 chore: renumera migration IP2-A para depois do último ledger (20261101140000)`, merge da main.

## Arquivo × achado × evidência

| Arquivo da branch | Achado | Evidência |
|---|---|---|
| `supabase/migrations/20261101140000_instance_pause_investigation.sql` (153 linhas) | **INCORPORADA** — entrou na main só renumerada | `diff <(git show origin/claude/feat-completar-c121-ddl-261101-1345:supabase/migrations/20261101140000_instance_pause_investigation.sql) <(git show origin/main:supabase/migrations/20261111181000_instance_pause_investigation.sql)` → **sem diferença** (byte-idêntico). Chegou na main por `bd62fc9d9 feat(monitoring): painel investigação de pausas de instância (IP2) (#2822)` |
| idem — estado em produção | **aplicada** | MCP `SUPABASE - ZAPP WEB V2 - MCP` (`tnnnlkbymytvtqngbbqh`), leitura: `schema_migrations` tem `20261111181000` (e não `20261101140000`); `pg_proc` tem `mark_pause_investigated`; `instance_pauses` tem `investigated_at,investigated_by,investigation_notes`; constraints `instance_pauses_investigacao_completa`, `instance_pauses_notas_tamanho`, `instance_pauses_notas_sem_html`, `instance_pauses_investigated_by_fkey` |
| `supabase/tests/instance_pause_investigation.sql` (493 linhas) | **PERDIDO** — não existe na main nem equivalente | `git ls-tree origin/main supabase/tests/ \| grep -i pause` → só `instance_pauses.sql` (IP1); `git show origin/main:supabase/tests/instance_pauses.sql \| grep -i investig` → **vazio**; `git grep -l mark_pause_investigated origin/main` não lista nenhum arquivo em `supabase/tests/` |

Front já existe na main (`src/components/monitoring/MonitoringInstancePauses.tsx`,
`src/services/instance-pauses.service.ts` + testes de comportamento), então o fluxo está completo ponta a ponta;
a única lacuna é a prova SQL da fronteira de autorização/CHECKs no banco.

## Lacuna a recuperar

`supabase/tests/instance_pause_investigation.sql` — arquivo **novo, sem conflito** (a migration alvo é a mesma
byte a byte que está na main, e a suíte não depende do nome/versão do arquivo da migration). Port em um comando,
sem reler a branch:

```sh
git show origin/claude/feat-completar-c121-ddl-261101-1345:supabase/tests/instance_pause_investigation.sql \
  > supabase/tests/instance_pause_investigation.sql
```

Único retoque sugerido: o cabeçalho diz `RODAR: zapp-db-local psql . v2-2610161333f0ad` (imagem/tag de
2026-10-16) — conferir a tag corrente antes de documentar.

O que a suíte prova (cabeçalho do arquivo, linhas 1-8; blocos `DO $pause_investigation$`):
- **T1** admin investiga: grava ator/data/notas e audita sem copiar as notas para `audit_logs`;
- **T2** negado sem efeito e sem auditoria para 3 papéis — `agent` → `42501`, `anon` para no ACL (sem EXECUTE),
  e a pausa permanece `investigated_at IS NULL`, `audit_logs` com 0 linhas para aquele `entity_id`;
- **T3** validação na função e nos CHECKs (notas >1000, notas com HTML) — valida ANTES do efeito;
- **T3b** FK × CHECK em savepoint: apagar o perfil do investigador (`ON DELETE SET NULL`) preserva a
  investigação (data sobrevive), e "ator sem data" segue proibido;
- **T4** pausa inexistente → `P0002`;
- **T5** idempotência + 1 auditoria por chamada (3 chamadas = 3 linhas), o 1º ator/data congela via `COALESCE`;
- **T5b** supervisor também investiga; **T6** RLS/ACL; **T7** roda o bloco `-- Rollback:` da migration no
  schema real e desfaz com SAVEPOINT.

Papel real pelo caminho do PostgREST (não é `service_role`, logo prova enforcement de verdade):
```sql
CREATE FUNCTION pg_temp.t_auth(p_sub uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated')::text, true);
  SELECT set_config('role', 'authenticated', true);
$$;
```
Fixtures sintéticas: `44444444-…-4444a1` admin, `…a2` supervisor, `…b1` agent, `…c1` investigador temporário
(excluído em T3b); instâncias `inst-invest-teste-a` / `-b`. Papéis usados (`admin`, `supervisor`, `agent`, `anon`)
continuam válidos — a remoção de `special_agent` do enum (`20261113172000`) não afeta a suíte.
Não é rodada por CI: `.github/workflows/db-guard.yml` só invoca `supabase/tests/db-audit/*.test.sh`, e registra que
`supabase/tests/*.sql` roda como `service_role` (db-guard.yml:440-445) — esta suíte, por usar papel real, é a
exceção e vale como prova manual.

## Veredito
**PERDIDA_PARCIAL** — DDL/RPC 100% incorporada e aplicada em produção; perdida apenas a suíte de teste SQL
(448 linhas úteis, valor médio: protege a fronteira de autorização de uma RPC admin/supervisor com auditoria).
`apagar_branch_seguro = false` (a branch é a única cópia do arquivo de teste).

## Verificação adversarial

Veredito mantido: **PERDIDA_PARCIAL**. Mas a receita de port da triagem está **errada** — copiar o arquivo
desta branch produz uma suíte que **falha** contra o schema atual da main/produção.

1. **Migration incorporada — confirmado.** `diff` branch `20261101140000` × main `20261111181000` → sem
   diferença (byte-idêntico). Entrou por `bd62fc9d9` (#2822), que adicionou **só** a migration (153 linhas,
   `git show --stat bd62fc9d9 -- supabase/migrations`).
2. **Teste ausente da main — confirmado.** `git ls-tree origin/main supabase/tests/` não tem
   `instance_pause_investigation.sql`; `git grep -l mark_pause_investigated origin/main` não lista nada em
   `supabase/tests/` (só src/, migrations, docs e `supabase/tests/db-audit/talkx-blacklist-reconcilia.test.sh`).
3. **Foi removida de propósito? Em parte.** A suíte **já esteve na main**: `db7dc362c` (27/10) adicionou
   migration+teste e `e9da73ad4` (27/10, ancestral da main) removeu os dois ("revert(db): desfaz squash C121 —
   IP2 migration incompleta (feature volta para COMPLETAR)"). O revert foi pela migration incompleta, não pelo
   mérito do teste; quando a migration voltou (`bd62fc9d9`, 11/11) o teste **não** voltou. Logo: lacuna por
   omissão, não rejeição. O arquivo desta branch é **idêntico** ao que foi revertido
   (`diff <(git show edad6a6f5:…) <(git show db7dc362c:…)` → idêntico).
4. **REFUTAÇÃO — a versão desta branch não roda mais.** Existe branch irmã
   `origin/claude/infra-c121-ddl-261101-1350` (PR **2471**, commits `a3d899dc1`, `e66c92b4f`, `81479b9d4`) com
   superconjunto estrito: mesma suíte + T2/T6 corrigidos + asserção nova em T3b.
   - Esta branch (`edad6a6f5:supabase/tests/instance_pause_investigation.sql:203-204`) exige que `service_role`
     pare **dentro** da função com `sem_permissao_para_investigar_pausa`.
   - A main já revogou o EXECUTE de `service_role`:
     `supabase/migrations/20261112160000_talkx_blacklist_reconcilia_e_higiene.sql:181`
     (`REVOKE EXECUTE … FROM service_role`) + pós-condição em :226-227.
   - Produção (MCP `SUPABASE - ZAPP WEB V2 - MCP`, leitura):
     `has_function_privilege('service_role',…,'EXECUTE')=false`, `authenticated=true`, `anon=false`;
     `schema_migrations` tem `20261111181000` e `20261112160000`.
   - Portanto `service_role` hoje para no ACL com a mensagem do Postgres → o T2 desta branch quebra
     ("T2 FALHOU: service_role sem ator deveria receber sem_permissao_para_investigar_pausa"). A versão da
     PR 2471 (`:194-212`, `:430-432`) é exatamente a que espera o ACL e assere
     `has_function_privilege('service_role', …) = false` — casa com a main.
   - O retoque da migration que a PR 2471 trazia (`service_role` no `REVOKE ALL`) **já está coberto** na main
     pela `20261112160000:181` — não é lacuna.
5. **Encaixe no código atual:** a suíte só usa `public.instance_pauses`, `public.profiles`,
   `public.user_roles`, `public.audit_logs` e `public.mark_pause_investigated` — todos existem na main; não cita
   `special_agent` (removido por `20261113172000`).

**Correção da lacuna:** portar de `origin/claude/infra-c121-ddl-261101-1350`, não desta branch:
`git show origin/claude/infra-c121-ddl-261101-1350:supabase/tests/instance_pause_investigation.sql > supabase/tests/instance_pause_investigation.sql`.
Conteúdo único desta branch = versão obsoleta do mesmo arquivo → `apagar_branch_seguro=false` **só até** a
suíte da PR 2471 estar na main (a branch irmã é a cópia que importa; não apague as duas).
