# ZAPP WEB V2 — Reauditoria da auditoria e das microfuncionalidades

**Etapa R3 • 4 de outubro de 2026 • America/Sao_Paulo**

## 1. Resultado executivo

Esta etapa aprofundou o delta posterior à reauditoria R2, sobretudo as relações entre reenvio manual, confirmação de lançamento, retenção, saúde do motor, logs e alertas. Produziu **15 registros: dez defeitos de código/contrato, três riscos condicionais, uma lacuna de escopo e um refinamento de achado anterior**. Prioridades: **3 P1, 11 P2 e 1 P3**. Esses números não significam 15 incidentes de produção nem 15 bugs independentes a somar ao histórico.

Foram realizadas **40 verificações offline**: **19 sobre corpos de funções extraídos do projeto e 21 em modelos explícitos**. Todas confirmaram suas expectativas diagnósticas ou de controle. Uma expectativa pode ser reproduzir um defeito; portanto **40 PASS não significa produto saudável**. Nenhum patch funcional foi aplicado para obter esse resultado.

A investigação deixou de depender apenas do repositório: o conector Supabase identificou o projeto correto, confirmou o registro das três migrations e retornou o código implantado de `talkx-send`, versão **609**. Os trechos problemáticos de logging e o helper de horário também foram observados nesse bundle. **Ler código implantado é diferente de executar o fluxo em produção.** Nenhuma mensagem, consulta de dados de negócio, migração ou alteração de banco foi executada.

O pacote está materializado nesta entrega. **Não foi publicado novo commit no GitHub nesta continuação.** As ações GitHub atualmente expostas são de leitura; a descoberta de ferramentas e busca de plugin não forneceram uma ação de escrita. O PR #1869 continua no head `dc2d19ee5bd018e1aebaf6c66211657218bc6b51` e em draft. A intenção inicial de consolidar remotamente não é apresentada como uma ação concluída.

## 2. Revisões e universos separados

| Referência | Revisão / universo | Uso nesta etapa |
|---|---|---|
| Auditoria documental publicada | `dc2d19ee5bd018e1aebaf6c66211657218bc6b51` | Ponto de retomada e evidências anteriores. |
| Código da reauditoria R2 | `da307ba5626dce892f0b37cb6762463f55d14a96` | Baseline de comparação. |
| Código principal da etapa R3 | `65679f38d400f7edc6a071f68554dd3b0372f03f` | Fixação dos achados e dos 40 testes. |
| Cauda remota observada ao encerrar | `711e76f5411399b412c89e8bc18dce7b4db5c7d4` | Mais 2 commits e 7 arquivos; conferência dirigida do helper alterado. |

O delta R2 → R3 tem **6 commits e 23 arquivos alterados**. A matriz desta etapa declara **14 arquivos lidos integralmente, 2 por trechos e 7 apenas inventariados**. Os sete não receberam selo de análise semântica completa. Fontes auxiliares — hooks, documentação primária, CI e o teste histórico de cadeia — estão catalogadas à parte e não aumentam artificialmente o denominador dos 23 arquivos.

A R2 publicada registra 372 itens e 217 casos offline. Esses totais foram recuperados do checkpoint, não recalculados nem reexecutados aqui. Ela também distingue cobertura estrutural, leitura integral e seleção de trechos. A primeira auditoria histórica conserva seus 5.166 registros de 62 fontes e 104 achados. São universos com finalidades e revisões diferentes, não três placares intercambiáveis. [S21, S22]

## 3. O que a revisão da auditoria corrigiu

**A mera existência de testes não encerra a validação de uma microfuncionalidade.** Os testes SQL de X031, X032 e X033 estão registrados no CI. O CI de Deno usa descoberta por glob. Assim, a hipótese de que os testes novos simplesmente não executariam por falta de registro foi descartada. A lacuna real são as combinações negativas e a interação com definições posteriores. [S09–S14]

**Há um teste chamado “cadeia completa”, mas seu alcance é histórico e delimitado.** O array explícito inspecionado vai até as migrations listadas antes da correção `20261002431230_talkx_regressoes_fix.sql`; ele foi criado para duas regressões específicas. Não demonstra, por seu nome, uma passagem conjunta pelas migrations X031/X032/X033. Não foi afirmado que o repositório não tenha nenhum outro teste de integração: o achado é a ausência de prova desses cruzamentos nas evidências examinadas. [S24]

**A última definição é que rege a análise.** X033 redefine rotinas já presentes em X032. Não basta analisar o expurgo original e ignorar o último `CREATE OR REPLACE`. O relatório rastreia o caminho final do tick até o expurgo, alertas e fan-out. [S02, S03]

**Modelos não foram rebatizados como testes reais de banco.** SQLite/Python demonstram cardinalidade, cursor, rollback e predicados em cenários reduzidos. Eles não carregam as funções PL/pgSQL, grants, triggers, extensões e schema efetivo. Os casos Node do loop também são modelos; somente N01–N19 executam os corpos extraídos indicados no manifesto de proveniência.

