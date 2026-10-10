# Dashboard — análise técnica e plano de 100 etapas

**Projeto:** adm01-debug/Zapp_Web_V2  
**Data da análise:** 30/09/2026  
**Referência fixa:** `2880cb9908a8bd2c5fd268f6b64b640fc0a4b222`  
**Estado:** planejamento; nenhuma correção, migration, teste de execução ou alteração de produção realizada nesta análise.

## Escopo e limites

Análise estática de documentação, componentes, hooks, migrations e testes acessados no repositório. A presença de uma migration não comprova sua aplicação no banco. Não houve conexão ao banco de produção, medição de desempenho real ou execução das suítes; esses pontos permanecem previstos no plano. Os achados são sobre a implementação versionada, salvo quando explicitamente classificados como risco a validar.

O plano preserva as correções já presentes: ranking com período real, conversão de auth.uid() para profiles.id nas RPCs, paginação keyset do breakdown CSAT e acesso a relatórios por proprietário com exceção administrativa. O README ainda descreve versões anteriores de parte desses comportamentos. [E01, E04, E09–E11, E24–E25]

## Achados que fundamentam a ordem de correção

| Achado | Evidência e consequência | Referências |
|---|---|---|
| Documentação desatualizada | Ranking por período e propriedade de relatórios já mudaram; o mapa documental não acompanha tudo. | E01, E09, E24 |
| Histórico associado ao responsável atual | KPI e volume usam contacts.assigned_to; transferências podem reatribuir fatos anteriores. É risco estrutural, não medição de impacto em produção. | E04, E05, E10 |
| Escopo de fila contraditório | O filtro pessoal elimina registros não atribuídos antes de calcular pending; myActive não exige status ativo e o breakdown não exclui todos os estados encerrados. | E04 |
| Estoque dependente de updated_at | A contagem de abertas recebe período de atualização do contato, não apenas seu estado atual. | E03, E04 |
| Realtime e atualização frágeis | Sem filtros recebidos do topo; erros de respostas não são todos verificados; fetch marca conexão; refetch não retorna Promise agregada. | E02, E03, E06 |
| Ausência confundida com desempenho | SLA sem denominador retorna 100%; montagem de KPI usa fallback zero; ranking usa habilitação do perfil como online. | E07, E10, E30 |
| Metas com fonte divergente | Taxa de resolução usa análises de IA; contatos atendidos dependem da criação do cadastro. | E08 |
| Limites usados como total | NPS lê no máximo 500; resumo recente de sentimento deriva totais de até 400; alertas de IA derivam lista de até 5. Outros hooks agregam leituras sem paginação. | E12, E16, E17 |
| Sentimento com contratos incompatíveis | Há leitores em português e inglês; zero é substituído por 50 em uma série; percentuais diários recebem peso igual. | E14, E15, E17 |
| Controles e estados não conectados | Modo CSAT/NPS desenha só CSAT; análises e insights recentes na aba IA são estados vazios fixos. | E13, E18 |
| Previsão com alegações sem suporte no método | Dados reais são médias históricas, intervalo usa faixa heurística e capacidade padrão é 35. | E19, E20 |
| Cobertura de segurança insuficiente como prova final | Testes de filtro rodam com service_role e podem pular cenários; casos de borda incluem SELECTs comentados e fórmulas isoladas. | E27–E29 |

**Prioridades:** P0 = comprovação de autorização e barreira de liberação; P1 = correção de números, escopo e confiabilidade; P2 = desempenho, manutenção e experiência. P0 não significa que um vazamento tenha sido demonstrado nesta análise.

**Organização:** dez revisões de código, com dez etapas cada. Segurança pode caminhar em paralelo ao contrato de métricas. Testes de regressão devem acompanhar cada correção desde o início; o último bloco consolida a homologação e a liberação.


## CR-01 — Base técnica, regras de negócio e contratos

P1 · Responsáveis sugeridos: arquitetura, banco de dados e produto.

**001. Fixar a versão de referência.** Registrar o commit auditado e, antes da implementação, identificar também a versão realmente publicada. Aceite: código, ambiente e data identificados; nenhuma suposição de que main equivale à produção.

**002. Mapear as dependências reais.** Relacionar cada card e aba aos componentes, hooks, RPCs, tabelas, triggers e serviços efetivamente utilizados. Aceite: mapa navegável incluindo implementações paralelas de CSAT, sentimento e relatórios.

