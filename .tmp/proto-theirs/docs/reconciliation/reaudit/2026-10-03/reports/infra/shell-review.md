# Leitura integral dos 12 scripts shell de contrato

Lote fechado: 12 arquivos/3.554 linhas no HEAD `da307ba5626dce892f0b37cb6762463f55d14a96`. Zero scripts, SQL, Docker, Deno, serviço, suíte ou probe executado. A leitura incluiu setup, SQL embutido, migrations selecionadas, branches/assertions, status de erro e cleanup. Credenciais nos fixtures são sintéticas; nenhum segredo real foi lido ou publicado.

As operações mutáveis desses scripts, quando executados, apontam para containers criados pelo próprio runner. Não foram confundidas com execução somente leitura nem com o cleanup de reações do E2E produtivo. Os controles positivos reais são preservados, assim como o limite de schema mínimo. Nenhum novo ID INF foi criado. Limites concretos de oráculo (pausa com item já inelegível, ACL PUBLIC não medido, psql permissivo/role ausente) foram encaminhados à família TC-011.

## scripts/db-audit/calls-telefonia-contract.test.sh

Faixa 1–373; SHA256 `c9a6e49def217142809123698aa5ccc77a1641312a1af1a299dbc31d8afee650`; blob `a1982fa70f7d983fed7c5a04edb6baa0629100a2`.

Docker com nome PID e cleanup restrito; readiness estável; set-Eeuo/ON_ERROR_STOP1. Schema/roles/policies mínimos, três migrations, asserts de escopo/raw RLS, filtro/paginação/KPI, dono, NULL profile/owner, notas, chamadas WhatsApp, grants e reaplicação.

expect_failure41–51 aceita qualquer erro, sem SQLSTATE; positivos e queries de estado reduzem o risco, mas não provam a causa de toda recusa. Reaplicação365 cobre a migration base, não as duas correções posteriores. Não certifica a cadeia completa nem o overload mais recente.

## scripts/db-audit/mapa-f1-address-contract.test.sh

Faixa 1–126; SHA256 `f02c1c695cf4e5701714c5381f9258100e10205c090cc278dc2579bbe986b801`; blob `980a69a0bbc8bcbd66aed4e680ed8514a20913f8`.

Container PID network none, mktemp/cleanup, readiness por log+SELECT, ON_ERROR_STOP1. Aplica migrations reais, mede assinatura/campo de endereço, trigger só em mudança, cleared e ausência de PII no audit.

ACL98–103 consulta grantees diretos e verifica anon ausente/authenticated presente, sem testar PUBLIC apesar do título; PUBLIC permitiria anon por herança. A função is_admin_or_supervisor da fixture sempre true: não prova escopo de agente.

## scripts/db-audit/multiplix-delivery-leases.test.sh

Faixa 1–743; SHA256 `ac3707ca66fdbf97753f7ecb8d79fe4933fac733a93f0eec3e27e74eb8883f06`; blob `461817346b9bfe24dc79d113e6c213e357406dc7`.

Container PID, retry apenas bootstrap, ON_ERROR_STOP1, migrations reais em fixture explícita auth/vault/cron/net. Verifica tokens distintos, reclaim e conflito do token antigo, cancel/timeout, ordem de três blocos, heartbeat, dead letters, optout, risco de conexão e atribuição linked/inferred com janela/contato.

Claims339–349 são sequenciais: não simulam corrida simultânea. F57.3 declara item pending, mas item1 foi reclaimado365 e permanece sending com lease90; recusa392 não isola pausa. O timeout claim422 ocorre após dispatch cancelled, também não isola só outcome_unknown. F59.4–5 mede gravação da supressão e lista imutável, não um envio real. Erros tolerados nos captures são em geral confrontados com valores/exceções específicos. positivos de outro item e token velho preservados.

## scripts/db-audit/talkx-campaign-worker-lease.test.sh

Faixa 1–330; SHA256 `26945f6a3f2a8579c884dda47ac58bf4636787ba3e76c59001f44dd21bec5c19`; blob `28d2c91d85445b0a12e7221a2f1f4e7506f47b65`.

Docker PID/cleanup, bootstrap até duas respostas estáveis, ON_ERROR_STOP1; expect_error exige nonzero+needle. ACL has_function_privilege, negativas42501, start idempotente, bloqueio worker direto, claim/renew/release, duas fixtures de fila (47/limite20 e subconjunto2), segredo só avaliado como não nulo.

Fixture mínima; leases sequenciais e expiração por UPDATE com escape GUC, sem concorrência real. Sorting313 reordena recipient_id na query externa, portanto não certifica a ordem original do set retornado; conjunto pequeno319 também reordena. Não leu segredo real.

## scripts/db-audit/talkx-lifecycle-events.test.sh

Faixa 1–195; SHA256 `5faa79d910550bc5aeaa7224647b48e935cfcd2f19e346f9e4febfcf99b315f5`; blob `88c1a10e71ddd3e274b0ecf460e04aafe936c30d`.

Docker PID e cleanup, retry bootstrap, ON_ERROR_STOP1. Fixture de perfis/campanhas/recipients/events; migration real. Transições reais+persistência de quatro eventos/ator/motivo, cancel5, no-complete cancelada, resumed_auto e complete com resumo.

Cabeçalho promete soltar leases, mas recipients são criados com leases NULL e não há assertion das colunas de lease. Conclusão usa UPDATE sent direto e contadores0, coerentes com resumo esperado; não prova contadores de envio reais.

## scripts/db-audit/talkx-overview-stats.test.sh

Faixa 1–423; SHA256 `6caf4c7aa6a36966353139e115b4e2b16b848b9f9cac55655ad65e4ad11ebb67`; blob `c8887e8e6db4f97d24a6bb993b9d22485c8dcc36`.