**Suspeitas refutadas foram mantidas visíveis.** `ai_jobs.finished_at` tem referência no projeto; não foi sustentada uma alegação de coluna inexistente. Os códigos de erro vistos no caminho de logging são constantes e o mapper não inclui telefone/texto: não foi classificado como vazamento de payload bruto nesse caminho. Isso não certifica todos os logs do sistema. Os controles corretos de autorização de retry e timezone válido foram preservados. [S05–S07, S10, S12]

**A retenção diária é deliberada no teste.** O caso que impede uma segunda limpeza no mesmo dia é explicitamente exigido pelo fixture. A questão levantada é capacidade e prazo sob carga, não uma falsa descoberta de que a rotina deveria ignorar sua própria regra de idempotência. [S11]

## 4. Evidência viva obtida, e seus limites

O projeto consultado foi `tnnnlkbymytvtqngbbqh` / `Zapp_Web_V2`. O ledger de migrations retornou X031 `20261003222707`, X032 `20261003232707` e X033 `20261003242707`. O estado observado do projeto era ACTIVE_HEALTHY; isso é estado de serviço, não aceite funcional do produto.

`get_edge_function` retornou `talkx-send` **ACTIVE / v609 / verify_jwt=true**, bundle SHA-256 `0281177c460d29a870954e1fb08b195c2fc8cdfddd8223d7afe871d13826a70f`. Foram conferidos os trechos relevantes de `index.ts`, `process-recipient.ts`, `validation.ts` e `talkx-window.ts`. Não foi comparado byte a byte todo o bundle com o checkout fixado.

O registro de migração não prova o corpo SQL efetivo, os grants atuais ou a presença de um incidente. Não havia uma ação de execução SQL PostgreSQL arbitrária entre as ações disponíveis; a consulta de logs não foi utilizada como substituto. Os fatos de serviço foram normalizados em [LIVE_METADATA.json](evidence/LIVE_METADATA.json), com essa limitação explícita.

## 5. Registro minucioso de achados

Prioridades indicam ordem de investigação/correção sugerida. **P1** exige atenção antes de depender operacionalmente do caminho; **P2** cobre integridade, contratos e operação; **P3** é precisão de diagnóstico. Uma prioridade alta em um risco condicional não transforma sua precondição em incidente observado.

### R3-DELTA-001 — Vocabulário incompatível impede a gravação do lote de alertas

**P1 • Defeito de código/contrato**  
**Cadeia examinada:** `talkx_engine_health → talkx_engine_alerts → talkx_engine_alert_events → trigger_talkx_engine_tick`.

**Condição de ocorrência.** Existe ao menos um sinal de resultado incerto com idade superior ao limite da view.

**Evidência e causa.** A view emite outcome_unknown_24h; o CHECK da tabela admite outcome_unknown. A função insere o kind recebido sem tradução. O tick envolve a chamada em EXCEPTION WHEN OTHERS THEN NULL. ON CONFLICT DO NOTHING não resolve essa incompatibilidade de CHECK. [S03, S09, P02]

**Consequência.** O INSERT de um lote que mistura o sinal incompatível com alertas válidos é rejeitado. O tick pode prosseguir sem armazenar esses alertas e sem expor a falha naquele bloco.

**Verificação desta etapa.** M01, M02

**Direção de correção.** Unificar o contrato de kind entre view, produtor, CHECK e consumidor; registrar falha de monitoramento sem impedir o motor.

**Aceite necessário.** Gerar simultaneamente outcome desconhecido vencido e campanha parada; ambos os alertas válidos devem persistir. Testar abertura, repetição deduplicada e fechamento para cada kind permitido. Uma falha de persistência deve ser observável, não absorvida por um bloco vazio.

**Limite da conclusão.** Confirmado no contrato do código. O contraexemplo usou SQLite para modelar a rejeição do lote, não PostgreSQL real. Não foi consultada a incidência de alertas no banco vivo.

### R3-DELTA-002 — A RPC de histórico do cron não repete o controle de papel da visão de saúde

**P2 • Defeito de código/contrato**  
**Cadeia examinada:** `talkx_engine_cron_runs`.

**Condição de ocorrência.** Chamador autenticado possui o EXECUTE concedido pela migration; função está exposta pelo schema da API.

**Evidência e causa.** A função SECURITY DEFINER consulta cron.job_run_details e retorna informações operacionais. O EXECUTE é concedido a authenticated; o corpo não exige is_admin_or_supervisor. O filtro de autorização no uso pela view não protege uma chamada direta à RPC. [S03, S09]

**Consequência.** Uma conta comum pode alcançar histórico operacional e return_message fora do caminho protegido da tela de saúde.

**Verificação desta etapa.** Análise de fonte/contrato; sem caso executado específico nesta etapa.

**Direção de correção.** Aplicar autorização dentro da RPC ou restringir seu EXECUTE a um chamador de serviço, mantendo um caminho administrativo auditável.

**Aceite necessário.** Chamada direta autenticada por agente comum deve ser negada. Admin/supervisor autorizado deve receber somente os dados necessários. Testar também usuário inativo, sessão anônima e sessão expirada.

**Limite da conclusão.** O grant e o corpo foram lidos na migration. A exposição efetiva via API, os grants atuais e uma tentativa com credencial de usuário não foram testados.

