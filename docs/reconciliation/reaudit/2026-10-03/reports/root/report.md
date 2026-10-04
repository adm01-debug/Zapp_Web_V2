# Revisão transversal: cobertura, requisitos, Filas e SLA

Código examinado: `da307ba5626dce892f0b37cb6762463f55d14a96`. Data local: 3 de outubro de 2026.

Esta revisão preserva o ledger anterior e acrescenta evidência. As descobertas abaixo não representam autorização para alterar produto, migrar banco ou operar provedores. Os cenários foram inspecionados no código e, quando indicado, executados com fronteiras sintéticas.

## Achados

### R2-GOV-001 · P2 · Duas fontes com tarefas explícitas ficaram sem adjudicação no registro de planos

**Condição:** Reconciliar todas as fontes de requisitos, inclusive prompts históricos versionados.

**Comportamento:** SOURCE_CATALOG inclui os dois prompts como SUPPORTING_DOCUMENT, mas PLAN_REGISTRY e os 62 arquivos tasks não os referenciam. Há seis tarefas no prompt CRM 360° e quatro no de Inteligência.

**Efeito:** Dez cabeçalhos de tarefa ficam sem sucessão, cancelamento ou correspondência explícita; isso não significa dez funcionalidades ausentes nem autoriza ressuscitar requisitos antigos.

**Correção e aceite propostos:** Adicionar a adjudicação de origem e a correspondência com consumidores e decisões atuais; manter requisitos históricos separados de trabalho novo.

