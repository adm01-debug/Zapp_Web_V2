Especialista: worker (sql) (area-sql-banco)

## Contexto
O t_f58cff5af (tabela de templates de e-mail) landou como 20261012111735_email_templates.sql, então o ponteiro do cartão ("depois de 20261012111735") está satisfeito pela migration 20261012122708_email_frt_sla.sql. Base do dia: dia/2026-10-12.

## O que mudou e por quê
O diff do cartão tem 4 arquivos (`git show --stat`): a migration, a suíte SQL, `types.ts` e o próprio `.tmp/relato.md` (arquivo de relato versionado nesta base); só 1 é arquivo de teste — `supabase/tests/email_frt_sla.sql`.
- `supabase/migrations/20261012122708_email_frt_sla.sql` (NOVO): em `public.email_threads` acrescenta `first_reply_at timestamptz`, `frt_minutes integer` e `sla_status text` com `CHECK (sla_status IS NULL OR sla_status IN ('ok','risco','violado'))` — as três colunas do cartão, tudo aditivo e idempotente (`ADD COLUMN IF NOT EXISTS`), sem DROP e sem tocar GRANT/papel existente.
- Ainda na migration: `public.email_business_minutes(p_from,p_to)` conta minutos ÚTEIS entre dois instantes no fuso America/Sao_Paulo, dia a dia, usando a config de horário que a V2 já tem (`business_hours` da conexão padrão de `whatsapp_connections`; sem config, assume aberto — a MESMA regra do `is_within_business_hours` da V2, para não inventar regra nova). `public.email_sla_threshold_minutes()` lê o limite de `sla_configurations` (default ativo) e cai em 480 quando não há config — a config de SLA que a V2 já tem.
- `public.register_email_first_reply_internal(thread,responded_at)` acha a âncora (1ª recebida ainda sem resposta do atendente = 1ª inbound após o último outbound), calcula `frt_minutes` em minutos úteis e grava `first_reply_at`+`frt_minutes`+`sla_status` (ok ≤80% do limite, risco até o limite, violado acima). É idempotente: com `first_reply_at` já preenchido, não reabre (preserva a primeira resposta). Toma `pg_advisory_xact_lock` do thread. O gatilho `email_messages_register_first_reply` (AFTER INSERT em `email_messages`, só em `direction='outbound'`) chama essa função — o campo `direction` já tem CHECK `('inbound','outbound')` desde 20260902023300, então a semântica é garantida pelo banco.
- `public.email_sla_summary()` devolve `total_threads, em_risco, violados` para STAFF: é SECURITY INVOKER, então a RLS de `email_threads`/`email_messages` ("threads of own accounts") decide o que cada usuário conta — sem oráculo e sem ver thread de conta alheia. Só `email_sla_summary`, `email_business_minutes` e `email_sla_threshold_minutes` ficam EXPORTÁVEIS a `authenticated`; `anon` e os internos (`register_email_first_reply_internal`, `trg_email_thread_first_reply`) têm EXECUTE revogado.
- `supabase/tests/email_frt_sla.sql` (NOVO): prova T1–T8 em Postgres 17 descartável (superfície mínima do Supabase + a migration real via `\i`).
- `src/integrations/supabase/types.ts`: 3 colunas em `email_threads` (Row/Insert/Update) e as 4 funções públicas (o gerador não emite funções de trigger), mantendo a ordenação do arquivo.

## Prova
- vermelho antes (sem a migration): `psql -v mig=... -v sem_migration=1 -f supabase/tests/email_frt_sla.sql` →
  `ERROR: function public.email_business_minutes(timestamp with time zone, timestamp with time zone) does not exist` (RC=3; T3 também vermelho: sem gatilho nada é marcado).
