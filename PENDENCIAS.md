# PENDÊNCIAS DE CI

> Gerado em 2026-11-05 pela sessão `fix-ci-workflows-hxupgs`.
> Atualizar quando o bloqueio for resolvido.

---

## 1. Deploy Edge Functions — manifesto desatualizado

| Campo | Valor |
|---|---|
| Workflow | `.github/workflows/deploy-functions.yml` |
| Última run com falha | [#956 (run `afd8c7ca`)](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41541397024) |
| Erro exato | `Deployment manifest is stale: supabase/deployment-manifest.json` |
| Causa | PR [#2707](https://github.com/adm01-debug/Zapp_Web_V2/pull/2707) (`fix: cron do drain de ai_usage_outbox e comentario do CodeQL`) adicionou a edge function `ai-usage-outbox-drain` mas ainda não foi mergeada. O `generate-manifest.mjs` que atualiza `supabase/deployment-manifest.json` está dentro do próprio PR. |
| Por que não posso corrigir agora | PR #2707 toca `supabase/deployment-manifest.json` (conflito de arquivo — AGENTS.md regra 3) **e** contém migration DDL (`supabase/migrations/`) — requer aprovação do dono (AGENTS.md regra 8). |

### O que o dono precisa fazer

1. Revisar e mergear o PR #2707.
2. Após o merge, o `deploy-functions.yml` será disparado automaticamente pelo push na `main` e deverá passar (manifesto regenerado pelo próprio PR).
3. Se o deploy ainda falhar após o merge, dispatchar manualmente `deploy-functions.yml` via GitHub Actions.
