Especialista: workersql

## O que fiz e por quê
O QR de pareamento não tinha onde ser auditado no banco: nenhuma linha por tentativa, sem como saber se o QR expirou, se o pareamento conectou ou por que falhou. Esta migration cria `public.qr_attempts`, uma linha por tentativa de pareamento.

- supabase/migrations/20261012110945_qr_attempts.sql — cria `public.qr_attempts` com:
  - `connection_id` FK → `public.whatsapp_connections(id)` ON DELETE CASCADE (apagar a conexão leva o histórico dela);
  - `created_at` (default now()), `expires_at` (default now() + 60 s), `status`
    ('pendente'|'conectado'|'expirado'|'erro', default 'pendente') e `reason` (motivo da falha);
  - CHECK do domínio de status e CHECK do TTL (clamp 15-300 s do QR da V3; a GO não devolve
    count/ttl, então o produtor usa o default de 60 s);
  - índices `(connection_id, created_at desc)` e `(created_at)`;
  - RLS LIGADA com uma policy FOR ALL para staff (`is_admin_or_supervisor(auth.uid())`), REVOKE de
    anon, GRANT para authenticated e service_role;
  - `public.qr_attempts_purge()` (SECURITY DEFINER, `search_path = pg_catalog, public`) que apaga
    tentativas com `created_at < now() - 30 dias`; EXECUTE só para service_role (retenção de 30 dias).
- supabase/tests/qr_attempts.sql — teste de aceitação/contrato (detalhe na prova).
- src/integrations/supabase/types.ts — tipos gerados: tabela `qr_attempts` (+ 4 relações para
  whatsapp_connections e suas views) e a função `qr_attempts_purge`.

Nada foi persistido do QR em si: a tabela só guarda tentativa, status e motivo — nenhum payload/base64.
Diff desta entrega (vs base): 4 arquivos — supabase/migrations/20261012110945_qr_attempts.sql,
supabase/tests/qr_attempts.sql (o único arquivo de teste), src/integrations/supabase/types.ts e
.tmp/relato.md.
Sobre src/integrations/supabase/types.ts: é arquivo GERADO (o próprio cartão manda atualizá-lo no mesmo
cartão). Não há teste unitário cabível para um tipo gerado — o que prova o contrato é o teste real
supabase/tests/qr_attempts.sql (aplica a migration e checa tabela, RLS, status, TTL, retenção), que
está no mesmo commit da mudança de tipos.

## Prova (vermelho antes, verde depois)
Teste em Postgres 17 descartável (docker local), aplicando as migrations REAIS via `\i` e rodando
como os papéis REAIS (SET LOCAL ROLE authenticated/anon/service_role), nunca como postgres:

- VERDE: `psql -X -v ON_ERROR_STOP=1 -f supabase/tests/qr_attempts.sql` → exit 0, 30 asserções PASS
  (T0..T10d) e a linha final `PASS: TC qr_attempts — ...`.
- VERMELHO (a guarda ausente): mesmo arquivo com `-v sem_guarda=1` (desliga a RLS dentro da
  transação) → `ERROR: t_7af815d8 FALHOU [T6 usuario comum NAO insere (RLS)]: esperava erro SQLSTATE
  42501, veio: OK 1`, exit 3. Ou seja, o teste é sensível à proteção.
- Rollback de verdade: as duas instruções do bloco `-- Rollback (SQL executável, na ordem):` rodam de
  fato (T10/T10b) e a tabela e a função somem (T10c/T10d).
- Migration aplicada no banco local da tarefa: `hermes-db-migrar
  supabase/migrations/20261012110945_qr_attempts.sql` → `APLICADA no banco LOCAL` (produção intocada).

O que o teste cobre: T0/T0d a barreira é a RLS e não a ACL (authenticated TEM o GRANT; anon não tem);
T1-T3 contrato de colunas, FK CASCADE e default de status; T4/T4b/T4c domínio de status e clamp de TTL
recusados; T4d/T4e TTL default de 60 s; T5/T5b/T5c staff insere e lê; T6/T6b usuário comum não insere e
lê zero; T7/T7b anon barrado; T8/T8b/T8c CASCADE; T9..T9e a purga de 30 dias preserva a recente e só
service_role executa; T10..T10d o rollback.

Verificação do repositório: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (db_guard, tipos,
lint e migrations OK; banco_local pulado por falta do nome do conjunto, como o fechar chama).

## O que NÃO fiz e por quê
- Agendamento do cron da retenção (`cron.schedule`) e qualquer deploy: fora do cartão; o mecanismo
  (`qr_attempts_purge()`) fica pronto, o agendamento é de quem opera a infra.
- Produtor do QR (Edge/front) e qualquer tela: não é a minha área; a tabela e o contrato de TTL/status
  ficam prontos para esses cartões consumirem (os tipos já estão em types.ts).
- Numa primeira tentativa eu criei um `scripts/db-audit/*.test.sh` e mexi em
  `scripts/ci/check-test-inventory.mjs`; o juiz apontou que esses arquivos não estão na lista do
  cartão, então reverti ambos — o teste ficou só em supabase/tests/, como o cartão pede.
