# Reauditoria de módulos complementares — rodada 2

**Fonte fixa:** `da307ba5626dce892f0b37cb6762463f55d14a96`. **Resultado:** 64 achados confirmados por contrato estático, dos quais 14 também reproduzidos por callbacks isolados; 1 candidato adiado. Nenhum desses números representa incidente observado em produção.

A fonte permaneceu intocada. Foram executados somente probes locais com dados sintéticos, mocks e trechos de código copiados em memória. A confirmação das definições SQL vencedoras foi cruzada com o agente de banco. Não houve banco, envio, ligação, acesso a segredos ou alteração de aplicação.

## Resultado e prioridades

Os riscos de maior impacto concentram-se em perda ou troca de dados: edição de automações reutiliza o draft de outro registro e descarta configurações; notas de chamadas podem ser salvas em outro ID; o catálogo classifica uma falha integral como parcial/sucesso; respostas tardias de variantes podem atingir outro template; e reabrir um draft Talk X de audiência manual grande pode acionar autosave com apenas a primeira página de destinatários.

A passagem final de Talk X examinou os consumidores de Overview, Analytics, LiveMonitor, Running, Scheduled, Segmentos e Supressão, além dos hooks centrais e do editor. Ela revelou divergências entre dados e rótulos, ausência de recuperação de erro, objetos selecionados obsoletos e transições assíncronas. A Agenda tem um problema de completude distinto do agendamento pelo Composer. O limite NPS já documentado foi confirmado como duplicata, sem aumentar a contagem de achados novos.

| Severidade | Quantidade |
|---|---:|
| P1 | 6 |
| P2 | 52 |
| P3 | 6 |

| Relação com auditoria anterior | Quantidade |
|---|---:|
| EXTENSION_OF_PRIOR | 8 |
| NEW_DISCOVERY | 56 |

“Nova descoberta” significa causa/efeito não identificado nos 104 achados usados na comparação. Não significa código novo, regressão recente ou prova de que o auditor anterior jamais leu o arquivo. Extensões preservam o ID anterior e acrescentam um consumidor, precondição ou efeito que não estava explicitado.

## Cobertura e limites

O inventário delimitado contém 474 arquivos: 295 com leitura integral, 18 com leitura dirigida e 161 somente inventariados. Foram lidas 51941 linhas únicas em 313 arquivos. Cada caminho, blob SHA, faixa e lacuna está em `coverage.json`. A categoria structural significa apenas inventário, sem revisão semântica.

Os diretórios src/components/talkx, src/hooks/analytics e src/components/dashboard foram lidos integralmente, incluindo seus testes: 165 arquivos e 24.311 linhas. A revisão continua nos saldos de catálogo, Tasks, Chatbot e automações. Bibliotecas e outros arquivos marcados structural ainda possuem somente inventário neste relatório; a união dos revisores é consolidada por root. Não é declarada cobertura integral do frontend nem execução de suas integrações.

### Arquivos parcialmente lidos

| Caminho | Faixas sem leitura semântica |
|---|---|
| `src/components/catalog/__tests__/CatalogRail.test.tsx` | 1–195, 241–365 |
| `src/components/catalog/__tests__/ExternalProductManagement.test.tsx` | 1–554, 611–638 |
| `src/components/catalog/catalogShared.tsx` | 1–779 |
| `src/components/inbox/ChatPanel.tsx` | 1–84, 176–284 |
| `src/components/inbox/RealtimeInboxView.tsx` | 1–284, 326–376 |
| `src/components/inbox/chat/useChatInputLogic.ts` | 1–49 |
| `src/components/layout/Sidebar.tsx` | 1–115, 146–258 |
| `src/components/settings/MediaLibraryAdmin.tsx` | 1–44, 65–155 |
| `src/components/voice/ElevenLabsDialogue.tsx` | 111–165 |
| `src/hooks/communication/useCalls.ts` | 1–64, 211–241 |
| `src/pages/Index.tsx` | 1–103, 150–196 |
| `src/pages/ViewRouter.tsx` | 211–258 |
| `supabase/migrations/20251224024453_84e90b51-3f9f-47f9-a4be-44831f2f5bd8.sql` | 21–46 |
| `supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql` | 1–41, 60–166 |
| `supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql` | 112–235 |
| `supabase/migrations/20261002391230_talkx_audience_rpc.sql` | 1–74, 111–478 |
| `supabase/migrations/20261002421230_talkx_audience_snapshot.sql` | 1–399, 489–657 |
| `supabase/migrations/20261002551230_talkx_limits_ritmo.sql` | 1–314, 352–369, 451–491, 546–747 |

## Provas isoladas e qualidade dos testes

`offline_probes.cjs` transpila trechos originais com TypeScript já disponível no workspace. Para os casos de estado, usa um driver mínimo e determinístico de hooks. O resultado está em `proofs.json`; não se alegam testes do React real ou do navegador. A simulação de resposta de criação perdida é explicitamente uma precondição artificial do caso Multiplix.

| Achado | Resultado observado no probe |
|---|---|
| R2-MOD-007 | `{"status":"partial","attempts":1,"persisted_message_ids":0}` |
| R2-MOD-013 | `{"written_call":"call-B","written_notes":"Draft for A"}` |
| R2-MOD-014 | `{"page_after_selection":1,"call":"call-on-page-3"}` |
| R2-MOD-012 | `{"period":"today","selected_messages":0,"applied_response":"Answer for previous period","toast_count":1}` |
| R2-MOD-017 | `{"current_days":8,"previous_days":7,"current_total":560,"reported_average":80,"actual_average":70,"queried_previous_start":"2026-09-20T03:00:00.000Z","displayed_previous_start":"2026-09-19T03:00:00.001Z"}` |
| R2-MOD-026 | `{"cached_after_two_different_campaign_events":[{"id":"A","sent_count":0},{"id":"B","sent_count":1}]}` |
| R2-MOD-023 | `{"distinct_creation_keys_after_retry":true,"attempts":2}` |
| R2-MOD-032 | `{"cleanup_state_setters_after_campaign_completed":[]}` |
| R2-MOD-049 | `{"input_contact":"contact-B","database_patch":{},"optimistic_patch":{}}` |
| R2-MOD-052 | `{"patch":{"remind_at":"2026-10-05T12:00:00.000Z"},"rearms_notified_at":false}` |
| R2-MOD-050 | `{"requested_local_time":"2026-10-05 09:00","sheet_payload":"2026-10-05T09:00:00","quick_add_payload":"2026-10-05T12:00:00.000Z","hours_apart_if_server_interprets_offsetless_as_utc":3}` |
| R2-MOD-051 | `{"order_before_either_write_resolves":["move-pending","save-pending","closed"]}` |
| R2-MOD-055 | `{"requested_visible_order":["A","X","B"],"persisted_visible_order":["X","A","B"],"written_positions":[{"id":"hidden","position":0},{"id":"X","position":1},{"id":"A","position":2},{"id":"B","position":3}]}` |
| R2-MOD-056 | `{"selected_default_day":"2026-10-06T23:59:00.000Z","internal_applied_marker":"2026-10-06T23:59:00.000Z","second_create_due_date":"2026-10-05T23:59:00.000Z"}` |

Alguns testes existentes cobrem contratos menores do que o comportamento que poderiam sugerir: useMyCalls verifica clamp com fixture incompatível com offset vazio; a navegação TalkXView substitui o wizard por stub; o teste de limites mantém a campanha sempre sending; CSAT verifica dados definidos e loading, sem validar média/total após atualização; agendamentos usam dois registros e não conferem completude. Esses testes continuam úteis para seus objetivos estreitos, mas não encerram os cenários encontrados. A suíte não foi executada nem ampliada nesta revisão.

O fechamento dos três diretórios registra observações separadas em `second-pass-observations.json`, com evidências imutáveis e sem somá-las como novos achados. Entre elas: TalkX.test contém cópias locais de funções para parte dos testes; os fixtures do editor não exercitam paginação de audiência nem saída antes do debounce; a matriz de estados/filtros comprova os componentes isolados, sem assegurar a adoção pelos consumidores; e o teste de fuso do Dashboard não interage com a opção Personalizada. Os testes que exercitam código real conservam seu valor dentro do escopo descrito.

## Índice de achados

| ID | Sev. | Achado | Relação anterior |
|---|---|---|---|
| R2-MOD-001 | P1 | Editor de automações reutiliza estado de outro registro | Novo |
| R2-MOD-002 | P1 | Salvar automação substitui condições e lista de ações por configuração incompleta | Novo |
| R2-MOD-003 | P2 | Editor de automação fecha sem aguardar confirmação da persistência | Novo |
| R2-MOD-005 | P2 | Campanhas aceita público e mídia sem campos ou materialização correspondente | Novo |
| R2-MOD-006 | P2 | Campanha pausada não tem comando de retomada | Novo |
| R2-MOD-007 | P1 | Catálogo em lote classifica falha integral de texto como sucesso e limpa seleção falhada | Novo |
| R2-MOD-008 | P2 | Pré-validação de envio do catálogo ausente em lote e permissiva quando a consulta falha | Novo |
| R2-MOD-009 | P2 | Retorno à primeira página não consulta produtos no catálogo do chat e na gestão | Novo |
| R2-MOD-010 | P2 | Catálogo conta seleção persistente mas envia somente produtos do filtro visível | OTH-001 |
| R2-MOD-011 | P2 | Limite de dez imagens não é aplicado à seleção inicial ou ao envio | Novo |
| R2-MOD-012 | P2 | University reaplica resposta de análise após a troca do período | Novo |
| R2-MOD-013 | P1 | Anotação de chamada acompanha troca de linha e pode sobrescrever outra chamada | Novo |
| R2-MOD-014 | P2 | Selecionar chamada fora da primeira página retorna à primeira e perde o detalhe | Novo |
| R2-MOD-015 | P2 | Histórico anuncia correção de página inválida sem refazer a consulta | Novo |
| R2-MOD-016 | P3 | Discador mantém chip do contato após alterar o número pelo teclado | Novo |
| R2-MOD-017 | P2 | Relatórios comparam períodos de duração desigual e mostram início anterior diferente do consultado | Novo |
| R2-MOD-018 | P2 | Totais dos Relatórios Avançados agregam apenas uma página de mensagens e contatos | DASH-METRICS-001 |
| R2-MOD-019 | P2 | Falhas de leitura de Relatórios Avançados são apresentadas como métricas zero | DASH-METRICS-001 |
| R2-MOD-020 | P2 | Taxa de abandono trata mensagem anterior do agente como resposta e não identifica sessões | Novo |
| R2-MOD-021 | P2 | Monitor Multiplix depende dos cinquenta disparos mais recentes e UI só abre oito | Novo |
| R2-MOD-022 | P2 | Lista de destinatários Multiplix descarta continuação e não diferencia falha de vazio | Novo |
| R2-MOD-023 | P2 | Idempotência do composer Multiplix é descartada em falha de resposta da criação | MX08 |
| R2-MOD-024 | P1 | Respostas atrasadas de variantes e histórico são aplicadas ao template seguinte | Novo |
| R2-MOD-025 | P1 | Reabrir rascunho TalkX grande pode reduzir audiência pelo autosave da primeira página | Novo |
| R2-MOD-026 | P2 | Debounce global TalkX descarta atualização de outra campanha e desliga polling | Novo |
| R2-MOD-027 | P2 | Sair do wizard antes do autosave perde edição sem a proteção beforeunload | Novo |
| R2-MOD-028 | P2 | Estatísticas CSAT podem continuar no snapshot anterior após atualizar as avaliações | Novo |
| R2-MOD-029 | P2 | Agenda filtra pendentes depois de uma consulta global que pode ser ocupada pelo histórico | Novo |
| R2-MOD-030 | P2 | War Room apresenta habilitação e contatos atribuídos como presença e atendimento ativo | DASH-METRICS-001 |
| R2-MOD-031 | P2 | Auto-atualização do War Room controla apenas o relógio exibido | DASH-CONTROLS-001, DASH-REALTIME-001 |
| R2-MOD-032 | P2 | Conclusão remota da campanha não limpa seleção e modais em andamento | Novo |
| R2-MOD-033 | P2 | Ritmo e prazo da campanha usam os primeiros envios e minutos não consecutivos | IA-TALKX-001 |
| R2-MOD-034 | P2 | Lista de supressão não identifica nem encontra bloqueios cadastrados somente por telefone | Novo |
| R2-MOD-035 | P2 | Cadastro de supressão busca contato somente no primeiro lote carregado | Novo |
| R2-MOD-036 | P2 | Consumidores Talk X ainda convertem erro de leitura em vazio ou carregamento indefinido | TX03 |
| R2-MOD-037 | P2 | Analytics Talk X rotula taxa de envio como entrega e usa volume para recomendar abertura | IA-TALKX-001 |
| R2-MOD-038 | P2 | Detalhe de segmento conserva cópia antiga depois de salvar e pode reabrir campos obsoletos | Novo |
| R2-MOD-039 | P3 | Ação Novo template abre o wizard de campanha | Novo |
| R2-MOD-040 | P2 | Resposta tardia de geração de áudio pode iniciar reprodução após fechar o diálogo | Novo |
| R2-MOD-041 | P2 | Exportar catálogo perde quase todos os filtros da listagem | OTH-004 |
| R2-MOD-042 | P2 | Histórico de envios do catálogo esconde registros além dos 500 mais recentes | Novo |
| R2-MOD-043 | P2 | Favoritar em lote anuncia sucesso antes da escrita e oculta falhas de persistência | Novo |
| R2-MOD-044 | P2 | Ranking Mais enviados do catálogo conta tentativas que falharam totalmente | Novo |
| R2-MOD-045 | P2 | Enviar variação perde a cor escolhida no catálogo de gestão | Novo |
| R2-MOD-046 | P2 | Reabrir detalhe do cartão A pode continuar exibindo o produto B navegado anteriormente | Novo |
| R2-MOD-047 | P3 | Galeria mantém índice fora do intervalo ao navegar para produto com menos imagens | Novo |
| R2-MOD-048 | P2 | Favoritos convertem preço e estoque desconhecidos em zero real na interface e no envio | Novo |
| R2-MOD-049 | P2 | Editar contato da tarefa não persiste o vínculo escolhido | Novo |
| R2-MOD-050 | P2 | Salvar tarefa reconstrói datas locais sem offset e pode deslocar prazo e alarme | Novo |
| R2-MOD-051 | P2 | Salvar tarefa fecha com escritas pendentes e divide a edição em operações concorrentes | Novo |
| R2-MOD-052 | P2 | Reagendar alarme pelo Salvar não rearma uma tarefa que já foi notificada | Novo |
| R2-MOD-053 | P2 | Desfazer cancelamento/conclusão não restaura todo o estado e anuncia sucesso antes da gravação | Novo |
| R2-MOD-054 | P2 | Tarefas e filtros consultam somente a primeira resposta da API sem continuação | Novo |
| R2-MOD-055 | P2 | Arrastar tarefa entre colunas filtradas persiste índice em relação à lista não filtrada | Novo |
| R2-MOD-056 | P2 | Agenda restaura o prazo do dia anterior se o dia for trocado durante a criação | Novo |
| R2-MOD-057 | P2 | Cartão de tarefa concluída oferece lembrete que o executor exclui por estado | Novo |
| R2-MOD-058 | P3 | Prazo vencido hoje aparece como atraso no menu e como não atrasado no módulo | Novo |
| R2-MOD-059 | P2 | Filtro de período do Talk X aparece nas quatro telas sem consumidor | TX03 |
| R2-MOD-060 | P3 | Tamanho de página em Templates, Segmentos e Supressão é um controle sem efeito | Novo |
| R2-MOD-061 | P2 | Atalho Duplicar template abre o editor do original | Novo |
| R2-MOD-062 | P3 | Gramática de variáveis do editor/Resumo diverge da personalização com fallback | Novo |
| R2-MOD-063 | P2 | Duas metas configuráveis nunca entram no cálculo das notificações de conquista | Novo |
| R2-MOD-064 | P2 | Restaurar padrões das metas perde IDs e Salvar tenta reinserir configurações existentes | Novo |
| R2-MOD-065 | P2 | Escolher período Personalizado não abre o calendário do Dashboard | DASH-CONTROLS-001 |

## Achados detalhados

### R2-MOD-001 — Editor de automações reutiliza estado de outro registro

**Severidade:** P1. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Abrir a tela de automações e escolher editar uma automação existente; ou trocar a automação selecionada sem desmontar o manager.

**Causa:** O diálogo fica montado no manager e inicializa o formulário com useState(automation) apenas uma vez. O registro selecionado muda por prop, sem key ou sincronização do draft.

**Cadeia observada:** Na primeira edição, o estado originalmente criado com automation=null permanece vazio. Em edições seguintes, os campos podem pertencer ao draft anterior, mas handleSave usa o ID atualmente selecionado.

**Efeito:** Salvar pode sobrescrever a automação B com nome, trigger e ação preparados para A, ou apagar dados de uma automação que deveria apenas ser editada.

**Correção recomendada:** Vincular o ciclo de vida do draft ao ID e à abertura do diálogo, com política explícita para descartar ou preservar alterações pendentes.

**Aceite:**

- Editar uma automação preenche os campos persistidos.
- Editar A, alterar um campo e depois abrir B nunca exibe nem salva o draft de A em B.
- Criar após editar abre os defaults de criação sem reaproveitar estado anterior.

**Evidência:**