**003. Reconciliar o plano anterior.** Conferir as etapas antigas contra commits, PRs e migrations antes de reabrir tarefas. Aceite: ranking por período, correção de UUID, paginação do breakdown CSAT e relatórios por proprietário preservados quando já implementados.

**004. Comparar repositório e banco.** Prever inspeção somente de leitura das definições efetivas, assinaturas, proprietários, permissões, RLS, índices e histórico de migrations. Aceite: divergências comprovadas e documentadas, sem aplicar automaticamente o SQL do repositório.

**005. Documentar as identidades.** Distinguir auth.uid(), profiles.user_id, profiles.id e as referências usadas por agente, autor e proprietário. Aceite: cada parâmetro e chave estrangeira com identidade explícita e exemplos em que os UUIDs são diferentes.

**006. Definir o dicionário dos indicadores.** Especificar unidade, fonte, numerador, denominador, granularidade, amostra mínima e tratamento de ausência para cada KPI. Aceite: “contato”, “mensagem”, “atendimento” e “encerramento” não usados como sinônimos.

**007. Formalizar a matriz de acesso.** Separar dados pessoais, filas autorizadas, gestão e propriedade de relatórios, respeitando decisões anteriores. Aceite: matriz aprovada para agente, special_agent, supervisor e administrador, incluindo mudança ou perda de papel.

**008. Padronizar os períodos.** Definir America/Sao_Paulo, início da semana, mês civil versus janela móvel e intervalos [início, fim). Aceite: frontend, SQL e relatórios compartilham a mesma definição, independentemente do fuso do navegador.

**009. Versionar o contrato analítico.** Definir respostas tipadas com valores, unidades, amostras, escopo, período e instante de referência. Aceite: dados incompletos ou incompatíveis são rejeitados, sem serem convertidos silenciosamente em zero.

**010. Definir o conjunto de aceitação.** Descrever cenários e resultados esperados antes das correções, inclusive transferências, reabertura, fila vazia e ausência de avaliações. Aceite: cada etapa posterior vinculada a uma evidência verificável e a uma revisão responsável.

## CR-02 — Autorização, RLS e isolamento de informações

P0 para comprovação dos controles de acesso · Responsáveis: banco de dados e segurança.

**011. Auditar EXECUTE das RPCs.** Verificar permissões efetivas de PUBLIC, anon, authenticated e service_role, incluindo sobrecargas e migrations posteriores. Aceite: manter as revogações já existentes e demonstrar que chamadas anônimas não acessam indicadores protegidos.

**012. Validar os controles no servidor.** Testar diretamente os endpoints das abas gerenciais, sem depender de abas ocultas. Aceite: usuário sem privilégio recebe negação ou resposta restrita conforme contrato, sem dados gerenciais no payload.

**013. Corrigir o escopo operacional das filas.** Separar o escopo pessoal do escopo das filas permitidas em dashboard_contact_counts. Aceite: agente enxerga pendências autorizadas não atribuídas, sem receber dados de filas externas; não basta remover indiscriminadamente o filtro de agente.

**014. Proteger o histórico por autoria.** Compatibilizar a futura atribuição histórica de desempenho com RLS e minimização de dados. Aceite: reconhecer trabalho passado não concede acesso indevido ao cadastro ou às mensagens atuais de outro responsável.

**015. Preservar a propriedade dos relatórios.** Manter supervisor limitado às próprias configurações e a exceção administrativa prevista, verificando também rebaixamento e desativação. Aceite: falsificação de created_by e manutenção indevida de acesso após revogação bloqueadas.

**016. Revalidar a navegação por papel.** Corrigir a aba ativa quando as permissões mudarem e condicionar consultas gerenciais ao papel resolvido. Aceite: nenhuma aba anteriormente aberta permanece exibindo dados vedados após perda de autorização.

**017. Isolar e limpar caches.** Auditar as chaves e o descarte de dados em logout, troca de usuário e mudança de papel. Aceite: resultados de uma identidade não reaparecem para outra, mesmo sem recarregar a página.

**018. Explicitar a segurança das funções.** Classificar cada função como INVOKER ou DEFINER de maneira intencional; revisar proprietário e search_path nas privilegiadas. Aceite: sem trocar para DEFINER apenas para contornar RLS e sem depender de caminhos de resolução inseguros.

**019. Validar parâmetros também no backend.** Limitar intervalos, p_limit, p_days, UUIDs e valores enumerados; tratar nulos e parâmetros contraditórios. Aceite: entradas inválidas não geram consultas ilimitadas nem ampliam o escopo de acesso.