### R3-DELTA-003 — Cursor de timestamp perde logs que empatam na borda da página

**P2 • Defeito de código/contrato**  
**Cadeia examinada:** `talkx_campaign_logs`.

**Condição de ocorrência.** Duas ou mais linhas compartilham created_at e o limite da página corta esse grupo.

**Evidência e causa.** A consulta ordena por created_at e id, mas recebe somente p_after timestamptz e filtra created_at > p_after. O segundo elemento da ordenação não faz parte do cursor. [S03, S09]

**Consequência.** A página seguinte omite registros com o mesmo timestamp do último registro entregue, mesmo que seus IDs ainda não tenham sido vistos.

**Verificação desta etapa.** M08, M09

**Direção de correção.** Usar cursor composto por created_at e id, com predicado consistente com a mesma ordenação.

**Aceite necessário.** Criar três logs com timestamp idêntico e consultar com limite dois; a segunda página deve trazer o terceiro. Percorrer o conjunto inteiro sem perda nem repetição. Testar inserções concorrentes e limites mínimo/máximo.

**Limite da conclusão.** Perda reproduzida em modelo de paginação. A RPC PostgreSQL e a interface consumidora não foram executadas.

### R3-DELTA-004 — Retry em lote aceita IDs inexistentes e pode reabrir campanha com zero destinatários

**P2 • Defeito de código/contrato**  
**Cadeia examinada:** `retry_talkx_recipients`.

**Condição de ocorrência.** Ator privilegiado fornece uma lista não vazia contendo IDs inexistentes ou nulos; campanha pode estar completed.

**Evidência e causa.** A validação compara a contagem de linhas encontradas com a contagem das encontradas na campanha. Não compara com o conjunto solicitado. Para uma lista sem correspondências, 0 = 0 passa; o loop não altera destinatários, mas a etapa de reabertura ainda pode mudar a campanha. [S01, S10]

**Consequência.** Sucesso parcial ou vazio apresentado como operação válida; evento de retomada e estado sending sem trabalho correspondente.

**Verificação desta etapa.** M03, M04, M05, M06, M07

**Direção de correção.** Validar o conjunto completo de IDs, rejeitar nulos/inexistentes e definir explicitamente a política de repetidos. Só reabrir se houver transição válida de destinatários.

**Aceite necessário.** Lista somente inexistente: erro, sem mudança de campanha ou evento. Lista mista válida/inexistente: operação integralmente rejeitada, salvo contrato explícito de resultados por item. ID de outra campanha continua sendo recusado; lista válida conserva o fluxo atual.

**Limite da conclusão.** Autorização administrativa existente não foi ignorada. A prova é de cardinalidade e fluxo, com modelos locais; não foi invocada a RPC viva.

### R3-DELTA-005 — Reabertura por retry não aplica a nova confirmação exigida no lançamento

**P2 • Defeito de código/contrato**  
**Cadeia examinada:** `retry_talkx_recipients → enforce_talkx_campaign_mutability → continue`.

**Condição de ocorrência.** Campanha antiga completed possui consent_confirmed_at nulo, destinatário elegível para retry e ator privilegiado.

**Evidência e causa.** X032 adiciona a confirmação de lançamento, mas as colunas são anuláveis. O caminho X031 de retry reabre para sending. O bypass interno app.talkx_retry_write é aceito antes dos controles posteriores de mutabilidade; o continue parte do estado sending. A confirmação que bloqueia o start normal não é aplicada no mesmo ponto desse caminho. [S01, S02, S04, S10, S11, S24]

**Consequência.** Invariante de confirmação fica diferente entre o lançamento normal e a retomada manual de campanhas anteriores.

**Verificação desta etapa.** M16

**Direção de correção.** Centralizar as precondições para todo ingresso em sending ou documentar e testar uma exceção de negócio deliberada. Preservar gates de supressão, elegibilidade, conexão e lease.

**Aceite necessário.** Aplicar X031, X032 e X033 em ordem sobre fixture realista com campanha legada. Retry sem confirmação não deve contornar a regra de lançamento. Retry de campanha corretamente confirmada continua permitido conforme as demais regras.

**Limite da conclusão.** Cadeia de código e modelo confirmam a divergência; a sequência real das três migrations não foi executada nesta etapa. Não é alegação jurídica de ausência de consentimento de cada contato.

### R3-DELTA-006 — Expurgo remove metadados de Storage sem excluir o objeto físico

**P1 • Defeito de código/contrato**  
**Cadeia examinada:** `purge_talkx_expired_data → storage.objects`.

**Condição de ocorrência.** Há mídia elegível do bucket talkx-media e o DELETE direto é permitido pelo ambiente.

**Evidência e causa.** A definição efetiva de expurgo em X033 faz DELETE em storage.objects. O serviço de Storage mantém ali metadados; o arquivo físico exige operação pela API de Storage. [S02, S03, P01]

**Consequência.** Se o DELETE ocorrer, pode deixar objeto físico órfão, inacessível pela API e ainda armazenado/cobrado. O código não prova liberação física dos arquivos.

