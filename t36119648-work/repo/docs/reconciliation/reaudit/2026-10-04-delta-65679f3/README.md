# Reauditoria R3 — integridade da auditoria e delta de microfuncionalidades

Referência: **4 de outubro de 2026**, America/Sao_Paulo. Repositório: `adm01-debug/Zapp_Web_V2`. Publicação prevista no PR documental #1869, sem merge ou mudança funcional.

## Resultado desta continuação

**12 registros suplementares: 3 P1, 8 P2 e 1 P3.** São um defeito do validador reproduzido, oito contratos confirmados por fonte, dois riscos operacionais condicionais e uma lacuna de cobertura de estados. A prioridade é uma avaliação de engenharia, não prova de incidente em produção. Nenhuma correção do produto foi executada.

A rodada partiu do checkpoint salvo, em vez de reiniciar a auditoria. O R2 preserva 372 registros no pin anterior. Este adendo confronta a própria prova de integridade e acompanha o delta de seis commits e 23 arquivos; não transforma os 372 registros mais estes 12 em uma contagem de bugs independentes.

- Código R2: `da307ba5626dce892f0b37cb6762463f55d14a96`.
- Código congelado para esta revisão: `65679f38d400f7edc6a071f68554dd3b0372f03f`.
- Checkpoint documental lido: `dc2d19ee5bd018e1aebaf6c66211657218bc6b51`.

Os totais históricos de 5.166 registros, 62 fontes e 104 achados da primeira reconciliação, e os 372 registros R2, permanecem intactos. Os 217 probes canônicos descritos no R2 não foram todos repetidos nesta sessão.

## Achados priorizados

| ID | Prioridade | Natureza da evidência | Resumo |
|---|---|---|---|
| R3-GOV-001 | P2 | Execução original + fixtures | O validador histórico pode aprovar integridade incompleta do pacote |
| R3-TX-001 | P2 | Contrato confirmado por fonte | Retry em lote não verifica todos os IDs solicitados |
| R3-TX-002 | P2 | Contrato confirmado por fonte | Resolução de resultado desconhecido permite retry sem validar o estado da campanha |
| R3-OBS-001 | P1 | Contrato confirmado por fonte | Sinal outcome_unknown_24h é incompatível com o CHECK da tabela de alertas |
| R3-OBS-002 | P2 | Contrato confirmado por fonte | Cursor do log perde linhas quando created_at empata |
| R3-OBS-003 | P2 | Contrato confirmado por fonte | Ordinal do log não usa o contador devolvido pelo claim |
| R3-SEC-001 | P2 | Contrato confirmado por fonte | Helper de cron pode ser chamado diretamente sem o gate de papel da view |
| R3-DAT-001 | P1 | Contrato confirmado por fonte | Expurgo apaga metadados de Storage por SQL, sem provar remoção física |
| R3-DAT-002 | P1 | Risco operacional condicional | Falha do expurgo pode abortar o tick antes do envio e da avaliação de alertas |
| R3-DAT-003 | P2 | Risco de capacidade condicional | Lote limitado combinado com gate diário pode deixar retenção atrasar |
| R3-AUTO-001 | P2 | Contrato confirmado por fonte | IF do workflow de alertas espera array onde o HTTP Request entrega item |
| R3-UX-001 | P3 | Lacuna de cobertura | Matriz de Configurações demonstra erro, mas não um estado vazio útil |

## Provas efetivamente executadas

As quatro fontes usadas nas execuções foram copiadas sem alterações e conferidas por SHA-256 e Git blob. Ambiente observado: Python 3.13.5 e Node v22.16.0. O [resultado estruturado](RESULTS.json) preserva versões, pins, hashes e saídas.

| Grupo | Execução | Resultado e significado |
|---|---|---|
| Validador histórico original | 7 cenários sintéticos | Quatro situações de integridade defeituosa retornaram PASS; três controles distinguiram pacote válido, alteração e arquivo listado ausente. Resultado reproduzido não significa produto correto. |
| Sanitização de logs de deployment | 4 testes Node originais | 4 aprovados, 0 falhas; fetch interceptado pelo teste original, sem chamada à API real. Preservado o controle positivo do ID de deployment. |
| Verificador deste adendo | 9 testes próprios | 9 aprovados; rejeição de ausência, extra, duplicação, total inválido, adulteração, remoção e travessia, além de composição com pai sintético. |

