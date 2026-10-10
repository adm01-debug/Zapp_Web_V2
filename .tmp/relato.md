Especialista: workersql (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261010071435_talkx_campaign_resume_precheck.sql`: migration nova com duas funções RPC (`talkx_campaign_resume_precheck` e `talkx_campaign_segment_progress`), ambas `SECURITY DEFINER`, `SET search_path = public, pg_temp`, com `REVOKE` de PUBLIC/anon e `GRANT` a authenticated/service_role, mais `-- Rollback:` completo e executável.
- `scripts/db-audit/talkx-resume-precheck.test.sh`: teste com Postgres descartável que aplica a migration real, roda como papel `authenticated` e `anon`, prova can_resume=true quando tudo ok, cada blocker isolado e ACL negada.
- `src/hooks/integrations/useTalkXServerResumePrecheck.ts`: hook que chama a RPC `talkx_campaign_resume_precheck`, parseia o jsonb e expõe `canResume`/`blockers`.
- `src/components/talkx/tracking/TalkXServerResumePrecheck.tsx`: componente que renderiza o resultado da pré-checagem (pronto para retomar ou lista de blockers).
- `src/components/talkx/TalkXCampaignRunning.tsx` e `TalkXLiveMonitor.tsx`: wiring dos componentes e hook na tela de campanha pausada e no monitor ao vivo.
- `src/hooks/integrations/useTalkXResumeChecklist.ts`: comentário atualizado indicando que o precheck vem da RPC do servidor.
- `.github/workflows/db-guard.yml`: registro do teste no CI.

O diff tem ~37 mil caracteres (acima de 25 mil), a maior parte é o teste de banco (255 linhas).

## Prova
- Teste de banco (roda migration real em Postgres descartável, papel real): `bash scripts/db-audit/talkx-resume-precheck.test.sh` → `talkx-resume-precheck: OK` (todos os PASS).
- `npx vitest run src/components/talkx/__tests__/TalkXServerResumePrecheck.test.tsx` → 3 passed.

## O que NÃO fiz e por quê
- Ficou para a próxima leva (restam do X142): status do template, limite diário, recorrência, autoresposta e fixture `talkx-window-cases.json`. Estes itens não foram tocados nesta migration.