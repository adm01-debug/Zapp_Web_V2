# Leitura estática dos scripts shell de banco

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. 12/12 arquivos, 3546/3546 linhas. Nenhum shell, Docker, PostgreSQL ou SQL executado.

## scripts/db-audit/contacts-legacy-visibility.test.sh

Leitura 1–224; SHA-256 `9837ea4ce1ba13fd3b8b7a7edc14dd92704051c69c1a0ae17e96192173547042`; Git blob `452a2d76731a7348c7b957aac6f8a590c77faae8`.

Leitura integral224linhas. Harness Docker PG17 descartável com cleanup restrito por prefixo; não usa URL de produção. Seed reconstrói helper de visibilidade, RLS e duas RPCs antigas simplificadas; aplica a migration contacts_include_legacy_filter real. Controles RED mostram legado visível antes; GREEN confere assinatura única23colunas/ACL nova, default sem legado, include_legacy, contagem/total e agente versus admin. Helpers simplificados não representam toda hierarquia/fila/role real, e o teste não aplica cadeia completa nem comprova índices/desempenho. Nada executado; nenhum achado novo.

## scripts/db-audit/f64-voz-assets-e-grants.test.sh

Leitura 1–257; SHA-256 `b9df91e62b0de8bd0f667d0d1062b675893f38fcf0cba776ac274cb8c7c969d8`; Git blob `e77c964de9c6feba7cb37274220f7f1f97bffb44`.

Leitura integral257linhas. Docker PG17 com retry/cleanup, auth.roles/storage sintéticos e default grants abertos para evitar ACL teste vacuamente fechado; aplica migration F64 real. Asserts tabelas/RLS/FORCE, grants, unique/check, bucket privado, grant por papel/perfil/revogado/criador/admin e escrita service. Controles positivos bons; SQL profiles sem RLS e helpers reconstruídos limitam a composição com schema real, Storage é tabela mínima sem API ou download. Negativa agent INSERT aceita qualquer saída diferente1, não SQLSTATE; comentada cobertura de mutação não foi reexecutada aqui. Sem execução, nenhum achado novo.

## scripts/db-audit/message-delivery-phase1-behavior.test.sh

Leitura 1–752; SHA-256 `e3550ecaf6093349152de44af57869708d8c76ffc26bfe8fcc1e8e6961891236`; Git blob `405e493087f8cc89db012a68f5c5a15e955b3576`.

Leitura integral752linhas em três trechos. Docker PG17, cleanup restrito, auth e tabelas/helpers mínimos, migration real de entrega e quatro hardenings até20260909270000. Controles de ACL/estrutura/hash, enqueue/text/poll idempotente, payload imutável, normalização telefone, CAS token/falha/replay, recuperação lease, close/event rollback, concorrência em sessões separadas e revogação de atribuição após lock. A réplica do FSM inclui transaction_timestamp. Contudo fixture closure96–102 omite UNIQUE por dia e não aplica gamificação/regras posteriores: replay mesmaUUID não cobre DB008 novaUUID no mesmo dia, nem DB009. Claim concorrente usa postgres com claim service, enquanto casos anteriores SET ROLE exercitam ACL. Não representa cadeia final inteira, Edge ou provedor; nada executado.

## scripts/db-audit/notification-delivery-atomicity.test.sh

Leitura 1–358; SHA-256 `e05b2839b55a2f00fe4be70bea67cb0061f75a629bd2c7929c3ab6f1e29804b6`; Git blob `d223b26325c806c46f7665f2ab38acc8a4696e17`.

Leitura integral358linhas. Docker PG17 isolado, seed mínimo, aplica somente20260922220000; mede catálogo/ACL e testa calls fora de ordem, idempotência por eventid, ausência de collapse quando eventidNULL, rollback call/notification, sentimento idempotente e reparo parcial. Assert de ACL é explicitamente sobre record_incoming_call_event de6argumentos151–154; não aplica sobrecarga posterior de7argumentos e portanto não refuta DB001. EXCEPTION OTHERS dos rollbacks aceita qualquer erro fora sentinela (limite de causa, embora checa ausência de efeitos). Nenhuma chamada/provider/UI real. Nada executado.

## scripts/db-audit/notify-due-tasks-authorization.test.sh

Leitura 1–168; SHA-256 `861bf8f625dcc51a7e76586b8d4143e56ab4a9936b63c7630fd96a30725c7946`; Git blob `4200d876bd6051582b7abac9a8399f3c67116fec`.

Leitura integral168linhas. DockerPG17/cleanup, auth helper e versão sem guarda reconstruídos. RED mostra chamada authenticated gravando para terceiro, aplica migration real e GREEN confirma rejeição por texto service_role_required sem efeitos, permissão service e cron postgres semJWT. Teste restrito à autorização, não concorrência/dedupe do loop, reminder edit/notified_at ou cron real. Helper usa session_user fallback em fixture; nenhuma operação executada nesta revisão.

## scripts/db-audit/runtime-config.test.sh

Leitura 1–103; SHA-256 `e62d8636aa5a5029b293fcad8954aeb478ffbcb1a7642071bdf8ad11570b7389`; Git blob `0a9cdd662eb3c54e2910433ede98a9df97c045d4`.

Leitura integral103linhas. Docker PG17 --network none com tabelas/publicação mínimas; coletor runtime-config.sql real antes/depois de schemas cron/storage/ledger sintéticos e autovacuum drift. Checker real deve manter PARTIAL, não vazar command e detectar reset. Não instala pg_cron, não faz Realtime delivery/Storage API/restore; cwd do import Node depende invocação na raiz e tmp de evidências não é removido pelo cleanup, observações locais sem novo achado. Nada executado.