**Verificação desta etapa.** Análise de fonte/contrato; sem caso executado específico nesta etapa.

**Direção de correção.** Separar seleção/manifesto de expurgo da remoção física por API de Storage, com confirmação do resultado, repetição segura e reconciliação de órfãos.

**Aceite necessário.** Em ambiente de teste, comprovar desaparecimento do objeto pela API e no provedor, não só da linha SQL. Conservar objetos ainda referenciados por qualquer consumidor válido. Uma falha parcial deve manter informação suficiente para repetir e reconciliar a remoção.

**Limite da conclusão.** Não foi excluído nenhum arquivo. Se o ambiente bloquear DML direto em Storage, o efeito será erro, não remoção de metadados; a presença desse bloqueio não foi verificada. A auditoria de todas as referências ao objeto ainda é necessária.

### R3-DELTA-007 — Erro no expurgo pode impedir o tick de chegar aos envios

**P1 • Risco condicional**  
**Cadeia examinada:** `trigger_talkx_engine_tick → purge_talkx_expired_data`.

**Condição de ocorrência.** A etapa de expurgo lança erro não tratado: configuração inválida, permissão, Storage ou outra dependência.

**Evidência e causa.** A definição final do tick chama o expurgo antes das etapas de reconciliação/fan-out e fora de um bloco isolado de tratamento. Falha nessa chamada interrompe o restante da função. Gravar o marcador antes não o torna persistido independentemente da transação. [S03, S11]

**Consequência.** Acoplamento de manutenção à disponibilidade do motor; falha de limpeza pode impedir processamento e se repetir no tick seguinte.

**Verificação desta etapa.** M10, M11, M12

**Direção de correção.** Isolar a manutenção em execução própria ou num bloco controlado com sinalização e política explícita. Definir quando retenção deve bloquear envio e quando deve apenas alertar.

**Aceite necessário.** Injetar falha de expurgo no PostgreSQL descartável e observar se a política escolhida é cumprida. Alerta de falha permanece visível; o marcador não informa sucesso inexistente. Teste de recuperação deve provar retomada sem duplicação.

**Limite da conclusão.** O risco é condicional; não foi observado motor parado em produção. O teste local modela a ordem e o rollback, não a execução real do cron.

### R3-DELTA-008 — Lote único diário não prova cumprimento da retenção em volumes maiores

**P2 • Risco condicional**  
**Cadeia examinada:** `purge_talkx_expired_data(1000)`.

**Condição de ocorrência.** Quantidade de dados vencidos ultrapassa a capacidade diária do lote.

**Evidência e causa.** O tick usa limite 1000 e o expurgo marca o dia como processado. Nova chamada no mesmo dia é ignorada, mesmo que sobrem elegíveis. O próprio teste X032 exige esse comportamento; não se trata de uma falha acidental de idempotência. [S03, S11]

**Consequência.** O prazo de retenção pode ser excedido. No exemplo sintético de 2501 linhas vencidas, ficam 1501 após o primeiro dia e são necessários ao menos três dias sem novas entradas.

**Verificação desta etapa.** M13, M14

**Direção de correção.** Definir capacidade e atraso máximo admissível. Processar lotes com cursor e orçamento por execução até esgotar a fila, ou medir/alertar o backlog de retenção.

**Aceite necessário.** Teste com volume superior ao limite deve informar quantos elegíveis restaram e sua maior idade. Medir taxa real de expiração versus capacidade de processamento. Provar que repetição controlada conclui o backlog sem reprocessamento destrutivo.

**Limite da conclusão.** Não foi medido volume real. O cenário de 1500 novas expirações/dia é hipótese de capacidade, não estatística do ZAPP.

### R3-DELTA-009 — Limpeza histórica pode ser interpretada como falha recente do motor

**P2 • Defeito de código/contrato**  
**Cadeia examinada:** `purge_talkx_expired_data → talkx_engine_health`.

**Condição de ocorrência.** Destinatários antigos em estado failed possuem snapshots que serão limpos.

**Evidência e causa.** O expurgo atualiza updated_at ao limpar snapshots. A view de saúde usa updated_at para contar falhas na janela recente, sem separar o instante da falha do instante da manutenção. [S03]

**Consequência.** Cinco falhas históricas limpas podem produzir um sinal de cinco falhas recentes sem nenhum novo disparo, distorcendo diagnóstico e alertas.

**Verificação desta etapa.** M15

**Direção de correção.** Basear saúde operacional em timestamp imutável da transição de falha ou nos eventos de entrega, não em updated_at genérico.

**Aceite necessário.** Executar expurgo sobre falhas antigas e confirmar que a métrica de falhas recentes não muda. Gerar falha nova e confirmar incremento. Alterações administrativas e retenção não podem simular tentativa de envio.

**Limite da conclusão.** Interação confirmada pelos predicados lidos e modelo local; não foram consultados falsos alertas no ambiente vivo.

### R3-DELTA-010 — Janela inválida tem comportamentos diferentes no TypeScript e no SQL de saúde

**P2 • Refinamento de achado anterior**  
**Cadeia examinada:** `deliveryWindowStatus ↔ cálculo de janela em talkx_engine_health`.

