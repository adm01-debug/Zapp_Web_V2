Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261012184049_rate_limit_alerts_cron_limiar.sql` (novo):
  - `public.rate_limit_alert_settings` — uma linha só (`id boolean PK = true` + CHECK singleton). Colunas que o
    cartão pede: `blocked_threshold` (limiar de bloqueios por janela, padrão 20), `window_minutes` (5),
    `min_severity` ('info'|'warning'|'critical'), `is_active`, + `updated_at`/`updated_by`. RLS LIGADA; leitura,
    inserção e atualização SÓ para admin (`public.is_admin(auth.uid())`); sem policy de DELETE; tabela nasce
    fechada (`revoke ... from public, anon, authenticated` + `grant select/insert/update` só authenticated).
  - `public.evaluate_rate_limit_alerts()` — SECURITY DEFINER, `set search_path = public, pg_temp` (regra do repo,
    `funcao-segura-no-banco`; a forma literal do cartão, `pg_catalog, public`, foi substituída por essa — o
    `pg_catalog` já vem implícito primeiro). Conta `rate_limit_logs.blocked` na janela, escala a gravidade pelo
    múltiplo do limiar (>= 3x critical, >= 2x warning, >= 1x info), respeita `min_severity` e `is_active`, e grava
    UM `warroom_alerts` com `source = 'rate_limit'`. Idempotência por JANELA: `dedupe_key = 'rate-limit:v1:<bucket>'`
    + `ON CONFLICT ... WHERE dedupe_key IS NOT NULL DO NOTHING` no índice único parcial
    `ux_warroom_alerts_dedupe_key` (já existente, 20261006155408) — a mesma janela não gera segundo alerta nem
    segundo push, sem corrida. Chama `public.secd_caller_ok(null, true)`: só contexto interno (cron) ou admin
    dispara; EXECUTE revogado de PUBLIC/anon/authenticated.
  - `cron.schedule('rate-limit-alerts', '*/5 * * * *', 'select public.evaluate_rate_limit_alerts();')` — desagenda
    o homônimo antes, então é reaplicável.
- `scripts/db-audit/rate-limit-alerts-limiares.test.sh` (novo): prova em Postgres 17 descartável (Docker) com a
  MIGRATION REAL aplicada por marcador. Roda como o papel real (`set role authenticated` + `request.jwt.claims`).

## Prova
- vermelho antes: `bash scripts/db-audit/rate-limit-alerts-limiares.test.sh` → `RED: o avaliador nem existe no
  estado vivo (42883) (does not exist)` e `RED: 60 bloqueios na janela nao geraram nenhum alerta de rate limit (= 0)`
  (o defeito: pico de requisições bloqueadas não alertava ninguém).
- verde depois: mesmo comando → `EXIT=0`, 38 `[PASS]`, fechando em
  `[OK] Rate limit: pico de bloqueios agora gera UM alerta no War Room por janela ...` — inclui o pico gerando 1
  alerta, 2ª rodada na mesma janela não duplicando, 2x o limiar barrado por `min_severity='critical'` e 3x alertando
  como `critical`, desligado sem gravar, CHECKs de entrada inválida, RLS (admin lê/edita, agente não, anon
  `permission denied`), EXECUTE negado a authenticated, job agendado, reaplicação idempotente, e o ROLLBACK
  extraído do próprio arquivo e executado (tabela/função somem, job desagendado, reaplicar restaura).
- `hermes-db-migrar <arquivo>` → `APLICADA no banco LOCAL 'v2-...' (produção não foi tocada)`.

## Decisão registrada (Edge send-rate-limit-alert)
Não chamei a Edge: o contrato dela é OUTRO (um IP bloqueado por vez, corpo ip_address/endpoint/request_count e
secret interno no Vault) — não serve para um limiar agregado, e mandar IP/telefone violaria a regra de não tirar
dado de cliente. O alerta é agregado (contagem + janela + limiar; teste prova que a mensagem não carrega IP nem
telefone) e vai direto para `warroom_alerts`, canal que o War Room já assina por realtime.

## Para outro especialista (interface do banco pronta)
- Front (worker telas/hooks): ler/editar via PostgREST `rate_limit_alert_settings` (RLS admin) e listar
  `warroom_alerts` com `source = 'rate_limit'`; `alert_type` traz a gravidade (critical/warning/info) que o
  `useWarRoomAlerts` já usa para o push. Nada de migration pendente.

## O que NÃO fiz e por quê
- REGISTRO PENDENTE: `scripts/db-audit/rate-limit-alerts-limiares.test.sh` — harness .test.sh novo precisa de um
  passo em `.github/workflows/db-guard.yml` (fora dos meus arquivos; é do worker ci). O verificador
  `scripts/ci/check-test-inventory.mjs` já o lista como órfão junto de outros 4 pré-existentes; o `zapp-verify`
  (fechar) não roda esse inventário.
- Nenhum DROP/TRUNCATE/DELETE/GRANT de objeto vivo além do pedido; nada de produção.