**Evidências:** [docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md:44–120](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/docs/PROMPT_LOVABLE_CRM360_INTEGRATION.md#L44-L120); [docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md:25–61](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/docs/PROMPT_LOVABLE_INTELLIGENCE_PANEL.md#L25-L61).

**Prova local:** Inspeção de contrato/cadeia; sem execução de produção..

### R2-GOV-002 · P2 · Catálogo histórico com 349 marcações de conclusão não comprova os fluxos ativos

**Condição:** Usar docs/COMPLETE_SYSTEM_FEATURES.md como evidência de cobertura funcional atual.

**Comportamento:** As 349 linhas numeradas com coluna de status estão marcadas ✅; 72 linhas referenciam caminhos literais inexistentes ou renomeados, correspondentes a 69 caminhos únicos. Push/Service Worker aparecem concluídos, enquanto a configuração ativa os desabilita. Alguns componentes citados foram substituídos.

**Efeito:** Checkmarks e existência de arquivo podem encobrir capacidades desativadas, consumidores substituídos e contratos quebrados. O índice físico anterior não omitiu este arquivo; faltava confrontar suas promessas com os caminhos ativos.

**Correção e aceite propostos:** Tratar o catálogo como declaração histórica, registrar sucessores e estados de produto, e exigir prova por fluxo; não reativar capacidades removidas por decisão.

**Evidências:** [docs/COMPLETE_SYSTEM_FEATURES.md:430–460](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/docs/COMPLETE_SYSTEM_FEATURES.md#L430-L460); [docs/COMPLETE_SYSTEM_FEATURES.md:558–570](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/docs/COMPLETE_SYSTEM_FEATURES.md#L558-L570); [src/config/service_worker.ts:1–8](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/config/service_worker.ts#L1-L8); [src/hooks/system/useServiceWorker.ts:7–43](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/system/useServiceWorker.ts#L7-L43).

**Prova local:** Inspeção de contrato/cadeia; sem execução de produção..

### R2-QUE-001 · P1 · Analytics de filas apresentam estimativas fixas como resultados medidos

**Condição:** Abrir os detalhes ou gráficos de uma fila com contatos atribuídos.

**Comportamento:** QueueDetails define Tempo Médio como ~3 min e Resolvidos Hoje como floor(assignedContacts*0.7). processStatusData assume 70% dos atribuídos resolvidos, e processDailyData conta atribuição como resolução na data de criação.

**Efeito:** Uma fila com dez contatos no total, todos atribuídos e nenhuma resolução, exibe sete resolvidos e 70% de resolução; o gestor recebe um resultado sem eventos que o sustentem.

**Correção e aceite propostos:** Derivar resoluções de eventos/status canônicos e tempos de timestamps válidos; representar ausência de amostra como sem dados. Provar atribuído aberto, resolvido antigo e resolvido hoje.

**Evidências:** [src/pages/QueueDetails.tsx:48–64](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/QueueDetails.tsx#L48-L64); [src/pages/queue-details/QueueMetricsCards.tsx:12–18](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/queue-details/QueueMetricsCards.tsx#L12-L18); [src/hooks/business/useQueueAnalytics.ts:101–119](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueueAnalytics.ts#L101-L119); [src/hooks/business/useQueueAnalytics.ts:183–210](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueueAnalytics.ts#L183-L210); [src/components/queues/QueueCharts.tsx:55–65](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/QueueCharts.tsx#L55-L65).

**Prova local:** ROOT-P01, ROOT-P06.

### R2-QUE-002 · P1 · Contagem de espera zerada impede os alertas configurados de filas

**Condição:** Fila com contatos aguardando e metas/alertas habilitados.

**Comportamento:** useQueues sobrescreve waiting_count com 0. QueuesView usa esse valor nos únicos dois alertas implementados; calcula atribuição com número de membros, não contatos atribuídos. max_avg_wait_minutes e max_messages_pending são editados e persistidos, mas não são avaliados por esse consumidor.

**Efeito:** A tela mostra zero aguardando e não dispara os alertas de espera/atribuição. Duas metas aparentam funcionar, embora não participem dessa avaliação.

**Correção e aceite propostos:** Buscar contagens reais por fila, definir denominador de atribuição e conectar todos os limites exibidos. Testar transição do limiar e recuperação, sem inferir ausência de eventual monitor externo.

**Evidências:** [src/hooks/business/useQueues.ts:44–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueues.ts#L44-L63); [src/components/queues/QueuesView.tsx:31–48](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/QueuesView.tsx#L31-L48); [src/components/queues/QueueCard.tsx:53–60](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/QueueCard.tsx#L53-L60); [src/components/queues/QueueGoalsDialog.tsx:127–157](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/QueueGoalsDialog.tsx#L127-L157); [src/components/queues/QueueGoalsDialog.tsx:195–225](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/QueueGoalsDialog.tsx#L195-L225).

**Prova local:** Inspeção de contrato/cadeia; sem execução de produção..

### R2-QUE-003 · P1 · Totais de filas são calculados sobre amostras truncadas

**Condição:** Fila com mais de 50 contatos, ou consultas de analytics/comparação que excedam o limite de resposta do PostgREST.

**Comportamento:** QueueDetails aplica limit(50) e usa contactsWithDetails.length como Total de Contatos. Para cada contato faz count de mensagens, última mensagem e possível busca de agente. Analytics/comparação usam consultas de linhas sem continuação.

**Efeito:** O total e a espera não representam a fila inteira; o caminho de 50 contatos faz de 103 a 153 consultas conforme atribuição, antes de somar os gráficos. Não foi medida latência real.

**Correção e aceite propostos:** Separar totais agregados da página visível e agregar mensagens/perfis em lote. Provar mais de 50 contatos e mais de uma página do servidor, preservando ACL e filtros.

**Evidências:** [src/pages/QueueDetails.tsx:41–63](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/QueueDetails.tsx#L41-L63); [src/hooks/business/useQueueAnalytics.ts:217–247](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueueAnalytics.ts#L217-L247); [src/hooks/business/useQueuesComparison.ts:54–84](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueuesComparison.ts#L54-L84); [src/pages/queue-details/QueueMetricsCards.tsx:12–17](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/queue-details/QueueMetricsCards.tsx#L12-L17).

**Prova local:** Inspeção de contrato/cadeia; sem execução de produção..

### R2-QUE-004 · P2 · Agrupamento de 30 dias conta o último dia duas vezes

**Condição:** Gráfico diário com intervalo cujo último índice não coincide com showEveryNth, por exemplo 30 dias.

**Comportamento:** processDailyData escolhe índices múltiplos do salto e também o último índice, depois atribui a ambos uma janela inteira. Em 30 dias, o bucket do dia 28 cobre 28–30 e o bucket do dia 30 inclui o mesmo dia novamente.

**Efeito:** Uma única mensagem no dia 30 aparece em dois pontos; totais visuais de mensagens/novos/resolvidos ficam sobrepostos.

**Correção e aceite propostos:** Construir intervalos consecutivos, exclusivos e limitados ao término selecionado. Testar 15, 30 e 90 dias com eventos nos limites.

**Evidências:** [src/hooks/business/useQueueAnalytics.ts:74–121](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueueAnalytics.ts#L74-L121).

**Prova local:** ROOT-P02.

### R2-QUE-005 · P2 · Salvar metas fecha o formulário mesmo quando a gravação falha

**Condição:** UPDATE/INSERT de queue_goals retorna erro explícito, como 42501.

**Comportamento:** saveGoal mostra erro e resolve normalmente no catch; handleSave aguarda a função e fecha o diálogo incondicionalmente.

**Efeito:** O rascunho sai de tela após uma gravação recusada, dificultando correção e repetição confiável.

**Correção e aceite propostos:** Propagar a falha ou retornar resultado discriminado; fechar apenas no sucesso confirmado e preservar o rascunho.

**Evidências:** [src/hooks/business/useQueueGoals.ts:68–103](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueueGoals.ts#L68-L103); [src/components/queues/QueueGoalsDialog.tsx:53–61](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/QueueGoalsDialog.tsx#L53-L61).

**Prova local:** ROOT-P03.

### R2-QUE-006 · P2 · Ações Editar e Configurar fila estão visíveis sem operação

**Condição:** Usar Editar no card de fila ou Configurar na página de detalhes.

**Comportamento:** QueueCard renderiza o item Editar sem callback; QueueDetails renderiza Configurar sem callback. updateQueue existe, mas não é conectado a esses controles.

**Efeito:** O CRUD anunciado não inclui um caminho funcional de edição nesses pontos de entrada.

**Correção e aceite propostos:** Conectar os controles a um formulário com confirmação de gravação, ou retirar a promessa até existir. Testar edição pelo ponto de entrada ativo.

**Evidências:** [src/components/queues/QueueCard.tsx:39–47](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/QueueCard.tsx#L39-L47); [src/pages/QueueDetails.tsx:95–99](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/pages/QueueDetails.tsx#L95-L99); [src/hooks/business/useQueues.ts:106–126](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/business/useQueues.ts#L106-L126).

**Prova local:** Inspeção de contrato/cadeia; sem execução de produção..

### R2-SLA-001 · P2 · Métricas e histórico de SLA usam denominadores incompatíveis

**Condição:** Mesmo conjunto contendo linhas pendentes legadas, importadas ou criadas por escrita administrativa, sem primeira resposta e ainda não marcadas como violadas. O escritor versionado atual insere linhas já respondidas; não se afirma que ele produza rotineiramente essa amostra, nem que ela exista em produção.

**Comportamento:** fetchSLAMetrics exclui pendentes do denominador de taxa; fetchSLAHistory os conta como sucesso. Dez registros, um com resposta válida tardia e nove pendentes, resultam em 0% no painel e 90% no histórico. Ausência de amostra também vira 100%.

**Efeito:** O resumo, o histórico e os sparklines podem contradizer-se sem mudança no dado e apresentar desempenho perfeito sem respostas avaliadas.

**Correção e aceite propostos:** Definir elegibilidade e denominador únicos, distinguir pendente de atendido no prazo e sem amostra; provar ambos consumidores com a mesma fixture.

**Evidências:** [src/hooks/sla/useSLAMetrics.ts:41–74](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sla/useSLAMetrics.ts#L41-L74); [src/hooks/sla/useSLAHistory.ts:87–116](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sla/useSLAHistory.ts#L87-L116); [src/components/queues/SLADashboard.tsx:25–33](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/SLADashboard.tsx#L25-L33).

**Prova local:** ROOT-P04.

### R2-SLA-002 · P2 · Períodos de SLA não correspondem aos rótulos Todos e 7d

**Condição:** Selecionar Todos, ou calcular histórico de sete dias.

**Comportamento:** Todos aplica limite inferior de 365 dias. Histórico subtrai sete dias e inclui os dois extremos, produzindo oito datas civis; vale também para 14/30/90.

**Efeito:** Registros mais antigos desaparecem do total anunciado, e a janela histórica contém um dia extra.

**Correção e aceite propostos:** Remover o limite em Todos ou explicitar Últimos 365 dias; definir janelas inclusivas/exclusivas e testar virada do dia no fuso do produto.

**Evidências:** [src/hooks/sla/useSLAMetrics.ts:31–54](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sla/useSLAMetrics.ts#L31-L54); [src/components/queues/SLADashboard.tsx:55–60](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/queues/SLADashboard.tsx#L55-L60); [src/hooks/sla/useSLAHistory.ts:60–83](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sla/useSLAHistory.ts#L60-L83).

**Prova local:** ROOT-P04, ROOT-P05.

### R2-SLA-003 · P1 · Configurações granulares de prazo não governam o SLA efetivo

**Condição:** Salvar regra ativa com primeira resposta diferente de cinco minutos.

**Comportamento:** O manager promete precedência automática, e as mutations persistem os prazos. useApplicableSLA implementa resolução, mas não tem consumidor ativo localizado. Os dois indicadores ativos passam 5 e a última definição versionada localizada da função do banco também compara cinco minutos. A revisão cruzada de modules também localizou o formulário SLAConfigTable: ele promete editar o prazo, mas oferece somente nome, prioridade e padrão. Esse contraste de interface reforça a necessidade de adjudicar o contrato atual, sem criar outro ID para a mesma família.

**Efeito:** Salvar uma regra não altera o indicador nem a classificação persistida no caminho examinado. A revisão não presume que restaurar um modelo antigo seja a decisão correta; a promessa atual precisa corresponder ao comportamento.

**Correção e aceite propostos:** Adjudicar o contrato de cinco minutos versus configurável e fazê-lo único entre UI, persistência e documentação. Testar regra de dois minutos com resposta aos três.

**Evidências:** [src/components/settings/SLARulesManager.tsx:50–61](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/settings/SLARulesManager.tsx#L50-L61); [src/hooks/sla/useSLARules.ts:67–86](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sla/useSLARules.ts#L67-L86); [src/hooks/sla/useApplicableSLA.ts:97–134](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/hooks/sla/useApplicableSLA.ts#L97-L134); [src/components/inbox/chat/ChatPanelHeader.tsx:128–132](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/chat/ChatPanelHeader.tsx#L128-L132); [src/components/inbox/VirtualizedRealtimeList.tsx:518–524](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/inbox/VirtualizedRealtimeList.tsx#L518-L524); [supabase/migrations/20260903233000_sla_base_only_valid_messages.sql:46–55](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260903233000_sla_base_only_valid_messages.sql#L46-L55); [src/components/dashboard/sla/SLAConfigTable.tsx:101–130](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/src/components/dashboard/sla/SLAConfigTable.tsx#L101-L130).

**Prova local:** Inspeção de contrato/cadeia; sem execução de produção..

### R2-SLA-004 · P2 · Marco de medição do SLA omite o tempo entre criação e envio

**Condição:** Mensagem do agente é criada antes de ser efetivamente enviada e muda para sent após atraso suficiente para ultrapassar o SLA.

**Comportamento:** O trigger roda ao confirmar sent, mas passa NEW.created_at para p_responded_at. A migração declara essa escolha deliberada para evitar drift de now(). O enqueue insere sending antes da entrega. Exemplo estático: criada aos quatro minutos e confirmada aos dez pode ser classificada como resposta aos quatro.

**Efeito:** A medida representa criação de uma mensagem que acabou enviada; não mede todo o tempo em fila/retentativa até a entrega ao provedor. O comportamento é confirmado, mas a aceitação desse marco é uma lacuna de contrato, não um incidente comprovado nem autorização para trocar a regra.

**Correção e aceite propostos:** Adjudicar o evento que materializa resposta e documentar seu timestamp; distinguir atraso de entrega de atraso do webhook sem presumir que now() seja correto. Provar envio pendente, confirmação posterior e retentativa.

**Evidências:** [supabase/migrations/20260903225000_sla_first_response_v2.sql:1–11](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260903225000_sla_first_response_v2.sql#L1-L11); [supabase/migrations/20260903225000_sla_first_response_v2.sql:109–135](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260903225000_sla_first_response_v2.sql#L109-L135); [supabase/migrations/20260903233000_sla_base_only_valid_messages.sql:46–55](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260903233000_sla_base_only_valid_messages.sql#L46-L55); [supabase/migrations/20260909250000_allow_location_in_atomic_outbound_delivery.sql:113–120](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/migrations/20260909250000_allow_location_in_atomic_outbound_delivery.sql#L113-L120); [supabase/functions/message-delivery/index.ts:327–331](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/supabase/functions/message-delivery/index.ts#L327-L331).

**Prova local:** Inspeção de contrato/cadeia; sem execução de produção..

## As duas fontes omitidas

A enumeração física de Markdown anterior contém todos os352 arquivos atuais. A falha é de adjudicação de requisitos: dois prompts classificados como apoio possuem dez tarefas explícitas sem correspondência no registro de planos. Parte já está implementada em consumidores atuais; parte existe em componentes substituídos. O arquivo omitted-source-adjudication.json conserva a comparação, sem fabricar dez tarefas pendentes.

| Requisito | Estado da correspondência | Avaliação |
|---|---|---|
| CRM360-T1 | CURRENT_CONSUMER_PRESENT_REQUIRES_SUCCESSOR_ADJUDICATION | Panel ativo dentro de Mais detalhes, protegido pelo gate CRM; a localização histórica mudou. |
| CRM360-T2 | CURRENT_CONSUMER_PRESENT_REQUIRES_SUCCESSOR_ADJUDICATION | Busca CRM integrada à tela de Contatos via ContactCRMDialog; planos posteriores divergem sobre o botão, sem dez tarefas novas presumidas. |
| CRM360-T3 | PARTIAL_OR_CHANGED_SCOPE | GlobalSearch consulta CRM com gate de supervisor, deduplica telefone e só inclui vínculos locais; debounce300ms. CommandPalette ativo busca módulos. Reconciliar a intenção antiga de busca/importação. |
| CRM360-T4 | IMPLEMENTED_IN_SUPERSEDED_COMPONENT | ChatHeader antigo contém CrmBadges, mas ChatPanel usa ChatPanelHeader. A presença do componente legado não certifica o header ativo. |
| CRM360-T5 | PARTIAL_OR_CHANGED_SCOPE | Header atual tem logo/nome/VIP; vendedor não aparece nesse header, podendo estar na ficha. Necessita sucessão explícita, não reaplicação cega do prompt. |
| CRM360-T6 | PARTIAL_OR_CHANGED_SCOPE | Lista ativa mostra empresa do contato local; não há consulta CRM por linha nesse ponto. Badge CRM específico do prompt não está presente no trecho. |
| INTEL-T1 | CURRENT_CONSUMER_PRESENT_REQUIRES_SUCCESSOR_ADJUDICATION | Painel ativo possui gatilhos limitados a4, rapport condicional, fallback de horários, cores churn e DISC. QA visual e contrato de dados externos não foram executados. |
| INTEL-T2 | IMPLEMENTED_IN_SUPERSEDED_COMPONENT | Brain, largura320, borda de risco e motion existem no ChatHeader legado; o header ativo é outro. |
| INTEL-T3 | PARTIAL_OR_CHANGED_SCOPE | CRMSyncButton legado não tem consumidor ativo localizado. O sucessor CrmSyncMenuItem envia contato estável, mas não mostra badge persistente de último sync ou modo Sem CRM. |
| INTEL-T4 | PARTIAL_OR_CHANGED_SCOPE | Lista ativa usa ai_sentiment canônico PT-BR; header legado usa briefing.sentiment. O detector do CRMAutoSync não é uma prova de atualização em tempo real de ambos. |

## Limites e falsos positivos rejeitados

- **CRMSyncButton bloqueia outros contatos depois de contact_not_found:** Componente exportado sem consumidor ativo localizado; o menu atual usa CrmSyncMenuItem.
- **Todas as72 referências ausentes do catálogo representam funcionalidades removidas:** As72 linhas representam69 caminhos únicos; muitos hooks foram movidos para subpastas. Resolver caminho/sucessor antes de concluir ausência.
- **Ausência de linha citada prova que ninguém leu a função:** Índice é de evidência estruturada localizada, não registro onisciente de leitura.
- **ADR de empty states gera automaticamente3tarefas novas:** Guia contém etapas, mas é regra/proposta; o estado de adoção e planos sucessores devem ser reconciliados antes de aumentar backlog.
- **OfflineCache nunca é limpo no logout:** useAuth chama clearOfflineCache e queryClient.clear no sign-out; não se inferiu vazamento do simples CACHE_KEY global.
- **Atividade por hora ignora o período sem aviso:** QueueCharts rotula explicitamente Atividade por Hora (Hoje); outros problemas de amostra são separados.

O catálogo de microfunções e o grafo de importação servem para identificar cobertura faltante. Funções aninhadas e callbacks não equivalem a funcionalidades de negócio; um import ou uma faixa citada não prova execução. A cobertura específica desta revisão está em coverage.json.