**Condição de ocorrência.** Configuração malformada de horário/dias ou timezone alcança o consumidor.

**Evidência e causa.** O helper TypeScript pode permitir envio quando comparações contêm NaN, ou lançar erro se days não oferecer includes. Para timezone inválido, ele recusa. O SQL de saúde usa casts e conversão de timezone que podem lançar erro, sem contrato de erro equivalente. [S03, S07, S23]

**Consequência.** Worker e monitor podem divergir sobre a mesma configuração. A análise refina R2-API-010; não é contada como descoberta independente de validação de horário.

**Verificação desta etapa.** N01, N02, N03, N04, N05, N06

**Direção de correção.** Definir normalização e esquema de configuração comum, validação na escrita e recusa segura na leitura. Testar paridade entre os dois consumidores.

**Aceite necessário.** Mesma tabela de entradas válidas/inválidas deve produzir decisões equivalentes no SQL e no TypeScript. Configuração inválida retorna estado inválido explícito, nunca envio permitido por NaN. Conservar os controles válidos de dia, horário e timezone.

**Limite da conclusão.** Os testes N01–N06 executam corpo extraído, não o handler inteiro. O save de rascunho já impede uma janela parcial em seu caminho normal; esse caso não foi apresentado como fluxo normalmente alcançável.

### R3-DELTA-011 — Exceção em destinatário posterior perde logs já acumulados no lote

**P2 • Defeito de código/contrato**  
**Cadeia examinada:** `runRecipient → state.deliveryLogs → flushDeliveryLogs → finally`.

**Condição de ocorrência.** Uma tentativa já produziu entrada no buffer; um destinatário posterior lança antes do flush de fim da passagem.

**Evidência e causa.** O flush ocorre depois do loop. Há caminhos de processRecipient que lançam antes de retornar um resultado. O finally externo libera a lease, mas não descarrega o buffer. Além disso, o flush remove entradas do buffer antes do insert best-effort, sem fila durável para repetir. [S04, S05, S12]

**Consequência.** A trilha de auditoria pode perder tentativas anteriores válidas, justamente durante uma passagem com erro. Um envio e sua persistência principal não dependem de o log sobrevivente existir.

**Verificação desta etapa.** N22, N23

**Direção de correção.** Garantir persistência/reconciliação dos registros mesmo em saída excepcional. Evitar que erro de observabilidade mascare a falha original; definir estratégia de lote durável ou descarregamento protegido.

**Aceite necessário.** Primeiro destinatário termina e segundo lança antes do flush; a trilha do primeiro deve persistir. Simular falha do insert de logs e provar repetição ou sinalização sem perda silenciosa. Lease deve ser liberada nos cenários positivos e negativos.

**Limite da conclusão.** O contraexemplo N22 é modelo de fluxo, não execução do handler real. O mesmo arranjo foi observado no bundle implantado v609, sem invocar envios.

### R3-DELTA-012 — Contexto de quarentena sobrescreve a tentativa ordinal do logger filho

**P3 • Defeito de código/contrato**  
**Cadeia examinada:** `Logger.child → Logger.log → processRecipient(quarentena)`.

**Condição de ocorrência.** Primeira tentativa parte de attempt_count zero e produz log de quarentena com o valor original.

**Evidência e causa.** runRecipient vincula attempt = attempt_count + 1 ao logger filho. Na chamada de quarentena o contexto fornece attempt = attemptSoFar. A mesclagem ...bound, ...ctx permite sobrescrever o valor um pelo valor zero. [S04, S05, S06, S25]

**Consequência.** A mesma tentativa aparece com numeração diferente entre log estruturado e registro de entrega, dificultando correlação.

**Verificação desta etapa.** N07, N08

**Direção de correção.** Escolher um significado único de attempt. Não sobrescrever o ordinal com o contador anterior; manter identidade de correlação explícita.

**Aceite necessário.** Primeira tentativa deve registrar o mesmo ordinal em todos os pontos. Reenvios e quarentena devem manter correlação com o contador efetivamente incrementado. Conservar requestId e vínculo de destinatário no logger filho.

**Limite da conclusão.** N08 executa a classe Logger extraída. O corpo equivalente foi observado no bundle v609 e continua no helper da main de corte final.

### R3-DELTA-013 — Template N8N testa tamanho de array em um item de alerta

**P2 • Defeito de código/contrato**  
**Cadeia examinada:** `HTTP Request → IF no template talkx-alerts.json`.

**Condição de ocorrência.** A consulta devolve uma lista JSON de alertas no modo de resposta configurado.

**Evidência e causa.** O nó HTTP Request separa a lista em itens. O IF seguinte avalia $json.length como se cada item ainda fosse o array. O objeto individual de alerta não possui esse número. [S08, P04]

**Consequência.** Alertas podem não seguir para envio, ou o nó pode falhar na validação de tipo, dependendo da versão/conversão do N8N.

**Verificação desta etapa.** N20, N21

**Direção de correção.** Definir o contrato de itens: processar cada alerta diretamente, ou agregar a lista de forma explícita antes de verificar seu tamanho.