**020. Minimizar dados sensíveis.** Revisar projeções de perfis, textos de análises, audit_logs, destinatários e campos de provedores. Aceite: cada widget recebe somente os campos necessários, sem credenciais ou conteúdo de terceiros.

## CR-03 — Modelo de dados e correção dos indicadores

P1 · Responsáveis: banco de dados, backend e produto.

**021. Definir o ciclo de atendimento.** Distinguir contato persistente de cada atendimento e reabertura, reutilizando identificadores existentes quando suficientes. Aceite: encerrar duas vezes o mesmo contato tem semântica definida, sem duplicação acidental.

**022. Fixar autoria e fila dos fatos.** Basear resultados históricos no autor e na fila do momento do evento, não no contacts.assigned_to atual. Aceite: transferência posterior não altera resoluções, tempos ou produtividade já atribuídos.

**023. Planejar a recomposição histórica.** Usar encerramentos, mensagens e eventos de transferência para reconstruir dimensões ausentes. Aceite: registros sem evidência ficam identificados como indeterminados; não atribuir retrospectivamente tudo ao responsável atual.

**024. Separar estoque de fluxo.** Revisar o filtro por contacts.updated_at nas contagens de abertas e pendentes. Aceite: conversa ainda aberta desde ontem aparece no estoque atual, enquanto entradas e encerramentos seguem seus períodos próprios.

**025. Unificar os estados contados.** Aplicar predicados explícitos a open, pending, myActive, waiting e inService. Aceite: resolvidos e arquivados não entram como ativos; totais e detalhamentos conciliam segundo as mesmas regras.

**026. Corrigir os limites de dashboard_kpi.** Substituir a ambiguidade entre últimas 24 horas e início de ontem; limitar também a consulta com p_since nulo. Aceite: “ontem” inclui o dia completo definido no contrato e não dispara varredura ilimitada.

**027. Fixar um instante de referência.** Usar limites temporais coerentes para cards, séries e comparação, excluindo timestamps futuros. Aceite: resultados de uma mesma atualização representam o mesmo corte temporal, inclusive na virada do dia.

**028. Tornar os filtros previsíveis.** Propagar filtros compatíveis aos widgets e identificar explicitamente os indicadores com período próprio. Aceite: nenhum controle apresentado como global altera apenas parte da tela sem informar quais dados ficaram fora do filtro.

**029. Distinguir média, mediana e p90.** Alinhar nomes de campos, rótulos, tooltips e séries; hoje a manchete usa mediana e a série de resposta usa média. Aceite: cada estatística tem identidade explícita e o mesmo conceito no banco e na apresentação.

**030. Validar integridade temporal.** Tratar respostas anteriores à primeira mensagem, eventos futuros e timestamps ausentes. Aceite: dados inválidos não entram nos tempos agregados; inconsistências ficam rastreáveis sem exclusão silenciosa de registros.

## CR-04 — Consultas, escala e integridade estrutural

P1 para completude; P2 para otimização · Responsáveis: banco de dados e backend.

**031. Agregar SLA no servidor.** Substituir a leitura bruta de conversation_sla em useSLAMetrics por agregação autorizada. Aceite: totais e percentuais permanecem corretos acima do limite de linhas da API.

**032. Agregar metas no servidor.** Calcular mensagens, atendimentos e resoluções sem transportar todo o histórico ao navegador. Aceite: metas continuam corretas com grandes volumes e mantêm filtros, autoria e regras aprovadas.

**033. Agregar análises de IA e sentimento.** Retornar contagens e distribuições completas por período, separadas das listas recentes. Aceite: um limite de apresentação nunca passa a ser o denominador do indicador.

**034. Remover o teto analítico de 500 respostas NPS.** Calcular NPS sobre todas as respostas elegíveis, deixando paginação apenas para listagens. Aceite: a 501ª resposta participa do cálculo quando pertence ao período.

**035. Agregar os heatmaps por intervalo.** Produzir buckets de dia e hora no banco, com filtros e autorização aplicados antes da agregação. Aceite: janelas de 90, 180 e 365 dias não exigem download de cada mensagem.

**036. Contar conversas ativas com DISTINCT.** Trocar a coleta limitada de contact_id em useRealtimeDashboard por contagem distinta no servidor. Aceite: muitos registros de um contato não escondem outros contatos ativos depois do corte de linhas.

