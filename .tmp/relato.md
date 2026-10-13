Especialista: workersql (area-sql-banco)

## Retomada (rebase) — como resolvi
Trouxe a entrega parada para a ponta de hoje: `git cherry-pick` dos 2 commits da
branch `v2/n097-talkx-banco-pre-checagem-retomada-26101014437e39` (d442d3e21 wiring;
pai 54127a16bb banco) sobre a base `dia/2026-10-13`. Dois conflitos, ambos em
arquivo de componente, resolvidos PRESERVANDO o que já entrou na ponta:
- `src/components/talkx/TalkXCampaignRunning.tsx` (linha do import de `./talkxShared`):
  mantive o `InsightCard` que a ponta adicionou E incluí os 2 imports novos do N-097.
- `src/components/talkx/TalkXLiveMonitor.tsx` (bloco X148 "Saúde da Campanha"): mantive
  o bloco X148 inteiro E acrescentei a linha do `useTalkXServerResumePrecheck`.
Depois reescrevi os 2 commits por assunto (banco / wiring) a partir da base, sem
alterar conteúdo — só para não deixar a migration com data antiga.

## O que mudou e por quê
- `supabase/migrations/20261013235903_talkx_campaign_resume_precheck.sql` (NOVO, versão
  de hoje): `talkx_campaign_resume_precheck(uuid)` e `talkx_campaign_segment_progress(uuid)`,
  SECURITY DEFINER, `SET search_path = public, pg_temp`, REVOKE de PUBLIC/anon e GRANT a
  authenticated/service_role, escopo admin/supervisor ou service_role. A versão antiga
  (20261010071435) foi renomeada via `hermes-db-migrar --nova` por exigência do cartão
  (data de hoje >= `generated_at` de schema-catalog.json = 2026-10-04 e > maior do ledger).
- `scripts/db-audit/talkx-resume-precheck.test.sh` (NOVO): prova em Postgres 17 descartável
  com papel real (`SET LOCAL ROLE authenticated` + claims). Aponta o caminho do arquivo novo.
- `.github/workflows/db-guard.yml`: passo do teste (check-test-inventory).
- Wiring do front (mesmo cartão, trazido junto): `TalkXServerResumePrecheck.tsx`,
  `useTalkXServerResumePrecheck.ts`, `TalkXCampaignRunning.tsx`, `TalkXLiveMonitor.tsx`,
  `useTalkXResumeChecklist.ts` e o teste do componente.

## Prova
- vermelho antes (base sem a correção, `TALKX_RESUME_PRECHECK_MIGRATION=.tmp/sem-correcao.sql`):
  `bash scripts/db-audit/talkx-resume-precheck.test.sh` →
  `ERROR: function public.talkx_campaign_resume_precheck(unknown) does not exist` (exit 1)
- verde depois: `bash scripts/db-audit/talkx-resume-precheck.test.sh` →
  `[PASS] tudo ok -> can_resume=true` (…) `talkx-resume-precheck: OK` (exit 0)
- componente: `npx vitest run src/components/talkx/__tests__/TalkXServerResumePrecheck.test.tsx`
  → `Test Files 1 passed (1); Tests 5 passed (5)`
- migration aplicada no banco LOCAL do cartão: `hermes-db-migrar supabase/migrations/20261013235903_talkx_campaign_resume_precheck.sql`
  → `APLICADA no banco LOCAL 'v2-261013115268aa'` (CREATE FUNCTION x2, REVOKE, GRANT, COMMENT, COMMIT)
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (banco_local é pulado sem o nome do
  conjunto, que é como o fechar chama; tipos/lint/migrations/db_guard OK)

## Todos os caminhos do mesmo defeito (git grep)
`git grep -n "talkx_campaign_resume_precheck"` → só `useTalkXResumeChecklist.ts` (comentário)
além dos arquivos acima. `talkx_campaign_segment_progress` aparece em
`src/components/talkx/tracking/TalkXSegmentProgressTable.tsx`, `talkxSegmentProgress.ts` e no
teste ao lado (leitura da RPC de N-096) — são do mesmo X142 e a RPC agora existe no banco;
não os toquei porque o cartão não os cita.

## Passada de efeitos colaterais
Funções novas e aditivas: nenhum GRANT/papel/ACL existente mudou (só REVOKE/GRANT das
funções criadas); nada de gatilho nem escrita em dado. Rollback executável no topo
(dropa as 2 funções). Nenhuma outra migration ou arquivo de outro módulo foi alterado.

## NÃO FEITO (fora do título X142)
Faltam da etapa X142, que não são deste cartão: status do template, limite diário,
recorrência, autoresposta e o fixture talkx-window-cases.json.