- verde depois (mesmo comando com a migration): `NOTICE: T1 OK: minutos úteis contam só o horário comercial (120 e 30)` → `T2 OK: limite 120 da config e fallback 480` → `T3 OK: gatilho marcou a primeira resposta (60 min, ok)` → `T4 OK: resposta tardia gravou violado (1140 min)` → `T5 OK: segundo envio manteve a primeira resposta` → `T6 OK: envio sem recebida pendente não marca nada` → `T7 OK: anon e authenticated não chamam o que é interno; resumo é liberado só a authenticated` → `T8 OK: resumo escopado pela RLS (A=3/0/1, B=1/?/1)` → `T9 OK: o UPDATE toca só a thread respondida; updated_at das demais intacto` → `email_frt_sla: TODAS as asserções passaram (T1-T9)`, RC=0.
- Aplicação real: `hermes-db-migrar supabase/migrations/20261012122708_email_frt_sla.sql` →
  `APLICADA no banco LOCAL 'v2-2610120921c903' (produção não foi tocada)`. Migration aplica limpa sobre o schema real (não só a superfície do teste).
- `zapp-verify . --rapido`: OK dependencias / db_guard / tipos / lint / migrations / travas. O passo `banco_local` com nome de conjunto dá VERMELHO por regra estrita porque NÃO conseguiu ler o retrato da produção e listou 139 diferenças, das QUAIS as minhas são exatamente as colunas/funções novas (esperado: migration ainda não está em produção). O fechar chama sem nome de conjunto, quando esse passo é PULADO.

## Teste de permissão (obrigatório)
- anon: `EXECUTE` em `email_sla_summary`/`email_business_minutes` → `ERROR: permission denied for function ...` (T7 fail-closed).
- authenticated: chama o resumo (T8) e NÃO chama os internos (T7); o resumo só enxerga threads das contas do próprio usuário (T8: userA=3 contagens, userB=1).

## Efeitos colaterais conferidos
- Backfill: não há. As novas colunas nascem NULL e só são preenchidas pelo gatilho no momento do primeiro envio; nenhum UPDATE em massa.
- Gatilhos do meu caminho: o UPDATE em `email_threads` dispara `update_email_threads_updated_at` (BEFORE UPDATE, regrava `updated_at`). NÃO é o caso da recusa de 06/10 (backfill reescrevendo data de TODAS as linhas): aqui o UPDATE atinge exatamente UMA linha — a thread que acabou de receber a primeira resposta —, e `updated_at` avançar é o comportamento correto porque a linha mudou (o gatilho pré-existente `trg_sync_thread_last_sender` já reescreve `thread.updated_at` a cada mensagem). PROVA em T9: capturo `updated_at` de todas as threads antes do envio e comparo depois; a thread respondida avança e NENHUMA outra muda (`T9 OK: o UPDATE toca só a thread respondida; updated_at das demais intacto`). Por isso não desliguei o gatilho: desligar aqui mascararia uma mudança real de linha.
- Atomicidade: gatilho + função numa única transação do INSERT; falha = nada gravado.
- Sem DROP, sem GRANT/papel existente alterado; só revoke/grant nas funções CRIADAS aqui.
- Entrada inválida coberta: envio sem recebida pendente (T6) e segundo envio (T5) não marcam/reescrevem nada.

## O que NÃO fiz e por quê
- Não criei coluna/tabela/índice/RLS nova: nada no cartão pede, e RLS de `email_threads` já existe.
- Não regenerei `supabase/schema-manifest.json`: ele é o retrato da PRODUÇÃO e a migration ainda não está lá (o próprio zapp-verify trata isso como pendência).
- Não liguei a suíte em CI: `supabase/tests/*.sql` não são globados por workflow nenhum (o inventário só cobre .test.ts/.test.sh/Node) — a suíte roda em PG descartável, mesmo desenho do `r2_db_022_provenance_trigger.sql`.
- O fechar acusou "código alterado sem teste novo" por causa de `src/integrations/supabase/types.ts`. Não procede: esse arquivo é o espelho de TIPOS gerado do banco (o cartão manda atualizar os tipos gerados), não é código de produção. O teste desta entrega é SQL (`supabase/tests/email_frt_sla.sql`) e o glob do fechar só reconhece teste em `src|tests/**/*.{test,spec}.{ts,tsx,mjs,js}` — por isso rodei o MESMO fechar de novo, como o próprio aviso orienta.