**037. Preservar a completude já obtida no CSAT.** Manter a paginação keyset do breakdown até validar eventual substituição por RPC. Aceite: comparação exata com a implementação atual, inclusive timestamps iguais e limite máximo de páginas.

**038. Projetar índices com evidência.** Avaliar planos para filtros temporais, filas, responsáveis e joins de contatos, mensagens, SLA e avaliações. Aceite: cada índice proposto tem ganho medido e custo de escrita/armazenamento documentado; sem duplicar índices existentes.

**039. Revisar restrições e chaves.** Verificar FKs, unicidade de eventos, escalas CSAT/NPS, metas positivas e campos obrigatórios. Aceite: restrições novas têm diagnóstico prévio dos dados legados e plano de saneamento aprovado.

**040. Definir orçamento de desempenho.** Medir volume transferido, consultas por abertura, duração e concorrência; avaliar agregação incremental somente se necessária. Aceite: metas de desempenho baseadas na infraestrutura real, sem particionamento ou materialização prematuros.

## CR-05 — Tempo real, atualização e concorrência

P1 · Responsáveis: frontend e backend.

**041. Alinhar o realtime ao escopo.** Aplicar aos contadores ao vivo os mesmos filtros e permissões dos cards correspondentes, ou rotulá-los como visão independente. Aceite: troca de fila/agente não mistura totais de universos diferentes.

**042. Separar conexão de sucesso de consulta.** Verificar error de todas as respostas Supabase e não marcar conectado porque um fetch terminou. Aceite: estado do canal, última leitura bem-sucedida e falha de dados são apresentados separadamente.

**043. Capturar deltas imutáveis.** Copiar pending e minuteCountRef antes de enfileirar setState e zerar os acumuladores. Aceite: renderização adiada e Strict Mode não perdem contagens nem alteram retroativamente o lote aplicado.

**044. Corrigir a contagem de não lidas.** Considerar sender, is_read, duplicatas e a confiabilidade de payload.old nas transições. Aceite: mensagem do agente não reduz não lidas do contato; eventos insuficientes provocam reconciliação, não subtração presumida.

**045. Manter janelas móveis verdadeiras.** Expirar eventos de mais de 60 minutos e renovar contagens diárias à meia-noite. Aceite: “última hora” e “hoje” não acumulam indefinidamente enquanto a tela permanece aberta.

**046. Reconciliar snapshot e eventos.** Definir como combinar carga inicial, eventos durante o fetch, reconexão e atualizações periódicas. Aceite: nenhum evento é perdido ou contado duas vezes durante a troca de snapshot.

**047. Invalidar todos os indicadores afetados.** Mapear mensagens, contatos, encerramentos, SLA, avaliações, metas e XP às respectivas queries. Aceite: alterações atualizam os cards envolvidos; staleTime não é tratado como agendamento automático de atualização.

**048. Corrigir a atualização manual.** Fazer refetch retornar uma Promise agregada, aguardar invalidações necessárias e encerrar o estado visual em finally. Aceite: “atualizado” só aparece depois das consultas concluídas e falhas continuam visíveis.

**049. Impedir respostas fora de ordem.** Cancelar ou descartar consultas antigas em trocas rápidas de período, usuário ou fila, especialmente no ranking e NPS. Aceite: resposta lenta de um filtro anterior não sobrescreve a seleção atual.

**050. Controlar assinaturas e carga.** Compartilhar fontes quando apropriado, desmontar canais/timers e agrupar atualizações em rajadas. Aceite: sem assinaturas duplicadas desnecessárias, consultas gerenciais para agentes ou tempestade de refetch a cada mensagem.

## CR-06 — SLA, metas, produtividade e ranking

P1 · Responsáveis: banco de dados, frontend e produto.

**051. Unificar a elegibilidade do SLA.** Distinguir respostas no prazo, violações e atendimentos ainda aguardando resposta. Aceite: painel SLA, saúde da fila e ranking utilizam denominadores explícitos e compatíveis.

**052. Retirar os 100% sem amostra.** Substituir o retorno de sucesso quando o denominador do SLA é zero por ausência de medição. Aceite: estados sem amostra, carregando e erro nunca aparecem como cumprimento perfeito.

**053. Calcular resolução a partir dos fatos operacionais.** Retirar conversation_analyses como substituto de encerramentos na meta de resolução. Aceite: concluir uma análise de IA não altera o desempenho operacional sem o evento de atendimento correspondente.