Docker PID/cleanup, fail-fast SQL. Registro CASES_SEEN exige todos13 casos após asserts. Fixture de políticas e roles, migration real+replay, eliminação de overload, has_function_privilege, números atuais/anteriores, dias/zero-fill/somas, dedup, filtros, canal, previous null e sessão agente/admin.

Escopo é schema/policies mínimos declarados, não cadeia completa. Fluxo muda dados só no container; maior parte numérica é como postgres, e o bloco RLS usa SET ROLE real. Não se executou nem confirmou resultado das13 medições nesta auditoria.

## scripts/db-audit/talkx-send-budget.test.sh

Faixa 1–253; SHA256 `ed3bf0fb60ec92b30d9161c42f4dd0c03372ba68adc237a4ee50af2782fce1fe`; blob `c96249c591a955feb158e823b42f2eabd5b3cce9`.

Docker PID/cleanup e retrybootstrap; ON_ERROR_STOP1. Cadeia explícita10migrations e schema mínimo. Assert objetos3, orçamento minuto/dia, soma Multiplix/TalkX por conexão, pace, clampfast e exceção específica de max_per_minute.

GUC role/sub sem SET ROLE nos casos: testa gates internos, não grants/RLS de um usuário autenticado. Orçamento lido sequencialmente, sem reserva concorrente; não substitui provas de envio. jqget definido181 não usado e sem ON_ERROR_STOP, sem consumidor ativo no script.

## scripts/db-audit/talkx-suppress-phone-axis.test.sh

Faixa 1–206; SHA256 `6b22e13ddeebb34e43d81a73caf5c551a25164923666aab80c11b18d614d04c8`; blob `a7223aa7d0fce61dc434c74fac2ccff6dc132236`.

Docker RANDOM+PID/cleanupvalidado, readiness por segundo marker, ON_ERROR_STOP1. Migrations phoneaxis+X029 reaplicadas, overload antigo eliminado, conflitos phone/contato retornam NULL, nova supressão UUID, has_function_privilege dos3roles.

Captures com ||true confrontam saída vazia/UUID; erros típicos não passam como sucesso vazio. Casos comportamentais usam postgres+GUC; ACL verificada separadamente. Não mede disputa simultânea nem serviço real.

## scripts/db-audit/talkx-transition-overload-postgrest.test.sh

Faixa 1–294; SHA256 `bfda297740566b20db21a02b727ec6ae685e08ad5f30c7c417977847fe6b7518`; blob `d0e345dc07d1bce4a9bd6e10922698e682f5eb1b`.

Docker PG+PostgREST+rede com nomes PID e cleanup restrito. SQL failfast, guard exige status+mensagem; reproduz2overloads, erro CHECK, aplica3migrations, NOTIFY schema, prepara JWT sintético HMAC e invoca testeDeno com falha propagada.

Se executado, faz pull de imagem/redeDocker e inicia serviços: não é script read-only. /tmp/talkx-transition-deno.log é caminho compartilhado, não isolado por PID; nota de robustez, sem corrida executada. ChamadaDeno/HTTP não ocorreu. Comentário de estado vigente é histórico do conjunto aplicado, não atestado de deployment.

## scripts/db-audit/talkx-v16-time-series.test.sh

Faixa 1–119; SHA256 `aa659a60f2f2b60c3de48f7fe6e065accb00302c4e3fdfacce0a0da49efdd399`; blob `3305ac8f65e62653051e5fc698a3ad96dc493527`.

Docker RANDOM/cleanupvalidado, readiness, fixture mínima; função antiga transcrita para RED3, migration real para GREEN5 e campo médio não nulo. Assert diferencia somas3/5 e mede resultado real se rodado.

psql helper9 usa ON_ERROR_STOP0; não prova aplicação integral sem erro, mesmo com ||fail na migration109. RED é cópia local da função antiga, não checkout histórico. Verifica presença de avg_reply_secs, não seu valor. Nenhuma execução.

## scripts/db-audit/talkx-v21-launch-flags.test.sh

Faixa 1–156; SHA256 `fd7df0f245f6a36ffe25525fec713b3fa5cb1e3f2d08f600d4cadf0e04637f69`; blob `305f5713485f5a1233dbb5709ddcb19399cb2e2a`.

Docker RANDOM/cleanupvalidado e readiness; fixture mínima, RED semcoluna, migration real, quatrocolunas/defaults, launched_by/at, erro específico adminonly e flags persistidas.

ON_ERROR_STOP0linha10 permite prosseguir em erros de arquivo. Fixture cria service_role/authenticated39–40, mas omite anon citado nos REVOKEs da migration114–115/369–370; assertions comportamentais não medem ACL. Captura save_out permissiva152 é seguida de checkreal true:true153–154, controle positivo preservado.

## scripts/db-audit/team-reaction-membership.test.sh

Faixa 1–336; SHA256 `1fe8efb02f1610e99db5d2f69893a2b7d1f20721c0e00350958f1e1c89a94457`; blob `b631998b263c5fcf87508427add1e3596436ade4`.

Docker PID e mktemp/cleanup, failfast ON_ERROR_STOP1, helpers de negativos com status+needle. SQL anterior transcrito com duas policies permissivas e NOTNULL; migration real aplicada entre A/B, reseed, ataques diretos/RPC, visibilidade vítima, bloqueios, controles legítimos e contagem/predicado final da policy.

Prova é sobre fixture de policies e migration escolhida; não inclui todas as RLS de tabelas vizinhas nem estado atual de plataforma. SQL de seed contém DELETE globais apenas no container recém-criado pelo script; não é cleanup de produto nem INF006. Não foi executado.