**Aceite necessário.** Importar o template na versão realmente utilizada e ensaiar zero, um e vários alertas. Verificar o shape recebido por cada nó e uma notificação por unidade definida no contrato. Resposta de erro não pode ser tratada como objeto de alerta válido.

**Limite da conclusão.** Não foi executado N8N nem comprovado que esse template esteja ativado. O export está inativo e a versão instalada não foi observada. A confirmação refere-se ao contrato do template e ao código primário consultado.

### R3-DELTA-014 — Never Error sem ramificação por status pode esconder falha HTTP do canal de alertas

**P2 • Risco condicional**  
**Cadeia examinada:** `HTTP GET/POST do template N8N`.

**Condição de ocorrência.** Um endpoint devolve HTTP 401, 403, 429 ou 5xx com uma resposta HTTP válida.

**Evidência e causa.** O template ativa Never Error e não possui validação explícita de status HTTP bem-sucedido nos pontos inspecionados. O nó final de envio pode concluir normalmente com resposta de erro. [S08, P03]

**Consequência.** Execução do workflow pode parecer encerrada sem que a notificação tenha sido entregue; um problema de credencial ou destino deixa de acionar o fluxo de falha esperado.

**Verificação desta etapa.** Análise de fonte/contrato; sem caso executado específico nesta etapa.

**Direção de correção.** Verificar status e conteúdo esperado; encaminhar falhas para retentativa limitada, registro e canal independente. Separar falha HTTP de ausência legítima de alertas.

**Aceite necessário.** Simular 200 com resposta válida, lista vazia, 401, 429 e 500. Erro no POST final não deve ser certificado como entrega. Testar timeout e falha de transporte separadamente.

**Limite da conclusão.** Never Error não implica absorção de todo erro de rede. Não houve chamada a endpoints de notificação; risco condicional do template.

### R3-DELTA-015 — Expurgo denominado Talk X alcança jobs de IA de outros módulos

**P2 • Lacuna de escopo/política**  
**Cadeia examinada:** `purge_talkx_expired_data → public.ai_jobs`.

**Condição de ocorrência.** Há jobs terminais antigos no armazenamento compartilhado, inclusive de funções alheias ao Talk X.

**Evidência e causa.** O predicado de DELETE restringe idade e estados terminais, mas não função, tipo de job ou módulo. A origem Talk X do procedimento não limita automaticamente a tabela compartilhada. [S03, S11]

**Consequência.** Histórico de IA de outros módulos, inclusive estado outcome_unknown antigo, pode entrar no expurgo. Falta comprovar que a política de retenção compartilhada autoriza esse alcance.

**Verificação desta etapa.** M17

**Direção de correção.** Registrar a autoridade e o escopo de retenção. Usar rotina global explicitamente governada ou restringir o predicado aos jobs do domínio desejado.

**Aceite necessário.** Fixture com jobs Talk X e não Talk X deve comprovar a política escolhida. Definir tratamento específico de pendências de reconciliação e auditoria. A documentação deve explicar responsabilidade, prazo e consequências da remoção.

**Limite da conclusão.** É uma lacuna de decisão/escopo, não prova automática de exclusão indevida. Nenhum registro de ai_jobs foi removido ou consultado nesta auditoria.

## 6. Cobertura negativa: o que ainda não está certificado

[COBERTURA_DELTA.csv](COBERTURA_DELTA.csv) atribui um estado explícito a cada arquivo alterado. Permanecem somente inventariados o documento e a imagem novos de SalesView, `docs/talkx/OPERACAO.md`, o placar STATUS, o manifesto de implantação do delta, `_test-utils.ts` e a nova versão do ratchet de produtores legados. A imagem de contraste não recebeu inspeção visual. O manifesto não foi integralmente recontado por hash nesta etapa.

A leitura de `talkx-send/index.ts` concentrou-se em 500–EOF. O bundle vivo foi recuperado, mas não existe alegação de ensaio completo de cada função nele. A interface Settings e seu hook foram lidos; não houve navegador, renderização, teste React ou revisão visual ao vivo.

Permanecem sem certificação nesta entrega: grants e corpos SQL efetivos; execução encadeada X031 → X032 → X033 no PostgreSQL real; configuração/versão e execução do N8N; exclusão física de objetos via Storage; concorrência real entre workers; custo/volume operacional; incidentes efetivos no monitoramento; toda a cauda remota funcional descrita adiante. Infraestrutura, banco Singu CRM, Evolution GO e gestão de usuários não foram declarados revalidados globalmente por causa deste aprofundamento de Talk X. Seus registros R2 continuam como ponto de partida, não são substituídos por este delta.

As provas de comportamento crítico que faltam têm forma objetiva: negação de RPC administrativa por agente comum; lote de alertas com todos os kinds; paginação com timestamps empatados; retry com IDs ausentes; retry de campanha legada sem confirmação; falha no segundo destinatário; erro no expurgo seguido de recuperação do tick; objetos ainda referenciados; separação de jobs entre módulos. Essas são lacunas de testes e contratos, não apenas arquivos a ler.

## 7. Cauda remota e validade temporal

