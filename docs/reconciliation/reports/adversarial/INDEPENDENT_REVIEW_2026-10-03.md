# Revisão adversarial independente — 03/10/2026

**Base imutável:** `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6` (`main`). Revisão documental e execução local isolada; nenhuma chamada de produção, envio de mensagem, alteração de GitHub ou alteração de banco.

## Resultado

Onze conclusões de código se sustentam após procurar implementações posteriores, caminhos alternativos e limitações dos testes. A falha de filtro `all` em Telefonia foi identificada nesta segunda revisão. Não se conclui que todos esses defeitos tenham sido observados em uma sessão atual de produção.

| ID | Conclusão que se sustenta | Evidência independente |
|---|---|---|
| ADV-DASH-01 | Última migração reintroduz UUID incorreto em `myActive`, join que multiplica contatos, escopo funcional mais amplo e janela de SLA inconsistente | Todas as 779 migrações examinadas por nome de função; comparação dos quatro corpos; contraexemplo relacional |
| ADV-MULT-01 | Composer cria destinatários e inicia envio sem materializar blocos/itens | Caminho React → hook → RPC de draft → worker; última definição de cada RPC |
| ADV-MULT-02 | Worker usa conclusão por destinatários depois de migrar o processamento para itens | Últimos RPCs de envio/conclusão e busca por propagação/trigger |
| ADV-MULT-03 | Texto e mídia do dispatch predominam sobre conteúdo dos blocos | Inspeção do worker e revisão do probe real com dependências isoladas |
| ADV-MULT-04 | HTTP 429 chega a `failed`, sem `reschedule_multiplix_item` | Controle de fluxo do worker, enum/RPC de conclusão e probe isolado |
| ADV-FILES-01 | `Encaminhar N` encaminha somente selecionados visíveis; pode não abrir nada | Filtro real e expressão exata: N=2 produz 2, 1 ou 0 itens conforme filtro |
| ADV-FILES-02 | Exclusão invalida lista e total da aba, mas não contagens por tipo | Chaves de cache, mutation e tratamento Realtime completos desse caminho |
| ADV-TEL-01 | Valores padrão `all` viram filtros literais que rejeitam chamadas válidas | Hook real capturado; única definição SQL; exemplo `voip/inbound` rejeitado |
| ADV-TEL-02 | Período muda cache, mas não muda os argumentos da consulta | Hook real executado com `7d`/`30d`: RPC idêntica, sem `p_from`/`p_to` |
| ADV-TEL-03 | Edge retorna áudio; hook espera JSON `{url}` e esconde player | Edge e hook reais; código oficial do SDK 2.117.2 decodifica áudio como texto |
| ADV-EMAIL-01 | Sync parcial HTTP 207 chega a toast de sucesso sem comunicar falhas | SDK oficial + wrapper real + callback real: `success:false` mostra sucesso |

## Método e reproduções

`reproduce_cross_module.mjs` executa os hooks `useMyCalls` e `useCallRecording`, o wrapper `callGmailFunction`, o callback de sucesso do sync e o filtro real de Arquivos com dependências em memória. A expressão `selectedItems` é extraída do arquivo, com assert de correspondência. A execução termina **PASS** e grava `cross-module-probes.json`, incluindo hashes SHA-256 dos 14 arquivos de origem.

O arquivo oficial `FunctionsClient.ts` foi obtido da tag `v2.117.2`, igual à resolução de `bun.lock`. Seu método `invoke` foi executado com transporte em memória: `audio/mpeg` 200 vira string; JSON 207 com `success:false` retorna `error:null`. As classes de erro e `resolveFetch` são injetadas; não há rede nessa execução. Origem: https://github.com/supabase/supabase-js/blob/v2.117.2/packages/core/functions-js/src/FunctionsClient.ts . O bruto e o código consultado acompanham os artefatos.

Dashboard é um **modelo relacional determinístico**, não execução de PostgreSQL. Não havia PostgreSQL local disponível; não foi instalado nem foi usada a produção para transformar uma inferência em suposta medição. Os testes não montam React nem substituem um ensaio de navegador.

```sh
node audit/adversarial/reproduce_cross_module.mjs
```

## ADV-DASH-01 — regressão de Dashboard confirmada com alcance limitado

