Especialista: worker (sql) (area-sql-banco) — perfil workersql (t_7d403167)

## O que mudou e por quê
- `supabase/migrations/20261013140359_crisis_room_snapshot.sql` (nova): cria `public.crisis_room_snapshot() RETURNS jsonb` (STABLE, SECURITY DEFINER, `search_path = public, pg_temp`), as 4 métricas da Sala de Crise num agregado único no banco. Corrige os dois defeitos da ponte no navegador: (1) o corte silencioso de 1.000 linhas do PostgREST transformava operação grande em número pequeno; (2) o SLA contava estouros de todo o histórico. Regras espelham `src/components/admin/CrisisRoom.tsx`: pendência = `sender='contact'` nos últimos 60 min SEM resposta posterior (`sender='agent'`) na mesma conversa; agentes ativos = presença REAL (`agent_presence` com heartbeat de 75 s, mesmo corte do `useAgentPresenceMap`) restrita a contas habilitadas (`profiles.is_active` e papel de atendimento) — nunca `profiles.is_active` sozinho; SLA = `first_response_breached` E (`first_response_at IS NULL` OU criado nas últimas 24 h), fuso America/Sao_Paulo; `queue_ratio` = contatos pendentes / agentes online, **NULL** quando não há agente online. Devolve `unanswered_messages`, `unanswered_conversations`, `online_agents`, `total_agents`, `sla_breached`, `queue_ratio`, `window_minutes`, `sla_window_hours`, `cycle_date_sp`, `generated_at`. Barreira explícita: não admin/supervisor recebe exceção (42501), sem zeros. ACL: `REVOKE ALL ... FROM PUBLIC, anon, service_role` + `GRANT EXECUTE ... TO authenticated`. `-- Rollback:` executável (`drop function if exists`), provado no teste.
- `scripts/db-audit/crisis-room-snapshot.test.sh` (novo): prova em PostgreSQL 17 descartável (docker) aplicando a migration REAL e chamando a RPC como o PAPEL real (authenticated + claim `sub`, anon, service_role), nunca como postgres para julgar autorização.
- `src/integrations/supabase/types.ts`: registra `crisis_room_snapshot: { Args: never; Returns: Json }` para o hook chamar tipado.
- `scripts/ci/check-test-inventory.mjs`: entrada na ALLOWLIST do `.test.sh` novo (REGISTRO PENDENTE do passo em `db-guard.yml`, que é do dono do workflow — agente não edita workflow).

## Prova (vermelho antes, verde depois)
- verde: `bash scripts/db-audit/crisis-room-snapshot.test.sh` → `[OK] ... (20 cenarios aprovados).` — 20 PASS, 0 FAIL.
- vermelho antes: o teste começa exigindo que a RPC NÃO exista antes da migration (`[PASS] vermelho antes: public.crisis_room_snapshot() ainda nao existia`) e o cenário anti-corte mede a consulta no formato antigo como `1000` contra o agregado real `1502`.
- `hermes-db-migrar supabase/migrations/20261013140359_crisis_room_snapshot.sql` → `APLICADA no banco LOCAL 'v2-2610131358fffb' (produção não foi tocada).`

## O que NÃO fiz e por quê
- Não liguei o `.test.sh` a `.github/workflows/db-guard.yml` (workflow é do dono; passo de uma linha, REGISTRO PENDENTE).
- Não toquei `CrisisRoom.tsx`: a troca das consultas do hook é o cartão filho t_ac0acb5c (área src/**, não é minha).