**054. Corrigir contatos atendidos.** Usar evidência de atendimento no período, em vez de apenas contacts.created_at; se o indicador pretendido for novos contatos, renomeá-lo. Aceite: retomar um cliente antigo é tratado conforme o conceito aprovado.

**055. Validar metas e ausência de configuração.** Impedir divisão por zero e diferenciar meta desativada, configuração ausente e falha de carregamento. Aceite: sem NaN, progresso artificial ou reativação de metas por fallback.

**056. Versionar metas e seu alcance.** Definir vigência, responsável e alcance pessoal/equipe; carregar configuração antes de calcular resultado. Aceite: mudança de objetivo não reescreve resultados históricos sem regra explícita.

**057. Conectar o período das metas à interface.** Usar o período real do hook, renovar datas na virada do dia e reiniciar controles de celebração por usuário/período. Aceite: seletor funcional e nenhuma celebração originada de dados antigos ou incompletos.

**058. Reconciliar o ledger de XP.** Comparar fatos de mensagens/encerramentos com agent_achievements e agent_stats; testar idempotência dos triggers existentes. Aceite: repetição de evento não duplica XP nem resoluções.

**059. Consolidar o ranking por período.** Preservar a RPC já implementada, validar desempate, amostras e limite; não usar rank atual como posição anterior. Aceite: variação de posição só aparece quando existe comparação histórica real.

**060. Corrigir presença e população de agentes.** Usar a fonte de presença, não profiles.is_active, para indicar online; alinhar papéis e denominadores. Aceite: usuário habilitado, porém desconectado, não aparece como atendente online.

## CR-07 — CSAT, NPS e sentimento

P1 · Responsáveis: banco de dados, analytics e frontend.

**061. Unificar o conceito de CSAT.** Distinguir média de estrelas da proporção de avaliações satisfeitas e padronizar esta última entre cards e ranking. Aceite: mesma amostra produz o mesmo CSAT em todas as telas.

**062. Corrigir o cache derivado de CSAT.** Evitar estatística em query independente que lê surveysQuery.data sem identidade da amostra. Aceite: nova avaliação e recarregamento atualizam distribuição, total e média juntos.

**063. Implementar a série NPS prometida.** Conectar dados reais ao modo “CSAT e NPS” e usar escala apropriada para NPS negativo. Aceite: legendas, séries e seletores correspondem ao que está efetivamente desenhado.

**064. Alinhar as janelas das avaliações.** Aplicar o mesmo corte temporal e escopo aos KPIs, séries, distribuição e classificação por fila. Aceite: amostras conciliáveis, inclusive no primeiro e último dia do período.

**065. Normalizar o vocabulário de sentimento.** Resolver a divergência positive/negative/neutral versus positivo/negativo/neutro na gravação e leitura. Aceite: mapeamento central e desconhecidos explícitos, sem classificar automaticamente dado inválido como neutro.

**066. Preservar zero e ausência de score.** Remover substituições como sentiment_score || 50 e documentar a escala real. Aceite: zero legítimo permanece zero; dia sem análise não recebe score inventado.

**067. Ponderar pelas amostras.** Calcular porcentagens e score agregados usando contagens ou somas, não média simples dos percentuais diários. Aceite: resultados batem com o conjunto completo, mesmo quando os dias têm volumes muito diferentes.

**068. Separar total de alertas da lista recente.** Distinguir análise negativa, alerta gerado e alerta ativo; não usar limites de 400 ou 5 registros como total. Aceite: card de total exato e lista paginada usam o mesmo conceito sem compartilhar o corte de apresentação.

**069. Corrigir a comparação temporal de sentimento.** Comparar janelas equivalentes, não metades dos dias que tiveram registros, e usar pontos percentuais quando apropriado. Aceite: “período anterior” corresponde a datas reais e comparáveis.

**070. Consolidar as fontes de sentimento.** Eliminar divergências entre useAIStats, useRealSentimentData e os hooks de alertas, preservando necessidades distintas. Aceite: uma análise tem classificação e contagem coerentes em todas as abas, com rastreabilidade da origem.

## CR-08 — IA, previsão e analytics

P1 para veracidade; P2 para evolução analítica · Responsáveis: analytics, backend e frontend.

**071. Conectar análises recentes.** Substituir o bloco vazio fixo em AIQuickAccess pela fonte existente de análises autorizadas. Aceite: mostrar lista, vazio, carregamento ou erro conforme resposta real, sem prometer conteúdo que não foi consultado.