Ao finalizar, a `main` estava em `711e76f5411399b412c89e8bc18dce7b4db5c7d4`: mais dois commits e sete arquivos em relação ao pin R3. Foram alterados Templates, seu teste, catálogo, manifesto, teste de degradação, helper de validação e ratchet. A lista completa está em [REMOTE_TAIL.json](evidence/REMOTE_TAIL.json).

O helper `validation.ts` foi lido na nova revisão: o comportamento de sobrescrita do contexto do Logger continua presente. As três migrations e `talkx-send/index.ts` / `process-recipient.ts` não aparecem como alterados nesse compare. Isso conserva a evidência de seus conteúdos, mas não equivale a certificar toda dependência introduzida pela cauda.

O novo contador `x-degraded` é explicitamente por isolate. Sua interpretação como diagnóstico por requisição, concorrência e ciclo de reset não foi ensaiada nesta entrega. Essa observação foi registrada como ponto de revisão da cauda, não promovida a bug comprovado. Os 40 casos continuam vinculados ao pin R3, sem troca silenciosa de versão.

## 8. Ordem de trabalho derivada dos achados

**Primeiro: tornar o monitoramento confiável.** Harmonizar os kinds e testar sua persistência; restringir a RPC de cron; corrigir o shape e o tratamento HTTP do template N8N. Sem isso, uma ausência de alertas pode ser ausência de telemetria, não ausência de problemas.

**Segundo: separar manutenção de entrega.** Corrigir remoção física por Storage API, explicitar a política de falha do expurgo e medir o backlog de retenção. Não atualizar históricos de forma que virem falhas novas no monitor. Definir governança do expurgo de jobs compartilhados.

**Terceiro: fechar invariantes de retry.** Validar todos os destinatários solicitados; impedir retomada vazia; testar confirmação de lançamento no caminho manual; manter supressão, elegibilidade, lease e proteção contra duplicidade.

**Quarto: completar a trilha técnica.** Preservar logs em saída excepcional, uniformizar o ordinal da tentativa e corrigir a paginação. Executar a matriz de janela SQL/TypeScript, preservando o vínculo a R2-API-010.

Esta ordem é proposta de engenharia, não execução autorizada. Cada correção deve produzir um contraexemplo vermelho antes, verde depois e evidência do ambiente/versão. Adoção em produção, PR de código, migrations e mudanças de infraestrutura ficam separados da presente entrega documental.

## 9. Reprodução e interpretação dos resultados

O pacote contém os três recortes TypeScript, suas versões JavaScript compiladas, os probes Node e Python e os resultados JSON. Para repetir somente os testes locais, sem rede e sem credenciais:

```bash
node probes/run_node.cjs
python3 probes/run_sql_models.py
```

O primeiro comando executa 23 casos: N01–N19 sobre funções extraídas, N20–N21 sobre shape de itens e N22–N23 sobre ordem do loop/flush. O segundo executa 17 modelos de SQL/fluxo em SQLite/Python. Usar a pasta extraída como diretório de trabalho. Ambos reescrevem apenas seus JSON de resultado; os horários desses arquivos mudam e, consequentemente, o manifesto original deixa de corresponder aos resultados regenerados.

Não existe comando de conexão a Supabase, envio de mensagens, remoção de objetos ou aplicação de migrations neste roteiro. Não é uma reprodução da suíte integral do repositório. Os recortes foram adaptados minimamente para isolar dependências, conforme [EXCERPT_PROVENANCE.json](evidence/EXCERPT_PROVENANCE.json). A integridade do pacote original está em `MANIFEST_SHA256.json`.

## 10. Publicação e conclusão delimitada

O resultado novo está nos arquivos deste pacote. O PR documental existente foi consultado, continua draft e não recebeu novo commit desta continuação. Nenhuma falha funcional foi corrigida no repositório ou no banco. Esta etapa entrega uma reauditoria verificável do delta, com provas locais e observações de código implantado, sem apresentar sua conclusão como uma auditoria total de cada microfuncionalidade atual do sistema.

As referências seguintes dão rastreabilidade por revisão. As referências S são fontes do projeto; P são documentação/código primário de plataforma. Os relatos de serviço estão no arquivo de observações normalizadas, não em hashes inventados de código SQL vivo.

