# Estado real do projeto — inventário gerado

Pasta de **dados gerados**, não de relatórios escritos à mão. Cada arquivo diz como foi produzido.

| Arquivo | Como gerar | O que tem |
|---|---|---|
| `edges.json` | `node scripts/inventario/gerar-repo.mjs` | as 85 edge functions: linhas, segredos lidos (`Deno.env.get`) e quem invoca cada uma (src, migrations, outras edges, e2e, CI) |
| `tabelas-uso.json` (não versionado; gere localmente) | `node scripts/inventario/gerar-repo.mjs < lista-de-tabelas.txt` | para cada tabela do banco, quantos `.from('tabela')` existem em `src/` e em `supabase/functions/` |
| `banco-AAAA-MM-DD.json` | consulta SQL de leitura no banco oficial (MCP) — ver `fonte` dentro do arquivo | tabelas, RLS, cron jobs e falhas, estado da conexão WhatsApp |

## Achados do snapshot de 2026-11-02

**Edge functions sem nenhum chamador no repositório nem em função SQL do banco (15):**
`ai-usage-outbox-drain`, `auto-close-conversations`, `cleanup-rate-limit-logs`, `csp-report`,
`elevenlabs-agent-token`, `external-db-bridge`, `multiplix-voices`, `recover-corrupted-audios`,
`recover-message-media`, `send-email`, `send-rate-limit-alert`, `sync-call-records`, `talkx-ai`,
`talkx-report`, `voice-copilot-action`.
(`talkx-scheduler` e `talkx-storage-purge` só são chamadas por funções SQL via cron — não aparecem no grep do repo, mas estão vivas.)
Atenção: `auto-close-conversations` consta como edge do fluxo 5 em `docs/PRONTO_PRODUCAO.md`, mas nada a invoca.

**Tabelas órfãs (23):** 0 linhas, sem `.from()` no código, sem função SQL, view ou trigger que as cite.
Lista em `banco-2026-11-02.json` → `tabelas_orfas`. Inclui 3 tabelas de rollback/log de migration
(`_rb_*`, `_zapp_*`), 7 tabelas `copilot_*`, `department_invites` (legada, substituída por `department_invitations`).

**Cron:** 24 jobs, todos ativos. 14 tiveram falhas nas últimas 48 h, todas `job startup timeout`
(pg_cron sem worker livre no instante do disparo). Os 4 jobs de 1 em 1 minuto concentram ~130 das ~230 falhas.

**WhatsApp:** conexão padrão `PRINCIPAL` segue `disconnected` (health-check confirma a cada 5 min);
4 mensagens nos últimos 7 dias, todas da fixture de E2E. É o item 2 de `docs/PRONTO_PRODUCAO.md`.

**Segurança:** 0 tabelas sem RLS em `public`; 521 policies.