**072. Tornar o período de insights funcional.** Ligar insightPeriod à consulta correspondente e alinhar os rótulos de 24 horas, mês civil e últimos 30 dias. Aceite: cada seleção muda a janela efetiva; recurso indisponível é identificado como tal.

**073. Usar acesso restrito aos alertas de IA.** Revisar a leitura direta de audit_logs em useAIStats e preferir a interface específica de alertas já existente quando adequada. Aceite: supervisor recebe somente dados permitidos, sem ampliar a RLS da tabela inteira.

**074. Corrigir as tendências de IA.** Tratar base zero, sinal da porcentagem, amostra insuficiente e significado do aumento de negativos. Aceite: sem “100%” arbitrário sobre base zero, sinal duplicado ou indicação positiva para piora do sentimento.

**075. Corrigir a identificação da previsão.** Descrever o método estatístico realmente utilizado e retirar a alegação de confiança de 95% sem validação. Aceite: badge, legenda e tooltip não atribuem IA ou cobertura estatística a uma faixa heurística.

**076. Separar observado e estimado.** Usar volumes efetivos das últimas horas na série “Dados Reais” e a observação mais recente na comparação. Aceite: médias históricas não são apresentadas como ocorrências atuais.

**077. Validar a metodologia preditiva.** Definir unidade de demanda, exposição por hora e histórico mínimo; avaliar previsões contra períodos reservados. Aceite: erro e cobertura medidos, sem dividir cegamente por sete quando a base está incompleta.

**078. Substituir a capacidade fixa.** Vincular o limite a uma configuração operacional validada, com unidade e vigência. Aceite: ausência de capacidade conhecida não resulta automaticamente em “OK” nem usa 35 como fato operacional.

**079. Tratar entradas vazias e inválidas.** Proteger os cálculos de previsão contra arrays vazios, ausência de pontos futuros, divisão por zero e valores não finitos. Aceite: nenhuma combinação suportada derruba o card ou mostra Infinity/NaN.

**080. Corrigir a semântica dos heatmaps.** Fazer messages, conversations e resolutions usarem suas fontes próprias; alinhar calendários e filtros. Aceite: mudar a métrica muda o cálculo, não apenas a chave do cache ou o rótulo.

## CR-09 — Relatórios, interação e observabilidade

P1 para confiabilidade; P2 para experiência · Responsáveis: backend, frontend e operação.

**081. Validar configurações de relatório.** Validar nome, tipo, frequência e destinatários, normalizando e deduplicando emails no frontend e backend. Aceite: configuração inválida não é salva, e created_by continua protegido pelas regras existentes.

**082. Corrigir a frequência apresentada.** Eliminar a associação entre biweekly e “Personalizada / Sob demanda”; definir precisamente a recorrência quinzenal. Aceite: texto escolhido corresponde ao calendário realmente executado.

**083. Comprovar a cadeia de execução.** Rastrear configuração, agendador, geração, transporte e retorno de entrega, sem presumir que salvar configurações significa enviar. Aceite: diagnóstico identifica o executor real ou documenta sua ausência antes de habilitar a promessa de automação.

**084. Projetar execução idempotente.** Definir chave por ocorrência programada, tratamento de concorrência, tentativas e horários perdidos. Aceite: duas instâncias do agendador não geram dois envios da mesma ocorrência.

**085. Controlar entrega e acesso.** Registrar estados de geração/envio, falhas e tentativas; revalidar permissões e proteger arquivos e destinatários. Aceite: conteúdo sensível não sai do escopo autorizado e entrega falha não aparece como concluída.

**086. Conciliar relatório e Dashboard.** Reutilizar contratos analíticos com período, fuso, escopo e instante de referência congelados. Aceite: relatório e tela conciliam quando consultados com os mesmos parâmetros.

**087. Endurecer as alterações de configuração.** Confirmar exclusões, tratar erros do toggle, verificar linhas afetadas e concorrência entre edições. Aceite: nenhuma mensagem de sucesso quando RLS ou conflito impediu a alteração.

**088. Padronizar estados dos widgets.** Distinguir carregando, vazio, sem permissão, erro, incompleto e desatualizado, preservando cards independentes. Aceite: falha de uma fonte não vira zero nem derruba desnecessariamente todo o painel.

**089. Revisar acessibilidade e navegação.** Testar teclado, foco, nomes acessíveis, botões em cards, contraste, responsividade e manutenção de filtros nos detalhamentos. Aceite: principais jornadas utilizáveis sem mouse e sem perda de contexto.