| Cenário do validador antigo | Observado | Exigência de integridade |
|---|---|---|
| `complete_manifest` | PASS (6 hashes conferidos) | PASS |
| `missing_manifest` | PASS (0 hashes conferidos) | FAIL |
| `extra_unlisted_file` | PASS (6 hashes conferidos) | FAIL |
| `duplicate_manifest_entry` | PASS (7 hashes conferidos) | FAIL |
| `wrong_manifest_totals` | PASS (6 hashes conferidos) | FAIL |
| `tampered_listed_file` | FAIL (6 hashes conferidos) | FAIL |
| `missing_listed_file` | FAIL (5 hashes conferidos) | FAIL |

Não houve execução de migrations, PostgreSQL/PostgREST, Deno, n8n, React/DOM, remoção de Storage, disparo de mensagens, consulta ao banco de negócio ou operação de deploy. Os contraexemplos SQL abaixo são derivados de leitura; não são apresentados como testes PostgreSQL realizados.

## Análise por microfuncionalidade

### R3-GOV-001 — O validador histórico pode aprovar integridade incompleta do pacote

**P2 · Execução original + fixtures**

**Condição.** Executar validate_package.py em um pacote estruturalmente consistente, mas sem manifesto, com arquivo adicional sem hash, entrada duplicada ou totais incorretos.

**Constatação.** O manifesto é opcional. O laço confere somente as entradas presentes e não compara seu conjunto com os arquivos efetivos nem valida os totais declarados. O módulo original, com hash verificado, retornou PASS nas quatro situações defeituosas. Manifesto completo passou; alteração e remoção de arquivo listado falharam.

**Consequência.** Um PASS desse comando não basta, isoladamente, para concluir cobertura integral dos artefatos. Isso não demonstra corrupção do pacote R2 real nem invalida suas provas anteriores.

**Correção proposta.** Exigir manifesto, caminhos únicos, totais corretos e igualdade exata de conjuntos. O verificador deste adendo aplica essas regras e oferece composição explícita com o manifesto R2 fixado; o validador histórico e o CI não foram substituídos.

**Aceite necessário.** Os sete cenários registrados devem distinguir integridade válida de ausência, duplicação, adulteração e arquivo extra. A validação composta do pacote histórico completo deve ser executada em checkout disponível, separadamente dos testes sintéticos.

**Limite da prova.** Sete execuções reais do módulo original em fixtures sintéticas. Não foi revalidado localmente o pacote R2 completo de 71.377.271 bytes referenciados no manifesto.