A última definição de `dashboard_contact_counts` é `supabase/migrations/20260930400000_dashboard_contact_counts_filter_deleted_at.sql:13–67`. Ela corrige `deleted_at`, mas volta ao corpo original de setembro, conforme seu próprio comentário nas linhas 10–11. A versão intermediária `20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql:30–90` já continha as correções agora removidas.

1. **Identidade:** linha 55 compara `assigned_to` com `auth.uid()`. O corpo anterior, linha 78, traduzia para `get_profile_id_for_user(auth.uid())`. Quando UUID de perfil e UUID de usuário diferem, um contato próprio pode deixar de entrar em `myActive`: contraexemplo 0 contra 1.
2. **Multiplicação por SLA:** linhas 32–49 ligam `conversation_sla` diretamente a contatos, e contam as linhas do join. A versão anterior usava `DISTINCT ON (contact_id)`. Um contato com dois SLAs respondidos no mesmo dia gera `inService=2`, embora `total=1`.
3. **O índice não refuta o cenário:** `20260903225000_sla_first_response_v2.sql:13–15` é único apenas onde `first_response_at IS NULL`. Dois SLAs já respondidos podem pertencer ao mesmo contato. A tabela correta é **`conversation_sla`**.
4. **Janela temporal:** a nova linha 35 ignora `p_since`/`p_until` para SLA e usa meia-noite da sessão. A antiga linha 56 fixava America/Sao_Paulo e a linha 57 aplicava o limite superior. Se a sessão for UTC, o início do dia é 00:00Z em vez de 03:00Z no exemplo de 03/10. Não foi medido o fuso atual da sessão de produção.
5. **Escopo funcional:** o CTE `effective` anterior impunha perfil próprio para não staff e ignorava `p_agent` estrangeiro. A nova linha 27 aceita diretamente o parâmetro e, quando nulo, não impõe essa restrição adicional. O impacto depende das linhas que RLS já permite visualizar.

**Refutações importantes:** ambos os corpos usam a modalidade padrão `SECURITY INVOKER`; não é correto afirmar que essa troca demonstrou bypass de RLS. `CREATE OR REPLACE` preserva ownership e permissões: não há prova de reabertura para `anon` ou `PUBLIC`. Já os demais atributos assumem os valores declarados ou implícitos, de modo que a ausência do `SET search_path` remove a fixação anterior. Documentação primária: https://www.postgresql.org/docs/current/sql-createfunction.html . O ponto comprovado é regressão do contrato funcional, com hardening de `search_path` perdido; exploração externa não foi demonstrada.

O consumo é real no código: `src/hooks/dashboard/useDashboardStats.ts` envia `p_since`, `p_until`, `p_queue`, `p_agent`; `src/hooks/analytics/useDashboardData.ts` usa totais e filas. A presença de hash no manifesto ou registro no ledger não substitui leitura atual do corpo efetivo da função.

## ADV-MULT-01/02 — criação e conclusão não acompanham a fila por item

`MultiplixView.tsx:342` monta o Composer. `MultiplixComposerDialog.tsx:45–60` chama `useCreateMultiplixDispatch`. Em `src/hooks/integrations/useMultiplixDispatches.ts:254–305`, o hook cria draft e, para envio imediato, invoca `multiplix-send/start` (linha 289). Não chama a confirmação que cria itens.

A última `multiplix_create_draft` está em `20261001211230_f31_multiplix_dispatch_recipient_columns.sql:95–258`: linhas 227–246 inserem dispatch e destinatários, sem blocos ou delivery items. A última transição F59 (`20261002521230_f59_transition_dispatch_enum_cast.sql:34`) também não os materializa. O worker consulta somente `list_multiplix_claimable_items` em `multiplix-send/index.ts:366–378`. A última lista F55 (`20261002621230_f55_claimable_items_por_bloco.sql:34`) exige a fila por item e blocos relacionados.

A confirmação F51c (`20261002461230_f51c_multiplix_confirm_dispatch_contrato.sql:149–154,197–215`) exige blocos e cria o produto destinatários × blocos. Isso confirma que há um caminho implementado de materialização, mas ele não integra o Composer examinado. No fluxo de draft com destinatários pendentes e sem itens, o worker não encontra trabalho.