## Referências
- **S01** — [supabase/migrations/20261003222707_talkx_retry_resolve.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003222707_talkx_retry_resolve.sql); blob `d116f386a0938a5fb7d292fcee178b6f47f39929`.
- **S02** — [supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003232707_talkx_lgpd_consentimento_expurgo.sql); blob `bf4aecc2f5c0b74e3e624c0458182bc85f64973f`.
- **S03** — [supabase/migrations/20261003242707_talkx_log_saude_alertas.sql](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/migrations/20261003242707_talkx_log_saude_alertas.sql); blob `940524087b66e4c16a410c89c43a8414fc4ceccb`.
- **S04** — [supabase/functions/talkx-send/index.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/talkx-send/index.ts); blob `da9c7b9e517ece6ec34a648dc98340a94bc61bef`.
- **S05** — [supabase/functions/talkx-send/process-recipient.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/talkx-send/process-recipient.ts); blob `d6c1b319e5668e25a23297ee9bc1685997185404`.
- **S06** — [supabase/functions/_shared/validation.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/_shared/validation.ts); blob `da82358f5985cfae6256bdad7ed78209af126f6c`.
- **S07** — [supabase/functions/_shared/talkx-window.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/_shared/talkx-window.ts); blob `d345c27f2024cf84a3cc73d6add0eb461a68d994`.
- **S08** — [docs/talkx/n8n/talkx-alerts.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/docs/talkx/n8n/talkx-alerts.json); blob `7f9ed9262388684df17dac843030e996c8449502`.
- **S09** — [scripts/db-audit/talkx-engine-health.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-engine-health.test.sh); blob `ce15bddfa03df551289299305e86e0425f8a47c8`.
- **S10** — [scripts/db-audit/talkx-retry-resolve.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-retry-resolve.test.sh); blob `f98f888765bc4cba62e1982ce6e12437d0eb8d52`.
- **S11** — [scripts/db-audit/talkx-lgpd.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-lgpd.test.sh); blob `f7c251db290a2cbef6261380de06c67b57d3e10c`.
- **S12** — [supabase/functions/talkx-send/x033-delivery-log.test.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/supabase/functions/talkx-send/x033-delivery-log.test.ts); blob `538ea09559f578061b9d57ea0ad64e2661bcc03d`.
- **S13** — [.github/workflows/db-guard.yml](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/.github/workflows/db-guard.yml); blob `856ac14795e0e9f28cf3dffc69e1e6ad4dd70e78`.
- **S14** — [.github/workflows/ci.yml](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/.github/workflows/ci.yml); blob `e6308213bcb911f4ad1a575b3b372635f87ef4a3`.
- **S15** — [src/components/talkx/TalkXSettings.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/src/components/talkx/TalkXSettings.tsx); blob `533642c41bc63273b9e7dfe6683bd05cdba90001`.
- **S16** — [src/hooks/integrations/useTalkXSettings.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/src/hooks/integrations/useTalkXSettings.ts); blob `314bca2b40bf89e62c999943e8528e77ffbc9de8`.
- **S17** — [src/components/talkx/__tests__/TalkXSettings.states.test.tsx](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/src/components/talkx/__tests__/TalkXSettings.states.test.tsx); blob `740bc43d6e59eadfd2c257842a59d31045043883`.
- **S18** — [scripts/edge-deploy/register-deployment.mjs](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/edge-deploy/register-deployment.mjs); blob `abbc4300dee03138c164873b7d00a3539d09a5a5`.
- **S19** — [scripts/edge-deploy/log-injection.unit.mjs](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/edge-deploy/log-injection.unit.mjs); blob `8743be77762b2e6cca334d2079e9de85a5944b0f`.
- **S20** — [docs/talkx/v4/etapas/F03-integridade-observabilidade-e-ensaio-real.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/docs/talkx/v4/etapas/F03-integridade-observabilidade-e-ensaio-real.md).
- **S21** — [docs/reconciliation/REAUDIT_MICROFUNCTIONS_2026-10-03.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/dc2d19ee5bd018e1aebaf6c66211657218bc6b51/docs/reconciliation/REAUDIT_MICROFUNCTIONS_2026-10-03.md).
- **S22** — [docs/reconciliation/SESSION_HANDOFF.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/dc2d19ee5bd018e1aebaf6c66211657218bc6b51/docs/reconciliation/SESSION_HANDOFF.md).
- **S23** — [docs/reconciliation/reaudit/2026-10-03/reports/providers/report.md](https://github.com/adm01-debug/Zapp_Web_V2/blob/dc2d19ee5bd018e1aebaf6c66211657218bc6b51/docs/reconciliation/reaudit/2026-10-03/reports/providers/report.md).
- **S24** — [scripts/db-audit/talkx-regressoes-chain.test.sh](https://github.com/adm01-debug/Zapp_Web_V2/blob/65679f38d400f7edc6a071f68554dd3b0372f03f/scripts/db-audit/talkx-regressoes-chain.test.sh); blob `90c184953b6dec3489787fd82bbc73704c1f9aba`.
- **S25** — [supabase/functions/_shared/validation.ts](https://github.com/adm01-debug/Zapp_Web_V2/blob/711e76f5411399b412c89e8bc18dce7b4db5c7d4/supabase/functions/_shared/validation.ts); blob `3b4ea40bfa60df587bd434e5970e80450f4e786b`.
- **P01** — [Storage SQL contém metadados; exclusão física requer API de Storage.](https://supabase.com/docs/guides/storage/schema/design).
- **P02** — [ON CONFLICT trata conflitos de unicidade/exclusão, não falhas independentes de CHECK.](https://www.postgresql.org/docs/17/sql-insert.html).
- **P03** — [Never Error aceita respostas HTTP não-2xx; não é evidência de entrega bem-sucedida.](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest).
- **P04** — [packages/nodes-base/nodes/HttpRequest/V3/HttpRequestV3.node.ts](https://api.github.com/repos/n8n-io/n8n/git/blobs/ba07d803c1e38b3724b6b57b3fa418eef8816761); blob `ba07d803c1e38b3724b6b57b3fa418eef8816761`.
