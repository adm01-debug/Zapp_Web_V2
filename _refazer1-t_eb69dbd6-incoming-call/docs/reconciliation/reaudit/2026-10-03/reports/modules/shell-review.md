# Leitura de scripts shell — módulos

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`. Lote de 13 arquivos / 3.608 linhas concluído. Hashes SHA-256, blobs Git e faixas 1–EOF conferidos. Nenhum script, Docker, SQL ou serviço foi executado.

Leitura adicional: pg-cron-concorrencia.py, 1–85. Confirma cálculo de uma fase, sem comparação entre antes e depois.

## scripts/db-audit/conversation-analyses-authorization.test.sh

Faixa 1–310; blob `976c95d60c7c8d102be4f5dd8353cd6a8290a2e4`.

Harness PG17 com migration real fixa, estado anterior/semente reconstruídos, negações com erro esperado e contagens persistidas, controles de agente próprio/admin/service e revalidação de SELECT.

Não executado. Predicados de visibilidade são reconstruídos no fixture; get_visible_agent_ids só retorna perfil próprio. Não aplica cadeia inteira nem testa fila com membership; gravação de serviço não chama Edge. Imagem por tag, cleanup por nome com PID e sem rótulo de ownership.

set -Eeuo pipefail, ON_ERROR_STOP; expect_error exige status não zero e mensagem; readiness em duas consultas e trap remove container/temporário.

## scripts/db-audit/enqueue-connection-scope.test.sh

Faixa 1–391; blob `6dc7e1dc6f1a646212145a90b2bfc0a621aa2fef`.

Migration real aplicada após reprodução do estado anterior. Verifica recusa por escopo, ausência de mensagem após recusa, conexão sem fila/atribuída e send_messages; total final quatro mensagens.

Não executado. Visibilidade de contato é stub SELECT true. Controle B3 usa contato já atribuído à mesma conexão, logo não isola membership; ADM também pertence à fila e usa contato atribuído, portanto B4 não isola override de admin. Não prova fallback concorrente ou matriz completa atual.

set -Eeuo pipefail, ON_ERROR_STOP; helpers exigem erro/valor, container PID e temporário removidos por trap.

## scripts/db-audit/pg-cron-escalonamento.test.sh

Faixa 1–120; blob `0136d8bbee837cd35670ce179fbe98008fa14ea5`.

Aplica migration fornecida, verifica nove valores de schedule, preserva três jobs por minuto, reaplicação e rollback textual completos, além de mensagem para job ausente.

Não executado. cron.job/alter_job são simulados em PG; não instala pg_cron. TMPDIR não é inicializado no script, e linha 91 com set -u depende de ambiente; arquivo jobs-medir.txt é fixo e não removido. A contagem de nove schedules não mapeia job a schedule, ESPERADO fica sem uso. Etapa C só confere retorno do helper, não redução numérica entre antes/depois.

set -euo pipefail e FALHAS final; Docker por PID com remoção antecipada; trap só container. Args exigem caminho de migration, tag de imagem alterável.

## scripts/db-audit/public-api-disable.test.sh

Faixa 1–80; blob `39046c022f52d96661226e7027b79af63b89ba87`.

Aplica migration real de retirada de token, preserva outra configuração, exige constraint validada, nega reinserção e reaplica para idempotência.

Não executado. Tabela mínima isolada e acesso como postgres; verifica migration/constraint, não kill switch HTTP ou cadeia completa. Imagem por tag e cleanup pelo nome PID.

set -Eeuo pipefail, ON_ERROR_STOP, espera readiness, falha de reinserção exige status e constraint específicos, trap remove container.

## scripts/db-audit/talk-me-client-privileges.test.sh

Faixa 1–260; blob `7b61e7ca9fcb1e58d0c492387dfe05044db2c698`.

Aplica migration duas vezes e verifica ACLs/RLS/trigger attachments, sessão authenticator com JWTs coerentes/incoerentes, recusa a perfil inativo e permissões de fila, autoatribuição, admin, serviço e auditoria append-only.

Não executado. Schema parcial e policy contacts_authenticated_all tornam testes específicos dos guards/ACL, não prova completa da RLS real. Helpers de perfil/admin reconstruídos. has_table_privilege com lista SELECT,INSERT em A6 aceita algum dos privilégios, mas B14 exerce INSERT e outros checks cobrem parte do restante.

set -Eeuo pipefail, ON_ERROR_STOP, helpers de erro/valor, três readiness consecutivos, tmp_dir sob prefixo verificado e trap do container PID.

## scripts/db-audit/talkx-counters-integrity.test.sh

Faixa 1–470; blob `67417a4a8223211aa78ae8a7c4553479723a7529`.

X026 é localizada por marcador e aplicada ao fixture; mede skipped_count/status, incremento único, conteúdo do duplicado, exclusão, ator do checklist e restrição de eventos; reaplica policy.

Não executado. Admin é stub true, trigger de use_count é copiado no fixture, não importado. Guards de contagem definem JWT mas permanecem como postgres (307–325), portanto não provam ACL de authenticated. Alguns asserts usam substring de número único (298/463) em saída permissiva; contagens exatas posteriores são controles mais fortes. Não compõe migrations posteriores.

set -euo pipefail e setup ON_ERROR_STOP=1; psql_raw/script usam ON_ERROR_STOP=0 e ||true, exigindo cuidado com assertions textuais. Container aleatório por tag e trap; fallback de migration local explicitado.

## scripts/db-audit/talkx-current-template-version.test.sh

Faixa 1–618; blob `24b121c82eac10856b648238552aea8ca37150bd`.

Harness modela applier SECURITY DEFINER com owner não superuser, guard/history, backfill, ponteiro vivo, duas edições, FK e bloqueio de SET NULL. Cria cinco mutações em cópias, exige mudança textual e morte pelo motivo esperado.

Não executado. Fixture omite set_talkx_template_updated_at/trigger de timestamp vigente; por isso não reproduz T≠S de R2-DB-013. Owner da tabela e helpers são reconstruídos, RLS completa ausente. Guard_n396 só conta presença, não tgenabled, embora o fixture o crie ativo. Não atesta produção pela simulação.

set -Eeuo pipefail; aplicação strict via função; psql_test permissivo tem saídas verificadas. Casos em containers separados; array de nomes registrados após docker run; temporários mktemp sob prefixo e cleanup validado.

## scripts/db-audit/talkx-delivery-leases.test.sh

Faixa 1–223; blob `6fa06ae5f531ca26d25ca964cd5bfa150d8c720b`.

Aplica seis migrations reais e exerce claims, recusa authenticated, tokens obsoletos, ACK duplicado, recibo repetido, recuperação antes/depois do dispatch, supressão tardia e conclusão/quarentena com contadores exatos.

Não executado. Operações de workers são sequenciais, não corridas concorrentes reais. Schema mínimo e auth.role simplificado; só cadeia de setembro indicada, não todas as redefinições atuais. Provider POST não é chamado.

set -euo pipefail, ON_ERROR_STOP; readiness com duas consultas e até três reinícios apenas no setup. Erros esperados via texto específico; cleanup por nome PID com EXIT e remoção antecipada.

## scripts/db-audit/talkx-escape-hatch-auth.test.sh

Faixa 1–187; blob `d8a5b91dd295a3dc844e43baec2d3778960d1f69`.

Aplica/reaplica V09d, conecta trigger e verifica não dono recusado, dono/admin autorizados com GUC e RPC do dono preservada com valores persistidos.

Não executado. Perfil usa coluna role do fixture e helper próprio; não aplica X014/políticas/trigger final, logo autorização histórica de dono agente não prova estado atual. GUC é setado de propósito para isolar guard; RLS completa fora do escopo.

set -Eeuo pipefail, ON_ERROR_STOP, recusa exige mensagem; setup e sucesso estritos, cleanup container random/PID.

## scripts/db-audit/talkx-message-snapshot.test.sh

Faixa 1–84; blob `c5138fe7bf2adf8f256af96923a53fce99e46cbc`.

Migration real de snapshot; compara conteúdo/mídia/variante, confirma retry imutável e nega authenticated, mídia sem tipo e token diferente.

Não executado. Schema mínimo e chamadas sequenciais; não verifica worker, variante escolhida no cliente, expiração de lease nem cadeia posterior.

set -euo pipefail e ON_ERROR_STOP; retry somente bootstrap, duas consultas readiness, erros específicos e cleanup por nome PID.

## scripts/db-audit/talkx-role-gates.test.sh

Faixa 1–357; blob `0d2538474cb3c4b66535c32dcac40f226e465edc`.

Migration X014 aplicada duas vezes; nega agente nas três RPCs, permite admin/supervisor, verifica revisões, ACL e agendamento via trigger com RLS desligada depois religada, além de status persistido.

Não executado. Helpers de visibilidade/timezone e schema são mínimos. Blacklist/clicks e parte das policies são confirmados por expressão textual no catálogo, não por operações adversariais. Não aplica redefinições posteriores nem testa cada privilégio operativo.

set -euo pipefail e ON_ERROR_STOP; erros exigem status não zero e mensagem, readiness em duas consultas com retry do container e trap EXIT.

## scripts/db-audit/talkx-update-limits-22009.test.sh

Faixa 1–175; blob `e6f533c32795f6766443a114921775e7a66b41c8`.

Aplica V09/V09c/V09e e reaplica fix; offsets inválidos devem produzir mensagem normalizada, offset válido persiste 10h e atualização seguinte usa revisão 2.

Não executado. rpc permissivo captura mensagem; não ativa VERBOSITY verbose nem captura SQLSTATE 22023 diretamente. Não cria trigger de mutabilidade no fixture e não aplica gates posteriores; escopo é conversão de valores histórica, não autorização atual.

set -Eeuo pipefail, setup/controle positivo ON_ERROR_STOP; erros esperados verificam texto e ausência do erro cru. Container random/PID e trap.

## scripts/db-audit/team-chat-rpc-ambiguity.test.sh

Faixa 1–333; blob `721296459a8f713f206cada8ef2d042895b925a9`.

Reproduz ambiguidade de vínculo/cursor e recursão da policy em etapas distintas, aplica migration real e testa valores, ordem/limite/join, não membro, sem JWT, isolamento e contrato de retorno.

Não executado. Schema/predicados anteriores reconstruídos; mensagens têm timestamps distintos, não testa empate de keyset, cursor alheio/inexistente ou redefinições posteriores. Não representa três RPCs diferentes: o foco é get_team_messages_page e policy de membros.

set -Eeuo pipefail e ON_ERROR_STOP; erros com status e mensagem esperados, contagens exatas como usuário; mktemp e trap removem fixture/container PID.