Ao concluir, o worker chama o RPC antigo `complete_multiplix_dispatch_if_drained` na linha 766. Sua última definição (`20260929600000_multiplix_send_engine_fixes.sql:90–142`) aguarda destinatários. O novo `record_multiplix_item_sent` (`20261001231230_f32b_multiplix_item_queue_rpcs.sql:247–305`) atualiza item e contador, sem avançar status do destinatário. O novo `complete_multiplix_dispatch_if_items_drained` existe nas linhas 588–643; o antigo está explicitamente depreciado nas linhas 677–678. Não foi encontrado trigger posterior que propagasse sucesso de item para status terminal de destinatário.

**Refutações:** a última F59 já corrige casts de enum e cancela tanto destinatários quanto itens; defeitos de versões anteriores nesses pontos não são atuais. A revisão dos mocks do agente também impede uma conclusão enganosa: `index.test.ts:255–278` fabrica itens a partir dos destinatários, e o caso padrão da RPC retorna `data:true`. Portanto o `completed:true` do probe do worker **não demonstra** drenagem correta em SQL. Os achados de materialização e conclusão vêm da cadeia real de funções SQL, não desse retorno simulado.

## ADV-MULT-03/04 — payload e retry do worker

O worker carrega `block.content` em `multiplix-send/index.ts:388–401`, mas calcula texto a partir de `dispatch.message_template` em 463–494. A mídia vem de `dispatch.media_url`/`media_type`; o conteúdo do bloco participa do nome de arquivo em 601. O probe do agente (`audit/modules/talkx_multiplix/offline_probe_results.json`) envia **GLOBAL Empresa 1** quando o texto do bloco é **BLOCO CORRETO Empresa 1**. Seu código foi revisto independentemente: executa o worker real, injetando transporte, banco, relógio e autenticação. A mesma execução mostra que o resultado `missing` de personalização não impede o envio de `Ola ` quando `empresa` falta. Esses probes não cobrem mídia nem todo contrato de variáveis.

HTTP 429 entra no ramo 655–669, que grava `p_status:'failed'`, mesmo quando `providerErrorInfo` o classifica como transitório. `reschedule_multiplix_item` só é usado no catch anterior ao POST (705–721). A última `complete_multiplix_item` (F32b:314–361) persiste o status recebido; a lista F55 aceita `pending`/`failed_transient`, não `failed`. O probe confirma zero chamadas de reschedule. Não confundir com falhas ≥500: elas seguem a proteção de resultado desconhecido; o achado é o tratamento de 429.

## ADV-FILES-01/02 — seleção e contagens

`src/components/inbox/tabs/FilesTab.tsx:111–117` produz a coleção filtrada. `selectedItems` em **167–170** filtra essa coleção pelos IDs selecionados; a barra usa o total de IDs em **263–273**. Essas são as linhas da base 2e7cf81; relatos anteriores que citavam 177/279 devem usar a referência corrigida. `FilesSelectionBar.tsx:98–103` exibe `Encaminhar N`. O hook `useFilesSelection` mantém IDs fora do filtro, logo não há reset oculto que elimine a discrepância.

Fixture: imagem + PDF selecionados. Sem filtro, envia 2; filtro imagem, envia 1 enquanto exibe 2; filtro vídeo, envia 0 e `openForward` retorna imediatamente em `FilesTab.tsx:181–185`. Preservar seleção entre filtros é deliberado; o problema está em comunicar total e preparar outro conjunto para envio.

Em `src/hooks/chat/useFilesActions.ts:42–55`, apagar mensagem invalida `contactMediaKey` e `conversationTabCountsKey`. A contagem dos chips usa a terceira chave `contactMediaCountsKey` (`useContactMediaCounts.ts:27–28,45–82`) e consultas próprias. `useMessages.ts` invalida as três no INSERT de mídia, mas seus ramos UPDATE/DELETE não fazem essa atualização. O `staleTime:30000` não é um temporizador de refetch; o singleton desliga refetch em foco e remontagem (`src/lib/queryClient.ts:16–21`). A divergência pode persistir até outro evento que efetivamente revalide a chave, como reconexão, nova inserção ou refetch explícito. Não é correto prometer correção automática após 30 segundos, nem afirmar que jamais atualizará.

## ADV-TEL-01/02/03 — filtros e gravação