- [src/components/automations/AutomationEditorDialog.tsx:20–33](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/AutomationEditorDialog.tsx#L20-L33) — blob `ca877500e4c9adc606352916c2c95cddd0262af4`.
- [src/components/automations/AutomationsManager.tsx:33–38](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/AutomationsManager.tsx#L33-L38) — blob `bea142159b3a6acc8ea5c09c346b9a44b969f51a`.
- [src/components/automations/AutomationsManager.tsx:90–114](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/AutomationsManager.tsx#L90-L114) — blob `bea142159b3a6acc8ea5c09c346b9a44b969f51a`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-002 — Salvar automação substitui condições e lista de ações por configuração incompleta

**Severidade:** P1. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Salvar uma automação com trigger_config existente, múltiplas ações ou ações que exigem parâmetros além de message.

**Causa:** O editor lê apenas a primeira ação e sempre reconstrói trigger_config como objeto vazio e actions como uma única ação com config.message. Não há editores para condições ou parâmetros dos demais tipos oferecidos.

**Cadeia observada:** Uma edição de nome também substitui as condições e toda a lista de ações; tipos como atribuição e tag são oferecidos sem controles para os IDs correspondentes.

**Efeito:** Configuração persistida é perdida ou a automação resultante fica incompleta. O problema independe da disponibilidade do executor.

**Correção recomendada:** Preservar campos não editados e permitir configuração completa por trigger/ação; bloquear tipos cuja configuração necessária não está disponível.

**Aceite:**

- Renomear preserva trigger_config e todas as ações existentes.
- Cada tipo oferecido valida seus parâmetros obrigatórios.
- Salvar e reabrir produz o mesmo contrato sem remover campos que a UI não edita.

**Evidência:**

- [src/components/automations/AutomationEditorDialog.tsx:20–33](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/AutomationEditorDialog.tsx#L20-L33) — blob `ca877500e4c9adc606352916c2c95cddd0262af4`.
- [src/components/automations/AutomationEditorDialog.tsx:64–88](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/AutomationEditorDialog.tsx#L64-L88) — blob `ca877500e4c9adc606352916c2c95cddd0262af4`.
- [src/components/automations/automationConstants.ts:1–17](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/automationConstants.ts#L1-L17) — blob `27329d662d0feaf089529e9ec2da682f55b98ac0`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-003 — Editor de automação fecha sem aguardar confirmação da persistência

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Salvar uma automação enquanto a mutation ainda está pendente, especialmente em falha de persistência.

**Causa:** O manager declara handleSave async, mas chama mutate, que não devolve a confirmação da mutation. O await do diálogo aguarda somente o callback já resolvido.

**Cadeia observada:** O diálogo fecha antes da resposta do banco; o erro aparece depois via toast, sem preservar a edição para correção imediata.

**Efeito:** A UI dá aparência de conclusão e obriga o operador a reconstruir a edição após erro; também permite iniciar outra operação enquanto a anterior está pendente.

**Correção recomendada:** Retornar mutateAsync e fechar somente após confirmação; manter draft, mensagem de erro e botão em estado pendente até o desfecho.

**Aceite:**

- Uma Promise de persistência pendente mantém o diálogo aberto e impede reenvio concorrente.
- Rejeição preserva campos e permite retry; sucesso fecha apenas depois da confirmação.

**Evidência:**

- [src/components/automations/AutomationsManager.tsx:33–38](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/AutomationsManager.tsx#L33-L38) — blob `bea142159b3a6acc8ea5c09c346b9a44b969f51a`.
- [src/components/automations/AutomationEditorDialog.tsx:28–38](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/AutomationEditorDialog.tsx#L28-L38) — blob `ca877500e4c9adc606352916c2c95cddd0262af4`.
- [src/components/automations/useAutomations.ts:25–77](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/automations/useAutomations.ts#L25-L77) — blob `5958192410fb9c11ada2cf6fa87d8c9fd1f6f9ed`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-005 — Campanhas aceita público e mídia sem campos ou materialização correspondente

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Criar campanha no módulo campaigns com público tag/fila/grupo/custom ou mensagem de imagem, vídeo ou documento.

**Causa:** O formulário oferece tipos sem pedir seleção de destinatários/filtros ou URL da mídia; a criação apenas insere o form e o comando de iniciar apenas altera status.

**Cadeia observada:** O consumidor cria uma linha de campanha sem materializar os contatos pelas opções oferecidas. addContacts existe no hook, mas não é chamado pela UI revisada.

**Efeito:** A campanha aparenta estar pronta ou iniciada sem o público e a mídia necessários para corresponder ao que foi escolhido.

**Correção recomendada:** Ligar os tipos de público e mídia a payloads validados e à materialização autorizada; definir a passagem para executor ou apresentar o módulo como indisponível.

**Aceite:**

- Uma campanha por tag/fila/grupo preserva a seleção e cria a audiência correspondente.
- Imagem, vídeo e documento exigem e conservam a mídia.
- Iniciar tem confirmação de processamento ou um estado explícito de indisponibilidade.

**Evidência:**

- [src/components/campaigns/CampaignCreateDialog.tsx:17–48](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/campaigns/CampaignCreateDialog.tsx#L17-L48) — blob `7abf055ef2b5356aea23a47889698d6cb83ce268`.
- [src/components/campaigns/CampaignCreateDialog.tsx:75–103](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/campaigns/CampaignCreateDialog.tsx#L75-L103) — blob `7abf055ef2b5356aea23a47889698d6cb83ce268`.
- [src/hooks/communication/useCampaigns.ts:29–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useCampaigns.ts#L29-L95) — blob `73aadfdf5fc5c9c884fe5ee20f88be2ff34b0647`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Ausência de consumidor/executor foi pesquisada no repositório; não demonstra inexistência de automação externa ao código versionado.

### R2-MOD-006 — Campanha pausada não tem comando de retomada

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Uma campanha do módulo campaigns está no estado paused após o comando Pausar.

**Causa:** A lista só oferece iniciar para draft e pausar para sending. O filtro de status omite paused e o painel de detalhes não implementa retomada.

**Cadeia observada:** Depois de pausar pela UI, a ação de retomar deixa de existir no mesmo fluxo.

**Efeito:** O operador não consegue continuar a campanha por esse módulo e precisa de outro meio para alterar o estado.

**Correção recomendada:** Definir e expor a transição paused→sending com tratamento de pendência/erro e incluir paused no filtro.

**Aceite:**

- Pausar e retomar pela UI percorre os estados esperados e a falha de retomada permanece visível.
- Campanhas pausadas podem ser filtradas e abertas.

**Evidência:**

- [src/components/campaigns/CampaignsView.tsx:100–113](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/campaigns/CampaignsView.tsx#L100-L113) — blob `d993c5aa11da231838e2c24a25cf66d04f4243b6`.
- [src/components/campaigns/CampaignsView.tsx:155–179](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/campaigns/CampaignsView.tsx#L155-L179) — blob `d993c5aa11da231838e2c24a25cf66d04f4243b6`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-007 — Catálogo em lote classifica falha integral de texto como sucesso e limpa seleção falhada

**Severidade:** P1. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Enviar em lote um produto sem imagem cuja única tentativa de texto falha; ou concluir um lote com produtos falhados.

**Causa:** imageOk começa true mesmo sem tentativa de imagem. Texto rejeitado produz partial; o agregador conta partial como sucesso e chama onSent/fecha mesmo quando há falhas.

**Cadeia observada:** O callback original devolveu partial para zero messageIds confirmados no probe. O loop incrementa ok e o encerramento limpa a seleção pelo callback de envio.

**Efeito:** Falha integral é anunciada como envio parcial/bem-sucedido e itens que precisam de retry desaparecem da seleção.

**Correção recomendada:** Classificar com base em tentativas efetivas e confirmações reais; só considerar parcial quando pelo menos uma parte foi enviada e manter seleção dos itens não concluídos.

**Aceite:**

- Produto sem imagem e texto rejeitado resulta failed, zero sucesso e item preservado para retry.
- Lote misto discrimina enviados, parciais e falhados com contagem e seleção correspondentes.

**Evidência:**

- [src/components/catalog/CatalogBulkSendDialog.tsx:41–78](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogBulkSendDialog.tsx#L41-L78) — blob `e9bbe8ca1179990d4e2e653b451732b8f4386fbe`.
- [src/components/catalog/CatalogBulkSendDialog.tsx:105–130](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogBulkSendDialog.tsx#L105-L130) — blob `e9bbe8ca1179990d4e2e653b451732b8f4386fbe`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-007`; código em `offline_probes.cjs`.

### R2-MOD-008 — Pré-validação de envio do catálogo ausente em lote e permissiva quando a consulta falha

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Usar envio em lote do catálogo; ou falhar a consulta de prontidão no envio individual.

**Causa:** O lote não conecta useCatalogSendReadiness/blockedContactIds/isChecking ao seletor. No hook de envio individual, error/isError não integra o estado devolvido; dados ausentes resultam em bloqueio vazio.

**Cadeia observada:** O seletor do lote recebe os defaults que permitem selecionar e continuar. Uma consulta de prontidão rejeitada termina com isChecking=false e sem motivo de bloqueio.

**Efeito:** A pré-validação apresentada pelo catálogo é inconsistente e falha aberta quando não consegue verificar as condições de envio.

**Correção recomendada:** Compartilhar a mesma verificação nos fluxos de lote e individual; distinguir indisponível de liberado e tornar o resultado de validação explícito.

**Aceite:**

- Falha controlada da consulta impede prosseguir e oferece retry com motivo claro.
- Lote e individual aplicam as mesmas restrições para o mesmo contato/conexão.

**Evidência:**

- [src/components/catalog/CatalogBulkSendDialog.tsx:190–215](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogBulkSendDialog.tsx#L190-L215) — blob `e9bbe8ca1179990d4e2e653b451732b8f4386fbe`.
- [src/components/catalog/ContactSelectionStep.tsx:90–104](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ContactSelectionStep.tsx#L90-L104) — blob `407c0a9d3c662d67c5414553cd63263ff85be7c6`.
- [src/components/catalog/ContactSelectionStep.tsx:250–286](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ContactSelectionStep.tsx#L250-L286) — blob `407c0a9d3c662d67c5414553cd63263ff85be7c6`.
- [src/hooks/integrations/useCatalogSendReadiness.ts:32–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useCatalogSendReadiness.ts#L32-L95) — blob `85c1d7f915d0848fc9fcfefd473d9d2d3bbcae45`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Este achado é da barreira de UI. Não afirma que o backend entrega mensagens a um contato que deveria estar bloqueado.

### R2-MOD-009 — Retorno à primeira página não consulta produtos no catálogo do chat e na gestão

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Navegar do índice 1 ou maior para o índice 0 usando Anterior, no catálogo do chat ou na gestão.

**Causa:** O efeito de paginação chama fetchProducts somente quando page>0. Mudar para zero não altera os filtros internos do hook que compõem sua queryKey.

**Cadeia observada:** A etiqueta passa para a primeira página, mas os produtos da página anterior permanecem porque nenhuma consulta da página zero é solicitada.

**Efeito:** Paginação exibe conteúdo incorreto e pode induzir seleção/exportação de produtos que não correspondem à página indicada.

**Correção recomendada:** Usar a página como entrada única da consulta e buscar também zero; separar claramente reset de filtros de navegação.

**Aceite:**

- Ir página 1→2→1 retorna os mesmos IDs da primeira página e emite a consulta de retorno.
- O teste verifica IDs e parâmetros da consulta, não só o número mostrado.
- A mesma transição é verificada nos dois consumidores, ExternalProductCatalog e ExternalProductManagement.

**Evidência:**

- [src/components/catalog/ExternalProductCatalog.tsx:169–197](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L169-L197) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`.
- [src/components/catalog/ExternalProductCatalog.tsx:675–686](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L675-L686) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`.
- [src/hooks/integrations/useExternalCatalog.ts:248–285](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useExternalCatalog.ts#L248-L285) — blob `3800598b759962f286a0fa94ce04c7c2cd458442`; filters internos determinam queryKey e só mudam no fetchProducts.
- [src/components/catalog/ExternalProductManagement.tsx:520–533](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L520-L533) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; efeito de filtros não depende de page e efeito de page ignora zero.
- [src/components/catalog/ExternalProductManagement.tsx:1056–1064](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L1056-L1064) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; paginacao chama setPage(p-1).

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-010 — Catálogo conta seleção persistente mas envia somente produtos do filtro visível

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY (OTH-001).

**Precondição:** Selecionar produtos e mudar filtro/página mantendo IDs selecionados que saem de displayedProducts.

**Causa:** O contador usa selectedIds.size, enquanto selectedProducts é a interseção com displayedProducts; lote e exportação usam somente essa interseção.

**Cadeia observada:** O número anunciado inclui produtos ocultos, mas o payload contém apenas os visíveis.

**Efeito:** Envio/exportação omite produtos selecionados e o operador recebe uma contagem diferente da operação real.

**Correção recomendada:** Resolver toda a seleção por ID ou limitar/limpar a seleção de forma explícita ao mudar o conjunto visível.

**Aceite:**

- Selecionar A, mudar filtro, selecionar B e enviar/exportar tem resultado consistente com a contagem anunciada.
- Produtos ocultos não são silenciosamente descartados.

**Evidência:**

- [src/components/catalog/ExternalProductCatalog.tsx:179–198](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L179-L198) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`.
- [src/components/catalog/ExternalProductCatalog.tsx:339–348](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L339-L348) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`.
- [src/components/catalog/ExternalProductCatalog.tsx:688–723](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L688-L723) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`.

**Comparação anterior:** OTH-001 descreve o mesmo padrão em Arquivos. Catálogo tem consumidor, estado e payload distintos; é descoberta nova com antecedente análogo.

### R2-MOD-011 — Limite de dez imagens não é aplicado à seleção inicial ou ao envio

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Abrir SendProductDialog para um produto que fornece mais de dez imagens base.

**Causa:** A seleção inicial e seu reset incluem todas as imagens. MAX_IMAGES limita somente adicionar/toggle; o comando de enviar não revalida o tamanho.

**Cadeia observada:** A UI pode iniciar acima do máximo anunciado e enviar todas as imagens selecionadas.

**Efeito:** O lote enviado excede o limite de dez e pode produzir envio inesperado ou rejeição parcial.

**Correção recomendada:** Aplicar o limite na inicialização, em toda transformação da seleção e no comando final.

**Aceite:**

- Produto com onze ou mais imagens abre com no máximo dez selecionadas e explica a limitação.
- O comando final recusa qualquer estado acima do limite, inclusive estado inicial ou restaurado.

**Evidência:**

- [src/components/catalog/SendProductDialog.tsx:220–256](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/SendProductDialog.tsx#L220-L256) — blob `01b5b9aaa7c2329fa51ace026a1f98d2be2e6d35`.
- [src/components/catalog/SendProductDialog.tsx:370–384](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/SendProductDialog.tsx#L370-L384) — blob `01b5b9aaa7c2329fa51ace026a1f98d2be2e6d35`.
- [src/components/catalog/SendProductDialog.tsx:594–609](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/SendProductDialog.tsx#L594-L609) — blob `01b5b9aaa7c2329fa51ace026a1f98d2be2e6d35`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-012 — University reaplica resposta de análise após a troca do período

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Iniciar resposta da University, alterar o período enquanto a requisição está pendente e receber a resposta antiga depois.

**Causa:** O efeito de período limpa resposta/seleção, mas não invalida a geração em voo. O callback assíncrono sempre aplica resultado e toast ao terminar.

**Cadeia observada:** O probe executou o hook: período atual today, seleção vazia e resposta do período anterior aplicada após a limpeza.

**Efeito:** O operador pode usar texto gerado de um contexto que já deixou de ser o período escolhido.

**Correção recomendada:** Aplicar o mecanismo de geração/cancelamento usado pelas outras ferramentas de IA também à University e atrelar a conclusão ao período/contexto que iniciou a requisição.

**Aceite:**

- Resposta atrasada após troca do período é descartada e não emite toast de sucesso.
- Resumo, objeções, assistente e University têm o mesmo contrato de invalidação.

**Evidência:**

- [src/hooks/ui/useUniversityHelp.ts:48–68](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useUniversityHelp.ts#L48-L68) — blob `42dd9e1f935dca8e5a467a9d50cbc17136835263`.
- [src/hooks/ui/useUniversityHelp.ts:87–134](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useUniversityHelp.ts#L87-L134) — blob `42dd9e1f935dca8e5a467a9d50cbc17136835263`.
- [src/components/inbox/UniversityHelp.tsx:58–78](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/UniversityHelp.tsx#L58-L78) — blob `60e46676d58ffc0712bc876cf16103855b9f75c3`.
- [src/components/inbox/RealtimeInboxView.tsx:298–305](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/RealtimeInboxView.tsx#L298-L305) — blob `3d6dacf92511e917426345a7f390dbe408d1ce1b`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Não é afirmado vazamento entre contatos: RealtimeInboxView atribui key da conversa ao ChatPanel atual.
- IA-048 é referência de implementação, não um dos IDs dos 104 achados anteriores.

**Probe:** `proofs.json`, ID `R2-MOD-012`; código em `offline_probes.cjs`.

### R2-MOD-013 — Anotação de chamada acompanha troca de linha e pode sobrescrever outra chamada

**Severidade:** P1. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Escrever anotação na chamada A e selecionar B no histórico enquanto o painel permanece montado.

**Causa:** rascunho é estado local sem reset por call.id. salvar usa o call.id atual com valor derivado do rascunho anterior.

**Cadeia observada:** O callback original, sob driver de hooks, chamou addCallNotes('call-B', 'Draft for A'). O pai renderiza o painel sem key por chamada.

**Efeito:** Anotações de uma chamada podem sobrescrever as de outra, comprometendo o histórico operacional.

**Correção recomendada:** Associar o draft ao ID da chamada e tratar mudança de registro com edição pendente antes de salvar.

**Aceite:**

- Após editar A e escolher B, salvar nunca grava o texto de A no ID B.
- Preservar/cancelar a edição de A é explícito, e o painel mostra as notas reais de B.

**Evidência:**

- [src/components/calls/SelectedCallPanel.tsx:34–62](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/SelectedCallPanel.tsx#L34-L62) — blob `55c3fb28c97f0ea781de761847042e60910045c1`.
- [src/components/calls/TelefoniaView.tsx:253–277](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/TelefoniaView.tsx#L253-L277) — blob `bc93425fb4ace67d66eba3611739e414e136e343`.
- [src/hooks/communication/useCalls.ts:194–202](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useCalls.ts#L194-L202) — blob `7d6c82a89cfdbdb57432af6c0ab1eabe9fec78d3`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-013`; código em `offline_probes.cjs`.

### R2-MOD-014 — Selecionar chamada fora da primeira página retorna à primeira e perde o detalhe

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Selecionar uma chamada presente na segunda página ou posterior do histórico.

**Causa:** setFilter reseta page=1 para qualquer chave diferente de page, inclusive call. O detalhe deriva apenas de historicos.rows da página consultada.

**Cadeia observada:** O probe do hook original mudou page=3 para page=1 ao escolher call. A linha deixa o conjunto atual e o detalhe pode desaparecer.

**Efeito:** É impossível manter aberto o detalhe de uma chamada de outra página pelo fluxo normal da lista.

**Correção recomendada:** Tratar seleção de chamada como estado de detalhe sem reset de paginação, ou carregar a chamada selecionada por ID de forma independente.

**Aceite:**

- Selecionar uma chamada da página 3 mantém a página e abre o detalhe correspondente.
- Teste usa ID ausente na página 1 e verifica resultado do detalhe.

**Evidência:**

- [src/hooks/calls/useTelefoniaFilters.ts:61–74](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/calls/useTelefoniaFilters.ts#L61-L74) — blob `c0b323d932420a8295628fcd5c3a75e784207784`.
- [src/components/calls/TelefoniaView.tsx:144–146](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/TelefoniaView.tsx#L144-L146) — blob `bc93425fb4ace67d66eba3611739e414e136e343`.
- [src/components/calls/TelefoniaView.tsx:253–277](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/TelefoniaView.tsx#L253-L277) — blob `bc93425fb4ace67d66eba3611739e414e136e343`.
- [src/hooks/calls/__tests__/useTelefoniaFilters.test.tsx:32–50](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/calls/__tests__/useTelefoniaFilters.test.tsx#L32-L50) — blob `6176e87cbf6a30894672675bfdcf004ec802889e`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-014`; código em `offline_probes.cjs`.

### R2-MOD-015 — Histórico anuncia correção de página inválida sem refazer a consulta

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** A URL aponta para página maior que o número atual de páginas, por edição manual, exclusão ou mudança de total.

**Causa:** useMyCalls consulta o offset inválido e só depois calcula pageEfetiva; o clamp não atualiza URL nem dispara nova consulta. O total é extraído da primeira linha, inexistente em uma página vazia.

**Cadeia observada:** Pode apresentar página 1 e total zero com os dados vazios retornados da página 99. O teste existente fornece linhas para offset além do total e só verifica o número clampado.

**Efeito:** Um histórico existente parece vazio e a correção visual de paginação não recupera os registros.

**Correção recomendada:** Obter total independente da primeira linha e refazer a consulta/URL quando a página estiver fora do intervalo.

**Aceite:**

- Página 99 com total de uma página converge para URL e dados da página 1.
- Fixture respeita o resultado vazio real de offset fora do intervalo e verifica a segunda consulta.

**Evidência:**

- [src/hooks/calls/useMyCalls.ts:43–77](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/calls/useMyCalls.ts#L43-L77) — blob `dd3793e571c494c4f3447446cf01a39953767c18`.
- [src/hooks/calls/__tests__/useMyCalls.test.tsx:59–65](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/calls/__tests__/useMyCalls.test.tsx#L59-L65) — blob `788c80196ea617d64001defd3ec3ea1bf123549b`.
- [src/components/calls/TelefoniaView.tsx:242–266](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/TelefoniaView.tsx#L242-L266) — blob `bc93425fb4ace67d66eba3611739e414e136e343`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-016 — Discador mantém chip do contato após alterar o número pelo teclado

**Severidade:** P3. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Escolher um contato no NewCallPanel e alterar o número usando seu teclado numérico/backspace.

**Causa:** As ações do teclado alteram numero, mas não limpam contato. ligar constrói phone com o número atual e metadados do contato antigo.

**Cadeia observada:** A tela pode mostrar contato A ao lado de um destino diferente. O provider atual disca apenas phone e useSipClient resolve o contato pelo telefone.

**Efeito:** Identificação visual enganosa antes da ligação; o operador pode acreditar que está ligando para o contato mostrado.

**Correção recomendada:** Limpar/reconciliar a identidade selecionada quando o número for modificado e tornar o destino efetivo visível.

**Aceite:**

- Selecionar A e alterar o número remove ou revalida o chip de A antes de habilitar a ligação.

**Evidência:**

- [src/components/calls/NewCallPanel.tsx:73–99](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/NewCallPanel.tsx#L73-L99) — blob `3c70a473d63f6492ccecb24818ab9d63abb4462f`.
- [src/components/calls/ContactPicker.tsx:120–133](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/calls/ContactPicker.tsx#L120-L133) — blob `572639385da6da8776ff429eddb279bb66880e15`.
- [src/providers/CallSessionProvider.tsx:338–375](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/providers/CallSessionProvider.tsx#L338-L375) — blob `47d783cd156b15af5267802d8321875f6c06e085`.
- [src/hooks/communication/useSipClient.ts:43–56](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L43-L56) — blob `7e8bb2881d0269faa84fb3f7a8f3360ce2aa3b72`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Não foi confirmado registro da chamada no contato errado: o provider descarta os metadados e resolve pelo phone. O achado foi reduzido à inconsistência comprovada da UI.

### R2-MOD-017 — Relatórios comparam períodos de duração desigual e mostram início anterior diferente do consultado

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Selecionar 7, 30 ou 90 dias nos Relatórios Avançados e comparar com o período anterior.

**Causa:** O período atual vai do começo de N dias atrás ao fim de hoje, totalizando N+1 dias; o anterior tem N. A média divide por N e a etiqueta anterior deriva de outra subtração.

**Cadeia observada:** Com 7 e tempo fixo, helpers originais produzem 8 dias atuais e 7 anteriores. O probe com 70 mensagens/dia resulta em média anunciada 80. A data inicial anterior exibida difere da query.

**Efeito:** Totais, médias e crescimento comparativo ficam enviesados mesmo com dados completos e sem erro de rede.

**Correção recomendada:** Definir períodos de dias de calendário com fronteiras compartilhadas para queries, rótulos e denominadores.

**Aceite:**

- 7 significa sete dias em ambos os intervalos, sem lacuna nem sobreposição.
- Média de uma série uniforme de 70/dia permanece 70 e as etiquetas são as fronteiras consultadas.

**Evidência:**

- [src/components/reports/useReportsData.ts:28–42](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/useReportsData.ts#L28-L42) — blob `0ca5ffff671f9b2abdda1ebdf09c8e862153a367`.
- [src/components/reports/useReportsData.ts:190–215](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/useReportsData.ts#L190-L215) — blob `0ca5ffff671f9b2abdda1ebdf09c8e862153a367`.
- [src/components/reports/AdvancedReportsView.tsx:44–47](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/AdvancedReportsView.tsx#L44-L47) — blob `fd9f20064b81966425e411717e80365383cbf34e`.
- [src/lib/localDay.ts:181–188](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/localDay.ts#L181-L188) — blob `6bb3e363d6004707db4be23e5c24c0b1cd9f5343`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-017`; código em `offline_probes.cjs`.

### R2-MOD-018 — Totais dos Relatórios Avançados agregam apenas uma página de mensagens e contatos

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (DASH-METRICS-001).

**Precondição:** O período contém mais mensagens ou contatos que o limite de linhas aplicado pelo PostgREST.

**Causa:** As quatro consultas current/previous usam select sem paginação, count ou RPC agregadora, e os totais/repartições são reduzidos dos arrays devolvidos.

**Cadeia observada:** A UI chama os valores de total, média e distribuição do período, mas só vê a primeira página. Não verifica truncamento.

**Efeito:** Relatórios e comparativos subcontam de forma silenciosa; a proporção por agente/tipo também depende de quais linhas couberam na página.

**Correção recomendada:** Agregar no servidor com o escopo autorizado ou percorrer todas as páginas de forma estável e indicar incompletude.

**Aceite:**

- Base sintética acima do cap mantém o total e as distribuições corretos.
- Se a leitura for incompleta, o relatório não publica o valor como total definitivo.

**Evidência:**

- [src/components/reports/useReportsData.ts:44–105](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/useReportsData.ts#L44-L105) — blob `0ca5ffff671f9b2abdda1ebdf09c8e862153a367`.
- [src/components/reports/useReportsData.ts:115–215](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/useReportsData.ts#L115-L215) — blob `0ca5ffff671f9b2abdda1ebdf09c8e862153a367`.
- [src/components/reports/AdvancedReportsView.tsx:49–54](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/AdvancedReportsView.tsx#L49-L54) — blob `fd9f20064b81966425e411717e80365383cbf34e`.

**Comparação anterior:** A auditoria anterior apontou caps em outros hooks do Dashboard; esta extensão identifica o consumidor AdvancedReports/useReportsData e seu comparativo.

**Limites específicos:**

- O cap efetivo do ambiente não foi consultado; não se presume valor exato de 1000.

### R2-MOD-019 — Falhas de leitura de Relatórios Avançados são apresentadas como métricas zero

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (DASH-METRICS-001).

**Precondição:** Falha de leitura em uma ou mais consultas dos Relatórios Avançados sem dados prévios em cache.

**Causa:** As queries lançam erro, mas o hook expõe somente data/isLoading e substitui ausências por arrays vazios; o consumidor não recebe error.

**Cadeia observada:** Depois de loading=false, métricas e gráficos são derivados de zero registros como se não houvesse atividade.

**Efeito:** Falha de rede/permissão é apresentada como resultado de negócio e pode contaminar comparação/exportação.

**Correção recomendada:** Propagar erro por conjunto de dados e distinguir zero confirmado, falha e conteúdo desatualizado.

**Aceite:**

- Erro em mensagens ou contatos é visível no relatório e não aparece como zero confirmado.
- Comparativo não usa ausência por erro como base válida.

**Evidência:**

- [src/components/reports/useReportsData.ts:44–105](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/useReportsData.ts#L44-L105) — blob `0ca5ffff671f9b2abdda1ebdf09c8e862153a367`.
- [src/components/reports/useReportsData.ts:190–217](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/useReportsData.ts#L190-L217) — blob `0ca5ffff671f9b2abdda1ebdf09c8e862153a367`.
- [src/components/reports/useReportsData.ts:239–245](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/useReportsData.ts#L239-L245) — blob `0ca5ffff671f9b2abdda1ebdf09c8e862153a367`.
- [src/components/reports/AdvancedReportsView.tsx:103–129](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/AdvancedReportsView.tsx#L103-L129) — blob `fd9f20064b81966425e411717e80365383cbf34e`.

**Comparação anterior:** Extensão do problema de ausência/erro para as quatro queries e seus consumidores de Relatórios Avançados.

### R2-MOD-020 — Taxa de abandono trata mensagem anterior do agente como resposta e não identifica sessões

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Um contato tem mensagem de agente anterior a uma nova mensagem de cliente ainda sem resposta, dentro do intervalo consultado.

**Causa:** AbandonmentRate só lê contact_id e sender e marca o contato como respondido se existir qualquer mensagem de agente; não considera ordem, sessão ou prazo.

**Cadeia observada:** A mensagem antiga do agente elimina o contato do conjunto abandonado mesmo quando a demanda mais recente continua sem resposta.

**Efeito:** O indicador não mede abandono de atendimento e pode mostrar melhora por atividade anterior sem relação com a solicitação atual.

**Correção recomendada:** Definir abandono por episódio/conversa e ordem temporal, com prazo de resposta e denominador explícitos.

**Aceite:**

- Agente às 10h e cliente às 11h sem resposta não contam como atendimento respondido às 11h.
- Sessões repetidas do mesmo contato são avaliadas pelo contrato de abandono escolhido.

**Evidência:**

- [src/components/reports/AbandonmentRate.tsx:14–54](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/AbandonmentRate.tsx#L14-L54) — blob `27dd9ee8f4237f7701698ece28846738bf85ddd1`.
- [src/components/reports/AbandonmentRate.tsx:75–108](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/AbandonmentRate.tsx#L75-L108) — blob `27dd9ee8f4237f7701698ece28846738bf85ddd1`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-021 — Monitor Multiplix depende dos cinquenta disparos mais recentes e UI só abre oito

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Há disparos Multiplix válidos mais antigos que os oito apresentados, ou um monitor aberto cujo disparo sai dos cinquenta mais recentes.

**Causa:** A UI principal mostra somente slice(0,8), sem histórico completo. A query de detalhe busca a lista limit=50, offset=0 e faz find pelo ID, em vez de pedir o registro.

**Cadeia observada:** Disparo existente fora da janela resulta not found; o monitor ignora error e renderiza skeleton enquanto dispatch é null, antes de seu botão Voltar.

**Efeito:** Histórico fica inacessível e monitor de um disparo existente pode parecer carregar indefinidamente.

**Correção recomendada:** Adicionar navegação paginada de histórico, detalhe por ID e estados independentes de não encontrado/erro.

**Aceite:**

- Abrir diretamente um disparo além dos cinquenta recentes retorna o registro correto.
- Erro/não encontrado tem explicação, retry e saída; histórico permite acessar além dos oito.

**Evidência:**

- [src/components/multiplix/MultiplixView.tsx:172–192](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/multiplix/MultiplixView.tsx#L172-L192) — blob `9416eb021af2a962e42afc833ae564fe1ced3e13`.
- [src/hooks/integrations/useMultiplixDispatches.ts:127–168](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useMultiplixDispatches.ts#L127-L168) — blob `eea3cc95099874349e4fc5dab25aedcdf20a7465`.
- [src/components/multiplix/MultiplixMonitor.tsx:52–65](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/multiplix/MultiplixMonitor.tsx#L52-L65) — blob `8ad6063852f2d9bfc0a6e9b706d56c5340b5655d`.
- [src/components/multiplix/MultiplixMonitor.tsx:102–122](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/multiplix/MultiplixMonitor.tsx#L102-L122) — blob `8ad6063852f2d9bfc0a6e9b706d56c5340b5655d`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Cenário usa registros existentes válidos; não presume que o contrato de criação hoje esteja corrigido (MX08).

### R2-MOD-022 — Lista de destinatários Multiplix descarta continuação e não diferencia falha de vazio

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Um disparo Multiplix tem mais de quinhentos destinatários, ou a consulta de destinatários falha.

**Causa:** useMultiplixRecipients pede limit=500/offset=0 e devolve somente rows, descartando total/continuação. O monitor usa data=[] e não consome error.

**Cadeia observada:** A tela lista somente o primeiro lote sem paginação; uma rejeição é mostrada como nenhum destinatário.

**Efeito:** Operação e diagnóstico ficam incompletos, especialmente para destinatários falhados fora do lote visível.

**Correção recomendada:** Preservar total/continuação e estados de erro, e paginar ou rotular claramente uma amostra deliberada.

**Aceite:**

- Destinatário 501 é alcançável e o total corresponde ao servidor.
- Erro de leitura não aparece como lista vazia confirmada.

**Evidência:**

- [src/hooks/integrations/useMultiplixDispatches.ts:172–187](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useMultiplixDispatches.ts#L172-L187) — blob `eea3cc95099874349e4fc5dab25aedcdf20a7465`.
- [src/components/multiplix/MultiplixMonitor.tsx:52–65](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/multiplix/MultiplixMonitor.tsx#L52-L65) — blob `8ad6063852f2d9bfc0a6e9b706d56c5340b5655d`.
- [src/components/multiplix/MultiplixMonitor.tsx:182–205](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/multiplix/MultiplixMonitor.tsx#L182-L205) — blob `8ad6063852f2d9bfc0a6e9b706d56c5340b5655d`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- O teste de volume depende de um disparo válido acima do limite; não foi executado contra o backend.

### R2-MOD-023 — Idempotência do composer Multiplix é descartada em falha de resposta da criação

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY (MX08).

**Precondição:** O servidor aceita a criação, mas a resposta se perde ou um passo posterior falha; o operador tenta de novo o mesmo conteúdo.

**Causa:** A chave de idempotência é limpa em onSettled, inclusive na rejeição. Retry recebe novo UUID em vez de reconciliar o resultado incerto da tentativa anterior.

**Cadeia observada:** O probe do callback original confirmou duas chaves distintas para o mesmo input após falha simulada de resposta.

**Efeito:** Quando a criação está funcional e o servidor usa a chave como identidade da operação, retry pode criar disparo duplicado em vez de reencontrar o primeiro.

**Correção recomendada:** Preservar a chave até conclusão/reconciliação inequívoca ou mudança intencional do draft; consultar o resultado pelo identificador após desfecho incerto.

**Aceite:**

- Commit aceito com resposta perdida seguido de retry reutiliza a identidade e resulta em um único disparo.
- Alteração intencional de novo draft é o que gera uma nova chave.

**Evidência:**

- [src/hooks/integrations/useMultiplixDispatches.ts:254–304](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useMultiplixDispatches.ts#L254-L304) — blob `eea3cc95099874349e4fc5dab25aedcdf20a7465`.
- [src/components/multiplix/MultiplixComposerDialog.tsx:45–71](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/multiplix/MultiplixComposerDialog.tsx#L45-L71) — blob `2b5682a3808000f659cae68554346af23eed025b`.

**Comparação anterior:** MX08 é antecedente de contrato bloqueado, não duplicata desta falha de identidade de retry.

**Limites específicos:**

- A criação aceita é uma precondição sintética. O caminho backend dispatch.create não foi homologado nesta revisão e os bloqueios anteriores MX08 continuam relevantes.

**Probe:** `proofs.json`, ID `R2-MOD-023`; código em `offline_probes.cjs`.

### R2-MOD-024 — Respostas atrasadas de variantes e histórico são aplicadas ao template seguinte

**Severidade:** P1. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Pedir variantes/histórico de A, trocar para B e abrir o mesmo painel, recebendo B antes da resposta atrasada de A.

**Causa:** Os loaders aplicam setVariants/setVersions sem comparar templateId/generation. Limpar o painel na troca não invalida Promises antigas.

**Cadeia observada:** A resposta antiga substitui o painel de B. Um onBlur de variante envia o ID/payload da variante A; saveVariant atualiza por esse ID, embora o editor esteja identificado como B. Restaurar histórico também aplica campos sem validar a origem ativa.

**Efeito:** Edição/exclusão de variante ou restauração de conteúdo pode atingir um template diferente do que o operador acredita estar editando.

**Correção recomendada:** Chavear os dados pelo template e descartar respostas obsoletas; validar que variante/versão pertencem ao ativo antes de permitir uma mutação.

**Aceite:**

- No cenário A lento/B rápido, somente dados de B permanecem acionáveis.
- Payload de salvar/excluir/restaurar é recusado se sua origem não corresponde ao template ativo.

**Evidência:**

- [src/components/talkx/TalkXTemplateEditor.tsx:109–118](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplateEditor.tsx#L109-L118) — blob `1b2377f61c6c4d11cab92887328a870a7c9b15f2`.
- [src/components/talkx/TalkXTemplateEditor.tsx:149–164](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplateEditor.tsx#L149-L164) — blob `1b2377f61c6c4d11cab92887328a870a7c9b15f2`.
- [src/components/talkx/TalkXTemplateEditor.tsx:415–449](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplateEditor.tsx#L415-L449) — blob `1b2377f61c6c4d11cab92887328a870a7c9b15f2`.
- [src/hooks/integrations/useTalkXTemplates.ts:191–215](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useTalkXTemplates.ts#L191-L215) — blob `5ae4fcf9832b5faba387db1ac01278f600983bae`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-025 — Reabrir rascunho TalkX grande pode reduzir audiência pelo autosave da primeira página

**Severidade:** P1. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Reabrir draft ou scheduled com audience_source=contacts e mais recipients que o cap de retorno da consulta, mantendo válidos os demais campos exigidos pela RPC.

**Causa:** A hidratação de contact_ids é uma consulta sem paginação. Ela altera selectedContacts depois do snapshot inicial do autosave. buildPayload persiste essa seleção e snapshotDraftAudience substitui integralmente os recipients pelo conjunto filtrado.

**Cadeia observada:** Mesmo sem editar o público, a hidratação da primeira página torna autosaveFields diferente; após 3 s o save grava contact_ids parciais. A RPC vigente preserva audience_filters; o snapshot passa esses IDs ao motor e faz DELETE/INSERT de toda a audiência.

**Efeito:** Somente reabrir um rascunho grande pode reduzir sua audiência e total_recipients. A operação transacional garante consistência do conjunto errado, sem recuperar os IDs omitidos pelo cliente.

**Correção recomendada:** Hidratar a seleção completa por contrato paginado ou preservar o snapshot no servidor quando o público não foi editado; a hidratação inicial não deve marcar o draft como alteração do usuário.

**Aceite:**

- Reabrir uma audiência manual acima do cap e aguardar autosave não altera nenhum recipient ou total.
- Uma edição apenas de nome preserva integralmente a audiência.
- Uma mudança intencional de público segue sendo validada e substituída de forma transacional.

**Evidência:**

- [src/components/talkx/useCampaignEditor.ts:495–521](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/useCampaignEditor.ts#L495-L521) — blob `91f14ebbc2a16edd3affa3966ce480b42b9e9cd6`.
- [src/components/talkx/useCampaignEditor.ts:720–750](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/useCampaignEditor.ts#L720-L750) — blob `91f14ebbc2a16edd3affa3966ce480b42b9e9cd6`.
- [src/components/talkx/useCampaignEditor.ts:768–794](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/useCampaignEditor.ts#L768-L794) — blob `91f14ebbc2a16edd3affa3966ce480b42b9e9cd6`.
- [src/components/talkx/useCampaignEditor.ts:834–874](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/useCampaignEditor.ts#L834-L874) — blob `91f14ebbc2a16edd3affa3966ce480b42b9e9cd6`.
- [supabase/migrations/20261002551230_talkx_limits_ritmo.sql:324–340](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002551230_talkx_limits_ritmo.sql#L324-L340) — blob `d0a2829769b7dfdd5c6de80ab16d753aa6e826e0`; RPC de save vigente extrai audience_filters.
- [supabase/migrations/20261002551230_talkx_limits_ritmo.sql:509–525](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002551230_talkx_limits_ritmo.sql#L509-L525) — blob `d0a2829769b7dfdd5c6de80ab16d753aa6e826e0`; RPC vigente atualiza audience_filters do draft existente.
- [supabase/migrations/20261002421230_talkx_audience_snapshot.sql:420–456](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002421230_talkx_audience_snapshot.sql#L420-L456) — blob `edff145c9afed1bf3ace5940df5f729f1d14beb1`; origem segmento excluída; manual entrega seleção ao motor.
- [supabase/migrations/20261002421230_talkx_audience_snapshot.sql:465–482](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002421230_talkx_audience_snapshot.sql#L465-L482) — blob `edff145c9afed1bf3ace5940df5f729f1d14beb1`; substituição transacional de todos os recipients e contador.
- [supabase/migrations/20261002391230_talkx_audience_rpc.sql:97–101](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20261002391230_talkx_audience_rpc.sql#L97-L101) — blob `1f0a342541548d2c83c398f63a0861ce78f4d4c0`; motor limita ao array de contact_ids recebido.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- O ramo audience_source=segment define v_contact_ids=NULL e não sofre esta truncação por hidratação manual.
- SQL foi rastreado estaticamente no conjunto de migrations vencedor confirmado pelo agente de banco, sem executar migração nem consultar banco.
- Não se presume um valor específico para o cap de linhas remoto.

### R2-MOD-026 — Debounce global TalkX descarta atualização de outra campanha e desliga polling

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Duas campanhas diferentes recebem UPDATE Realtime dentro de 500 ms com a assinatura marcada como live.

**Causa:** Há um único debounceRef para todas as campanhas. O segundo evento cancela o timer que aplicaria o primeiro e a atualização restante modifica só o ID do último payload.

**Cadeia observada:** O probe original manteve A.sent_count=0 e atualizou apenas B após eventos A=1/B=1. isLive desativa o fallback de polling de campanhas.

**Efeito:** Contadores e estados de campanhas ficam silenciosamente desatualizados mesmo com indicador Ao vivo.

**Correção recomendada:** Acumular todos os payloads por ID ou invalidar/refetch uma vez para o lote inteiro; manter recuperação de eventos perdidos.

**Aceite:**

- Eventos intercalados de A e B dentro do debounce atualizam ambos.
- A recuperação não depende de uma ação manual incidental do operador.

**Evidência:**

- [src/hooks/integrations/useTalkX.ts:144–198](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useTalkX.ts#L144-L198) — blob `b68c3b95ef0e3cc5c42b4c0001a730ae90541689`.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-026`; código em `offline_probes.cjs`.

### R2-MOD-027 — Sair do wizard antes do autosave perde edição sem a proteção beforeunload

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Editar o wizard e clicar Voltar ou navegar internamente antes dos 3 s do autosave, sem usar Salvar rascunho.

**Causa:** A única guarda instalada é beforeunload. onClose chama diretamente backToList, desmonta o editor e o cleanup cancela o timer de autosave.

**Cadeia observada:** A navegação SPA não produz beforeunload e a alteração pendente não chega a persistSave.

**Efeito:** Edição é perdida sem aviso, apesar de existir uma proteção declarada para dados não salvos.

**Correção recomendada:** Vincular navegação interna ao estado dirty e aguardar flush ou oferecer descarte explícito; guardar somente mudanças realmente pendentes.

**Aceite:**

- Editar e voltar em menos de 3 s preserva a edição ou apresenta escolha clara antes de desmontar.
- Histórico do navegador e mudança de rota seguem o mesmo contrato.
- Teste exercita o wizard real e a Promise/timer de save, não só um stub de navegação.

**Evidência:**

- [src/components/talkx/TalkXCampaignWizard.tsx:52–57](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignWizard.tsx#L52-L57) — blob `db4ab96f2ff17a40158849aad4503a19e4d6ad33`.
- [src/components/talkx/TalkXCampaignWizard.tsx:115–117](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignWizard.tsx#L115-L117) — blob `db4ab96f2ff17a40158849aad4503a19e4d6ad33`.
- [src/components/talkx/useCampaignEditor.ts:846–874](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/useCampaignEditor.ts#L846-L874) — blob `91f14ebbc2a16edd3affa3966ce480b42b9e9cd6`.
- [src/components/talkx/TalkXView.tsx:136–140](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXView.tsx#L136-L140) — blob `c0581d92d355a850e82be0976de3ca0b9b18033c`; backToList desmonta o wizard.
- [src/components/talkx/TalkXView.tsx:218–230](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXView.tsx#L218-L230) — blob `c0581d92d355a850e82be0976de3ca0b9b18033c`; onClose é backToList.
- [src/components/talkx/__tests__/TalkXView.route.test.tsx:23–28](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/__tests__/TalkXView.route.test.tsx#L23-L28) — blob `90f8e6e8d1924f0b3d47ed12d54e1bdf87f1d703`; teste substitui wizard por stub sem save.
- [src/components/talkx/__tests__/TalkXView.route.test.tsx:95–114](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/__tests__/TalkXView.route.test.tsx#L95-L114) — blob `90f8e6e8d1924f0b3d47ed12d54e1bdf87f1d703`; asserts de navegação não exercitam autosave real.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-028 — Estatísticas CSAT podem continuar no snapshot anterior após atualizar as avaliações

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Avaliações já carregadas; ocorre nova submissão ou refetch e a consulta das avaliações demora mais que a derivação de stats.

**Causa:** stats é outra query com key estável por período, cujo queryFn lê surveysQuery.data. O sucesso invalida as duas queries simultaneamente e a key de stats não contém a identidade/revisão dos dados de surveys.

**Cadeia observada:** Stats pode recalcular sobre o array antigo enquanto surveys refaz a leitura. A chegada do novo array muda a lista de feedbacks sem necessariamente invalidar/refazer a query de stats já habilitada.

**Efeito:** Quantidade, média e distribuição podem discordar das avaliações mostradas na mesma tela.

**Correção recomendada:** Derivar stats diretamente do resultado atual de surveys ou usar um contrato único de agregação e atualização.

**Aceite:**

- Com refetch atrasado, ao chegar uma quarta avaliação média, total e distribuição mudam junto com a lista.
- O teste verifica valores e transição após submissão, não somente surveys definido/isLoading=false.

**Evidência:**

- [src/hooks/business/useCSAT.ts:44–81](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useCSAT.ts#L44-L81) — blob `0aafe1de8cdee42106363ecabfd4415b318a86fe`; stats depende de closure de surveys sem identidade na queryKey.
- [src/hooks/business/useCSAT.ts:83–108](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useCSAT.ts#L83-L108) — blob `0aafe1de8cdee42106363ecabfd4415b318a86fe`; invalidação simultânea e retorno ao consumidor.
- [src/components/csat/CSATDashboard.tsx:20–36](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/csat/CSATDashboard.tsx#L20-L36) — blob `04b0b80b79d298094892f5cfe2c08013e4d66d6e`; consome stats separado de surveys.
- [src/components/csat/CSATDashboard.tsx:74–104](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/csat/CSATDashboard.tsx#L74-L104) — blob `04b0b80b79d298094892f5cfe2c08013e4d66d6e`; total/distribuição e feedbacks coexistem.
- [src/hooks/__tests__/useCSAT.test.tsx:55–97](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useCSAT.test.tsx#L55-L97) — blob `c64ac6746ceca37a50b54dab79be3de7d1925abe`; asserts atuais não verificam stats ou atualização.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Confirmado por leitura do contrato de dependência entre queries; não houve execução do React Query real no navegador.

### R2-MOD-029 — Agenda filtra pendentes depois de uma consulta global que pode ser ocupada pelo histórico

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** scheduled_messages contém histórico suficiente para atingir o cap de linhas antes dos agendamentos futuros.

**Causa:** O hook global busca todos os status em scheduled_at crescente sem intervalo/paginação. O calendário filtra pending e o mês somente no cliente.

**Cadeia observada:** Mensagens antigas enviadas/canceladas entram primeiro. Uma página só de histórico vira zero pendentes, e navegar pelos meses não muda a consulta. Falha de leitura também não é exposta ao calendário.

**Efeito:** Agendamentos futuros existentes podem desaparecer da Agenda e dos contadores, impedindo revisão/cancelamento por esse fluxo.

**Correção recomendada:** Consultar pendentes pelo intervalo visível com ordenação/paginação estável, manter totais autorizados separados e propagar error.

**Aceite:**

- Histórico acima do cap não esconde pendentes no mês atual/futuro.
- Mudar o mês carrega a faixa necessária; erro não equivale a agenda vazia.
- Teste usa o calendário com histórico e pendentes além do primeiro lote.

**Evidência:**

- [src/hooks/chat/useScheduledMessages.ts:22–42](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/chat/useScheduledMessages.ts#L22-L42) — blob `68fa21fd6d09f821beef4ba9842e0f28c87b478b`; query global sem status/faixa/páginas.
- [src/components/schedule/ScheduleCalendarView.tsx:43–82](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/schedule/ScheduleCalendarView.tsx#L43-L82) — blob `08dd49b82a2e4500f780a24bd1ae0d340bc9f42b`; filtro local e navegação por mês.
- [src/components/schedule/ScheduleCalendarView.tsx:232–277](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/schedule/ScheduleCalendarView.tsx#L232-L277) — blob `08dd49b82a2e4500f780a24bd1ae0d340bc9f42b`; ações dependem dos eventos encontrados.
- [src/hooks/__tests__/useScheduledMessages.test.tsx:42–105](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/__tests__/useScheduledMessages.test.tsx#L42-L105) — blob `abb5697eb5978d39bcbdfa1194964f0e74a093a2`; fixture de dois registros; não prova completude.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Este achado é a leitura da Agenda. O sucesso prematuro de ScheduleMessageDialog e a disponibilidade do executor são cobertos por Inbox/Providers.
- O cap remoto exato e as execuções de cron não foram consultados.

### R2-MOD-030 — War Room apresenta habilitação e contatos atribuídos como presença e atendimento ativo

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (DASH-METRICS-001).

**Precondição:** Há perfis habilitados mas desconectados, contatos resolvidos ainda atribuídos ou filas com diferentes episódios históricos.

**Causa:** O hook deriva online/busy de profiles.is_active e da contagem de todos os contacts.assigned_to, sem presença nem status de conversa. Filas também contam todo contato associado e retornam avgWaitTime/slaWarnings fixos em zero.

**Cadeia observada:** Todo perfil is_active consultado vira online/busy. Contatos resolvidos contam como activeChats/inProgress. A UI publica Agentes Online, Na Fila e Em Risco com esses valores.

**Efeito:** Supervisão pode interpretar cadastro habilitado como disponibilidade real e zero risco como medição efetiva.

**Correção recomendada:** Usar presença e episódios ativos como fontes dos indicadores; distinguir métrica indisponível de zero e ligar espera/risco a medidas reais.

**Aceite:**

- Perfil habilitado offline não conta online; conversa resolvida não ocupa capacidade ativa.
- Espera e risco não são anunciados como zero quando não foram calculados.

**Evidência:**

- [src/hooks/business/useWarRoomData.ts:38–78](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useWarRoomData.ts#L38-L78) — blob `9952287758b4d9238a3806e9ba0c5050d012d225`; habilitação e todos os contatos viram presença/capacidade.
- [src/hooks/business/useWarRoomData.ts:90–110](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useWarRoomData.ts#L90-L110) — blob `9952287758b4d9238a3806e9ba0c5050d012d225`; filas sem estado do episódio; espera e risco fixos.
- [src/hooks/business/useWarRoomData.ts:120–128](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useWarRoomData.ts#L120-L128) — blob `9952287758b4d9238a3806e9ba0c5050d012d225`; agregados publicados.
- [src/components/dashboard/WarRoomDashboard.tsx:82–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/WarRoomDashboard.tsx#L82-L95) — blob `35458d3fdc3874fb38f1a5c49b1fa605f97c7850`; rótulos operacionais.

**Comparação anterior:** A auditoria anterior tratava presença/proxies no ranking e outros cards; aqui há a cadeia específica do War Room. Filas/SLA fora desse componente ficam com root.

**Limites específicos:**

- Não foi promovida a hipótese de conversations_resolved ser acumulado histórico, pois a semântica da tabela agent_stats não foi comprovada neste escopo.

### R2-MOD-031 — Auto-atualização do War Room controla apenas o relógio exibido

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (DASH-CONTROLS-001, DASH-REALTIME-001).

**Precondição:** Usar o botão Auto-atualização ou ocorrer falha nas consultas periódicas do War Room.

**Causa:** autoRefresh só habilita um setInterval que muda lastUpdate; o hook mantém refetchInterval=30000 independente do botão e sem devolver o instante/erro de confirmação.

**Cadeia observada:** Desligar o controle não interrompe as consultas. Enquanto ativo, Atualizado avança a cada 30 s mesmo sem confirmação de novos dados; Ao vivo é incondicional.

**Efeito:** O estado e a atualidade anunciados não correspondem ao comportamento de dados, comprometendo a interpretação operacional da tela.

**Correção recomendada:** Controlar o refetch real pelo botão e derivar horário/estado da consulta confirmada, com erro e dados desatualizados explícitos.

**Aceite:**

- Desligar interrompe o refetch governado pelo controle.
- Consulta falhada não avança a hora de dados confirmados nem mantém alegação incondicional de atualidade.

**Evidência:**

- [src/components/dashboard/WarRoomDashboard.tsx:38–58](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/WarRoomDashboard.tsx#L38-L58) — blob `35458d3fdc3874fb38f1a5c49b1fa605f97c7850`; autoRefresh atua somente em lastUpdate.
- [src/components/dashboard/WarRoomDashboard.tsx:69–78](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/WarRoomDashboard.tsx#L69-L78) — blob `35458d3fdc3874fb38f1a5c49b1fa605f97c7850`; indicadores e botão.
- [src/hooks/business/useWarRoomData.ts:77–79](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useWarRoomData.ts#L77-L79) — blob `9952287758b4d9238a3806e9ba0c5050d012d225`; poll de agentes sempre 30s.
- [src/hooks/business/useWarRoomData.ts:113–117](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useWarRoomData.ts#L113-L117) — blob `9952287758b4d9238a3806e9ba0c5050d012d225`; poll de filas e retorno sem estado da query.

**Comparação anterior:** Novo consumidor e mecanismo concreto (relógio local versus polling), dentro das famílias de controles/realtime já abertas.

### R2-MOD-032 — Conclusão remota da campanha não limpa seleção e modais em andamento

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Campanha selecionada sending/paused conclui ou é cancelada remotamente, com um modal de ação aberto.

**Causa:** O primeiro useEffect escreve campaign=null em prevCampaignRef antes de o efeito seguinte testar se havia campanha anterior. A condição prevCampaignRef.current!==null fica falsa.

**Cadeia observada:** O probe executou os dois efeitos originais na ordem: nenhum setter de limpeza foi chamado após a campanha sair de sending/paused. Modais permanecem renderizados fora do bloco campaign e handlers retornam sem ação quando campaign=null.

**Efeito:** Ações obsoletas permanecem abertas e sua confirmação pode não fazer nada. A correção descrita pelo comentário não cobre a transição real.

**Correção recomendada:** Comparar o estado anterior antes de atualizar a referência, ou modelar seleção/modal em um efeito de transição único.

**Aceite:**

- Com Pausar, Cancelar ou Limites aberto, mudar status para completed limpa seleção/modal e informa a conclusão.
- Teste varia o resultado do hook entre renders; fixture sending fixa não encerra esse caso.

**Evidência:**

- [src/components/talkx/TalkXCampaignRunning.tsx:498–517](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L498-L517) — blob `9c6d1a207d331a72cef5195d49175f12f7816366`; ordem dos efeitos da transição.
- [src/components/talkx/TalkXCampaignRunning.tsx:557–563](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L557-L563) — blob `9c6d1a207d331a72cef5195d49175f12f7816366`; save limites retorna sem campanha.
- [src/components/talkx/TalkXCampaignRunning.tsx:589–611](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L589-L611) — blob `9c6d1a207d331a72cef5195d49175f12f7816366`; pausar/cancelar retornam sem campanha.
- [src/components/talkx/TalkXCampaignRunning.tsx:736–837](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L736-L837) — blob `9c6d1a207d331a72cef5195d49175f12f7816366`; modais independentes da presença da campanha.
- [src/components/talkx/__tests__/TalkXCampaignRunning.limits.test.tsx:16–62](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/__tests__/TalkXCampaignRunning.limits.test.tsx#L16-L62) — blob `bf8ca3c916991d4ffa06012d03cb97d329fbe2ba`; fixture permanente sending.
- [src/components/talkx/__tests__/TalkXCampaignRunning.limits.test.tsx:116–139](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/__tests__/TalkXCampaignRunning.limits.test.tsx#L116-L139) — blob `bf8ca3c916991d4ffa06012d03cb97d329fbe2ba`; teste prova conversão de unidade, não transição de estado.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-032`; código em `offline_probes.cjs`.

### R2-MOD-033 — Ritmo e prazo da campanha usam os primeiros envios e minutos não consecutivos

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (IA-TALKX-001).

**Precondição:** Campanha com mais de 2000 envios ou pausas/minutos sem envio; abrir Resultados em Campanha em Andamento.

**Causa:** A query lê sent_at crescente com limit(2000), agrupa somente minutos que tiveram eventos e corta os vinte últimos grupos dessa amostra. A média divide os últimos dez grupos por sua quantidade e os chama de últimos dez minutos.

**Cadeia observada:** Depois de atingir o cap, envios novos não entram na série. Pausas são omitidas do denominador e minutos antigos podem sustentar um ritmo positivo usado para calcular conclusão prevista.

**Efeito:** Velocidade, gráfico e prazo estimado podem continuar refletindo uma fase anterior e superestimar o ritmo atual.

**Correção recomendada:** Consultar a janela temporal recente no servidor, agregar todos os eventos com buckets consecutivos incluindo zeros e computar o prazo dessa mesma janela.

**Aceite:**

- Envio 2001 e posteriores alteram a série recente.
- Dez minutos sem envio resultam em ritmo zero/indisponível, sem previsão otimista baseada nos dez últimos minutos não vazios.

**Evidência:**

- [src/components/talkx/TalkXCampaignRunning.tsx:419–439](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L419-L439) — blob `9c6d1a207d331a72cef5195d49175f12f7816366`; média por grupos com rótulo últimos 10 min.
- [src/components/talkx/TalkXCampaignRunning.tsx:453–457](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L453-L457) — blob `9c6d1a207d331a72cef5195d49175f12f7816366`; ETA usa essa média.
- [src/components/talkx/TalkXCampaignRunning.tsx:519–544](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignRunning.tsx#L519-L544) — blob `9c6d1a207d331a72cef5195d49175f12f7816366`; primeiros 2000 e buckets esparsos.

**Comparação anterior:** Amostra/semântica temporal reaparece em consumidor diferente dos insights: Running usa ordenação crescente e ainda deriva ETA dos grupos esparsos.

### R2-MOD-034 — Lista de supressão não identifica nem encontra bloqueios cadastrados somente por telefone

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Existe talkx_blacklist com phone preenchido e contact_id null, formato aceito pelo contrato do módulo.

**Causa:** O componente define/consome a identidade exclusivamente pelo join contacts. Não usa o phone próprio da entrada na pesquisa ou na linha.

**Cadeia observada:** O bloqueio aparece sem nome/telefone útil; pesquisar o número não o encontra. A confirmação de remoção também não identifica esse destino.

**Efeito:** O operador não consegue localizar e conferir de forma confiável um bloqueio válido por número antes de gerenciá-lo.

**Correção recomendada:** Representar explicitamente bloqueios por contato e por telefone, com fallback normalizado na busca, linha e confirmação.

**Aceite:**

- Entrada phone-only aparece com seu número, é encontrada pela busca e a confirmação de remoção identifica exatamente o destino.

**Evidência:**

- [src/hooks/integrations/useTalkXSuppression.ts:13–35](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useTalkXSuppression.ts#L13-L35) — blob `528eb1beac8a5a419329736c1e5791ec26335a88`; contrato admite contato nulo e phone.
- [src/components/talkx/TalkXSuppression.tsx:24–35](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L24-L35) — blob `6192e65588d1e204cf70704428690858090c9f76`; UI só tipa identidade do contato.
- [src/components/talkx/TalkXSuppression.tsx:82–88](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L82-L88) — blob `6192e65588d1e204cf70704428690858090c9f76`; busca ignora phone da entrada.
- [src/components/talkx/TalkXSuppression.tsx:160–178](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L160-L178) — blob `6192e65588d1e204cf70704428690858090c9f76`; linha usa somente join.
- [src/components/talkx/TalkXSuppression.tsx:250–254](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L250-L254) — blob `6192e65588d1e204cf70704428690858090c9f76`; confirmação sem fallback por telefone.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Não se afirma que a efetividade da supressão falha no motor: o agente de banco confirmou filtragem vigente por removed_at e expires_at.

### R2-MOD-035 — Cadastro de supressão busca contato somente no primeiro lote carregado

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** O contato procurado existe além do cap da consulta contacts ordenada por name.

**Causa:** A abertura carrega uma única consulta sem paginação e o texto de pesquisa apenas filtra esse array em memória, cortando os resultados em cinquenta.

**Cadeia observada:** Buscar pelo nome/telefone exato de um contato fora da primeira página devolve Nenhum contato encontrado, sem nova consulta ao servidor.

**Efeito:** O operador não consegue cadastrar bloqueio manual para parte da base usando esse formulário.

**Correção recomendada:** Aplicar busca paginada no servidor por nome/telefone com estado pendente/erro e exclusão correta dos já bloqueados.

**Aceite:**

- Contato além do primeiro lote é encontrado por nome e telefone e pode ser bloqueado.
- Teste verifica que mudar a busca emite a consulta correspondente.

**Evidência:**

- [src/components/talkx/TalkXSuppression.tsx:65–80](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L65-L80) — blob `6192e65588d1e204cf70704428690858090c9f76`; fetch único e filtro local.
- [src/components/talkx/TalkXSuppression.tsx:215–226](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L215-L226) — blob `6192e65588d1e204cf70704428690858090c9f76`; busca e vazio do formulário.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Não se presume o cap remoto exato; o limite explícito de cinquenta é apenas o corte da lista local exibida.

### R2-MOD-036 — Consumidores Talk X ainda convertem erro de leitura em vazio ou carregamento indefinido

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (TX03).

**Precondição:** Falhar a consulta de campanhas, segmentos, supressão ou campanha individual sem dados prévios válidos.

**Causa:** A query/hook conserva ou lança error, mas os componentes não o usam. Overview não recebe isError, Segments e Suppression seguem pelo array vazio, Scheduled retorna null e LiveMonitor aguarda campaign indefinidamente.

**Cadeia observada:** Uma falha pode aparecer como Nenhum segmento/Nenhum contato, nenhum conteúdo de agendamento ou skeleton contínuo no monitor, sem retry específico.

**Efeito:** Falha de acesso/rede é confundida com inexistência de dados e impede recuperação orientada pelo operador.

**Correção recomendada:** Aplicar estados de carregamento, erro, vazio confirmado e dados desatualizados em cada consumidor real.

**Aceite:**

- Injetar erro em cada uma das consultas mostra mensagem recuperável e preserva saída/navegação.
- Nenhum erro sem cache é apresentado como zero entidades ou loading perpétuo.

**Evidência:**

- [src/components/talkx/TalkXView.tsx:335–344](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXView.tsx#L335-L344) — blob `c0581d92d355a850e82be0976de3ca0b9b18033c`; Overview recebe loading mas não isError.
- [src/components/talkx/TalkXOverview.tsx:196–205](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXOverview.tsx#L196-L205) — blob `17e8a2b2e9b9cb787b0c604c79ef123fed0fdee2`; erro vira emptyCampaigns.
- [src/components/talkx/TalkXSegments.tsx:26–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L26-L39) — blob `5062084f588316ac8421858d37050d1a1558ae23`; isError extraído.
- [src/components/talkx/TalkXSegments.tsx:117–121](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L117-L121) — blob `5062084f588316ac8421858d37050d1a1558ae23`; render ignora erro.
- [src/components/talkx/TalkXSuppression.tsx:52–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L52-L63) — blob `6192e65588d1e204cf70704428690858090c9f76`; erro lançado sem expor no consumidor.
- [src/components/talkx/TalkXSuppression.tsx:149–152](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L149-L152) — blob `6192e65588d1e204cf70704428690858090c9f76`; fallback vazio.
- [src/components/talkx/TalkXCampaignScheduled.tsx:49–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXCampaignScheduled.tsx#L49-L63) — blob `270b8aa0b5b7bf7943343e708b051c114647b642`; sem registro retorna null.
- [src/components/talkx/TalkXLiveMonitor.tsx:43–51](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXLiveMonitor.tsx#L43-L51) — blob `e291213b0185d2dcaa6e940e6f54fb77881102b0`; query campanha lança erro.
- [src/components/talkx/TalkXLiveMonitor.tsx:97–100](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXLiveMonitor.tsx#L97-L100) — blob `e291213b0185d2dcaa6e940e6f54fb77881102b0`; ausência equivale a skeleton.

**Comparação anterior:** TX03 já mostrava adoção incompleta dos estados como gap do plano; esta extensão localiza ramos concretos de consumidores além do kit e inclui supressão/segmentos/agendamento/monitor.

### R2-MOD-037 — Analytics Talk X rotula taxa de envio como entrega e usa volume para recomendar abertura

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (IA-TALKX-001).

**Precondição:** Campanhas têm sent_count diferente de delivered_count, ou horas de maior volume não têm maior taxa de abertura.

**Causa:** compareData calcula sent_count/total_recipients, mas a legenda chama a série de Taxa de entrega. bestHour usa contagem de sent_at, sem denominador nem read_at, e o texto promete maior abertura.

**Cadeia observada:** O comparativo pode exibir envio de 100% sob legenda de entrega mesmo com entregues abaixo de 100%. O melhor horário é simplesmente o maior volume da amostra enviada.

**Efeito:** O operador interpreta sucesso de entrega e recomendações de horário com uma semântica que os dados consultados não medem.

**Correção recomendada:** Alinhar rótulos às fórmulas; para afirmar entrega/abertura usar ocorrências e denominadores apropriados, período e fuso explícitos.

**Aceite:**

- Caso sent=100/delivered=20 distingue taxa de envio de taxa de entrega em todas as legendas.
- Horário com volume alto e abertura baixa não é anunciado como melhor para abertura sem cálculo correspondente.

**Evidência:**

- [src/components/talkx/TalkXAnalytics.tsx:42–57](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXAnalytics.tsx#L42-L57) — blob `d05d5b9c8812348058ebde185cf02e5a4f2b7c9e`; origem é sent_at e volume.
- [src/components/talkx/TalkXAnalytics.tsx:118–133](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXAnalytics.tsx#L118-L133) — blob `d05d5b9c8812348058ebde185cf02e5a4f2b7c9e`; fórmula envio no comparativo.
- [src/components/talkx/TalkXAnalytics.tsx:150–158](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXAnalytics.tsx#L150-L158) — blob `d05d5b9c8812348058ebde185cf02e5a4f2b7c9e`; pico por contagem.
- [src/components/talkx/TalkXAnalytics.tsx:265–275](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXAnalytics.tsx#L265-L275) — blob `d05d5b9c8812348058ebde185cf02e5a4f2b7c9e`; texto de entrega e abertura.
- [src/components/talkx/TalkXAnalytics.tsx:337–364](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXAnalytics.tsx#L337-L364) — blob `d05d5b9c8812348058ebde185cf02e5a4f2b7c9e`; legenda de entrega para série de envio.

**Comparação anterior:** Evidência adicional no Analytics principal, distinta da implementação useTalkXInsights anteriormente apontada.

### R2-MOD-038 — Detalhe de segmento conserva cópia antiga depois de salvar e pode reabrir campos obsoletos

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Editar um segmento selecionado, salvar, aguardar a query atualizada e usar Editar segmento no painel lateral ainda selecionado.

**Causa:** selected guarda o objeto inteiro. A mutation invalida a lista, mas save apenas muda mode para list; não substitui selected pelo retorno nem o deriva da lista por ID.

**Cadeia observada:** O painel continua recebendo o objeto anterior. Sua ação onEdit chama openEdit(selected), restaurando as regras/nome antigos no formulário.

**Efeito:** A tela contradiz a persistência recém-concluída e salvar outra pequena edição pode reverter inadvertidamente a alteração anterior.

**Correção recomendada:** Guardar selectedId e derivar da query atual, ou atualizar selected com a entidade confirmada após cada mutation.

**Aceite:**

- Editar regras, salvar e reabrir pelo painel lateral mantém as regras salvas.
- Nome, favorito, status e audiência do painel acompanham o objeto atual da query.

**Evidência:**

- [src/components/talkx/TalkXSegments.tsx:33–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L33-L39) — blob `5062084f588316ac8421858d37050d1a1558ae23`; selected armazena snapshot inteiro.
- [src/components/talkx/TalkXSegments.tsx:59–81](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L59-L81) — blob `5062084f588316ac8421858d37050d1a1558ae23`; save não atualiza selected.
- [src/components/talkx/TalkXSegments.tsx:176–180](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L176-L180) — blob `5062084f588316ac8421858d37050d1a1558ae23`; rail reabre objeto antigo.
- [src/hooks/integrations/useTalkXSegments.ts:344–355](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useTalkXSegments.ts#L344-L355) — blob `e5e75e65e519dd94de85be9b515fce40d870e69f`; update retorna entidade mas só invalida a query.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-039 — Ação Novo template abre o wizard de campanha

**Severidade:** P3. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Usar o menu Templates → Novo template no topo do módulo.

**Causa:** O handler chama openNew, que limpa editingCampaign e escreve wizard=new; não abre TalkXTemplateEditor.

**Cadeia observada:** A ação nomeada Novo template leva à criação de campanha com passos de público/mensagem/entrega.

**Efeito:** O atalho não executa o objetivo anunciado e pode induzir criação de um rascunho de campanha desnecessário.

**Correção recomendada:** Encaminhar para criação de template ou ajustar o rótulo para o destino verdadeiro.

**Aceite:**

- Clicar Novo template abre editor de template vazio e salvar cria somente um template.

**Evidência:**

- [src/components/talkx/TalkXView.tsx:118–122](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXView.tsx#L118-L122) — blob `c0581d92d355a850e82be0976de3ca0b9b18033c`; openNew abre wizard de campanha.
- [src/components/talkx/TalkXView.tsx:322–331](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXView.tsx#L322-L331) — blob `c0581d92d355a850e82be0976de3ca0b9b18033c`; menu Novo template chama openNew.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-040 — Resposta tardia de geração de áudio pode iniciar reprodução após fechar o diálogo

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Iniciar Gerar Preview de efeito/música na biblioteca de mídia e fechar o diálogo antes da resposta.

**Causa:** Fechar apenas pausa o audioRef atual e limpa preview. O callback pendente não tem cancelamento/geração vinculada à abertura e, quando termina, cria novo Audio e chama play.

**Cadeia observada:** A resposta pode repor genPreviewUrl e iniciar reprodução depois do fechamento. O componente permanece montado no administrador de áudio.

**Efeito:** Áudio começa sem diálogo visível para controlar a reprodução; reabertura também pode recuperar um resultado antigo como preview atual.

**Correção recomendada:** Invalidar a geração no fechamento/desmontagem e validar identidade antes de aplicar preview ou iniciar reprodução.

**Aceite:**

- Fechar enquanto a requisição está pendente e resolver depois não chama Audio.play nem repõe preview.
- Reabrir e gerar B descarta resposta tardia de A.

**Evidência:**

- [src/components/settings/media-library/AIGenerateDialog.tsx:14–36](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/media-library/AIGenerateDialog.tsx#L14-L36) — blob `b5c329adff3cae5b1a3f31ff2b4fc48f9164c4f5`; requisição seguida de preview e play incondicional.
- [src/components/settings/media-library/AIGenerateDialog.tsx:57–70](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/media-library/AIGenerateDialog.tsx#L57-L70) — blob `b5c329adff3cae5b1a3f31ff2b4fc48f9164c4f5`; fechar só limpa estado e pausa áudio existente.
- [src/components/settings/MediaLibraryAdmin.tsx:57–64](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/MediaLibraryAdmin.tsx#L57-L64) — blob `0f7f892e86413211f34e27fd13ffc151eb44a2cd`; diálogo permanece montado para audio_memes.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Contratos externos ElevenLabs e disponibilidade da geração ficam com Providers. Este achado trata o desfecho assíncrono do consumidor.

### R2-MOD-041 — Exportar catálogo perde quase todos os filtros da listagem

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY (OTH-004).

**Precondição:** Aplicar busca, categoria, fornecedor, estoque baixo, filtros avançados ou duas flags simultâneas e usar Exportar catálogo no rail da gestão.

**Causa:** A consulta de produtos recebe o objeto completo de filtros, mas a propriedade exportFilter reduz esse estado a uma única chave com precedência in_stock, featured, new_30d. O rail reconstrói somente essa flag e não recebe os demais filtros.

**Cadeia observada:** O atalho anuncia CSV do filtro atual; o fetch de exportação consulta um conjunto maior, possivelmente o catálogo inteiro quando só existe busca/categoria/fornecedor/avançados.

**Efeito:** O arquivo contém produtos fora da seleção de negócio exibida na tela, mesmo com menos de 1.000 resultados e sem empates de ordenação.

**Correção recomendada:** Passar os mesmos filtros normalizados da listagem para o export, retirando apenas offset/limit e aplicando a paginação própria da exportação.

**Aceite:**

- Busca + categoria + fornecedor + cor/preço geram consultas de exportação com os mesmos predicados da listagem.
- Duas flags ligadas são preservadas simultaneamente e o CSV não contém produtos que falhem em qualquer filtro.

**Evidência:**

- [src/components/catalog/ExternalProductManagement.tsx:470–497](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L470-L497) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; filtros completos da listagem.
- [src/components/catalog/ExternalProductManagement.tsx:596–601](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L596-L601) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; redução a uma flag.
- [src/components/catalog/ExternalProductManagement.tsx:1128–1137](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L1128-L1137) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; único filtro passado ao rail.
- [src/components/catalog/CatalogRail.tsx:350–358](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogRail.tsx#L350-L358) — blob `0ee85605a3a494a642265cad65f0571e6c837a48`; promessa CSV do filtro atual.
- [src/components/catalog/CatalogRail.tsx:449–457](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogRail.tsx#L449-L457) — blob `0ee85605a3a494a642265cad65f0571e6c837a48`; callback constrói filtros a partir da flag.
- [src/components/catalog/catalogExport.ts:152–158](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/catalogExport.ts#L152-L158) — blob `040ad705331fc3f8a6f7030c0909e676ddb30b62`; mapeamento admite uma flag apenas.
- [src/components/catalog/catalogExport.ts:204–209](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/catalogExport.ts#L204-L209) — blob `040ad705331fc3f8a6f7030c0909e676ddb30b62`; filtros seguem para a edge.
- [src/components/catalog/__tests__/CatalogRail.test.tsx:206–219](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/__tests__/CatalogRail.test.tsx#L206-L219) — blob `10158e0ffc559ad11165612cccd3d0597b9a95fe`; teste isolado cobre apenas ausência ou uma flag.

**Comparação anterior:** OTH-004 trata ordenação empatada e paginação por offset. Esta causa ocorre antes da paginação, na perda do objeto de filtros; é descoberta nova, não correção daquele achado.

### R2-MOD-042 — Histórico de envios do catálogo esconde registros além dos 500 mais recentes

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** O usuário possui visibilidade para mais de 500 eventos catalog_send_events, ou procura um envio/status que só exista além desse corte.

**Causa:** useCatalogSendHistory aplica limit(500) sem total/continuação. A aba aplica busca/status, total de paginação e exportação ao array já truncado.

**Cadeia observada:** A busca pode declarar Nenhum envio com esses filtros para um registro existente; paginação termina em 500 e CSV contém só o lote carregado. A UI não informa o corte nem oferece período/continuação.

**Efeito:** Histórico operacional e reconciliação de envios ficam incompletos; filtros de falha podem ocultar falhas antigas mesmo quando o resultado filtrado teria poucas linhas.

**Correção recomendada:** Levar filtros e paginação ao servidor e obter total/hasMore; permitir exportar o recorte completo ou declarar explicitamente o limite enquanto houver contrato parcial.

**Aceite:**

- Com 501 eventos, o evento mais antigo é localizável por busca e status sem depender de estar entre os 500 recentes.
- Total, páginas e CSV representam o mesmo recorte de negócio, com indicador explícito de limite se a exportação for parcial.

**Evidência:**

- [src/hooks/integrations/useCatalogSendHistory.ts:44–50](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useCatalogSendHistory.ts#L44-L50) — blob `5fe3952fcd295eebb894158cd0fe3205e162d272`; teto interno explícito.
- [src/hooks/integrations/useCatalogSendHistory.ts:71–90](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useCatalogSendHistory.ts#L71-L90) — blob `5fe3952fcd295eebb894158cd0fe3205e162d272`; consulta limitada sem contagem.
- [src/components/catalog/ExternalProductManagement.tsx:353–387](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L353-L387) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; filtros e exportação locais.
- [src/components/catalog/ExternalProductManagement.tsx:1186–1208](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L1186-L1208) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; vazio e paginação com tamanho do lote.
- [src/components/catalog/CatalogHelpSheet.tsx:88–114](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogHelpSheet.tsx#L88-L114) — blob `60540eb26c5097cea0e89cdfed22dbf56723b17e`; orienta acompanhar cada envio na aba sem informar corte.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- O limite está documentado em comentário interno do hook como v1; o achado é a omissão no fluxo do usuário e a falta de continuação, não uma ausência de intenção no código.

### R2-MOD-043 — Favoritar em lote anuncia sucesso antes da escrita e oculta falhas de persistência

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Selecionar produtos ainda não favoritos e usar Favoritar N; uma ou mais escritas falham ou permanecem pendentes.

**Causa:** Os dois consumidores executam toggle com void em forEach e imediatamente anunciam a quantidade inteira. O hook reverte cache e registra log, mas não lança nem retorna falha ao chamador.

**Cadeia observada:** A mensagem produto(s) adicionado(s) aos favoritos aparece antes de qualquer resposta e permanece como confirmação mesmo se todos os inserts falharem.

**Efeito:** O usuário acredita ter salvo uma seleção reutilizável que não está persistida e não recebe uma relação dos itens que precisa tentar novamente.

**Correção recomendada:** Fazer a operação retornar resultado por item, aguardar o lote e anunciar apenas o número confirmado; conservar falhas para retentativa.

**Aceite:**

- Nenhuma confirmação final aparece enquanto o lote está pendente.
- Falha total gera erro e zero adicionados; falha parcial discrimina adicionados e falhos.
- Teste integra o callback com promessas resolvidas/rejeitadas em vez de verificar somente a chamada de um spy síncrono.

**Evidência:**

- [src/components/catalog/ExternalProductManagement.tsx:433–441](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L433-L441) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; toast imediato após void toggle.
- [src/components/catalog/ExternalProductCatalog.tsx:350–356](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L350-L356) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`; mesmo comportamento no catálogo do chat.
- [src/hooks/integrations/useExternalCatalog.ts:483–525](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useExternalCatalog.ts#L483-L525) — blob `3800598b759962f286a0fa94ce04c7c2cd458442`; escrita async, rollback e erro somente em log.
- [src/components/catalog/__tests__/ExternalProductManagement.test.tsx:581–594](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/__tests__/ExternalProductManagement.test.tsx#L581-L594) — blob `cdc4e649b86ad0f3bcc195e0bba0da3f49f52e04`; teste usa vi.fn e só verifica invocação.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-044 — Ranking Mais enviados do catálogo conta tentativas que falharam totalmente

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Há eventos catalog_send_events com status failed na janela de 30 dias; a falha pode ocorrer em envio individual normal, sem depender do erro do envio em lote R2-MOD-007.

**Causa:** O envio individual classifica falha total e registra seu status. A consulta do ranking seleciona apenas product_id/product_name, não filtra status e incrementa o contador para cada evento.

**Cadeia observada:** Um produto com várias falhas e nenhuma mensagem enviada pode liderar Mais enviados, pois cada tentativa falha acrescenta uma unidade ao ranking.

**Efeito:** O indicador orienta o agente com uma medida de tentativas apresentada como sucesso de envio.

**Correção recomendada:** Definir explicitamente a medida: filtrar eventos com envio bem-sucedido, ou nomear o ranking como tentativas e separar falhas/entregas.

**Aceite:**

- Um produto com zero envios bem-sucedidos e dez falhas não supera outro com um envio confirmado em um ranking chamado Mais enviados.
- O tratamento de partial é definido e testado separadamente de failed.

**Evidência:**

- [src/components/catalog/useSendProduct.ts:209–239](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/useSendProduct.ts#L209-L239) — blob `54c9a4002342a557ea5e0c95e83721ef312f436e`; falha total recebe failed e é registrada.
- [src/hooks/integrations/useCatalogContactSearch.ts:83–101](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useCatalogContactSearch.ts#L83-L101) — blob `fb9880912d3d8b5cb357da035ef8036a07e03197`; logger preserva o status recebido.
- [src/hooks/integrations/useCatalogRecentSends.ts:84–106](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/integrations/useCatalogRecentSends.ts#L84-L106) — blob `5ca329154cb1a6c8cd5f20540c1e3d7de6232327`; ranking soma eventos sem filtro ou leitura de status.
- [src/components/catalog/CatalogRail.tsx:320–327](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogRail.tsx#L320-L327) — blob `0ee85605a3a494a642265cad65f0571e6c837a48`; indicador é apresentado como Mais enviados nos últimos 30 dias.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Este achado não depende do corte de 20 páginas do mesmo hook; ele se reproduz conceitualmente com apenas poucos eventos.

### R2-MOD-045 — Enviar variação perde a cor escolhida no catálogo de gestão

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Abrir o detalhe de um produto com variantes na gestão, selecionar uma cor e clicar Enviar variação.

**Causa:** O detalhe entrega onSend(produto, cor), mas ExternalProductCard declara callback de um argumento e a gestão handleSendProduct só salva o produto. initialVariantColor do diálogo vem exclusivamente do deep link.

**Cadeia observada:** O diálogo de envio abre no modo Produto Completo, apesar do CTA indicar a variação escolhida; cor e fotos específicas não são preservadas.

**Efeito:** O agente precisa refazer a escolha ou pode enviar a apresentação de todas as variantes sem perceber a perda de intenção.

**Correção recomendada:** Preservar a cor no contrato do wrapper e no estado da gestão, associada ao produto, e passá-la a initialVariantColor.

**Aceite:**

- Na gestão, selecionar Azul no detalhe e clicar Enviar variação abre o diálogo em Variação Específica / Azul.
- Fechar e abrir outro produto não reutiliza a cor anterior.

**Evidência:**

- [src/components/catalog/ProductDetailDialog.tsx:618–625](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L618-L625) — blob `4faa61bfc188a269b548195f895e3190b940df69`; CTA entrega produto e cor.
- [src/components/catalog/CatalogProductCard.tsx:489–492](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogProductCard.tsx#L489-L492) — blob `d9751477fd96651fc66dc2d4d7fde40ce251a4b5`; callback repassado ao detalhe.
- [src/components/catalog/ExternalProductCard.tsx:9–12](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCard.tsx#L9-L12) — blob `45904597cd7ece7b0368e75d381cedd558ce4ccf`; wrapper só declara produto.
- [src/components/catalog/ExternalProductCard.tsx:36–40](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCard.tsx#L36-L40) — blob `45904597cd7ece7b0368e75d381cedd558ce4ccf`; mesmo callback chega ao card.
- [src/components/catalog/ExternalProductManagement.tsx:600–604](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L600-L604) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; handler ignora segundo argumento.
- [src/components/catalog/ExternalProductManagement.tsx:1097–1106](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductManagement.tsx#L1097-L1106) — blob `de112ff85dda84986ad5d9efe7269ee29c31b60e`; preset de variante exclusivo do deep link.
- [src/components/catalog/SendProductDialog.tsx:178–190](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/SendProductDialog.tsx#L178-L190) — blob `01b5b9aaa7c2329fa51ace026a1f98d2be2e6d35`; preset é o caminho que seleciona a variante ao abrir.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-046 — Reabrir detalhe do cartão A pode continuar exibindo o produto B navegado anteriormente

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** No catálogo do chat com dois produtos, abrir A, navegar para B pelo botão Próximo produto, fechar o painel e clicar Ver novamente no cartão A sem desmontar a listagem.

**Causa:** ProductDetailDialog permanece montado em cada cartão. nav só se invalida se product.id mudar, mas esse id é sempre A na instância; a transição open false/true não reinicia nav.

**Cadeia observada:** Ao reabrir o cartão A, activeIdx continua apontando para B e shown/ações usam B.

**Efeito:** Detalhe e possível envio correspondem a outro produto que o cartão acionado; há quebra de identidade da seleção.

**Correção recomendada:** Reiniciar o índice na abertura a partir do produto do cartão ou tornar a seleção do produto controlada pelo pai.

**Aceite:**

- A→Próximo B→Fechar→Ver A reabre A e suas ações recebem o ID de A.
- Navegar enquanto aberto continua funcionando e preserva somente a seleção dessa abertura.

**Evidência:**

- [src/components/catalog/ExternalProductCatalog.tsx:541–552](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L541-L552) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`; lista repassada ao card no chat.
- [src/components/catalog/CatalogProductCard.tsx:228–232](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogProductCard.tsx#L228-L232) — blob `d9751477fd96651fc66dc2d4d7fde40ce251a4b5`; abrir só altera booleano.
- [src/components/catalog/CatalogProductCard.tsx:489–492](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogProductCard.tsx#L489-L492) — blob `d9751477fd96651fc66dc2d4d7fde40ce251a4b5`; detalhe montado mesmo fechado.
- [src/components/catalog/ProductDetailDialog.tsx:229–244](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L229-L244) — blob `4faa61bfc188a269b548195f895e3190b940df69`; nav não depende de open.
- [src/components/catalog/ProductDetailDialog.tsx:293–304](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L293-L304) — blob `4faa61bfc188a269b548195f895e3190b940df69`; navegação altera índice interno.
- [src/components/catalog/ProductDetailDialog.tsx:618–625](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L618-L625) — blob `4faa61bfc188a269b548195f895e3190b940df69`; ação usa produto efetivamente mostrado.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- A navegação entre produtos só é disponibilizada quando products é passado, como no catálogo do chat; o wrapper da gestão não passa essa lista.

### R2-MOD-047 — Galeria mantém índice fora do intervalo ao navegar para produto com menos imagens

**Severidade:** P3. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** No detalhe com navegação entre produtos, visualizar uma imagem de índice alto de A e avançar para B, que possui menos imagens.

**Causa:** ImageGallery mantém idx em useState, não recebe key do produto e não ajusta o índice quando product/images mudam. O ajuste de focusToken só altera idx se houver uma URL correspondente.

**Cadeia observada:** current cai para a imagem principal, mas o contador pode exibir 5 / 1 e Imagem anterior continua habilitada para índices sem imagem.

**Efeito:** Contador e navegação da galeria ficam incoerentes até o usuário voltar manualmente a um índice válido.

**Correção recomendada:** Reiniciar ou limitar idx ao mudar a identidade do produto/conjunto de imagens, com estado associado ao produto.

**Aceite:**

- Da quinta imagem de A para B com uma imagem, o contador é 1 / 1 e nenhuma seta aponta para um índice inexistente.

**Evidência:**

- [src/components/catalog/ProductDetailDialog.tsx:89–103](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L89-L103) — blob `4faa61bfc188a269b548195f895e3190b940df69`; índice persistente e fallback de current.
- [src/components/catalog/ProductDetailDialog.tsx:120–125](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L120-L125) — blob `4faa61bfc188a269b548195f895e3190b940df69`; focus sem URL não reinicia índice.
- [src/components/catalog/ProductDetailDialog.tsx:162–180](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L162-L180) — blob `4faa61bfc188a269b548195f895e3190b940df69`; contador e seta derivam do índice antigo.
- [src/components/catalog/ProductDetailDialog.tsx:324–328](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ProductDetailDialog.tsx#L324-L328) — blob `4faa61bfc188a269b548195f895e3190b940df69`; galeria sem key ao mudar dp.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-048 — Favoritos convertem preço e estoque desconhecidos em zero real na interface e no envio

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Abrir Meus favoritos no catálogo do chat; para a consequência de envio, usar a aba Favoritos da gestão quando a consulta do produto completo demora ou falha.

**Causa:** favoriteToProduct fabrica sale_price=0 e stock_quantity=0 para uma snapshot que não guarda esses campos. O card trata zero como esgotado. O diálogo usa a snapshot como fallback e seus bloqueios não aguardam a hidratação nem tratam erro do produto.

**Cadeia observada:** No chat, todos os favoritos mostram preço zero/esgotado e têm Enviar desabilitado mesmo para produtos com estoque. Pela aba Favoritos da gestão, pode-se avançar/enviar o texto com R$ 0,00 e Em estoque: 0 un. antes de obter dados reais, desde que os demais requisitos de envio estejam satisfeitos.

**Efeito:** O atalho de favoritos fica inutilizável para envio direto no chat e pode anunciar informação comercial inventada no outro consumidor.

**Correção recomendada:** Representar campos ausentes como desconhecidos, hidratar o produto antes de habilitar ação que depende de preço/estoque e apresentar erro/retentativa da consulta.

**Aceite:**

- Favorito cujo produto tem estoque real não é rotulado Esgotado apenas por não ter snapshot de estoque.
- Enquanto preço/estoque completos estiverem pendentes ou indisponíveis, o fluxo não monta nem envia valores zero como se fossem dados reais.

**Evidência:**

- [src/components/catalog/catalogShared.tsx:945–977](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/catalogShared.tsx#L945-L977) — blob `c716f9ab2bb47a59cd2a1836b92acb308d959a38`; snapshot com zeros e variantes null.
- [src/components/catalog/ExternalProductCatalog.tsx:533–552](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/ExternalProductCatalog.tsx#L533-L552) — blob `768a320e87b348db6ca1a6ee1b15f757533e9150`; favoritos viram cards comuns.
- [src/components/catalog/CatalogProductCard.tsx:228–244](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogProductCard.tsx#L228-L244) — blob `d9751477fd96651fc66dc2d4d7fde40ce251a4b5`; stockout derivado de zero bloqueia envio.
- [src/components/catalog/CatalogProductCard.tsx:455–479](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogProductCard.tsx#L455-L479) — blob `d9751477fd96651fc66dc2d4d7fde40ce251a4b5`; preço zero e bloqueio visíveis.
- [src/components/catalog/CatalogFavoritesTab.tsx:57–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogFavoritesTab.tsx#L57-L63) — blob `2a2283d342d8d973c7332822a981baf96c437481`; aba da gestão abre envio sem consulta anterior.
- [src/components/catalog/CatalogFavoritesTab.tsx:124–130](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/CatalogFavoritesTab.tsx#L124-L130) — blob `2a2283d342d8d973c7332822a981baf96c437481`; snapshot enviada ao diálogo.
- [src/components/catalog/SendProductDialog.tsx:104–108](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/SendProductDialog.tsx#L104-L108) — blob `01b5b9aaa7c2329fa51ace026a1f98d2be2e6d35`; fallback mantém snapshot pendente ou com erro.
- [src/components/catalog/SendProductDialog.tsx:603–609](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/SendProductDialog.tsx#L603-L609) — blob `01b5b9aaa7c2329fa51ace026a1f98d2be2e6d35`; bloqueios não incluem carga/erro do produto.
- [src/components/catalog/SendProductDialog.tsx:634–652](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/SendProductDialog.tsx#L634-L652) — blob `01b5b9aaa7c2329fa51ace026a1f98d2be2e6d35`; passo de contato recebe apenas readiness do envio.
- [src/components/catalog/sendProductUtils.ts:55–95](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/catalog/sendProductUtils.ts#L55-L95) — blob `6460d216d9ab005fa4a9d9dd5bc9f830f6d1f644`; mensagem materializa zeros como preço e estoque.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-049 — Editar contato da tarefa não persiste o vínculo escolhido

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** No Sheet de uma tarefa, trocar o Contato ou escolher Sem contato e salvar.

**Causa:** O formulário emite patch.contactId, mas toDbPatch e toItemPatch não mapeiam contactId/contact_id. A chamada update recebe um objeto sem essa alteração.

**Cadeia observada:** O Sheet fecha; após recarregar, a tarefa permanece vinculada ao contato antigo. Se só o vínculo mudou, o DTO de update fica vazio.

**Efeito:** O controle aparente de vínculo não funciona e a tarefa continua aparecendo sob o contato anterior.

**Correção recomendada:** Mapear contactId para contact_id na persistência e no cache, atualizar/invalidar os embeds e escopos por contato de forma coerente.

**Aceite:**

- Trocar A por B persiste contact_id=B, remove a tarefa do recorte A e mostra no recorte B.
- Escolher Sem contato persiste null e não preserva o embed antigo.

**Evidência:**

- [src/components/tasks/shared/WorkItemSheet.tsx:282–297](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L282-L297) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; controle de contato editável.
- [src/components/tasks/shared/WorkItemSheet.tsx:193–203](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L193-L203) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; patch de contato enviado antes de fechar.
- [src/components/tasks/TasksModule.tsx:365–374](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L365-L374) — blob `33c1ab2beebb194087c2044c1bc72a6af1f5e64e`; onSave encaminha ao hook.
- [src/hooks/tasks/useMyWorkItems.ts:149–170](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L149-L170) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; mapeadores ignoram contactId.
- [src/hooks/tasks/useMyWorkItems.ts:358–371](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L358-L371) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; update e cache usam os mapeadores.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-049`; código em `offline_probes.cjs`.

### R2-MOD-050 — Salvar tarefa reconstrói datas locais sem offset e pode deslocar prazo e alarme

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Editar uma tarefa com prazo/alarme em navegador cujo fuso difere do fuso da sessão PostgreSQL; por exemplo navegador America/Sao_Paulo e sessão UTC. Basta editar outro campo, pois as strings reconstruídas diferem do ISO original.

**Causa:** WorkItemSheet compõe data+hora como string sem Z/offset. Salvar compara esse formato local com o ISO retornado e envia dueDate/remindAt ao banco sem normalizar. QuickAdd usa a conversão correta para ISO, portanto criação e edição têm contratos diferentes.

**Cadeia observada:** Uma hora local 09:00 vira payload 09:00 sem offset no Sheet, enquanto o QuickAdd envia 12:00Z no cenário -03. Se o servidor interpreta sem offset como UTC, o horário é antecipado em três horas. Datas intocadas também aparecem como alteradas por diferença de formato.

**Efeito:** Prazos e lembretes mudam de instante ao salvar a tarefa, inclusive após editar somente título/descrição.

**Correção recomendada:** Reusar um único conversor de data/hora local para ISO com offset explícito e comparar instantes normalizados, mantendo a convenção de dia inteiro.

**Aceite:**

- Criar e editar o mesmo 09:00 em UTC-03 produz o mesmo instante ISO.
- Editar somente título não altera due_date nem remind_at e não habilita Salvar por diferença de representação.

**Evidência:**

- [src/components/tasks/shared/WorkItemSheet.tsx:40–55](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L40-L55) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; data local vira string sem offset.
- [src/components/tasks/shared/WorkItemSheet.tsx:137–168](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L137-L168) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; inicialização e comparação textual com ISO original.
- [src/components/tasks/shared/WorkItemSheet.tsx:186–203](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L186-L203) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; envio das datas reconstruídas.
- [src/components/tasks/shared/QuickAdd.tsx:23–37](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/QuickAdd.tsx#L23-L37) — blob `cd42ebbb2f8dca964174fce5f7a8394fc0a6e04f`; conversor de criação envia ISO correto.
- [src/hooks/tasks/useMyWorkItems.ts:150–158](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L150-L158) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; DTO preserva string sem normalização.
- [supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql:42–54](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260409014536_3a836b4b-1e37-411c-b8af-45d918304272.sql#L42-L54) — blob `c5f203b22e88f4c36ae9b87e2a143f8ef43491e2`; declaração original de due_date timestamptz; não evidência de RLS vigente.
- [supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql:19–26](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql#L19-L26) — blob `fa46bd1dc63958d816587fe09ea0d229142ecf79`; remind_at timestamptz.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- O probe compara as duas funções reais sob TZ explícito. A interpretação da sessão UTC é precondição declarada; não foi medida no banco remoto.

**Probe:** `proofs.json`, ID `R2-MOD-050`; código em `offline_probes.cjs`.

### R2-MOD-051 — Salvar tarefa fecha com escritas pendentes e divide a edição em operações concorrentes

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Editar campos no WorkItemSheet e salvar com escrita lenta/falha; para aplicação parcial, alterar estado e outro campo simultaneamente.

**Causa:** As props de escrita são tipadas como void e o pai descarta as promessas. salvar chama onMove e onSave sem await e fecha imediatamente, sem estado pending ou manutenção do rascunho.

**Cadeia observada:** O fechamento ocorre antes de ambas as respostas; estado e campos são gravados em chamadas independentes. Uma pode falhar enquanto a outra persiste, e o rascunho do formulário desmontado se perde.

**Efeito:** Falha exige reconstruir a edição; o usuário pode obter uma tarefa parcialmente modificada apesar de ter usado um único Salvar.

**Correção recomendada:** Retornar/aguardar promessas, manter formulário e erro visíveis até conclusão e definir uma operação consistente para estado+campos.

**Aceite:**

- Com save pendente, o formulário permanece aberto e bloqueia novo submit.
- Falha preserva todos os campos digitados para retentativa.
- Mudança de estado e campos não gera confirmação/fechamento de sucesso parcial.

**Evidência:**

- [src/components/tasks/shared/WorkItemSheet.tsx:71–80](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L71-L80) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; contrato de callbacks void.
- [src/components/tasks/shared/WorkItemSheet.tsx:179–204](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L179-L204) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; move e save concorrentes antes de fechar.
- [src/components/tasks/TasksModule.tsx:365–373](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L365-L373) — blob `33c1ab2beebb194087c2044c1bc72a6af1f5e64e`; pai descarta promessas.
- [src/components/tasks/__tests__/WorkItemSheet.test.tsx:58–67](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/__tests__/WorkItemSheet.test.tsx#L58-L67) — blob `87b4efae81cd3a6d3b0c015973325220d59b671a`; spies síncronos.
- [src/components/tasks/__tests__/WorkItemSheet.test.tsx:103–128](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/__tests__/WorkItemSheet.test.tsx#L103-L128) — blob `87b4efae81cd3a6d3b0c015973325220d59b671a`; teste valida chamada e fechamento, sem persistência pendente/erro.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-051`; código em `offline_probes.cjs`.

### R2-MOD-052 — Reagendar alarme pelo Salvar não rearma uma tarefa que já foi notificada

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** A tarefa ativa tem notified_at preenchido. Abrir o Sheet, escolher uma nova data/hora de alarme no futuro e Salvar.

**Causa:** O Sheet envia patch.remindAt pelo update genérico; toDbPatch não limpa notified_at. O trigger vigente só executa em mudança de status e o scheduler exige notified_at IS NULL.

**Cadeia observada:** O novo remind_at é persistido, mas o scheduler exclui a tarefa quando esse horário vence. O caminho dedicado setReminder/snooze zera o campo, mas Salvar não o utiliza.

**Efeito:** O usuário agenda um novo aviso que não será disparado pelo contrato vigente.

**Correção recomendada:** Rearmar notified_at atomicamente sempre que remind_at for alterado no caminho de edição, centralizando a regra para todos os consumidores.

**Aceite:**

- Editar via Salvar o alarme de tarefa já notificada grava o novo horário e notified_at=null.
- No vencimento, a tarefa volta a ser elegível exatamente uma vez segundo a regra do scheduler.

**Evidência:**

- [src/components/tasks/shared/WorkItemSheet.tsx:186–203](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemSheet.tsx#L186-L203) — blob `1ec3e7b894ca9df10e35a6ac43201cc058973a5b`; alarme segue pelo patch genérico.
- [src/hooks/tasks/useMyWorkItems.ts:149–158](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L149-L158) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; DTO só modifica remind_at.
- [src/hooks/tasks/useMyWorkItems.ts:554–566](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L554-L566) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; caminho dedicado correto não é usado pelo Salvar.
- [supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql:75–104](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql#L75-L104) — blob `fa46bd1dc63958d816587fe09ea0d229142ecf79`; trigger atua só quando status muda.
- [supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql:29–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql#L29-L39) — blob `31ef17f2da9e8dc5f9b4760623efd42046f76014`; notificação depende de notified_at nulo.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-052`; código em `offline_probes.cjs`.

### R2-MOD-053 — Desfazer cancelamento/conclusão não restaura todo o estado e anuncia sucesso antes da gravação

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Cancelar uma tarefa que possui alarme e usar Desfazer; para a segunda consequência, fazer a atualização de reversão falhar ou permanecer pendente.

**Causa:** Cancelar limpa remind_at/notified_at pelo trigger. O callback de undo só restaura status/completed_at, não restaura o alarme e ignora error da atualização. undoToast também anuncia sucesso sem aguardar onUndo. Na conclusão, o undo força todo em vez do status anterior e também não restaura o lembrete removido pelo trigger.

**Cadeia observada:** Mesmo com reversão bem-sucedida, a tarefa retorna sem o alarme que possuía antes do cancelamento. Com erro, pode continuar cancelada enquanto o toast já diz Ação desfeita. Concluir uma tarefa doing/waiting e desfazer a devolve a todo, não ao estado anterior; o alarme anterior também se perde.

**Efeito:** Desfazer não restaura o estado anterior e pode ocultar falha de recuperação da tarefa.

**Correção recomendada:** Restaurar de modo consistente os campos alterados pelo cancelamento, verificar a escrita e só confirmar Desfazer após conclusão.

**Aceite:**

- Cancelar→Desfazer preserva o alarme anterior quando a reversão é válida.
- Erro de reversão não exibe Ação desfeita e oferece nova tentativa com contexto preservado.
- Desfazer conclusão restaura o estado e alarme anteriores, incluindo doing/waiting, ou comunica uma reabertura diferente de undo.

**Evidência:**

- [src/hooks/tasks/useMyWorkItems.ts:489–521](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L489-L521) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; cancel e undo com patch incompleto e sem ler erro.
- [supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql:88–93](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260928140000_tasks_unify_reminders_kanban.sql#L88-L93) — blob `fa46bd1dc63958d816587fe09ea0d229142ecf79`; cancelamento apaga alarme e carimbo.
- [src/lib/undoToast.ts:27–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/lib/undoToast.ts#L27-L39) — blob `4a349e877d6a6902cc82af8746751070a330a517`; sucesso antecipado de onUndo.
- [src/hooks/tasks/useMyWorkItems.ts:525–531](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L525-L531) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; Undo de conclusão sempre força todo.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-054 — Tarefas e filtros consultam somente a primeira resposta da API sem continuação

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** O conjunto elegível de tarefas pessoais excede o teto de linhas configurado no PostgREST. O corte inclui tarefas ativas e concluídas da janela, ordenadas por posição e criação.

**Causa:** useMyWorkItems faz um único select sem range/cursor/total/continuação. Todos os modos, busca, filtros, KPIs e resolução de deep link operam no array retornado; o badge repete uma consulta não paginada.

**Cadeia observada:** Tarefas além da resposta inicial não podem ser encontradas por busca/contato/prioridade, não entram nos contadores e um ?task fora do lote não abre o Sheet. A interface não informa que falta continuação.

**Efeito:** O módulo pode omitir tarefas e subestimar carga pessoal e atrasos em contas com volume acima do teto.

**Correção recomendada:** Paginar a fonte inteira de modo explícito ou levar filtros/contagens ao servidor, com continuação observável e resolução por ID independente do lote.

**Aceite:**

- Fixtures com mais de uma página de API mantêm uma tarefa da última página acessível em busca, filtros e deep link.
- KPIs e badge não usam o tamanho de uma resposta parcial como total completo.

**Evidência:**

- [src/hooks/tasks/useMyWorkItems.ts:195–222](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L195-L222) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; select único da fonte.
- [src/components/tasks/TasksModule.tsx:58–92](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L58-L92) — blob `33c1ab2beebb194087c2044c1bc72a6af1f5e64e`; filtros e números reais derivados do lote.
- [src/components/tasks/TasksModule.tsx:226–231](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L226-L231) — blob `33c1ab2beebb194087c2044c1bc72a6af1f5e64e`; deep link resolve apenas hook.items.
- [src/hooks/tasks/useMyWorkItems.ts:624–654](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L624-L654) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; badge também deriva array sem continuação.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- O teto efetivo do PostgREST remoto não foi medido. A condição é exceder o teto configurado, sem inventar um limite numérico do ambiente.

### R2-MOD-055 — Arrastar tarefa entre colunas filtradas persiste índice em relação à lista não filtrada

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Há filtro ativo que esconde pelo menos um item antes do destino. Arrastar uma tarefa de outra coluna para entre dois cartões visíveis.

**Causa:** TasksModule fornece byStatus filtrado ao quadro. resolveDragEnd entrega destination.index relativo a essa lista; persistPositions usa o mesmo índice em bucketByStatus(items) da fonte completa do hook.

**Cadeia observada:** Com destino completo [oculto,A,B] e visível [A,B], soltar X entre A e B passa índice 1, mas grava [oculto,X,A,B]. Após recomputar/refetch, a lista visível é [X,A,B], diferente do destino escolhido.

**Efeito:** A ordem persistida não corresponde ao gesto e tarefas mudam de posição após o drop.

**Correção recomendada:** Traduzir a posição por IDs de vizinhos visíveis para uma posição na sequência completa ou definir uma regra de reordenação que preserve itens ocultos de forma explícita.

**Aceite:**

- O cenário oculto,A,B + X solto entre A/B termina com ordem visível A,X,B antes e depois do refetch.
- Testes integram resolver do DnD com o payload de persistência e incluem filtros ativos.

**Evidência:**

- [src/components/tasks/TasksModule.tsx:63–78](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L63-L78) — blob `33c1ab2beebb194087c2044c1bc72a6af1f5e64e`; byStatus é filtrado e hook.items é completo.
- [src/components/tasks/TasksModule.tsx:320–328](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L320-L328) — blob `33c1ab2beebb194087c2044c1bc72a6af1f5e64e`; quadro recebe colunas filtradas.
- [src/components/tasks/board/TasksBoardMode.tsx:83–107](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/board/TasksBoardMode.tsx#L83-L107) — blob `a041fd83fdab39e1e476e57e54441446646b5a78`; resolver e callback de mover.
- [src/components/tasks/board/resolveDragEnd.ts:91–100](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/board/resolveDragEnd.ts#L91-L100) — blob `069700840fa8c8533aad0e7fe98ce5dc94ad9870`; índice vem do destino visível.
- [src/hooks/tasks/useMyWorkItems.ts:382–400](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L382-L400) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; persistência reinsere em array não filtrado.
- [src/hooks/tasks/useMyWorkItems.ts:424–428](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L424-L428) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; movimento invoca persistência com mesmo índice.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-055`; código em `offline_probes.cjs`.

### R2-MOD-056 — Agenda restaura o prazo do dia anterior se o dia for trocado durante a criação

**Severidade:** P2. **Prova:** CONFIRMED_ISOLATED_CALLBACK. **Relação:** NEW_DISCOVERY.

**Precondição:** Iniciar criação no dia A; antes de onCreate resolver, selecionar dia B na Agenda. A criação A termina com sucesso e o usuário cria outra tarefa no campo que anuncia B.

**Causa:** QuickAdd sincroniza defaultDueDate com um marcador diaAplicado durante render, mas handleSubmit chama a closure limpar do render A depois de await. Essa closure restaura dueDate=A sem atualizar diaAplicado, já igual a B; o próximo render não corrige o prazo.

**Cadeia observada:** O probe executando o callback real mantém o placeholder/padrão B e o marcador B, mas o segundo payload de criação contém o prazo A. A Agenda permite trocar o dia enquanto a primeira criação está pendente.

**Efeito:** Uma nova tarefa aparece no dia anterior ao selecionado, podendo sumir da lista do dia em que o usuário acredita tê-la criado.

**Correção recomendada:** Ao concluir o submit, restaurar o padrão atual através de uma referência/atualização consistente, ou impedir troca de contexto durante a operação; manter o rascunho associado à identidade de dia.

**Aceite:**

- Criar em A com resposta pendente, mudar para B, resolver A e criar novamente resulta em prazo B.
- O teste cobre a troca durante a promise; criar duas vezes no mesmo dia continua correto.

**Evidência:**

- [src/components/tasks/agenda/TasksAgendaMode.tsx:109–150](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/agenda/TasksAgendaMode.tsx#L109-L150) — blob `0f735e8e214ae8f3232e283d604a5a0935b129a9`; Botões de dia permanecem habilitados e QuickAdd recebe padrão/placeholder do dia atual.
- [src/components/tasks/shared/QuickAdd.tsx:68–76](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/QuickAdd.tsx#L68-L76) — blob `cd42ebbb2f8dca964174fce5f7a8394fc0a6e04f`; Sincronização por marcador diaAplicado.
- [src/components/tasks/shared/QuickAdd.tsx:123–146](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/QuickAdd.tsx#L123-L146) — blob `cd42ebbb2f8dca964174fce5f7a8394fc0a6e04f`; limpar fecha sobre defaultDueDate antigo depois de await.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Probe:** `proofs.json`, ID `R2-MOD-056`; código em `offline_probes.cjs`.

### R2-MOD-057 — Cartão de tarefa concluída oferece lembrete que o executor exclui por estado

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Uma tarefa concluída está visível na seção/coluna de concluídas; escolher Lembrar-me → 15 min, 1 h ou amanhã sem reabrir a tarefa.

**Causa:** O menu de lembretes é renderizado também quando isDone; o callback snooze grava apenas remind_at/notified_at e anuncia sucesso. A função vigente notify_due_tasks exclui status done/cancelled.

**Cadeia observada:** O prazo do alarme pode ser persistido e o toast anuncia Aviso adiado, mas o estado continua done e a tarefa nunca entra no SELECT do executor enquanto permanecer concluída. O próprio cartão esconde o RemindChip nesse estado.

**Efeito:** O usuário recebe confirmação de um lembrete que não será entregue.

**Correção recomendada:** Desabilitar a ação para estados terminais com motivo claro ou implementar explicitamente a reabertura/contrato de lembrete independente de tarefa; não confirmar uma ação inelegível.

**Aceite:**

- Tarefa done não oferece sucesso de snooze sem que haja um caminho elegível para disparar o alarme.
- Teste cobre menu de concluída, payload emitido e regra de seleção do executor, não apenas o toast.

**Evidência:**

- [src/components/tasks/shared/WorkItemCard.tsx:54–55](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemCard.tsx#L54-L55) — blob `3483139a1acc207fd73f50d0d5dea6fcecd8daa8`; isDone deriva do estado.
- [src/components/tasks/shared/WorkItemCard.tsx:98–106](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemCard.tsx#L98-L106) — blob `3483139a1acc207fd73f50d0d5dea6fcecd8daa8`; Alarme oculto em estado terminal.
- [src/components/tasks/shared/WorkItemCard.tsx:126–142](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemCard.tsx#L126-L142) — blob `3483139a1acc207fd73f50d0d5dea6fcecd8daa8`; Submenu Lembrar-me incondicional.
- [src/components/tasks/TasksModule.tsx:178–187](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L178-L187) — blob `33c1ab2beebb194087c2044c1bc72a6af1f5e64e`; Ligação do menu à mutação snooze.
- [src/hooks/tasks/useMyWorkItems.ts:540–552](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L540-L552) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; Snooze mantém status e anuncia sucesso.
- [supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql:29–39](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260930141000_harden_notify_due_tasks_rpc_authorization.sql#L29-L39) — blob `31ef17f2da9e8dc5f9b4760623efd42046f76014`; Executor vigente exclui done/cancelled.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Leitura estática; não se executou cron, banco ou notificação. A permanência no estado concluído é precondição explícita.

### R2-MOD-058 — Prazo vencido hoje aparece como atraso no menu e como não atrasado no módulo

**Severidade:** P3. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Uma tarefa ativa tem due_date com horário anterior ao instante atual, mas no mesmo dia local, sem outro alarme/atraso.

**Causa:** O badge compara due_date com Date.now(), enquanto bucketByDue e dueLabel só consideram atrasadas datas anteriores ao início do dia.

**Cadeia observada:** A mesma tarefa gera badge de atraso vermelho na navegação, mas KPI Atrasadas=0 e seção Hoje no módulo; não é preciso haver falha de rede ou paginação.

**Efeito:** A contagem e a prioridade visual divergem entre a chamada de atenção e a lista que deveria explicá-la; prazos com horário não possuem uma semântica única de atraso.

**Correção recomendada:** Definir uma única regra para prazo com hora versus prazo apenas de dia e usá-la no badge, KPI, grupos e chip, preservando a distinção visual se houver duas semânticas intencionais.

**Aceite:**

- Com relógio fixo às 15h e prazo de hoje às 9h, badge, KPI e agrupamento concordam sobre atraso ou explicitam suas regras diferentes.
- Inclui-se prazo sem hora/fim do dia e limites de fuso no teste da regra compartilhada.

**Evidência:**

- [src/hooks/tasks/useMyWorkItems.ts:629–649](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/useMyWorkItems.ts#L629-L649) — blob `30c53078791bcb04ec2651b3bb701a884b488069`; Badge usa instante de agora.
- [src/hooks/tasks/workItemAggregates.ts:29–66](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/workItemAggregates.ts#L29-L66) — blob `621ad9cafd66f3e08518c08cf1ddfc9a3a46a450`; Agrupamento usa início do dia.
- [src/hooks/tasks/workItemAggregates.ts:169–205](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/tasks/workItemAggregates.ts#L169-L205) — blob `621ad9cafd66f3e08518c08cf1ddfc9a3a46a450`; KPI e chip reaproveitam semântica por dia.
- [src/components/tasks/shared/TasksKpiStrip.tsx:55–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/TasksKpiStrip.tsx#L55-L63) — blob `bc9e46a1428ea1cc58b9a998dd1757c486de8f48`; Exibição Atrasadas/Para hoje.
- [src/components/layout/Sidebar.tsx:130–139](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/layout/Sidebar.tsx#L130-L139) — blob `8781121425b6ee0267d079decb32959035ad6146`; Cor do badge depende de hasOverdue.
- [src/components/tasks/list/TasksListMode.tsx:183–187](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/list/TasksListMode.tsx#L183-L187) — blob `e621e20292b9b42b09e3ec21f9c71e4094b4b255`; Grupos Atrasadas/Hoje.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- A divergência é demonstrada por regras estáticas; a escolha de produto entre atraso por instante ou por dia permanece uma decisão de correção.

### R2-MOD-059 — Filtro de período do Talk X aparece nas quatro telas sem consumidor

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY (TX03).

**Precondição:** Abrir Visão geral, Templates, Segmentos ou Supressão e escolher Hoje, 7 dias, 30 dias, Este mês ou Personalizado no menu Período.

**Causa:** TalkXFilterBar renderiza o menu incondicionalmente e depende da prop opcional onPeriodChange. Nenhuma das quatro instâncias atuais passa period ou onPeriodChange. O clique apenas fecha o popover; os filtros e dados das telas não recebem intervalo.

**Cadeia observada:** Escolher um período deixa o rótulo Todo o período e mantém os dados. Personalizado também não abre um seletor de datas nesse fluxo.

**Efeito:** Um controle que aparenta recortar dados não altera a consulta nem a amostra; o usuário não consegue efetuar o recorte por data por esse menu.

**Correção recomendada:** Integrar período/intervalo e reset de paginação em cada consumidor, ou ocultar/desabilitar o menu quando não suportado. Testar a tela completa com dados em datas distintas.

**Aceite:**

- Nas quatro telas, escolher 7 dias altera rótulo e conjunto apresentado conforme contrato explícito.
- Personalizado oferece seleção de intervalo válida ou não é oferecido.
- Os testes incluem as instâncias de produção; passar vi.fn ao kit isolado não encerra integração.

**Evidência:**

- [src/components/talkx/kit/filters.tsx:116–135](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/kit/filters.tsx#L116-L135) — blob `a00694fe51c23c8978790e6ee66e515784a84c5d`; Menu existe sem callback obrigatório.
- [src/components/talkx/TalkXTemplates.tsx:115–121](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplates.tsx#L115-L121) — blob `b5f8e4c76ca33c5b5746c6fd4bfff933c007f056`; Instância sem period/onPeriodChange.
- [src/components/talkx/TalkXOverview.tsx:130–136](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXOverview.tsx#L130-L136) — blob `17e8a2b2e9b9cb787b0c604c79ef123fed0fdee2`; Instância sem period/onPeriodChange.
- [src/components/talkx/TalkXSegments.tsx:104–115](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L104-L115) — blob `5062084f588316ac8421858d37050d1a1558ae23`; Instância sem period/onPeriodChange.
- [src/components/talkx/TalkXSuppression.tsx:142–147](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L142-L147) — blob `6192e65588d1e204cf70704428690858090c9f76`; Instância sem period/onPeriodChange.
- [src/components/talkx/kit/__tests__/TalkXFilterBar.test.tsx:24–43](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/kit/__tests__/TalkXFilterBar.test.tsx#L24-L43) — blob `95fd5e2e894d733d33ad56a821e14de25f29d4af`; Teste injeta callback não ligado nas telas.

**Comparação anterior:** TX03 trata estados de consulta/erro e adoção de boundary. Este é outro controle e outra cadeia: menu de período sem callback nas quatro telas; novo achado, não duplicação dos estados.

### R2-MOD-060 — Tamanho de página em Templates, Segmentos e Supressão é um controle sem efeito

**Severidade:** P3. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Usar o seletor 8/10/20/50 por página em qualquer das três telas com resultados.

**Causa:** TalkXPagination é controlado por pageSize, mas as telas criam estado sem setter e fornecem onPageSize vazio.

**Cadeia observada:** Escolher outro tamanho mantém 8 templates/segmentos ou 10 itens de supressão. O controle comum funciona na Visão geral, que fornece setter, mas não nessas três instâncias.

**Efeito:** A preferência de densidade/paginação oferecida não é aplicada e força navegação desnecessária.

**Correção recomendada:** Conectar setter e voltar à página 1 ao mudar o tamanho, ou remover esse seletor das instâncias com tamanho fixo.

**Aceite:**

- Em cada tela, escolher 20 muda pageSize e o slice, com página válida após a mudança.

**Evidência:**

- [src/components/talkx/kit/table.tsx:10–30](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/kit/table.tsx#L10-L30) — blob `974f6d4404494ee189c9bf235cb371d1e4a9cfb7`; Seletor controlado repassa valor.
- [src/components/talkx/TalkXTemplates.tsx:31–34](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplates.tsx#L31-L34) — blob `b5f8e4c76ca33c5b5746c6fd4bfff933c007f056`; pageSize sem setter.
- [src/components/talkx/TalkXTemplates.tsx:142–142](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplates.tsx#L142-L142) — blob `b5f8e4c76ca33c5b5746c6fd4bfff933c007f056`; onPageSize vazio.
- [src/components/talkx/TalkXSegments.tsx:31–32](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L31-L32) — blob `5062084f588316ac8421858d37050d1a1558ae23`; pageSize sem setter.
- [src/components/talkx/TalkXSegments.tsx:172–172](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSegments.tsx#L172-L172) — blob `5062084f588316ac8421858d37050d1a1558ae23`; onPageSize vazio.
- [src/components/talkx/TalkXSuppression.tsx:41–43](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L41-L43) — blob `6192e65588d1e204cf70704428690858090c9f76`; pageSize sem setter.
- [src/components/talkx/TalkXSuppression.tsx:188–188](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXSuppression.tsx#L188-L188) — blob `6192e65588d1e204cf70704428690858090c9f76`; onPageSize vazio.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

### R2-MOD-061 — Atalho Duplicar template abre o editor do original

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Selecionar um template e usar Duplicar template em Ações rápidas (rail).

**Causa:** O atalho chama openEdit(selected), preservando id/updated_at do original, em vez da mutation duplicateTemplate usada nos botões das linhas/cartões.

**Cadeia observada:** O editor abre com activeTemplateId do original; salvar dispara updateTemplate.mutateAsync com esse id. Não se cria uma cópia por esse atalho. Se não houver selecionado, o atalho abre criação vazia.

**Efeito:** Uma pessoa que pretende criar uma variação pode editar o original e afetar outros usos, se a atualização for aceita pelo RPC.

**Correção recomendada:** Ligar o atalho à duplicação real e abrir a nova identidade, ou renomeá-lo para Editar template quando esse for o comportamento pretendido.

**Aceite:**

- Atalho Duplicar template produz novo id e não altera o original após editar/salvar a cópia.
- Caso sem seleção pede seleção ou apresenta corretamente um fluxo novo, sem alegar duplicação.

**Evidência:**

- [src/components/talkx/TalkXTemplates.tsx:55–56](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplates.tsx#L55-L56) — blob `b5f8e4c76ca33c5b5746c6fd4bfff933c007f056`; openEdit mantém objeto/id original.
- [src/components/talkx/TalkXTemplates.tsx:94–101](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplates.tsx#L94-L101) — blob `b5f8e4c76ca33c5b5746c6fd4bfff933c007f056`; Original é passado ao editor.
- [src/components/talkx/TalkXTemplates.tsx:156–160](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplates.tsx#L156-L160) — blob `b5f8e4c76ca33c5b5746c6fd4bfff933c007f056`; Atalho Duplicar chama openEdit.
- [src/components/talkx/TalkXTemplateEditor.tsx:49–51](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplateEditor.tsx#L49-L51) — blob `1b2377f61c6c4d11cab92887328a870a7c9b15f2`; activeTemplateId recebe editing.id.
- [src/components/talkx/TalkXTemplateEditor.tsx:97–103](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXTemplateEditor.tsx#L97-L103) — blob `1b2377f61c6c4d11cab92887328a870a7c9b15f2`; Salvar atualiza esse id.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Banco não executado. O possível bloqueio transacional de snapshot estudado pelo agente de SQL é independente; a conclusão comprovada aqui é o roteamento de identidade incorreto.

### R2-MOD-062 — Gramática de variáveis do editor/Resumo diverge da personalização com fallback

**Severidade:** P3. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Usar placeholder suportado pela personalização, como {{nome|cliente}} ou uma chave customizada com dígito, no wizard/template.

**Causa:** personalizePreview separa o nome antes do primeiro | e aceita a chave normalizada; o editor normaliza todo o conteúdo sem remover fallback, enquanto extractVariables aceita somente letras e underscore sem fallback.

**Cadeia observada:** {{nome|cliente}} produz nome/fallback na prévia, mas o editor marca nome|cliente como desconhecida; o resumo que usa extractVariables pode indicar Nenhuma variável. Chaves com dígitos também desaparecem da extração.

**Efeito:** Avisos e revisão de variáveis contradizem o texto que será personalizado, dificultando a verificação do conteúdo.

**Correção recomendada:** Compartilhar o parser de placeholders entre validação, contagem e prévia, distinguindo nome e fallback; não classificar a sintaxe válida como variável desconhecida.

**Aceite:**

- {{nome|cliente}}, custom_1 e variantes com espaços são interpretados de forma coerente no editor, resumo e prévia.

**Evidência:**

- [src/components/talkx/kit/personalize.ts:93–118](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/kit/personalize.ts#L93-L118) — blob `97bb60e5798d1c1a5d95296b0e356363f87c3ea8`; Parser separa fallback e normaliza chave.
- [src/components/talkx/TalkXMessageEditor.tsx:27–34](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXMessageEditor.tsx#L27-L34) — blob `93b78fc37ff2a8878b12d0bd6666726047494eaa`; Normalizer não remove fallback.
- [src/components/talkx/TalkXMessageEditor.tsx:91–106](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXMessageEditor.tsx#L91-L106) — blob `93b78fc37ff2a8878b12d0bd6666726047494eaa`; UnknownVariables usa token completo.
- [src/components/talkx/TalkXMessageEditor.tsx:210–215](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXMessageEditor.tsx#L210-L215) — blob `93b78fc37ff2a8878b12d0bd6666726047494eaa`; Aviso ao usuário.
- [src/components/talkx/kit/format.ts:37–41](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/kit/format.ts#L37-L41) — blob `86f93616f4a25f7aaf10b4ef20ed27b5e4d08eda`; Extração aceita só a-z e underscore.
- [src/components/talkx/TalkXWizardDelivery.tsx:185–185](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXWizardDelivery.tsx#L185-L185) — blob `4c242f9c90875ad23d8ef15ad8858bd900932e7f`; Resumo usa extração.
- [src/components/talkx/TalkXWizardDelivery.tsx:217–217](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/talkx/TalkXWizardDelivery.tsx#L217-L217) — blob `4c242f9c90875ad23d8ef15ad8858bd900932e7f`; Exibe Nenhuma quando extração vazia.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Não é alegado bloqueio de envio: os avisos são visuais e a prévia já resolve o fallback.

### R2-MOD-063 — Duas metas configuráveis nunca entram no cálculo das notificações de conquista

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Meta ativa de contacts_handled ou resolution_rate com alvo positivo, configurada pelo diálogo atual; estatística real atinge a meta.

**Causa:** O diálogo oferece messages_sent, contacts_handled e resolution_rate, mas o switch do notificador só trata messages_sent, conversations_resolved, response_time e satisfaction. Os dois tipos atuais restantes conservam current = 0.

**Cadeia observada:** O provider ativo executa o verificador; para contatos atendidos e taxa de resolução ele nunca satisfaz current >= target positivo, mesmo quando o painel de metas calcula progresso desses tipos.

**Efeito:** Conquistas diárias, semanais e mensais de dois dos três tipos padrão não geram o aviso esperado.

**Correção recomendada:** Compartilhar o catálogo e cálculo de tipos de meta entre configuração, painel e notificação, com semântica explícita de período e alvo.

**Aceite:**

- Ao atingir meta positiva de contatos atendidos ou taxa de resolução, uma notificação é produzida para o mesmo período exibido no painel.
- Tipos configuráveis e tipos calculados são coerentes; tipo desconhecido não é silenciosamente tratado como progresso zero.

**Evidência:**

- [src/components/dashboard/GoalsConfigDialog.tsx:44–53](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/GoalsConfigDialog.tsx#L44-L53) — blob `629fc8b94ed6a51fcb50d747055792ff81237336`; Três tipos padrão apresentados ao usuário.
- [src/hooks/analytics/useGoalNotifications.ts:85–90](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/analytics/useGoalNotifications.ts#L85-L90) — blob `fd0caf751ea9b67d010187cd69d8f3265eb50ae0`; Configurações ativas são carregadas.
- [src/hooks/analytics/useGoalNotifications.ts:105–148](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/analytics/useGoalNotifications.ts#L105-L148) — blob `fd0caf751ea9b67d010187cd69d8f3265eb50ae0`; Inicializa zero e não trata contacts_handled/resolution_rate.
- [src/hooks/analytics/useGoalsDashboard.ts:149–180](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/analytics/useGoalsDashboard.ts#L149-L180) — blob `58a2ab75ab0761c67c1b02a53a449209063037a2`; Painel calcula os tipos atuais.
- [src/components/notifications/GoalNotificationProvider.tsx:1–10](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/notifications/GoalNotificationProvider.tsx#L1-L10) — blob `bd4bdfb26ceb0615b7397afc5e6811ac5c71ca43`; Provider chama verificador.
- [src/pages/Index.tsx:104–149](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/Index.tsx#L104-L149) — blob `9317b83b809bbb745fd6d5adfe5de3c1e420d16d`; Provider envolve aplicação atual.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Comparação estática entre consumidores e tipos; não foram consultados dados ou enviadas notificações. Ramos legados de response_time/satisfaction não são alegados como configuráveis pela UI atual.

### R2-MOD-064 — Restaurar padrões das metas perde IDs e Salvar tenta reinserir configurações existentes

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** NEW_DISCOVERY.

**Precondição:** Perfil já possui ao menos uma goals_configuration do tipo padrão; abrir configuração, clicar Restaurar padrões e Salvar.

**Causa:** A hidratação preserva o id existente, mas handleReset substitui todos os objetos por DEFAULT_GOALS sem id. A mutation usa INSERT quando id falta, embora exista UNIQUE(profile_id, goal_type).

**Cadeia observada:** Salvar os padrões tenta criar novamente o mesmo par perfil/tipo, falha pela unicidade e cai no toast de erro. A ação de restaurar não atualiza os registros que acabou de carregar.

**Efeito:** Restaurar padrões não persiste para configurações já existentes; em conjuntos parcialmente criados pode gravar alguns tipos antes de falhar em outro, pois o loop não é transacional.

**Correção recomendada:** Restaurar apenas valores preservando a identidade de cada tipo, ou usar upsert autorizado sobre a chave natural com gravação atômica.

**Aceite:**

- Restaurar padrões e salvar em perfil com os três tipos existentes mantém os mesmos IDs e atualiza todos os valores.
- Falha em qualquer tipo não deixa uma mistura não informada de valores antigos e novos.

**Evidência:**

- [src/components/dashboard/GoalsConfigDialog.tsx:92–113](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/GoalsConfigDialog.tsx#L92-L113) — blob `629fc8b94ed6a51fcb50d747055792ff81237336`; Hidratação mantém IDs por tipo.
- [src/components/dashboard/GoalsConfigDialog.tsx:120–147](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/GoalsConfigDialog.tsx#L120-L147) — blob `629fc8b94ed6a51fcb50d747055792ff81237336`; Decisão UPDATE/INSERT depende apenas de id.
- [src/components/dashboard/GoalsConfigDialog.tsx:166–172](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/GoalsConfigDialog.tsx#L166-L172) — blob `629fc8b94ed6a51fcb50d747055792ff81237336`; Reset remove IDs e Save envia esses objetos.
- [src/components/dashboard/GoalsConfigDialog.tsx:274–280](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/GoalsConfigDialog.tsx#L274-L280) — blob `629fc8b94ed6a51fcb50d747055792ff81237336`; Ações alcançáveis no rodapé.
- [supabase/migrations/20251224024453_84e90b51-3f9f-47f9-a4be-44831f2f5bd8.sql:2–18](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20251224024453_84e90b51-3f9f-47f9-a4be-44831f2f5bd8.sql#L2-L18) — blob `06cff2e7f52b19836614a622b43f663df38787c4`; Unicidade de perfil e tipo; revisor SQL confirmou preservação na cadeia.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Banco não executado. A permanência da constraint foi cruzada com o agente SQL e seu manifesto de schema; o efeito 23505 é a consequência estática da chave única vigente.

### R2-MOD-065 — Escolher período Personalizado não abre o calendário do Dashboard

**Severidade:** P2. **Prova:** CONFIRMED_STATIC_CONTRACT. **Relação:** EXTENSION_OF_PRIOR (DASH-CONTROLS-001).

**Precondição:** Dashboard com período today/yesterday/week/month; abrir o seletor e escolher Personalizado.

**Causa:** handlePeriodChange retorna imediatamente em custom, antes de onFiltersChange. A única renderização do calendário exige que filters.period já seja custom.

**Cadeia observada:** O popover permanece aberto na lista; o estado continua no período anterior e o calendário nunca aparece por essa interação. Um URL previamente inicializado em custom é uma precondição diferente e não corrige o seletor normal.

**Efeito:** Não é possível iniciar a seleção de intervalo personalizado pela opção visível do filtro.

**Correção recomendada:** Separar o estado de abertura do calendário da aplicação do intervalo, ou ativar custom preservando inicialmente as datas para permitir a seleção.

**Aceite:**

- Partindo de today, clicar Personalizado exibe calendário e permite aplicar início/fim.
- Selecionar um preset depois fecha o calendário e atualiza a consulta com o período anunciado.

**Evidência:**

- [src/components/dashboard/DashboardFilters.tsx:68–102](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/DashboardFilters.tsx#L68-L102) — blob `193942624e4421f3250b2c0054072dee48b80094`; Ramo custom retorna sem atualizar filtros.
- [src/components/dashboard/DashboardFilters.tsx:172–202](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/DashboardFilters.tsx#L172-L202) — blob `193942624e4421f3250b2c0054072dee48b80094`; Clique e condição circular de renderização.
- [src/components/dashboard/DashboardView.tsx:68–77](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/DashboardView.tsx#L68-L77) — blob `1a89a0f309bbc5aaeae9f03761faadd7e61715ab`; Filtros reais alimentam consultas.
- [src/components/dashboard/DashboardView.tsx:144–149](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/DashboardView.tsx#L144-L149) — blob `1a89a0f309bbc5aaeae9f03761faadd7e61715ab`; Consumidor passa setter atual.

**Comparação anterior:** Não localizado como causa/efeito nos 104 achados anteriores. Descoberta nesta rodada não significa regressão introduzida desde o baseline anterior.

**Limites específicos:**

- Fluxo validado estaticamente, sem browser. Extensão da família anterior de controles cosméticos; causa e callback específicos não constavam dos 104 achados.

## Hipóteses adiadas, limitadas e duplicadas

### R2-MOD-004 — Formulário da carteira monta SelectItem com valor vazio

**Estado:** DEFERRED_DEPENDENCY_CONTRACT. O valor vazio está confirmado na fonte. O pacote Radix resolvido não está disponível no ambiente de revisão e o componente não foi montado.

**Limite:** Possível falha de renderização pelo contrato do Radix; não contada como achado confirmado nesta rodada.

**Evidência:**

- [src/components/wallet/ClientWalletView.tsx:45–65](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/wallet/ClientWalletView.tsx#L45-L65) — blob `2111dcec3f489d95af7bb398ea5fd68059b8faf7`.
- [src/components/ui/select.tsx:99–112](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/ui/select.tsx#L99-L112) — blob `6f2525465bc450154ac8083461d0f84b2c1360f2`.

### University aplica resposta à conversa seguinte no fluxo atual

**LIMITED_NOT_CONFIRMED:** RealtimeInboxView dá key da conversa ao ChatPanel. Mantido apenas R2-MOD-012, corrida do período no mesmo componente.

- [src/components/inbox/RealtimeInboxView.tsx:298–305](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/RealtimeInboxView.tsx#L298-L305)

### Discador persiste anotação/chamada no contato antigo após alterar número

**LIMITED_NOT_CONFIRMED:** O provider consome phone e useSipClient resolve por esse telefone. R2-MOD-016 limita-se ao chip incorreto.

- [src/providers/CallSessionProvider.tsx:338–375](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/providers/CallSessionProvider.tsx#L338-L375)
- [src/hooks/communication/useSipClient.ts:43–56](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/communication/useSipClient.ts#L43-L56)

### NPS com limit 500 é descoberta nova

**DUPLICATE_CONFIRMED:** A limitação permanece, mas está explicitamente registrada na auditoria anterior; não recebe outro ID novo.

- [src/hooks/business/useNPSSurveys.ts:39–59](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useNPSSurveys.ts#L39-L59)
- [src/hooks/business/useNPSSurveys.ts:97–110](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useNPSSurveys.ts#L97-L110)

### Exportação automática aparece pronta sem integração

**REJECTED_UI_EXPLICITLY_UNAVAILABLE:** AutoExportManager informa explicitamente indisponibilidade por política. Esse estado honesto não é contado como funcionalidade quebrada ocultamente.

- [src/components/reports/AutoExportManager.tsx:1–32](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/reports/AutoExportManager.tsx#L1-L32)

### Links de pagamento anunciam checkout integrado disponível

**LIMITED_UI_EXPLICITLY_UNAVAILABLE:** PaymentLinksView contém aviso de checkout indisponível. Não se interpreta o cadastro/local URL como prova de integração de pagamento.

- [src/components/payments/PaymentLinksView.tsx:100–118](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/payments/PaymentLinksView.tsx#L100-L118)

### Editor possui ação de investimento/ROI pós-envio ligada à RPC

**NO_CONSUMER_FOUND:** Busca global em src por talkx_set_campaign_investment/investment/investimento e leitura das telas Talk X não localizaram consumidor. O agente de banco avalia apenas o contrato RPC/trigger.

### Supressão removida/expirada continua bloqueando entrega por causa da UI

**NOT_INFERRED_FROM_UI:** As falhas de representação/busca da UI não provam quebra da decisão no motor. O agente de banco confirmou critérios removed_at/expires_at no motor vigente.

### Atalhos X/Delete de Tasks disparam duas vezes por handler local e global

**REJECTED_GLOBAL_CAPTURE_STOPS_PROPAGATION:** O handler global instala listener em window na fase capture e chama preventDefault/stopPropagation antes da action. Com binding padrão e escopo Tasks, o evento não chega ao handler do card; fora do escopo/binding, só o handler local aplica. Não foi comprovado duplo disparo.

- [src/hooks/ui/useGlobalKeyboardShortcuts.ts:97–143](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/ui/useGlobalKeyboardShortcuts.ts#L97-L143)
- [src/hooks/shortcuts/defaultShortcuts.ts:49–55](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/shortcuts/defaultShortcuts.ts#L49-L55)
- [src/components/tasks/shared/WorkItemCard.tsx:61–68](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/shared/WorkItemCard.tsx#L61-L68)
- [src/components/tasks/TasksModule.tsx:203–223](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/tasks/TasksModule.tsx#L203-L223)

## Artefatos e reprodução

- `findings.json`: achados, hipóteses adiadas, relação anterior, precondições, critérios e evidências imutáveis.
- `coverage.json`: inventário delimitado, nível de leitura, declarações/faixas realmente lidas e lacunas.
- `second-pass-observations.json`: limites concretos dos testes e extensões de famílias já registradas, sem aumentar a contagem.
- `proofs.json` e `offline_probes.cjs`: 14 provas isoladas e respectivas limitações.
- `read-journal.jsonl`: diário bruto de leitura; a cobertura consolidada agrupa as releituras usadas para recuperar saídas truncadas.
- `candidates.json`, `adjudications.json` e `additional_findings.json`: trilha de candidatos e decisões de classificação.
- `build_reports.py`: montagem e validação de paths/faixas/blobs contra o manifesto fixado.

Nenhum achado foi corrigido na aplicação nesta tarefa. Aprovar uma correção futura requer executar o cenário de aceite correspondente e os gates relevantes, sem substituir comportamento por marcadores de documentação ou existência de arquivo.