## scripts/db-audit/talkx-campaign-transitions.test.sh

Leitura 1–123; SHA-256 `86d96e98c740af324eb667765e3575818d4af4bd2381508ddd1cd9a1026105d2`; Git blob `115cf06885ab415f7ccb5a8c36660e9e027f591d`.

Leitura integral123linhas. DockerPG17 com bootstrap retry e cleanup, tabelas mínimas e Vault stub; aplica RPC transição antiga e worker lease4args atual. Confere ACL authenticated negativa, start/replay sem alterar started_at, pause/cancel e recusas mensagem/audiência/completed. Apesar da mensagem final dizer serializes, chamadas são sequenciais; não testa concorrência nem cancel durante POST/recipient lease (DB014). Não monta schema completo de recipients. Nada executado.

## scripts/db-audit/talkx-engine-tick.test.sh

Leitura 1–352; SHA-256 `81d3448b0d2454d08b742d4e42e1a288d054cb189eaffab0180d8f598b772111`; Git blob `cc22278f4a737ba2a621499d561fc0a41667f1b6`.

Leitura integral352linhas. Aplica migration real tick e prerequisites sobre PG17 mínimo; Vault/net.http_post/cron.alter_job são stubs de tabela. Seed exerce reaper pós-dispatch→outcome_unknown+contador, completion drained, seleção antiga de1campanha por conexão,2continue+1scheduler com header/timeout, preservação job e ACL chamadas authenticated. Controle role-only verifica claim local do tick. Captura prova argumentos que seriam enviados, sem provar HTTP, cron real, secret gateway ou sequência de entrega; fixtures lease não incluem todas constraints finais. Nada executado e nenhum achado novo.

## scripts/db-audit/talkx-links-conversions.test.sh

Leitura 1–325; SHA-256 `c89762837bd9af291d7ab0a95437e8253d19efdd1824a1aa486efd8f3dfa70b8`; Git blob `dd7babd5b3ba4fc635e4cab611d38572fcc933f5`.

Leitura integral325linhas. DockerPG17 e migration X021 real aplicada duas vezes; fixture mínimo de links/cliques/conversões/roles, mutability guard explicitamente reduzido a status/current_user. Cenários papel/dono/leitura, slug/labels/url, campanha editável, conversão external_ref repetido/valor/link alheio, investimento completed e eventos. as_service_role só define claim e continua postgres, portanto não valida privilégio de executor service positivo; negação authenticated é explícita. Dedup cobre somente external_ref não nulo, não replay sem referência, e default de currency/occurred_at omitido não cobre null explícito da Edge. Mock de guard não prova integração com guard vencedor; recurso investimento sem UI confirmada. Nada executado.

## scripts/db-audit/talkx-regressoes-chain.test.sh

Leitura 1–421; SHA-256 `db1cb1f29276585f3661f5668a3de8b7139ffc6324218ba67275b9cc90299ebb`; Git blob `90c184953b6dec3489787fd82bbc73704c1f9aba`.

Leitura integral421linhas. Harness PG17 aplica lista explícita15migrations reais de sucessão draft/transition e fix duas vezes sobre schema mínimo; RED prova perda template_version/launched, GREEN insert/update/replay/conflito de versão e ator start. Helpers visibilidade/timezone e Vault são réplicas reduzidas. Declara cadeia completa apenas dessas funções e até esse ponto, não schema inteiro. Afirma preservar launched_at mas compara só IS NOT NULL409/417, não timestamp igual; bloco pause/cancel só executa pause416. Registrar limite de assertion na família governança, sem novo finding genérico. Nada executado.

## scripts/db-audit/talkx-update-limits-casts.test.sh

Leitura 1–190; SHA-256 `e232a9c7702f1209fc7e73e2dfeac579f76333d8cc8d8013f39a6e3036529f98`; Git blob `acb083600168273dfe92cee092f7557d00461b9c`.

Leitura integral190linhas. PG17 descartável com schema mínimo, aplica V09/V09c reais, repete V09c e instala seu guard. Exercita casts integer/time/overflow, boolean vazio e persistência válida como dono authenticated. Negativas verificam mensagem invalid_talkx_limits_values e ausência de mensagens brutas, mas psql sem VERBOSITY verbose não demonstra positivamente SQLSTATE22023 afirmado no texto final; sem claim de teste falhando. Não aplica hardening de papéis posterior nem todas triggers. Nada executado e nenhum achado novo.

## scripts/db-audit/talkx-update-limits-rpc.test.sh

Leitura 1–273; SHA-256 `7531a944e4234750f6e6ec0b23d0f563553d620e701f6dc45bea49374fe9a41e`; Git blob `c8e7dcfc2683d112c3068950221f9fd38e25250e`.

Leitura integral273linhas. PG17 mínimo, V09+X014 reais repetidas para idempotência; trigger real da migration e role helper em profiles reconstruído. Testa update direto negado, RPC atualiza limites/revision/evento before, novo psql nega update, stale revision, agente sem papel, min>max, whitelist e anonACL. Controle após RPC ocorre em conexão nova191, portanto não demonstra por si só restauração do hatch em mesma sessão/transação; claim no texto final maior que cenário. No schema final outros guards/restrições podem compor. Nada executado, nenhum achado novo.

