Especialista: workersql

## O que mudou e por quê
- `supabase/migrations/20261011181949_warroom_alerts_resolve.sql`: mantive a entrega anterior e fechei o buraco restante da recusa 2: o gatilho `trg_prevent_direct_warroom_alert_resolution_update` agora roda em `BEFORE INSERT OR UPDATE`; no `INSERT`, bloqueia qualquer `resolved_at`, `resolved_by` ou `resolution_note` não nulo fora da flag interna da RPC; no `UPDATE`, preserva o bloqueio já existente. Também ajustei os comentários das colunas para não prometer que NULL é "escrito" pela RPC.
- `supabase/tests/warroom_alerts_resolve.sql`: acrescentei prova SQL real do admin autenticado tentando `INSERT` com `resolved_by` preenchido e recebendo `resolution_update_not_allowed`; ajustei o teste estrutural do limite de 500 caracteres para ligar a flag interna e isolar a constraint, sem afrouxar a blindagem.
- `src/integrations/supabase/types.ts`: preservado da entrega anterior, só com tipos das colunas/RPCs de warroom criadas pela migration.

## Pontos da recusa anterior, na ordem
- Ponto 1: resolvido — `warroom_alerts_summary` segue com gate de sessão e staff em `supabase/migrations/20261011181949_warroom_alerts_resolve.sql`; o contrato cobre atendente e anônimo em `supabase/tests/warroom_alerts_resolve.sql`.
- Ponto 2: resolvido — os testes de permissão continuam exercendo quem pode, quem não pode e anônimo no SQL real, sob os papéis `authenticated` e `anon`.
- Ponto 3: resolvido — o desvio restante era INSERT direto com `resolved_*`. Corrigi a blindagem em `public.prevent_direct_warroom_alert_resolution_update()` e no trigger `BEFORE INSERT OR UPDATE`, e acrescentei o teste `== insert direto de resolved_* e recusado ==`.
- Ponto 4: resolvido — o cabeçalho `-- Rollback:` continua listando, em SQL executável, o drop do gatilho, da função de blindagem, das RPCs, dos índices, da constraint e das colunas.
- Ponto 5: resolvido — executei o rollback em Postgres descartável com `.tmp/test_rollback_warroom_alerts_resolve.sql`; este relato foi reescrito ponto a ponto e não mistura diff alheio/tipos com os pontos da recusa.

## Prova vermelho → verde
- Vermelho antes: depois de acrescentar o teste do INSERT forjado e antes de trocar o gatilho para `BEFORE INSERT OR UPDATE`, rodei `docker exec "$cid" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -v mig_dir=/repo/supabase/migrations -U postgres -d postgres -f /repo/supabase/tests/warroom_alerts_resolve.sql` → `ERROR: FALHOU: INSERT direto com resolved_* deveria ser recusado, veio: sem-erro`.
- Verde depois: o mesmo teste SQL retornou `OK: warroom_alerts_resolve (estrutura, permissao, resolucao com auditoria, idempotencia, contagens)` e `ROLLBACK` com exit code 0.
- Rollback verde: `docker exec "$cid" psql -h 127.0.0.1 -v ON_ERROR_STOP=1 -v mig_dir=/repo/supabase/migrations -U postgres -d postgres -f /repo/.tmp/test_rollback_warroom_alerts_resolve.sql` retornou `OK: rollback warroom_alerts_resolve restaurou schema basal` e `ROLLBACK` com exit code 0.
- Typecheck verde: `bun run typecheck` retornou `tsc -b --force` com exit code 0.
- Verificação rápida verde: `zapp-verify . --rapido` retornou `VERIFY: VERDE SEM BANCO (119s)` com `dependencias`, `db_guard`, `tipos`, `lint` e `migrations` OK; a prova de banco deste cartão é o Postgres descartável acima.

## Arquivos do diff
- `.tmp/relato.md`
- `src/integrations/supabase/types.ts`
- `supabase/migrations/20261011181949_warroom_alerts_resolve.sql`
- `supabase/tests/warroom_alerts_resolve.sql`

## O que NÃO fiz
- Não usei produção, push, PR, deploy nem banco remoto.
- Não alterei arquivo fora dos permitidos pelo cartão; `.tmp/test_rollback_warroom_alerts_resolve.sql` e logs ficaram só como prova local não versionada.
