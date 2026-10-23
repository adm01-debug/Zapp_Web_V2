# PENDÊNCIAS — Auditoria Supabase (2026-10-22)

Itens que dependem de ação manual do Joaquim ou que ficaram tecnicamente bloqueados.
Cada item indica o que travar, por que trava e o passo exato a fazer.

---

## P1 — Aplicar migrations do PR #2186 em produção

**O que:** 3 migrations com correções críticas (S3-01, S3-02, S2-01, S12-01) estão no branch
`claude/loving-lovelace-esc3l2` mas **NÃO estão aplicadas em produção**. Confirmado:

```
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version IN ('20261026100300','20261026110300','20261026120300');
-- 0 linhas → nenhuma das 3 está no ledger
```

**Por que trava:** a regra do projeto exige: PR → merge em `main` → deploy → apply em produção
com aprovação no environment `producao-ddl`.

**⚠️ IMPORTANTE — aplicar uma migration por vez:** o workflow `db-migrate.yml` aceita exatamente
um alvo por disparo; com 3 migrations pendentes, executar todas de uma vez pára no preflight.
Repetir os passos 3–6 abaixo para CADA migration na ordem cronológica.

**Passo a passo:**
1. Revisar e mergear PR #2186 em `main`
2. Aguardar deploy automático no Vercel
3. **Para cada migration** (na ordem: `20261026100300`, depois `20261026110300`, depois `20261026120300`):
   a. `.github/Actions → db-migrate.yml → Run workflow` → `migration_version=<versão>` + `apply=false`
   b. Conferir output do dry-run — hash SHA-256 gerado
   c. Rodar novamente com `apply=true` e `confirm_runtime_sha256=<hash do dry-run>`
   d. Aprovar no environment `producao-ddl`
   e. Confirmar que a version aparece no ledger antes de aplicar a próxima

**Severity das correções:**
- `20261026100300` → S3-01 + S3-02 (ALTO — deleta/insere invites de outros departamentos)
- `20261026110300` → S12-01 (MÉDIO — login_attempts sem TTL)
- `20261026120300` → S2-01 (MÉDIO — RPC `log_search_event` ausente no banco)

---

## P2 — Habilitar MFA para todos os usuários

**O que:** 10 usuários com 0 MFA configurado (S8-01).

```
SELECT count(*) FROM auth.users;           -- 10
SELECT count(*) FROM auth.mfa_factors;     -- 0
```

**Por que trava:** é decisão de negócio + ação nos perfis dos usuários.

**Passo a passo:**
1. Acessar painel Supabase → Authentication → Users
2. Habilitar MFA obrigatório: Authentication → Policies → MFA → "Enforce MFA for all users"
   (ou usar fluxo progressivo pelo front-end para não bloquear todos de uma vez)
3. Comunicar usuários para configurar TOTP ou SMS

---

## P3 — Definir file_size_limit no bucket multiplix-voice

**O que:** bucket `multiplix-voice` sem `file_size_limit` (S8-02).

```
SELECT id, file_size_limit FROM storage.buckets WHERE id = 'multiplix-voice';
-- file_size_limit: null
```

**Por que trava:** requer decisão sobre tamanho máximo de arquivo de áudio.

**Passo a passo:**
1. Decidir limite (sugestão: 25 MB para áudios de campanhas de voz)
2. Executar via SQL ou dashboard:
   ```sql
   UPDATE storage.buckets SET file_size_limit = 26214400 WHERE id = 'multiplix-voice';
   ```
   (ou via Supabase dashboard → Storage → multiplix-voice → Edit bucket)

---

## P4 — Rotação de sessões JWT sem expiração

**O que:** 222 sessões JWT com `not_after IS NULL` (S9-01) — sem expiração definida.

```
SELECT count(*) FROM auth.sessions WHERE not_after IS NULL;  -- 222
```

**Por que trava:** revogar sessões de usuários pode causar logout em massa inesperado.

**Passo a passo:**
1. Decidir política (sugestão: `not_after = 90 dias`)
2. No Supabase dashboard → Authentication → Providers → Email → "JWT expiry limit" ou via config
3. Opcionalmente revogar sessões mais antigas via `DELETE FROM auth.sessions WHERE created_at < now() - interval '90 days'` — ação destrutiva, requer autorização de Joaquim

---

## P5 — Criar índices para 20 FKs sem cobertura (S4-01)

**O que:** 20 FKs sem índice identificadas, com maior risco em `talkx_campaigns` (7 FKs).

**Por que trava:** criação de índice é DDL — requer arquivo de migration + PR + merge + apply.

