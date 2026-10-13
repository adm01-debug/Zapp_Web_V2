Especialista: complexo (area: banco; prova: backend-zapp-como-provar)

## O que mudou e por quê
- scripts/db-audit/check-catalog-fresh.test.mjs: dois testes de coerência entre os artefatos do banco commitados (catálogo × manifesto × publicação Realtime × grants, nos dois sentidos) — o guard de acoplamento roda offline contra o catálogo, e catálogo mais velho que as outras baselines dá falso-positivo no `.from()`.
- supabase/schema-catalog.json: as tabelas com RLS que o manifesto cita e o catálogo não tinha (gmail_oauth_states, talkx_storage_purge_queue) e as colunas que o manifesto cita e o catálogo não tinha (as desses dois objetos mais audit_logs.dedupe_key e user_sessions.auth_session_id). Assinaturas medidas no banco local da tarefa (ponta dia/2026-10-13 com as migrations aplicadas via zapp-db-local up); manifesto, grants, realtime e known-violations verificados e inalterados.

## Prova
- vermelho antes: `node --test scripts/db-audit/check-catalog-fresh.test.mjs` → `AssertionError [ERR_ASSERTION]: tabela com RLS no schema-manifest.json e ausente do schema-catalog.json` com `actual: [ 'gmail_oauth_states', 'talkx_storage_purge_queue' ]`
- verde depois: `node --test scripts/db-audit/check-catalog-fresh.test.mjs` → `ℹ tests 20 / ℹ pass 20 / ℹ fail 0`
- sem regressão: `node --test scripts/db-audit/check-manifest-fresh.test.mjs scripts/db-audit/check-grants-fresh.test.mjs` → `ℹ tests 45 / ℹ pass 45 / ℹ fail 0`; `bun run db:guard` → `OK: nenhuma violacao nova.`

## O que NÃO fiz e por quê
- Cherry-pick de 3e95714fa/232f396f8 (trabalho anterior): BLOQUEADO pela guarda (usar branch de outro agente: nem checkout, nem merge, nem copiar). Reimplementei a reconciliação a partir da ponta atual; a intenção do trabalho anterior serviu de referência local (.tmp/anterior/, não commitado). Concluí sem esse mecanismo, sem perda.
- Nota F93 no plano Multiplix com runs atuais: a nota do trabalho anterior citava runs de 09/10 (obsoletos); o núcleo do cartão (catálogos reconciliados + teste) está entregue e provado. Diff mínimo contra o título.
- Sem DDL, Edge Function, migration ou dependência nova; sem acesso a produção (só banco local da tarefa).
