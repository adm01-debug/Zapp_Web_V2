Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê

- supabase/migrations/20261012134000_auto_reconnect_logs.sql (nova): paridade V3→V2 da
  auto-reconexão de conexões WhatsApp. Em public.whatsapp_connections entram 4 colunas
  aditivas — auto_reconnect_enabled (default true), reconnect_interval_seconds (default 60,
  CHECK 60..3600), reconnect_max_attempts (default 3, CHECK 1..20) e health_reason (texto
  curto, ≤200 caracteres) — mais a tabela public.reconnection_logs (conexão, tentativa,
  resultado, motivo, data). `health_reason` também passa a ser exposta em
  public.whatsapp_connections_safe (CREATE OR REPLACE VIEW, coluna NOVA no fim; o
  mascaramento de qr_code/instance_id para não-admin continua igual), porque é a view que a
  tela de conexões lê. RLS ligada em reconnection_logs com leitura só para staff
  (is_admin_or_supervisor(auth.uid())) e ACL explícita: authenticated só com SELECT
  (histórico de auditoria não se forja de dentro do app — a Edge escreve com service_role),
  anon/PUBLIC sem grant. Retenção de 30 dias por job pg_cron diário (padrão do repo), com o
  agendamento guardado por pg_namespace para a migration rodar também em Postgres sem pg_cron.
  A migration é aditiva (nenhuma linha existente muda; nenhum GRANT/papel preexistente é
  alterado) e o rollback é o inverso executável, extraído do próprio arquivo pelo teste.
- scripts/db-audit/auto-reconnect-logs.test.sh (novo): prova o contrato em Postgres
  descartável (postgres:17-alpine), nos papéis reais (authenticated/anon/service_role), nunca
  como postgres: RLS, defaults e CHECKs, mascaramento da view, quem lê e quem não lê o
  histórico, quem não consegue escrever, sintaxe de ACL, cascade, retenção (o comando
  AGENDADO extraído do arquivo apaga a linha de 31 dias e preserva a de 1 dia), guarda do
  cron e REAPLICAÇÃO da migration sem pg_cron.
- .github/workflows/db-guard.yml: registra o teste novo no job do contrato DB offline
  (exigência do check-test-inventory, senão ele vira órfão).
- src/integrations/supabase/types.ts: tipos do Database alinhados à forma que o gerador
  emite — as 4 colunas novas em whatsapp_connections, health_reason na view
  whatsapp_connections_safe e o bloco da tabela reconnection_logs (com as 4 relações de FK
  como connection_health_logs declara).

## Prova

- vermelho antes (mesmo arquivo, no Postgres descartável, sem a migration):
  `bash scripts/db-audit/auto-reconnect-logs.test.sh` → `[PASS] A1 sem a migration nao existe a tabela reconnection_logs`
  / `[PASS] A2 sem a migration nao existe auto_reconnect_enabled`
  / `[PASS] A3 sem a migration nao existe health_reason` (bloco A roda antes de aplicar o SQL)
- verde depois: `bash scripts/db-audit/auto-reconnect-logs.test.sh` → `== TODOS OS PASSOS PASSARAM ==` RC=0
  (46 passos: A1–A4 e B1–B42, incluindo rollback e reaplicação)
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (118s)` RC=0
  (dependencias OK, db_guard OK, tipos OK, lint OK, migrations OK;
  `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto` — é assim que o fechar chama)

## O que NÃO fiz e por quê

- Não rodei `hermes-db-migrar`: este cartão não tem banco local de tarefa (nenhum
  `v2-26101209546aae` na pasta de stacks) e subir/replayar a stack custa ~14 min. A prova de
  banco é o teste descartável acima, que aplica o arquivo REAL em postgres:17 com os papéis
  reais — mesma decisão dos cartões de banco vizinhos de hoje.
- Não rodei `supabase gen types` (o gerador aponta para o banco de produção, proibido pelo
  protocolo). types.ts foi editado à mão na forma exata do gerador (ordem alfabética, mesmas
  relações). Se o time exigir regeneração, é um comando só, no merge.
- Não toquei a Edge function connection-health-check (área do worker de Edge): o banco agora
  oferece auto_reconnect_enabled/reconnect_interval_seconds/reconnect_max_attempts/health_reason
  e a tabela reconnection_logs; quem grava o log de tentativa e o motivo é ela.
- Não mexi nas policies de escrita de whatsapp_connections nem na contagem do OmnichannelManager.