`src/hooks/calls/useTelefoniaFilters.ts:16–24` define `all` para canal, direção e resultado. `TelefoniaView.tsx:111–120` passa esses valores ao hook. `useMyCalls.ts:46–54` os envia sem normalizar. A única definição de `search_my_calls` (`20260926800000_calls_telefonia_v2.sql:123–200`) só considera NULL como ausência de filtro; compara canal/direção literalmente nas linhas 183–184 e trata resultados específicos em 187+. Uma chamada válida `voip/inbound` é rejeitada quando recebe `all`. Isso pode zerar a tela padrão mesmo existindo histórico autorizado. O comentário de intenção e mocks de tabela não substituem a correspondência desses argumentos.

`period` aparece apenas no destructuring/cache em `useMyCalls.ts:36–39`; os limites `p_from`/`p_to` não são enviados. No probe, `7d` e `30d` geram os mesmos argumentos. A SQL aceita os limites e aplica ambos nas linhas 185–186; não há tradução do texto de período escondida nessa função. O achado diz respeito ao histórico: não generalizar automaticamente para todos os KPIs.

Para gravação, `useCallRecording.ts:37–40` espera `data.url`; `get-call-recording/index.ts:95–103` entrega diretamente o corpo de áudio. O SDK 2.117.2 decodifica `audio/mpeg` como string (`FunctionsClient.ts:302–326`), confirmada pelo probe. `RecordingPlayer.tsx:16–18` retorna `null` quando URL está ausente. Mesmo um 200 de áudio válido não satisfaz o contrato atual do hook. A análise não afirma que existam gravações disponíveis em produção; prova a incompatibilidade quando esse cenário ocorre.

## ADV-EMAIL-01 — sync parcial aparece como sucesso

`supabase/functions/gmail-sync/index.ts:84–88` responde 207 e `success:false` em sucesso parcial. O código oficial do SDK mantém `error:null` para esse 2xx e decodifica o JSON. `src/hooks/gmail/gmailApi.ts:19–31` só lança quando `response.error` existe. O `onSuccess` de `src/hooks/integrations/useGmail.ts:182–185` comunica `${data.synced} emails sincronizados` sem falhas. O callback real executado com 2 sincronizados/1 falha produz **2 emails sincronizados**. O sync parcial tem trabalho concluído; o defeito é omitir a condição parcial, não afirmar que nenhuma mensagem foi sincronizada.

## Revisão de alegações históricas e ações decorrentes

As issues #1265/#1266/#1267 permanecem abertas, mas suas correções estão nas PRs mergeadas #1309/#1313/#1314 e em migrações posteriores presentes no main. Não converter a issue aberta em implementação ausente. A última definição dos guards Multiplix de #1267 ainda rejeita claim nula para sessão authenticated; o bypass legítimo de outros papéis não é o mesmo bug. Atestação viva atual continua separada.

O log vivo já coletado em `audit/prs/job-111299332677-logs.raw.json`, 03/10 21:42Z, compara 779 arquivos com 781 registros e só enumera extras `20261003182707`/`20261003192707`. As linhas 541–558 de `scripts/db-audit/check-migration-drift.mjs` comparam conjuntos completos. A ausência de outras versões no grupo sem registro sustenta presença por diferença integral, mas não constitui nova leitura individual de seus corpos. Isso evita repetir como atual a ausência de apply de PRs antigas quando o log posterior já mudou.

Próximas correções devem preservar o filtro de soft delete do Dashboard, integrar materialização/conclusão por item no Multiplix, alinhar a coleção anunciada ao encaminhamento de Arquivos, invalidar a contagem correta e ajustar os contratos de Telefonia/Gmail. Nenhuma dessas correções foi aplicada por esta frente: o objetivo aqui era adjudicar a evidência sem alterar o produto.

## Artefatos

- `cross-module-probes.json`: resultados, limites e hashes de origem.
- `reproduce_cross_module.mjs`: execução reprodutível isolada.
- `function-definition-history.json`: todas as definições encontradas nas 779 migrações para nove RPCs analisadas.
- `supabase-functions-client-2.117.2.raw.json` e `.ts`: fonte oficial do SDK correspondente ao lockfile.
- `findings.json`: onze conclusões normalizadas, prova e refutações.
- `source-evidence.json`: trechos de código numerados e SHA-256 para conferência.