**090. Instrumentar a confiabilidade.** Registrar latência, falhas, atraso de atualização, completude e identificadores de requisição sem expor dados pessoais. Aceite: diferenças entre número exibido e fonte podem ser investigadas com evidência.

## CR-10 — Testes, migrations e liberação controlada

P0 como barreira de liberação; P1 para regressões · Responsáveis: QA, banco de dados, segurança e operação.

**091. Transformar exemplos SQL em testes executáveis.** Adicionar asserções e falha automática, chamando as funções reais com dados controlados. Aceite: alterar a fórmula da RPC faz o teste falhar; comentários de resultados antigos não contam como aprovação.

**092. Testar com permissões reais.** Separar testes do guard interno dos testes de RLS e chamadas autenticadas via API. Aceite: matriz de papéis validada sem usar service_role como única prova de isolamento.

**093. Criar fixtures determinísticas de escala e borda.** Cobrir limites superiores a 1.000 linhas, 500 NPS e 400 análises, UUIDs distintos, transferências e mudanças de papel. Aceite: massa isolada com resultados exatos e relógio controlado, sem depender dos dados existentes em produção.

**094. Cobrir as nove abas de ponta a ponta.** Testar papéis, filtros, atualização, navegação, recarga da URL, erros e apresentação dos dados. Aceite: fluxos reais aprovados, incluindo componentes que antes exibiam vazios fixos.

**095. Testar concorrência e realtime.** Simular renderização adiada, eventos duplicados, desconexão, reconexão, meia-noite e respostas fora de ordem. Aceite: contagens finais conciliam com a fonte e nenhum recurso permanece ativo após desmontagem.

**096. Ensaiar migrations em ambiente isolado.** Validar sequência, compatibilidade, locks, segurança das funções e reversão; separar operações que não cabem em transação. Aceite: instalação limpa e atualização da versão anterior convergem para o mesmo esquema esperado.

**097. Ensaiar backfill e reconciliação.** Executar futuramente apenas em ambiente autorizado, por lotes rastreáveis e com checkpoints. Aceite: integridade e totais conciliados antes/depois, sem alterar banco-fonte ou substituir fatos desconhecidos por suposição.

**098. Executar testes de carga controlados.** Medir banco, payload, renderização e número de assinaturas com concorrência representativa. Aceite: cumprir os limites definidos na etapa 40 e registrar margem operacional e regressões.

**099. Exigir revisão independente.** Revisar dados, segurança e frontend separadamente, anexando evidências, riscos e estado das etapas. Aceite: testes pulados, TODOs e verificações bloqueadas não são contabilizados como concluídos.

**100. Preparar a liberação para autorização.** Consolidar PRs, migrations, backup restaurável, estratégia de reversão, ativação gradual e monitoramento. Aceite: execução em produção somente após autorização explícita; documentação final reflete o código e os controles realmente entregues.

## Dependências e critérios de conclusão

O contrato de métricas e a matriz de acesso devem preceder mudanças de agregação. A correção de autoria histórica deve preceder backfills e comparações de produtividade. Relatórios devem reutilizar indicadores já conciliados. Testes acompanham as PRs; não ficam adiados até a etapa 91.

Uma etapa só pode ser encerrada com evidência correspondente ao seu aceite. Alteração de banco exige migration revisada e estratégia de reversão. Nenhuma etapa autoriza, por si, alterações no banco-fonte, produção, integrações ou envio de mensagens e emails.

## Evidências do repositório

Os links abaixo apontam para a referência fixa auditada. Comentários de resultados anteriores são registros históricos, não resultados de testes executados nesta análise.