**Passo a passo:**
1. Criar migration `20261026NNNNNN_indexes_fk_coverage.sql` com os `CREATE INDEX` listados abaixo
2. Priorizar as mais críticas: `talkx_campaigns` (7 FKs), `multiplix_delivery_items` (3 FKs)
3. Seguir fluxo: arquivo → PR → merge → apply

**FKs mais críticas para indexar:**
```sql
-- talkx_campaigns (7 FKs sem índice)
CREATE INDEX ON public.talkx_campaigns(cancelled_by);
CREATE INDEX ON public.talkx_campaigns(consent_confirmed_by);
CREATE INDEX ON public.talkx_campaigns(launched_by);
CREATE INDEX ON public.talkx_campaigns(owner);
CREATE INDEX ON public.talkx_campaigns(paused_by);
CREATE INDEX ON public.talkx_campaigns(responsible_id);
CREATE INDEX ON public.talkx_campaigns(template_version_id);
-- multiplix_delivery_items (3 FKs)
CREATE INDEX ON public.multiplix_delivery_items(block_id);
CREATE INDEX ON public.multiplix_delivery_items(recipient_id);
CREATE INDEX ON public.multiplix_delivery_items(voice_asset_id);
```

---

## P6 — Verificar lista exata de edge functions deployed vs repo

**O que:** auditoria identificou 84 funções no repo, mas não foi possível listar as deployed
em produção (requer CLI `supabase functions list` ou REST API com service_role token de projeto).

**Por que trava:** MCP read-only não expõe lista de deployed functions; requer Supabase CLI autenticado.

**Passo a passo:**
1. Na máquina com CLI configurado: `supabase functions list --project-ref tnnnlkbymytvtqngbbqh`
2. Comparar com `ls supabase/functions/` (84 funções esperadas)
3. Funções no repo mas não deployed = possível drift; funções deployed mas não no repo = possível legado

---

## P7 — Verificar logs de 7d por edge function individualmente

**O que:** logs do Supabase Edge Functions (nivel função) não estão disponíveis via
`query_logs` sem token de autenticação edge. A auditoria cobriu logs de cron jobs mas não
os logs de cada edge function individualmente.

**Por que trava:** requer acesso ao Supabase dashboard → Functions → cada função → Logs.

**Passo a passo:**
1. No dashboard: Functions → selecionar funções de alto risco (`evolution-webhook`, `whatsapp-webhook`, `external-db-bridge`, `external-db-proxy`)
2. Filtrar por `level=error` nos últimos 7 dias
3. Qualquer erro recorrente → investigar e criar issue

---

## P8 — Investigar spike de job startup timeout (S6-01)

**O que:** spikes de falhas em 02/10 e 15/10: ~200 falhas/hora em 9 jobs simultaneamente.
`talkx-scheduler-1min` tem 3878 falhas em 30d (9.9%).

**Por que trava:** causa-raiz requer acesso aos logs de infraestrutura do Supabase (dashboard
→ Reports → Infrastructure) ou suporte ao Supabase.

**Passo a passo:**
1. Verificar `Reports → Infrastructure → CPU/Memory` para 02/10 e 15/10
2. Se for memory pressure: analisar as funções `trigger_talkx_engine_tick` (908ms avg) e
   `notify_due_tasks` para otimização
3. Abrir ticket com Supabase se o spike persistir

---

## Itens NÃO VERIFICÁVEIS por limitação técnica desta auditoria

| Item | Limitação | Como verificar |
|------|-----------|---------------|
| RLS em produção via `SET ROLE` | MCP corre dentro de SECURITY DEFINER — `SET ROLE` e `BEGIN/ROLLBACK` bloqueados pelo PostgREST | Executar via psql direto ou SQL Editor do dashboard com `SET LOCAL ROLE authenticated` |
| Funções deployed vs repo | Nenhuma tool MCP lista funções deployed | `supabase functions list` CLI |
| Logs por edge function 7d | `query_logs` sem auth edge não retorna logs de função | Dashboard → Functions → Logs |
| Backup/PITR config | `pg_settings` não expõe config de backup; Supabase Cloud gerencia automaticamente | Dashboard → Settings → Database → Backups |
| Advisors de segurança/performance | `get_advisors` MCP não disponível nesta sessão; requer Supabase MCP com endpoint dedicado | Dashboard → Advisors |
| R0/R1/R2 das 84 edge functions | Ler 84 arquivos `index.ts` individualmente ultrapassaria limite de tokens | Ler funções de maior risco: `evolution-webhook`, `external-db-bridge`, `public-api`, `voice-agent` |