**Fontes.** [docs/reconciliation/reproduce/validate_package.py](https://github.com/adm01-debug/Zapp_Web_V2/blob/dc2d19ee5bd018e1aebaf6c66211657218bc6b51/docs/reconciliation/reproduce/validate_package.py); [docs/reconciliation/evidence/ARTIFACT_MANIFEST.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/dc2d19ee5bd018e1aebaf6c66211657218bc6b51/docs/reconciliation/evidence/ARTIFACT_MANIFEST.json); [docs/reconciliation/reproduce/README.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/dc2d19ee5bd018e1aebaf6c66211657218bc6b51/docs/reconciliation/reproduce/README.md).

### R3-TX-001 — Retry em lote não verifica todos os IDs solicitados

**P2 · Contrato confirmado por fonte**

**Condição.** Admin/supervisor com perfil ativo solicita retry para campanha existente; parte ou todos os UUIDs informados não existem, ou o array contém NULL.

**Constatação.** A comparação v_found <> v_valid conta somente linhas encontradas, não os IDs pedidos. Todos ausentes produzem 0 = 0; uma mistura válida/ausente permite atualizar somente o subconjunto encontrado. Uma campanha completed pode ser reaberta e receber eventos mesmo com contagem zero. O limite usa apenas array_length(...,1), não a cardinalidade total.

**Consequência.** O contrato declarado de tudo-ou-nada não é atendido; a trilha pode registrar reabertura sem destinatário reencaminhado. No limite SQL, arrays multidimensionais também precisam ser considerados.

**Correção proposta.** Validar dimensão, cardinalidade, NULLs e política de duplicatas; confrontar IDs solicitados com todos os encontrados na campanha antes de qualquer mudança. Não reabrir campanha por uma operação vazia.

**Aceite necessário.** Testar UUID válido+inexistente, todos inexistentes, NULL, duplicatas, outra campanha, limite 500/501 e array multidimensional. Nos casos recusados, destinatários, contadores, estado e eventos permanecem inalterados.

**Limite da prova.** Leitura do SQL e contraexemplo lógico; PostgreSQL/PostgREST não executados nesta rodada. O caso multidimensional se refere ao contrato SQL, não a uma chamada HTTP demonstrada.

**Fontes.** [supabase/migrations/20261003222707_talkx_retry_resolve.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003222707_talkx_retry_resolve.sql); [scripts/db-audit/talkx-retry-resolve.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-retry-resolve.test.sh).

### R3-TX-002 — Resolução de resultado desconhecido permite retry sem validar o estado da campanha

**P2 · Contrato confirmado por fonte**

**Condição.** Destinatário outcome_unknown pertence a uma campanha cancelled; chamador autorizado confirma expressamente o risco de duplicidade e escolhe retry.

**Constatação.** A RPC valida o destinatário e a confirmação, mas não aplica a lista de estados de campanha aceita no retry em lote. O ramo retry passa o destinatário para pending e só reabre campanhas completed; cancelled permanece cancelled.

**Consequência.** A resolução pode deixar pendência que o motor não processará porque a campanha é terminal. Não foi demonstrado reenvio após cancelamento; o problema observado é a inconsistência de estado.

**Correção proposta.** Unificar as invariantes de retry entre as duas RPCs, sem impedir conciliação histórica mark_sent/mark_failed quando legítima. Documentar também se o teto de três retries do caminho em lote deve valer no ramo de resolução; não presumir essa decisão como já aprovada.

**Aceite necessário.** Cobrir retry em cancelled, sending, paused e completed; manter controles mark_sent/mark_failed. Recusa de retry em estado terminal não pode alterar destinatário, contadores ou eventos.

**Limite da prova.** Contrato estático da RPC. Estado real de campanhas, acesso pela UI e efeito de todas as triggers instaladas não foram testados.

**Fontes.** [supabase/migrations/20261003222707_talkx_retry_resolve.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003222707_talkx_retry_resolve.sql); [scripts/db-audit/talkx-retry-resolve.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-retry-resolve.test.sh).

### R3-OBS-001 — Sinal outcome_unknown_24h é incompatível com o CHECK da tabela de alertas

**P1 · Contrato confirmado por fonte**

**Condição.** Existe destinatário outcome_unknown atualizado na janela das últimas 24 horas, gerando sinal para uma campanha.

**Constatação.** talkx_engine_health emite outcome_unknown_24h; talkx_engine_alerts leva esse valor sem conversão ao INSERT. talkx_alerts_kind_check aceita outcome_unknown, não outcome_unknown_24h. ON CONFLICT DO NOTHING não transforma a violação de CHECK em sucesso. O tick captura a exceção dos alertas e a ignora.

**Consequência.** O cálculo de alertas pode deixar de abrir e resolver alertas na rodada, inclusive de outros tipos presentes no mesmo processamento. O envio não é interrompido por esse catch; a perda aqui é de observabilidade.

**Correção proposta.** Usar uma representação canônica consistente na geração, gravação e resolução dos alertas. Registrar falha de avaliação em vez de suprimi-la sem sinal observável.

**Aceite necessário.** Em PostgreSQL descartável, combinar um sinal outcome_unknown recente com outro tipo, provar abertura de ambos, deduplicação e resolução posterior. Injetar falha do avaliador e verificar o registro da degradação.

**Limite da prova.** Divergência literal confirmada no código SQL. Não foi observada nem provocada em produção; o harness PostgreSQL não foi executado aqui.

**Fontes.** [supabase/migrations/20261003242707_talkx_log_saude_alertas.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql); [scripts/db-audit/talkx-engine-health.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-engine-health.test.sh).

### R3-OBS-002 — Cursor do log perde linhas quando created_at empata

**P2 · Contrato confirmado por fonte**

**Condição.** Mais linhas compartilham o mesmo created_at do que cabem na página; cliente usa o último timestamp como p_after.

**Constatação.** A RPC ordena por created_at e id, mas filtra a próxima página somente por created_at > p_after. O id usado para desempatar a ordenação não integra o cursor.

**Consequência.** Linhas restantes com o mesmo timestamp ficam fora da próxima página. Inserções em lote tornam o empate plausível; um teste com uma única linha não cobre essa fronteira.

**Correção proposta.** Adotar cursor composto (created_at,id), com ordenação e comparação correspondentes; preservar compatibilidade de clientes conforme decisão explícita de contrato.

**Aceite necessário.** Inserir pelo menos três logs com o mesmo timestamp, paginar com limite dois e recuperar todos exatamente uma vez. Cobrir também timestamps diferentes e primeira página sem cursor.

**Limite da prova.** Contraexemplo de paginação derivado do SQL; não houve execução PostgreSQL nem medição de perda no ambiente do usuário.

**Fontes.** [supabase/migrations/20261003242707_talkx_log_saude_alertas.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql); [scripts/db-audit/talkx-engine-health.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-engine-health.test.sh); [supabase/functions/talkx-send/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/talkx-send/index.ts).

### R3-OBS-003 — Ordinal do log não usa o contador devolvido pelo claim

**P2 · Contrato confirmado por fonte**

**Condição.** attempt_count e delivery_attempt_count divergem, por exemplo após trajetórias de retry e aquisição de lease diferentes.

**Constatação.** runRecipient constrói recipientAttempt com recipient.attempt_count + 1 antes do processamento. claim_talkx_recipient incrementa e devolve delivery_attempt_count; processRecipient não devolve esse ordinal ao chamador para compor o log.

**Consequência.** A coluna attempt pode repetir ou representar um contador diferente da tentativa de claim. A divergência é de contrato; não foi demonstrado dano a envio nem incidência em produção.

**Correção proposta.** Definir precisamente a métrica attempt e propagar o ordinal autoritativo quando ela representar o claim. Distinguir no_claim de tentativa efetivamente adquirida, sem mudar silenciosamente o significado para consumidores.

**Aceite necessário.** Testar contadores inicialmente distintos, retry manual, reaproveitamento de lease e no_claim. Os logs devem refletir a semântica documentada, não apenas o caso inicial zero.

**Limite da prova.** Leitura dos dois contadores e das interfaces. Nenhum fluxo de retry foi executado em Deno/PostgreSQL nesta rodada.

**Fontes.** [supabase/functions/talkx-send/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/talkx-send/index.ts); [supabase/functions/talkx-send/process-recipient.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/talkx-send/process-recipient.ts); [supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003202707_talkx_counters_checklist_duplicate.sql); [supabase/functions/talkx-send/x033-delivery-log.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/talkx-send/x033-delivery-log.test.ts).

### R3-SEC-001 — Helper de cron pode ser chamado diretamente sem o gate de papel da view

**P2 · Contrato confirmado por fonte**

**Condição.** Migration aplicada, schema público exposto, chamador authenticated e owner da função com acesso ao cron.

**Constatação.** talkx_engine_cron_runs é SECURITY DEFINER e recebe GRANT EXECUTE para authenticated, mas não valida admin/supervisor. O filtro por papel existe no ramo cron da view, não no corpo do helper.

**Consequência.** Um chamador comum pode alcançar diretamente metadados de execução e return_message do job Talk X, conforme os privilégios do owner. Não há prova de exposição de segredo nem acesso a todos os jobs.

**Correção proposta.** Aplicar no helper o gate que o contrato exige, ou restringir EXECUTE e manter uma interface de leitura autorizada. Revisar helpers SECURITY DEFINER chamados por views, não apenas RLS da view.

**Aceite necessário.** Invocar a RPC diretamente como anon, agente comum, admin/supervisor e service_role em banco descartável. A autorização não pode depender de o cliente escolher consultar a view.

**Limite da prova.** Grants e corpo verificados em fonte; ACL, owner e exposição HTTP no banco vivo não foram inspecionados.

**Fontes.** [supabase/migrations/20261003242707_talkx_log_saude_alertas.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql); [scripts/db-audit/talkx-engine-health.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-engine-health.test.sh).

### R3-DAT-001 — Expurgo apaga metadados de Storage por SQL, sem provar remoção física

**P1 · Contrato confirmado por fonte**

**Condição.** Existem objetos elegíveis no bucket usado pelo expurgo e a rotina alcança o bloco de storage.objects.

**Constatação.** A rotina executa DELETE em storage.objects. O contrato oficial do Supabase separa esses metadados dos objetos físicos e exige remoção pela Storage API.

**Consequência.** Quando o DELETE é permitido, pode deixar arquivo físico órfão e inacessível sem realmente eliminá-lo. Se o ambiente bloquear a operação direta, o erro também deve ser tratado. Não foi afirmado que qualquer objeto real foi removido ou está órfão.

**Correção proposta.** Produzir uma fila durável de remoções por API, com rechecagem de referências, identidade do objeto, resultado e repetição segura. Separar a tarefa de remoção do ciclo crítico de envio.

**Aceite necessário.** Em armazenamento descartável, verificar a remoção física e dos metadados, falha transitória, objeto já ausente e referências ainda ativas. Não usar somente a contagem de DELETE do SQL como aceite.

**Limite da prova.** Fonte do projeto confrontada com documentação primária do Storage. Nenhuma operação de Storage foi executada.

**Fontes.** [supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql); [supabase/migrations/20261003242707_talkx_log_saude_alertas.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql); [scripts/db-audit/talkx-lgpd.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-lgpd.test.sh).

### R3-DAT-002 — Falha do expurgo pode abortar o tick antes do envio e da avaliação de alertas

**P1 · Risco operacional condicional**

**Condição.** purge_talkx_expired_data lança exceção durante o tick, por uma falha de SQL, metadados, privilégio ou outro erro persistente.

**Constatação.** A chamada do expurgo fica antes do restante do trabalho e fora do bloco que captura exceções de talkx_engine_alerts. Uma exceção não tratada impede os passos seguintes. A marca last_purge_at pertence à transação e não constitui um commit independente.

**Consequência.** O trabalho do tick não chega ao fan-out nessa execução; se a condição persistir, a falha pode repetir. A avaliação de alertas do próprio tick também não é alcançada. Isso difere do erro de enum, que é capturado e não interrompe o envio.

**Correção proposta.** Isolar manutenção do caminho crítico, mantendo uma política explícita de falha e sinal de degradação. Não simplesmente engolir erros nem declarar expurgo concluído após exceção.

**Aceite necessário.** Injetar erro no expurgo em ambiente descartável, conferir a política de continuidade/pausa escolhida, a observabilidade da falha e o estado transacional de last_purge_at. Não houve decisão de produto para ignorar expurgo.

**Limite da prova.** Risco condicional derivado da ordem e do tratamento de exceções. Não foi demonstrada interrupção do cron de produção.

**Fontes.** [supabase/migrations/20261003242707_talkx_log_saude_alertas.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql); [supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql); [scripts/db-audit/talkx-engine-health.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-engine-health.test.sh); [scripts/db-audit/talkx-lgpd.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-lgpd.test.sh).

### R3-DAT-003 — Lote limitado combinado com gate diário pode deixar retenção atrasar

**P2 · Risco de capacidade condicional**

**Condição.** O caminho padrão do tick recebe mais registros vencidos do que o limite por tabela, sem intervenção ou execução concorrente que altere o cenário.

**Constatação.** O tick usa p_limit=1000; a rotina processa um lote limitado e marca o dia como tratado. Nova chamada no mesmo dia retorna sem drenar o restante.

**Consequência.** No exemplo hipotético de 1.001 elegíveis, um fica para outra rodada diária. Se a entrada diária exceder a capacidade, o backlog pode crescer. Não há medição de volume nem conclusão jurídica sobre prazos de retenção.

**Correção proposta.** Manter progresso de drenagem e um orçamento de execução, separando fim de lote de fim do trabalho diário. Monitorar quantidade e idade do backlog; definir a política por tabela, inclusive o alcance sobre ai_jobs compartilhada.

**Aceite necessário.** Usar volume maior que o lote, repetir invocações e simular novas entradas. Demonstrar drenagem sem impedir envios, respeitando as referências ativas e a política de retenção aprovada.

**Limite da prova.** Capacidade do caminho padrão analisada por fonte; não é limite absoluto de toda chamada manual nem diagnóstico de backlog real.

**Fontes.** [supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql); [supabase/migrations/20261003242707_talkx_log_saude_alertas.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql); [scripts/db-audit/talkx-lgpd.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-lgpd.test.sh).

### R3-AUTO-001 — IF do workflow de alertas espera array onde o HTTP Request entrega item

**P2 · Contrato confirmado por fonte**

**Condição.** Template talkx-alerts importado em versão com o contrato HTTP Request 4.2/V3 examinado; GET devolve array JSON de alertas.

**Constatação.** O workflow testa $json.length. O HTTP Request V3 expande o array de resposta em itens, cada um com json igual a um objeto de alerta, sem a propriedade length esperada. O Code node agrega itens, mas está depois do IF.

**Consequência.** O teste não comprova que existem alertas e pode bloquear ou falhar o caminho de notificação. O arquivo está active:false e não foi comprovadamente implantado, portanto não se afirma falha de notificações em uso.

**Correção proposta.** Validar o formato de item no ponto de consumo, tratar respostas HTTP de erro separadamente e testar agregação antes de ativar. Conferir também a rota/token compatível com Evolution GO no ambiente escolhido.

**Aceite necessário.** Executar workflow isolado com zero, um e vários alertas, além de 401/500. Não chamar um erro de consulta de ausência de alerta; verificar somente destino interno autorizado e nenhum disparo real nesta auditoria.

**Limite da prova.** Contrato do artefato e do fonte upstream fixado, sem importação nem execução do n8n instalado pelo usuário.

**Fontes.** [docs/talkx/n8n/talkx-alerts.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/docs/talkx/n8n/talkx-alerts.json); [packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts](https://github.com/n8n-io/n8n/blob/e8b9821f4a9a7ee634d394ada7b695bdebfafa86/packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts).

### R3-UX-001 — Matriz de Configurações demonstra erro, mas não um estado vazio útil

**P3 · Lacuna de cobertura**

**Condição.** Consulta de configurações retorna lista vazia, ou o componente recebe ausência de dados sem loading/erro.

**Constatação.** O hook retorna data ?? []; lista vazia renderiza um container sem linhas. O ramo com boundary fixa isEmpty=false. Os dois testes novos simulam erro e verificam somente a apresentação de erro e ausência de loading/vazio.

**Consequência.** O comportamento de erro tem evidência legítima, mas ela não fecha uma matriz completa de estados. Falta diferenciar ausência de configurações de conteúdo efetivamente carregado.

**Correção proposta.** Definir o estado vazio da tela e estender os testes sem remover os controles de erro existentes. A decisão de UX não foi implementada nesta atualização.

**Aceite necessário.** Cobrir loading, erro com retry, [], dados válidos e refetch; validar conteúdo e ações realmente exibidos. Executar em React/DOM no ambiente de teste, sem inferir resultado a partir do nome da suíte.

**Limite da prova.** Leitura do componente, hook e testes. Não houve renderização React nem inspeção visual nesta rodada.

**Fontes.** [src/components/talkx/TalkXSettings.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/src/components/talkx/TalkXSettings.tsx); [src/components/talkx/__tests__/TalkXSettings.states.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/src/components/talkx/__tests__/TalkXSettings.states.test.tsx); [src/hooks/integrations/useTalkXSettings.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/src/hooks/integrations/useTalkXSettings.ts).

## Correções de interpretação e controles positivos

O erro `outcome_unknown_24h` afeta a avaliação de alertas; seu catch permite que o tick continue. Já a exceção do expurgo está fora desse catch e impede o trabalho posterior do tick. Esses impactos não foram misturados.

A busca encontrou novamente a ordem não especificada das variantes A/B e a divergência de horário comercial. Elas permanecem R2-API-020 e R2-API-010, sem nova contagem. A insuficiência de um teste não é automaticamente um defeito novo de produto: a família R2-GOV-003 já trata essa distinção.

Uma hipótese de deadlock foi recusada como conclusão: ordens inversas de lock não bastam, por si, quando cancelamento e resolução selecionam estados diferentes e não disputam a mesma linha no caminho normal. Qualquer hipótese restante exige cenário concorrente reproduzível.

A sanitização de logs ganhou uma correção verificável: os quatro testes originais passaram com os fontes exatos. A tela de Configurações também conserva um controle de erro legítimo. O gap está nos estados que esse controle não demonstra, não na inexistência de toda a melhoria.

Os harnesses SQL novos contêm verificações úteis em PostgreSQL descartável e foram lidos; não foram executados aqui. O workflow também contém um ensaio de cadeia completa em outra etapa. A existência dessas etapas não prova, sem execução e assertivas correspondentes, os contraexemplos de IDs ausentes, empate de cursor, kind incompatível, RPC direta e falha do expurgo.

## Cobertura sem fechar lacunas por contagem

O [inventário dos 23 arquivos](COVERAGE.json) separa revisão de fonte, leitura parcial, mero inventário/fragmento e imagem não inspecionada. Identificar um arquivo no diff não equivale a auditar seu comportamento.

| Nível desta rodada | Arquivos | Interpretação |
|---|---:|---|
| SOURCE_REVIEW | 12 | Contratos e trechos relevantes confrontados; não é cobertura de execução. |
| PARTIAL_SOURCE | 5 | Leitura delimitada e limites registrados. |
| INVENTORY_OR_SNIPPET | 5 | Ainda sem revisão semântica suficiente nesta rodada. |
| BINARY_NOT_VISUALLY_REVIEWED | 1 | PNG identificado, sem aceite visual. |

Não se declara que cada arquivo ou corpo do projeto inteiro foi novamente examinado nesta sessão. Os números R2 de 4.068 arquivos, 36.853 corpos JS/TS e 805 arquivos classificados como estruturais são referências do relatório anterior, não medições refeitas aqui; os 805 não devem ser convertidos automaticamente em 805 omissões sem considerar sua classe.

Permanecem explicitamente abertos: trechos parciais e arquivos apenas inventariados desta tabela, inspeção visual do PNG, conferência integral do pacote histórico no checkout, replay PostgreSQL das cadeias e aceites dos provedores/UI. A disponibilidade de Cartographer, Claude-Mem, Headroom ou da skill nativa Grill Me não foi presumida nem necessária para essas leituras. Seu planejamento documental continua distinto de instalação.

O main avançou durante a investigação para `18689fa07f72bdc61b7285ae4f6a6adb3f0e016c`, incluindo o PR #1875 do contador x-degraded. Essa alteração foi observada, mas não incorporada retroativamente ao pin 65679f3. Uma nova rodada precisa de um delta próprio; ela não muda as evidências fixadas aqui.

## Integridade: preservação do histórico e composição explícita

O manifesto histórico `../../evidence/ARTIFACT_MANIFEST.json` é mantido como snapshot R2: blob `5c58c0fca1690c70bd06c8bbd91d3dae17c00100`, com 759 entradas e 71.377.271 bytes declarados. Não foi reescrito, nem se afirma que ele passou a incluir os novos arquivos sozinho.

O [MANIFEST.json](MANIFEST.json) cobre exatamente os arquivos deste diretório, exceto ele próprio, cuja identidade fica presa à árvore Git. [verify_bundle.py](verify_bundle.py) exige manifesto, unicidade, totais, hashes e igualdade de conjuntos. A opção `--audit-root` confere também cada arquivo do manifesto R2 fixado e a união exata dos dois conjuntos. Alteração do manifesto pai ou arquivo extra exige reconciliação, não uma aprovação silenciosa.

**A validação composta dos 759 arquivos históricos reais não foi executada nesta sessão.** O modo composto recebeu teste com pai sintético; a validação dos arquivos locais novos é uma verificação separada. O verificador não certifica a semântica dos relatórios nem substitui os testes funcionais do ZAPP.

## Reprodução sem rede

Requisitos dos scripts deste adendo: Python 3.10+; Node 22+ para os quatro testes de logs. As fontes testadas são recusadas quando seus hashes diferem. Nada é buscado pela rede.

No diretório que contém este adendo:

```bash
python -B verify_bundle.py
python -B test_verify_bundle.py
python -B run_probes.py --sources ../original
```

No ZIP, `original/` fica ao lado de `audit-extension/`; a última linha pressupõe execução dentro de `audit-extension/`. Para usar objetos Git já disponíveis localmente, a alternativa é:

```bash
python -B run_probes.py --repo /caminho/do/checkout
```

Para conferir a composição com o pacote histórico completo, a partir deste diretório no checkout do PR:

```bash
python -B verify_bundle.py --audit-root ../..
```

Os scripts de reprodução imprimem resultados; as execuções do código original ocorrem em diretórios temporários. Não use a saída zero de um probe de reprodução para afirmar ausência de defeito: nos quatro casos AUD-REPRO, o resultado reproduzido é justamente o PASS incorreto do validador antigo.

## Ordem de correção proposta, ainda não executada

Primeiro, harmonizar o tipo de alerta, corrigir o contrato de remoção física e decidir o isolamento da manutenção do tick. Depois, alinhar invariantes de retry, autorização direta do helper, cursor e ordinal do log. Em seguida, validar o workflow interno, capacidade de drenagem e matriz de estados. Antes de encerrar qualquer item, exigir o contraexemplo correspondente falhando antes e passando depois, em ambiente descartável.

As referências primárias de PostgreSQL, Supabase Storage e os pins upstream utilizados estão em [SOURCES.json](SOURCES.json). Esta publicação encerra o registro desta rodada, não declara encerrada a auditoria de todo o produto.