- **E01 — Documentação do módulo:** [docs/dashboard/README.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/docs/dashboard/README.md)
- **E02 — Composição e filtros do Dashboard:** [src/components/dashboard/DashboardView.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/DashboardView.tsx)
- **E03 — Contagens e atualização manual:** [src/hooks/dashboard/useDashboardStats.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/dashboard/useDashboardStats.ts)
- **E04 — RPCs e escopo pessoal/fila:** [supabase/migrations/20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/supabase/migrations/20260925221406_dashboard_fix_p_agent_uuid_perf_and_fanout.sql)
- **E05 — Definição posterior de dashboard_kpi:** [supabase/migrations/20260927120000_dashboard_kpi_p_since_default_null_guard.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/supabase/migrations/20260927120000_dashboard_kpi_p_since_default_null_guard.sql)
- **E06 — Atualização em tempo real:** [src/hooks/analytics/useRealtimeDashboard.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/analytics/useRealtimeDashboard.ts)
- **E07 — SLA:** [src/hooks/sla/useSLAMetrics.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/sla/useSLAMetrics.ts)
- **E08 — Metas:** [src/hooks/analytics/useGoalsDashboard.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/analytics/useGoalsDashboard.ts)
- **E09 — Ranking: hook:** [src/hooks/gamification/useLeaderboard.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/gamification/useLeaderboard.ts)
- **E10 — Ranking: RPC:** [supabase/migrations/20260926112500_dashboard_leaderboard_rpc.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/supabase/migrations/20260926112500_dashboard_leaderboard_rpc.sql)
- **E11 — CSAT legado e breakdown paginado:** [src/hooks/business/useCSAT.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/business/useCSAT.ts)
- **E12 — NPS limitado a 500:** [src/hooks/business/useNPSSurveys.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/business/useNPSSurveys.ts)
- **E13 — Séries de satisfação:** [src/components/dashboard/SatisfactionMetrics.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/SatisfactionMetrics.tsx)
- **E14 — Agregação de sentimento:** [src/components/dashboard/SentimentHelpers.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/SentimentHelpers.tsx)
- **E15 — Comparação de sentimento:** [src/components/dashboard/SentimentTrendChart.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/SentimentTrendChart.tsx)
- **E16 — Alertas e amostra de 400 análises:** [src/hooks/analytics/useRecentSentimentAlerts.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/analytics/useRecentSentimentAlerts.ts)
- **E17 — Estatísticas de IA e audit_logs:** [src/hooks/analytics/useAIStats.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/analytics/useAIStats.ts)
- **E18 — Estados vazios fixos da aba IA:** [src/components/dashboard/AIQuickAccess.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/AIQuickAccess.tsx)
- **E19 — Método de previsão:** [src/hooks/business/useDemandPrediction.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/business/useDemandPrediction.ts)
- **E20 — Apresentação da previsão:** [src/components/dashboard/DemandPrediction.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/DemandPrediction.tsx)
- **E21 — Heatmap de atividade:** [src/components/dashboard/ActivityHeatmap.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/ActivityHeatmap.tsx)
- **E22 — Configuração de relatórios:** [src/hooks/dashboard/useScheduledReportConfigs.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/dashboard/useScheduledReportConfigs.ts)
- **E23 — Interface de relatórios:** [src/components/dashboard/ScheduledReportsManager.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/components/dashboard/ScheduledReportsManager.tsx)
- **E24 — Relatórios por proprietário:** [supabase/migrations/20260926113806_scheduled_report_configs_owner_only.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/supabase/migrations/20260926113806_scheduled_report_configs_owner_only.sql)
- **E25 — Proteção do proprietário no INSERT:** [supabase/migrations/20260926140000_fix_scheduled_report_configs_insert_owner_check.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/supabase/migrations/20260926140000_fix_scheduled_report_configs_insert_owner_check.sql)
- **E26 — Filtros URL e calendário:** [src/hooks/dashboard/useDashboardUrlFilters.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/dashboard/useDashboardUrlFilters.ts)
- **E27 — Testes dos filtros SQL:** [supabase/tests/dashboard_rpc_filters.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/supabase/tests/dashboard_rpc_filters.sql)
- **E28 — Casos de borda SQL:** [supabase/tests/dashboard_kpi_edge_cases.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/supabase/tests/dashboard_kpi_edge_cases.sql)
- **E29 — Testes do agregador frontend:** [src/hooks/dashboard/__tests__/useDashboardKpi.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/dashboard/__tests__/useDashboardKpi.test.ts)
- **E30 — Montagem dos KPIs:** [src/hooks/analytics/useDashboardData.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/analytics/useDashboardData.ts)
- **E31 — Horários e volumes:** [src/hooks/dashboard/useTodayHourlyVolume.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/2880cb9908a8bd2c5fd268f6b64b640fc0a4b222/src/hooks/dashboard/useTodayHourlyVolume.ts)

## Referências técnicas primárias

- PostgreSQL — CREATE FUNCTION: https://www.postgresql.org/docs/current/sql-createfunction.html
- Supabase — Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- TanStack Query — Important Defaults: https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults
- React — useState: https://react.dev/reference/react/useState

As recomendações de permissões, funções privilegiadas, cache e atualizações enfileiradas devem ser conferidas contra as versões efetivamente utilizadas pelo projeto antes da implementação.
