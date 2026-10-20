# Auditoria do plano de recuperação Talk X — 100 etapas

> **STATUS: HISTÓRICO/SUPERADO (baseline de 11/09/2026).** A matriz abaixo auditou `5aeb75ca` antes da integração do pacote de recuperação. As falhas reproduzidas deram origem aos testes positivos e ao hardening das PRs [#368](https://github.com/adm01-debug/Zapp_Web_V2/pull/368), [#369](https://github.com/adm01-debug/Zapp_Web_V2/pull/369) e [#371](https://github.com/adm01-debug/Zapp_Web_V2/pull/371). O documento permanece como trilha de decisão; seus estados não substituem o [overlay atual do plano](../../talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md#estado-de-execução-em-12092026).

Data: 11/09/2026. Escopo: Campanhas/Talk X e suas dependências de audiência, banco, provider, relatórios e release. Esta revisão não é uma auditoria integral de todos os módulos do ZAPP.

## 1. Veredito executivo

**Não implementamos integralmente todas as melhorias. O plano não pode ser encerrado e a branch não deve ser promovida apenas porque os testes existentes passam.**

A revisão confrontou as 100 etapas do [plano de recuperação](../../talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md), o código atual, as quatro migrations recentes, os harnesses locais e os caminhos entre UI, hooks, Edge Functions e persistência.

| Classificação de auditoria | Etapas |
|---|---:|
| PARCIAL — há implementação, mas requisito ainda incompleto | 57 |
| NÃO IMPLEMENTADA — capacidade específica não encontrada no fluxo auditado | 15 |
| REABERTA — correção recente/fluxo relacionado precisa revisão por defeito residual | 8 |
| ACEITE NÃO COMPROVADO — gate, evidência ou verificação ainda pendente | 20 |
| VERIFIED integral segundo o Definition of Done do plano | 0 |
| Total revisado documentalmente e no código | 100 |

Isso **não significa zero trabalho entregue**, nem que 100 etapas tiveram execução end-to-end. Significa que nenhuma está certificada nesta revisão contra o conjunto completo dos seus critérios. Não há percentual honesto de “10/10” derivável da quantidade de arquivos, commits ou testes gerais.

Foram reproduzidos **oito defeitos específicos**: seis no hook real do editor/compilador de segmentos com dependências simuladas, e dois nas migrations reais em PostgreSQL 17 isolado. Uma nona sondagem documentou uma decisão de contrato sobre lease expirado; isoladamente ela não prova duplicação.

### Correção do diagnóstico anterior

- Substituição atômica de recipients, fila local de saves, leases e RPC de transição são avanços reais.
- A afirmação ampla de que esses mecanismos fechavam integridade/concorrência era excessiva: a proteção de campanha não cobre INSERT, a cascata de DELETE falha, a identidade da cópia ainda duplica e a gravação pode anteceder a hidratação.
- “Concorrente” no nome/mensagem de um teste sequencial não prova uma disputa entre duas transações abertas.
- Não há garantia de exatamente-uma-vez no envio externo. Retry de POST após resultado desconhecido exige contrato do provedor ou reconciliação.
- Não confundir arquivos em branch, merge na main, frontend publicado, Edge Function implantada e migration aplicada.

## 2. Baseline, ambientes e limites

| Camada | Evidência desta rodada | Conclusão |
|---|---|---|
| Local HEAD | 5aeb75ca66b68fe367e84e01bd65d96e501c0e3a | Branch feat/talkx-recovery-foundations |
| Remote da mesma branch após fetch | Mesmo SHA | O código commitado local acompanha essa branch remota |
| origin/main após fetch | 9c99b1646ee83230f71567cf248a0dbb233471c7 | Branch de recuperação 8 commits à frente e 0 atrás |
| PR da branch | Busca por head retornou lista vazia | Não havia PR aberto encontrado para essa branch |
| Frontend público /version.json | buildId 9c99b1646ee83230f71567cf248a0dbb233471c7 | Frontend publicado não contém os oito commits da recuperação |
| Banco canônico tnnnlkbymytvtqngbbqh | Sem inspeção nova de ledger/runtime nesta rodada | Não certificado; não inferir aplicação/ausência de SQL pelo Git |
| Estrutura local das migrations | 415 arquivos válidos; DESTINO_URL ausente | Verificação local passou; comparação remota foi explicitamente pulada |
| Browser autenticado | Navegação pelo conector Playwright falhou por extensão não encontrada | Sem aceite visual autenticado das 17 telas |
| PostgreSQL dos probes | Containers descartáveis postgres:17-alpine, fixtures sintéticas | Testa a lógica das migrations, não representa todo o schema/RLS canônico |

Os oito commits em recuperação são 7d459ef8, f6b11824, f84ab057, cff497aa, ddc63ef2, 5ca423bb, 020409e4 e 5aeb75ca. O diff para main cobre 20 arquivos, concentrado em integridade/execução; não representa reconstrução visual integral.

As quatro migrations da branch são:

- 20260911120000_replace_talkx_draft_recipients.sql.
- 20260911130000_add_talkx_recipient_delivery_leases.sql.
- 20260911140000_harden_talkx_campaign_state_transitions.sql.
- 20260911150000_add_talkx_campaign_transition_rpc.sql.

O plano de recuperação, o diretório original de referências e os artefatos de diagnóstico anteriores permaneciam untracked. Foram preservados. Esta auditoria acrescenta somente documentação e probes locais, sem modificar código produtivo, fazer push/merge, aplicar SQL remoto, alterar secrets ou enviar mensagens.

O índice Graphify existente não cobria Talk X adequadamente (vocabulário concentrado em TeamChat). Não foi usado como prova de ausência nem reconstruído. A leitura direta do código atual e as convenções locais orientaram os probes; nenhum segredo foi necessário.

## 3. Evidências e fontes do código

Os caminhos abaixo são relativos à raiz do repositório; linhas referem-se ao SHA auditado.

| Código | Fonte principal e trechos relevantes |
|---|---|
| E01 | docs/talkx/PLANO_RECUPERACAO_100_ETAPAS_2026-09-11.md:24,37,45; docs/audits/talkx-2026-09-11/DIAGNOSTICO_CAMPANHAS.md:239; docs/talkx/PARIDADE.md |
| E02 | git fetch origin; git rev-parse HEAD/origin/main; git rev-list; gh pr list por head; GET público /version.json |
| E03 | src/components/talkx/useCampaignEditor.ts:91,113,164,181,191,237,300,329,336,355,363,412,425 |
| E04 | src/components/talkx/TalkXView.tsx:29,44,49,157; TalkXCampaignWizard.tsx:53,116,119,187,196,213; TalkXWizardDelivery.tsx |
| E05 | src/hooks/integrations/useTalkXSegments.ts:12 e compilador/resolvedor; src/components/talkx/TalkXSegments.tsx:237,282,362 |
| E06 | supabase/functions/talkx-send/index.ts:58,174,230,237,246,260,268,292,298,352,422,425; supabase/functions/talkx-scheduler/index.ts |
| E07 | Quatro migrations listadas na seção 2; scripts/db-audit/talkx-*.test.sh; trigger de campanha em 20260911140000:157; complete_talkx_recipient em 20260911130000 |
| E08 | src/components/talkx/TalkXAnalytics.tsx:94,107,170; handlers evolution-webhook-msg-handlers/evolution-webhook-messages |
| E09 | src/components/talkx/TalkXCampaignScheduled.tsx:64,69,87; TalkXCampaignRunning.tsx:350,410,550; TalkXLiveMonitor.tsx |
| E10 | src/components/talkx/TalkXTemplates.tsx:82,185; TalkXTemplateEditor.tsx; src/hooks/integrations/useTalkXTemplates.ts |
| E11 | src/components/talkx/TalkXSuppression.tsx; src/hooks/integrations/useTalkXSuppression.ts:48,55,93; consumidores em editor/sender/webhook |
| E12 | supabase/functions/talkx-report/index.ts; exportação paginada em TalkXLiveMonitor.tsx |
| E13 | .github/workflows/ci.yml e db-guard.yml; vitest.config.ts; src/components/talkx/__tests__; testes em scripts/db-audit |
| E14 | Inventário atual de arquivos/rotas TalkX e ausência de evidência por etapa em docs/talkx/recovery/evidence; limitação de browser/runtime explicitada na seção 2 |

Ausência significa “não encontrado no caminho produtivo/inventário auditado”, não inexistência absoluta em todo serviço externo ou branch desconhecida. Integrações gerais de CRM, upload ou inbox não certificam seu consumo correto por Campanhas.

## 4. Reproduções executáveis

Arquivos desta auditoria:

- `editor-gaps.repro.tsx`: probe histórico, não versionado por afirmar defeitos como sucesso. Suas garantias válidas foram promovidas para `src/components/talkx/__tests__/useCampaignEditor.test.tsx` e `src/hooks/integrations/__tests__/useTalkXSegments.test.ts`.
- `vitest.config.ts`: configuração descartável do probe histórico, não versionada.
- `database-gaps.repro.sh`: probe histórico substituído pelos testes positivos `scripts/db-audit/talkx-campaign-state-transitions.test.sh` e `scripts/db-audit/talkx-delivery-leases.test.sh`.

**PASS de probe diagnóstico significa comportamento defeituoso observado, não correção aprovada.** Para uma implementação futura, converter as expectativas para o comportamento correto e incorporar à suíte normal.

| ID | Cenário simulado | Resultado observado | Consequência / aceite necessário |
|---|---|---|---|
| R01 | Abrir cópia com id vazio e salvar duas vezes | createCampaign chamado duas vezes; update nenhuma | Duplicação continua quebrada. Normalizar ID ausente e persistir identidade/idempotência no servidor. |
| R02 | Salvar rascunho; alterar somente companyFilter; avançar debounce | Nenhum update no segundo ciclo | Filtros fazem parte do payload, mas não da assinatura de autosave. Incluir todos os campos persistidos e verificar reload. |
| R03 | Rascunho existente, recipients ainda não carregados, clicar salvar | replaceDraftRecipients recebe contactIds=[] | Pode apagar audiência persistida antes da hidratação. Bloquear escrita até resolver carga/erro e distinguir “vazio confirmado” de “ainda desconhecido”. |
| R04 | Nome preenchido, mensagem/consentimentos inválidos, invocar handleSave('launch') | start chamado apesar de canProceed 2/4 falsos | Falta defesa no handler. O teste NÃO prova envio real: RPC atual rejeita mensagem vazia; confirmações adicionais ainda carecem de contrato server-side. |
| R05 | Campanha com imagem; aplicar template somente texto | Conteúdo muda, mas hasMedia/URL antiga permanecem | Risco de mídia involuntária. Aplicar/limpar template como operação completa e testar cada transição entre tipos. |
| R06 | Regra de segmento com field desconhecido | rulesToPostgrest retorna null, removendo restrição | Falha deve bloquear resolução, não ampliar audiência. Não confundir allowlist de campos com validação integral da AST. |
| R07 | Authenticated proprietário, RLS de proprietário, INSERT status=sending e sent_count=999 | INSERT aceito | Trigger novo só cobre UPDATE. É falha de integridade/autorização de campos; não demonstrou envio externo nem acesso a outro usuário. |
| R08 | Proprietário exclui draft que possui recipients | Trigger da cascata lança talkx_recipient_snapshot_required; transação é revertida | Regressão na exclusão legítima. Validar todos estados/atores/cascatas com constraints e grants reais. |
| R09 | Lease expirado; token ainda é o atual; conclusão tardia | complete aceita a conclusão | Decisão de contrato, não defeito necessariamente. ACK tardio com token atual pode ser intencional. Testar nova claim concorrente e documentar política antes de mudar. |

R07/R08 usam tabelas simplificadas e política de proprietário construída no fixture. A prova é do código das migrations sob essas permissões, não uma alegação de exploração do banco de produção.

## 5. Gaps adicionais na inspeção do caminho produtivo

Classificação “alta” nesta seção significa risco relevante para a release de campanhas; não é avaliação de CVSS nem afirmação de incidente real.

### 5.1. Integridade de rascunho, navegação e agendamento

| ID | Prioridade | Evidência | Falha e próximo teste/correção |
|---|---|---|---|
| A01 | Alta | E03/E04 | ID permanece só em ref; wizard usa id antigo/new na URL e view inicia em tabs. Recarregar deep link, back/forward e responder após desmontagem precisam preservar estado real. |
| A02 | Média | E04 | onLaunched é seguido por onClose; o pai pode selecionar monitor e logo voltar à lista. Exigir uma única transição de navegação após sucesso; nenhuma após erro. |
| A03 | Alta | E03/E09 | Timezone não é persistido no payload; tela agendada converte pela timezone do navegador. Testar round-trip em duas zonas IANA, data inválida e horário ambíguo/inexistente. |
| A04 | Alta | E03 | updateCampaign pode gravar scheduled antes de substituir recipients. Simular scheduler entre as duas chamadas: não pode despachar audiência antiga/parcial. |
| A05 | Alta | E03 | Autosave serializa somente uma instância em memória. Duas abas, resposta perdida, fechamento e retry não têm revisão/idempotência de servidor. |
| A06 | Média | E03/E04 | Filtros são salvos mas não reidratados integralmente; vários campos usados para cidade/grupo/último contato/aniversário não são selecionados. Testar filtros contra dados retornados, não mocks enriquecidos. |
| A07 | Média | E04 e useTalkX.ts | Mapa de criadores usa nome da campanha; lookup de profile na criação usa single sem filtrar user_id. Testar administrador que enxerga vários perfis e erro de lookup. |

### 5.2. Banco, fila e efeitos externos

| ID | Prioridade | Evidência | Falha e próximo teste/correção |
|---|---|---|---|
| A08 | Alta | E07/E09 | Trigger proíbe todo UPDATE autenticado em sending; UI de editar limites ainda usa updateCampaign. Compatibilizar operação permitida com RPC estreita, sem liberar estado/contadores arbitrários. |
| A09 | Alta | E06 | fetchWithRetry repete POST em falha de rede/5xx sem identidade de envio comprovada. Simular “provedor aceitou, resposta caiu”; persistir unknown e reconciliar antes de novo envio. |
| A10 | Alta | E07 | Migration de leases transforma sending legado sem claim em pending. Não há prova de que esses registros nunca foram aceitos pelo provedor. Exigir inventário/quarentena/reconciliação; não reencaminhar automaticamente por suposição. |
| A11 | Alta | E06 | Sender processa campanha em uma requisição longa; scheduler considera scheduled, e start rejeita sending. Queda do worker pode deixar campanha sem retomada automática. Exigir jobs duráveis e dispatcher limitado. |
| A12 | Alta | E06 | Consulta de recipients é sem paginação e descarta error. Erro pode virar lista vazia e completed; teto de resposta pode processar só parte da campanha. Simular > limite REST e falha de SELECT. |
| A13 | Alta | E06 | Blacklist é lida uma vez, com error descartado. Um opt-out durante o lote não é reavaliado; janela/consentimento/permissão também não fecham a checagem imediatamente antes do envio. |
| A14 | Alta | E06:260 | Builder de UPDATE skipped é criado dentro de filter sem await/then. O fluxo não aguarda/executa a requisição como as demais mutações. Converter em operação confirmada e testar erro/contagem/reconciliação. |
| A15 | Alta | E06:292,352 | Pausa/cancelamento é verificado antes do claim e da espera de digitação. Mudança durante a espera não é consultada novamente antes do POST. Definir linearização e política para efeitos já iniciados. |
| A16 | Alta | E06:425 | SELECT status seguido de UPDATE completed apenas por ID não é transição atômica. Pode sobrescrever pausa/cancelamento concorrente e não exige zero pendências/claims. |
| A17 | Alta | E06/E07 | Falta política completa de heartbeat/timeout/lease e persistência de tentativa. Token de banco evita algumas conclusões obsoletas, mas não desfaz uma mensagem já aceita externamente. |
| A18 | Média | E06/E07 | Repetir comandos start/pause/cancel gera erros de estado em vez de resposta idempotente por command_id. Testar retry após perda da resposta sem criar segunda execução. |
| A19 | Média | E06 | Scheduler usa HTTP response.ok como sucesso; outside-window pode responder HTTP200 sem lançamento. Medir accepted/started/rejected como estados distintos. |

### 5.3. Dados comerciais, visibilidade e funcionalidades faltantes

| ID | Prioridade | Evidência | Falha e próximo teste/correção |
|---|---|---|---|
| A20 | Alta | E08:170 | Funil usa 0.964, 0.128 e 0.046 para fabricar entregas/leituras/conversões. Remover fallback numérico, distinguir zero de indisponível e depois ligar eventos reais. |
| A21 | Alta | E06/E08 | Não se fecha correlação provider_message_id→tentativa→recipient. Handler de mensagens da inbox não substitui atualização causal de recipients TalkX. |
| A22 | Alta | E08 | Resposta é inferida por contato/janela de 24h; consultas limitadas e campanhas concorrentes tornam a atribuição ambígua. Criar golden dataset com sobreposição e respostas sem campanha. |
| A23 | Média | E10:82,185 | “Mais convertidos” ordena use_count. Renomear para “Mais usados” é mitigação de honestidade, mas conversão continua pendente até fonte real. |
| A24 | Média | E05:237 | “Risco baixo” decorre de audiência >10000, não de qualidade/entregabilidade. Não usar volume como promessa de segurança de disparo. |
| A25 | Alta | E05/E09/E12 | Resolução/analytics/running/monitor/report usam cortes ou consultas não paginadas distintos; CSV report limitado a 2000 não é relatório completo. Testar contagens e export com 0,1,501,1001,2001,5001 e 10001 registros. |
| A26 | Média | E04/E09 | Importar da listagem não tem rota tratada; aba Mensagens em running é TabComingSoon. Não contar componente/botão ativo como funcionalidade entregue. |
| A27 | Alta | E04/E05/E14 | CRM do wizard está disabled. Workspace de importação, matching, conflitos e job de importação TalkX não encontrados. Integração externa de outros módulos não fecha esta promessa. |
| A28 | Média | E04/E09/E14 | Ausentes experiência própria de pausada, relatório completo de concluída e ajuda dedicada. Reaproveitar monitor não reproduz o fluxo do modelo. |
| A29 | Média | E11 | Hook useTalkXSuppression mantém contrato antigo: limite500, exclusão física e checagem sem removed_at. Não foi encontrado consumidor produtivo atual do hook; é dívida latente, não prova de bypass ativo. Unificar/remover apenas após confirmar consumidores. |
| A30 | Média | E06/E10 | Variante é escolhida/registrada durante envio e pode cair em conteúdo alterado em retry; falta snapshot imutável da versão/variante/mídia por tentativa. |
| A31 | Média | E04/E10 | Wizard usa URL de mídia; recursos do editor de templates não equivalem ao uploader do wizard. Validar limites reais, formatos, arquivos privados e preview de cada tipo. |
| A32 | Média | E09 | Tela scheduled inicializa estado antes de query e não o hidrata depois; qualquer status diferente de scheduled dispara callback de lançamento, inclusive cancelamento. |

### 5.4. Lacunas de teste e de processo

- Cobertura configurada em vitest.config.ts contempla src/lib e src/services, não automaticamente hooks/componentes TalkX. Quantidade de testes não certifica cobertura das 100 etapas.
- O lint-ratchet atual **falha**: baseline1189, atual1130, mantidas1129, removidas60, novas1. A ocorrência nova é prefer-const em supabase/functions/talkx-send/index.ts:193:34 (campErr). Corrigir o código em próxima implementação; não ampliar baseline para absorver a regressão.
- Harnesses SQL usam fixtures menores que o schema real e várias alegações de concorrência são chamadas sequenciais. Acrescentar duas conexões com barreiras, locks e efeitos observáveis.
- Houve falhas transitórias de inicialização do PostgreSQL nos harnesses nesta rodada. Reexecuções isoladas passaram; registrar a instabilidade, não ocultá-la nem chamá-la defeito SQL comprovado. A readiness atual usa psql local e merece diagnóstico do reinício entre servidor temporário/final.
- Antes de aceitar migrations, testar o conjunto ordenado sobre schema representativo, roles/grants/RLS/triggers originais, cascatas e frontend/Edge N e N-1.
- O plano de recuperação não tem diário de evidência por etapa preenchido. Marcas antigas em PARIDADE.md não são aprovação automática do plano novo.
- Não há aceite visual autenticado das 17 referências. Preservar carvão é necessário, mas não prova composição equivalente.

## 6. Matriz integral das 100 etapas

Legenda: PARCIAL reconhece implementação existente; REABERTA exige regressão nova para uma correção/fluxo já tratado; NÃO IMPLEMENTADA refere-se à capacidade específica; ACEITE NÃO COMPROVADO não é sinônimo de ausência de código.

| Etapa | Requisito canônico | Estado de auditoria | Evidências | Pendência para concluir |
|---|---|---|---|---|
| 001 | Congelar a base de trabalho e reconciliar trabalho concorrente | PARCIAL | E01/E02 | Base e branch identificadas; faltam inventário reconciliado do trabalho concorrente e baseline imutável de aceite. |
| 002 | Preservar e catalogar as 17 referências | PARCIAL | E01 | 17 referências mapeadas no diagnóstico; não foi localizado manifesto versionado completo de imagens com hashes e aprovação. |
| 003 | Criar rastreabilidade entre promessa, código, dados e aceite | PARCIAL | E01/E14 | Plano e diagnóstico existem; matriz promessa→SHA→dados→teste→aceite por etapa ainda não estava preenchida. |
| 004 | Resolver contradições visuais e comportamentais | PARCIAL | E01/E04 | Carvão está prescrito; composição da tela 08 continua divergente e não há decisão visual aprovada rastreada. |
| 005 | Inventariar capacidades reais e contratos externos | PARCIAL | E05/E06 | Há integrações existentes; identidade/contrato do CRM para audiência TalkX e capacidades do provedor não estão fechados. |
| 006 | Definir contratos de domínio, estados e indicadores | PARCIAL | E06/E07/E08 | Tipos e estados existem, mas faltam revisão de campanha, resultado desconhecido, invariantes completas e unidades únicas dos indicadores. |
| 007 | Preparar ambientes e limites de segurança | PARCIAL | E07/E13 | Harnesses locais e fixtures existem; não há prova de staging representativo com provedor bloqueado e matriz completa de autorizações. |
| 008 | Construir fixtures e simulador de provedor | PARCIAL | E07/E13 | Fixtures SQL/hook existentes; falta simulador do provedor e datasets de escala, falha e tempo do motor inteiro. |
| 009 | Instalar gates funcionais desde o primeiro PR | PARCIAL | E13 | Workflows incluem testes SQL novos; faltam demonstração dos cenários adversariais, PR executado e gates obrigatórios verificados nesta branch. |
| 010 | Instalar comparação visual e passar o gate inicial | ACEITE NÃO COMPROVADO | E01/E14 | Não foi localizado baseline visual aprovado das 17 telas nem gate de comparação funcional em CI. |
| 011 | Remover métricas fabricadas e sucessos enganosos | PARCIAL | E08/E10 | Alguns KPIs ficaram honestos, mas o funil ainda fabrica percentuais e ranking de conversão usa quantidade de usos. |
| 012 | Corrigir URL, restauração e navegação do wizard | PARCIAL | E03/E04 | Há parsing de step e replaceState no wizard; a view não restaura topView pela URL, nem ID salvo, back/forward e encerramento coerentes. |
| 013 | Dar identidade estável e revisão ao rascunho | REABERTA | E03/R01 | ID em memória ajuda criação normal; duplicação com id vazio cria novamente. Falta idempotência/revisão persistida no servidor. |
| 014 | Serializar autosave e tratar recuperação | REABERTA | E03/R02 | Fila local serializa saves; filtros isolados não acionam autosave e não há recuperação persistente nem conflito entre sessões. |
| 015 | Persistir seleção e separar draft de audiência de envio | REABERTA | E03/E07/R03 | RPC substitui audiência atomicamente; salvar antes da hidratação envia lista vazia. Draft/snapshot final/job seguem acoplados/incompletos. |
| 016 | Corrigir duplicação e identidade de autoria | REABERTA | E03/E04/R01 | Cópia usa id vazio; criadores são apresentados com nome da campanha. Falta cópia coerente de seleção e autoria confiável. |
| 017 | Corrigir persistência e round-trip de fuso | PARCIAL | E03/E09 | Conversão de data existe; timezone não faz round-trip no payload e a tela agendada usa timezone do navegador. |
| 018 | Validar formulário e autorização por camada | REABERTA | E03/E07/R04/R07 | Botões/algumas RPCs validam; handler permite chamar start sem confirmações e INSERT pode fabricar estado/contadores. |
| 019 | Corrigir callbacks e eventos de sucesso/falha | REABERTA | E03/E04 | start retorna booleano; onLaunched seguido de onClose pode apagar navegação. Evento updated antecede possível falha de audiência. |
| 020 | Gate de integridade e decisão sobre dados legados | ACEITE NÃO COMPROVADO | E03/E07 | Gate reprovado pelos probes; decisão segura sobre legados não está fechada. Não remover dados por inferência. |
| 021 | Normalizar identidade de contato e telefone | PARCIAL | E03/E06 | Normalização pontual de telefone existe; falta identidade canônica única compartilhada entre CRM, blacklist, preflight e sender. |
| 022 | Fechar schema mínimo e autorização de audiência | PARCIAL | E07/R07/R08 | RPC verifica perfil/contatos e bloqueia parte das mutações; INSERT e cascata mostram lacunas da proteção e compatibilidade. |
| 023 | Unificar linguagem de filtros e compilação segura | PARCIAL | E05/R06 | Compilador com allowlist existe; regra desconhecida vira ausência de filtro. Falta AST versionada e validação fail-closed. |
| 024 | Resolver audiência e contagens sem truncamento | PARCIAL | E03/E05/E06 | Estimativas e seleção existem, mas consultas sem paginação/limitadas não garantem a audiência total exibida. |
| 025 | Consolidar o predicado de supressão | PARCIAL | E03/E06/E11 | Há supressão por telefone/contato e expiração no sender; predicados dispersos, erros ignorados e consulta única no início. |
| 026 | Implementar preflight de elegibilidade com revisão | NÃO IMPLEMENTADA | E03/E06/E07 | Não foi encontrado preflight persistido que vincule revisão, elegibilidade, expiração e confirmação de lançamento. |
| 027 | Materializar audiência e job de lançamento de forma segura | PARCIAL | E03/E06/E07 | Snapshot e start têm primitivas separadas; falta transação de lançamento com job durável e identidade idempotente. |
| 028 | Implementar adaptador canônico de empresas e contatos CRM | NÃO IMPLEMENTADA | E04/E05/E14 | Opção CRM do wizard permanece desabilitada; não foi encontrado adaptador de audiência TalkX consumindo o CRM canônico. |
| 029 | Testar isolamento, cardinalidade e expiração de ponta a ponta | PARCIAL | E07/E13 | Há cenários SQL de proprietário/contato; falta cadeia completa UI→API→banco com usuários reais de teste, grandes volumes e expiração. |
| 030 | Gate de audiência e compatibilidade com o fluxo existente | ACEITE NÃO COMPROVADO | E03/E05/E07 | Gate de audiência não pode passar com corrida de hidratação, truncamento e predicados divergentes. |
| 031 | Consolidar shell, tokens e orçamento de espaço | PARCIAL | E04/E09 | Tokens carvão/componentes compartilhados existem; faltam orçamento de layout e provas de densidade em todos os viewports. |
| 032 | Aprovar a composição estrutural da tela 08 antes dos detalhes | ACEITE NÃO COMPROVADO | E04/E14 | Estrutura da tela 08 não foi aprovada contra referência; editor segue exclusivamente no passo 2. |
| 033 | Conectar informações e origem do público | PARCIAL | E04 | Nome/objetivo/origens parciais; responsável do modelo é substituído por conexão, e CRM está indisponível. |
| 034 | Conectar filtros visuais e seleção paginada | PARCIAL | E03/E04 | Filtros locais existem; alguns campos filtrados não são consultados. Falta seleção persistente paginada e fontes comerciais. |
| 035 | Unificar editor de mensagem e personalização | PARCIAL | E03/E04/R05 | Estado de mensagem e preview existentes; composição no passo 1 ausente e template só texto não limpa mídia anterior. |
| 036 | Implementar uploader e ciclo de vida seguro de mídia | PARCIAL | E04/E10 | Template possui recursos de mídia; wizard usa URL. Falta fluxo completo privado, MIME/tamanho, progresso, erro, cancelamento e limpeza. |
| 037 | Entregar rail, preview e ações persistentes | PARCIAL | E04 | Rail/preview e ações existem; amostra não necessariamente pertence à audiência e não há aceite de sticky/mobile/composição. |
| 038 | Fechar revisão final e confirmação sem efeitos colaterais | PARCIAL | E04/E06/E07 | Resumo e checks existem; não há preflight revisionado, job de lançamento nem garantias de consistência da elegibilidade. |
| 039 | Validar responsividade e acessibilidade dos passos | ACEITE NÃO COMPROVADO | E04/E14 | Sem evidência autenticada 1672×941/1280×800/390×844, teclado e zoom 200%; associações de labels precisam revisão. |
| 040 | Gate visual e funcional de Nova campanha/revisão | ACEITE NÃO COMPROVADO | E04/E14 | Gate 08/09 pendente; existência de componentes e build não constitui paridade visual. |
| 041 | Fazer o banco impor a máquina de estados | REABERTA | E07/R07/R08 | RPC com lock é avanço; trigger UPDATE não cobre INSERT, bloqueia exclusão em cascata e não impõe FSM completa ao service. |
| 042 | Formalizar a fronteira com o provedor de mensagens | PARCIAL | E06 | Sender chama Evolution; faltam contrato de capacidades, limites, respostas tipadas e implementação stub verificável. |
| 043 | Implementar claim atômico e lease de trabalho | PARCIAL | E06/E07/R09 | Claim SKIP LOCKED e token de conclusão existem; falta prova concorrente real e contrato de expiração/renovação/ack tardio. |
| 044 | Resolver retries e resultado desconhecido sem reenvio cego | NÃO IMPLEMENTADA | E06/E07 | Retries existem, mas tratamento persistente de resultado desconhecido/reconciliação antes de reenvio não foi encontrado. |
| 045 | Limitar dispatcher, concorrência e pressão de envio | PARCIAL | E06 | Intervalos e checagens existem; execução continua em uma requisição longa, sem dispatcher durável e cotas agregadas. |
| 046 | Revalidar elegibilidade imediatamente antes de enviar | PARCIAL | E06 | Há checagem inicial; opt-out/expiração/permissão/janela não são revalidados imediatamente antes de cada POST. |
| 047 | Tornar pausa, cancelamento e retomada operações confiáveis | REABERTA | E06/E07 | Comandos usam RPC; repetição não é idempotente e pausas/finalização ainda têm corridas fora da transação. |
| 048 | Implementar agendamento e recorrência com fuso explícito | PARCIAL | E03/E06/E09 | Scheduler e tela existem; faltam fuso persistido, recorrência com identidade e execução recuperável. |
| 049 | Executar caos controlado no motor completo | NÃO IMPLEMENTADA | E06/E13 | Não foi encontrado caos do motor completo cobrindo timeout após aceitação, queda de worker, pause e opt-out simultâneos. |
| 050 | Gate do motor de campanhas | ACEITE NÃO COMPROVADO | E06/E07 | Gate bloqueado por ambiguidade do provedor, execução longa e conclusão não condicionada à fila vazia. |
| 051 | Correlacionar eventos ao destinatário e à tentativa corretos | NÃO IMPLEMENTADA | E06/E08 | Retorno do provedor não é persistido como correlação recipient→tentativa→provider_message_id no fluxo avaliado. |
| 052 | Processar webhooks com autenticação, deduplicação e ordenação | PARCIAL | E06/E08 | Webhook existente atende mensagens/opt-out; não prova pipeline deduplicado/ordenado de eventos dos recipients TalkX. |
| 053 | Medir respostas com atribuição explícita | PARCIAL | E08 | Há heurística de resposta por contato e janela de 24h; falta atribuição explícita entre campanhas simultâneas. |
| 054 | Rastrear cliques sem criar redirecionador inseguro | NÃO IMPLEMENTADA | E08/E14 | Não foi localizado rastreamento de cliques de campanhas com allowlist, identificadores e proteção de redirecionamento. |
| 055 | Conectar conversões e receita a uma fonte verificável | NÃO IMPLEMENTADA | E08 | Não foi localizada atribuição verificável de conversões e receita às campanhas; percentuais de funil são sintéticos. |
| 056 | Criar agregações consistentes para gráficos e indicadores | PARCIAL | E08 | Agregações locais existentes; faltam unidade/denominadores canônicos e golden dataset sem cortes arbitrários. |
| 057 | Validar e completar exportação e envio de relatórios | PARCIAL | E09/E12 | Export do monitor pagina; talkx-report limita a 2000, e email não possui prova integral/idempotência de envio. |
| 058 | Tornar monitoramento realtime completo e limitado | PARCIAL | E09 | Realtime e polling existem; consultas limitadas, estados divergentes e ausência de reconciliação completa impedem fechamento. |
| 059 | Ancorar riscos e recomendações em evidências reais | PARCIAL | E05/E08/E10 | Há regras/recomendações; risco derivado de volume e usos chamados conversões não são evidências de qualidade comercial. |
| 060 | Gate de métricas, relatórios e rastreabilidade | ACEITE NÃO COMPROVADO | E08/E12 | Gate de métricas falha com números fabricados, atribuição aproximada e relatório truncado. |
| 061 | Reconstruir a visão geral com densidade e dados corretos | PARCIAL | E04/E09 | Listagem/KPIs/rail implementados; layout não aprovado e autoria, filtros, métricas e ações ainda divergem. |
| 062 | Conectar rail lateral, atalhos e ações da listagem | PARCIAL | E04 | Atalhos existem; importar dispara chave sem tratamento em onGoTab e ajuda não tem fluxo próprio. |
| 063 | Entregar a tela de campanha agendada | PARCIAL | E09 | Tela agendada existe; hidratação assíncrona, timezone e navegação por status continuam incorretos/incompletos. |
| 064 | Entregar o monitor ao vivo com informações acionáveis | PARCIAL | E09 | Monitor possui controles/realtime/export; telemetria, fila multissegmento e cálculos não estão completos. |
| 065 | Completar campanha em andamento e todas as suas abas | PARCIAL | E09 | Tela running existe, porém aba Mensagens usa TabComingSoon e edição de limites conflita com trigger novo. |
| 066 | Criar experiência própria de campanha pausada | NÃO IMPLEMENTADA | E04/E09 | Campanha pausada reutiliza running; experiência própria com checklist/segmentos pendentes do modelo não foi encontrada. |
| 067 | Entregar relatório de campanha concluída | PARCIAL | E04/E09/E12 | Endpoint de relatório existe; campanha concluída abre monitor, não a tela completa com funil/ROI/links/insights. |
| 068 | Completar analytics agregado e comparativos | PARCIAL | E08 | Analytics renderiza gráficos; filtros, comparações, atribuição e valores reais ainda não correspondem ao contrato. |
| 069 | Implementar estados de sistema e modais no produto real | PARCIAL | E04/E09/E11 | Estados/modais compartilhados existem; falta consumo integral de erro, permissão, CRM indisponível e desconexão nos fluxos. |
| 070 | Gate das telas operacionais | ACEITE NÃO COMPROVADO | E09/E14 | Sem aceite funcional/visual das telas operacionais, incluindo ações de pausa e detalhes completos. |
| 071 | Entregar biblioteca de segmentos e painel de detalhes | PARCIAL | E05 | Biblioteca, favoritos e amostra existem; composição, CRM, métricas comerciais e detalhes do modelo não estão completos. |
| 072 | Entregar construtor visual de regras versionadas | PARCIAL | E05/R06 | Construtor existe; AST não é versionada e semântica AND/OR/validação não fecha o contrato. |
| 073 | Completar filtros comerciais e RFM com dados reais | NÃO IMPLEMENTADA | E05 | Campos atuais não implementam filtros reais de compras/ticket/RFM com origem comercial verificável. |
| 074 | Implementar prévia, sobreposição e resumo de segmento | PARCIAL | E05 | Estimativa e amostra existem; faltam sobreposição verificada, composição completa e resumo sem risco fabricado. |
| 075 | Entregar biblioteca visual de templates | PARCIAL | E10 | Galeria/preview/import existem; composição, toggle de lista e ranking de conversão do modelo permanecem incompletos. |
| 076 | Entregar editor completo e histórico de versões | PARCIAL | E10 | Histórico e restauração existem; falta validar edição/versões imutáveis, mídia, limites e paridade end-to-end. |
| 077 | Implementar variações A/B com atribuição estável | PARCIAL | E06/E10 | Variantes e variant_id existem; snapshot/tentativa e imutabilidade da atribuição entre retries não estão garantidos. |
| 078 | Completar importação, duplicação e teste de templates | PARCIAL | E06/E10 | Importar/duplicar/testar templates existem; contratos de variáveis/mídias e teste seguro por tipo precisam validação completa. |
| 079 | Fechar reutilização entre segmentos, templates e wizard | PARCIAL | E03/E04/E05 | Callbacks aplicam template/segmento; falta round-trip URL/edição/retorno com seleção e revisão persistidas. |
| 080 | Gate de segmentos e templates | ACEITE NÃO COMPROVADO | E05/E10 | Gate de bibliotecas não fecha com AST permissiva, mídia residual, ranking incorreto e aceite visual ausente. |
| 081 | Implementar upload e análise segura da importação | NÃO IMPLEMENTADA | E04/E14 | Importação de templates não equivale a importação de contatos; workspace CSV/CRM de campanhas não encontrado. |
| 082 | Implementar correspondência com o CRM canônico | NÃO IMPLEMENTADA | E04/E05/E14 | Não foi encontrada correspondência de importação TalkX com empresas/contatos do CRM canônico. |
| 083 | Implementar resolução manual de conflitos e vínculos | NÃO IMPLEMENTADA | E14 | Não foi encontrado fluxo TalkX de revisão de sugestões, conflito, criar/vincular/ignorar e trilha da decisão. |
| 084 | Tornar importações retomáveis e auditáveis | NÃO IMPLEMENTADA | E14 | Não foi encontrado job de importação TalkX com checkpoints, retomada, deduplicação e auditoria de lotes. |
| 085 | Completar a lista de supressão e suas ações | PARCIAL | E11 | Lista e soft-delete existem; contrato de telefone avulso, expiração, paginação/contagens e ações não está completo. |
| 086 | Completar importação, exportação e histórico de supressão | PARCIAL | E11 | Há import/export e campos de auditoria; não há prova de round-trip integral, histórico e consistência entre todos consumidores. |
| 087 | Executar revisão transversal de autorização e segurança | PARCIAL | E06/E07/E11 | Revisões e testes pontuais existem; regressões R07/R08 e falhas de elegibilidade impedem certificar segurança transversal. |
| 088 | Reconciliar CRM, audiência e resultado ponta a ponta | ACEITE NÃO COMPROVADO | E05/E06/E08 | Sem golden dataset CRM→audiência→provedor→eventos→resultado no destino canônico. |
| 089 | Medir performance, capacidade e custo com orçamento aprovado | ACEITE NÃO COMPROVADO | E06/E09/E13 | Build medido; faltam budgets e testes de volume/custo/concorrência/filas com critérios aprovados. |
| 090 | Gate das integrações e qualidade transversal | ACEITE NÃO COMPROVADO | E11/E14 | Gate transversal não passa com integrações CRM ausentes e segurança/escala incompletas. |
| 091 | Produzir ajuda correspondente ao produto entregue | NÃO IMPLEMENTADA | E04/E14 | Não foi localizada ajuda TalkX própria com conteúdo revisado correspondente às capacidades entregues. |
| 092 | Implementar busca, guias e canais de suporte da ajuda | NÃO IMPLEMENTADA | E04/E14 | Não foi encontrada tela/rota de ajuda com busca, guias e canais válidos do modelo. |
| 093 | Fechar inventário de rotas, abas e ações dos 17 modelos | PARCIAL | E01/E04/E14 | Diagnóstico cataloga 17 referências; falta inventário executável completo de rotas, abas, cliques e seus contratos. |
| 094 | Executar aceite visual integral autenticado | ACEITE NÃO COMPROVADO | E14 | Nenhuma aprovação visual autenticada das 17 telas obtida nesta revisão; não atualizar screenshots para mascarar divergência. |
| 095 | Executar bateria final funcional e de regressão | ACEITE NÃO COMPROVADO | E13 | Suites locais passaram, mas lint-ratchet falha com uma ocorrência nova e probes demonstram gaps; falta bateria integrada com provider stub e browser autenticado. |
| 096 | Preparar release imutável, migrations e rollback | ACEITE NÃO COMPROVADO | E02/E07/E13 | Há commits/migrations na branch; falta release imutável aprovada, compatibilidade N/N-1 e rollback ensaiado. |
| 097 | Executar deploy canário e smoke positivo/negativo | ACEITE NÃO COMPROVADO | E02/E14 | Frontend online ainda na main anterior; sem canário e sem verificação nova do ledger canônico nesta rodada. |
| 098 | Ampliar rollout com critérios objetivos de interrupção | ACEITE NÃO COMPROVADO | E02/E14 | Não há evidência de rollout gradual desta recuperação com thresholds e critérios de interrupção. |
| 099 | Observar operação e fechar falhas de campo | ACEITE NÃO COMPROVADO | E14 | Não há janela de observação desta release concluída nem falhas de campo reconciliadas. |
| 100 | Encerrar com rastreabilidade integral, não com promessa | ACEITE NÃO COMPROVADO | E01/E14 | Encerramento não autorizado por evidência: existem capacidades ausentes, parciais e correções reabertas. |

## 7. Confronto das 17 referências

Mapeamento segue o diagnóstico canônico da pasta de referências, não a ordem em que imagens aparecem no histórico do chat. A avaliação abaixo é estrutural/funcional pelo código; a comparação visual autenticada pixel a pixel permanece pendente.

| Tela | Capacidade | Estado observado | O que impede aceite |
|---|---|---|---|
| 01 | Visão geral | Parcial | Autoria, ações de importar/ajuda, dados e densidade sem aceite. |
| 02 | Biblioteca de segmentos | Parcial | Detalhes/CRM/composição/desempenho incompletos. |
| 03 | Construtor de segmentos | Parcial | AST permissiva, RFM ausente, risco fabricado, sem sobreposição completa. |
| 04 | Biblioteca de templates | Parcial | Ranking de usos não é conversão; apresentação/toggles/filtros divergem. |
| 05 | Editor de template | Parcial | Histórico/A-B existentes, mas mídias, versões por envio e composição sem prova integral. |
| 06 | Supressão | Parcial | Predicado, telefone avulso, expiração, histórico e paginação não fechados. |
| 07 | Analytics | Parcial | Percentuais fabricados, atribuição aproximada e integrações comerciais ausentes. |
| 08 | Nova campanha | Parcial com defeitos | Deep link, autosave/seleção/filtros, mensagem no passo1, responsável e uploader. |
| 09 | Revisão final | Parcial | Elegibilidade/preflight/data/callback e composição do preview incompletos. |
| 10 | Agendada | Parcial | Fuso/recorrência/hidratação e estados de navegação. |
| 11 | Monitor ao vivo | Parcial | Telemetria, paginação, fila multissegmento e consistência do ciclo de vida. |
| 12 | Em andamento | Parcial | Aba Mensagens em breve, limites incompatíveis com trigger e métricas. |
| 13 | Pausada/retomada | Experiência específica ausente | Reutiliza running, sem composição/checklist próprios do modelo. |
| 14 | Relatório concluída | Fluxo específico incompleto | Endpoint/CSV não substituem tela completa; concluída abre monitor. |
| 15 | Importação/vinculação CRM | Não encontrada no TalkX | Ausentes workspace, matching/confiança, conflitos e job retomável. |
| 16 | Ajuda | Não encontrada no TalkX | Ausentes rota, busca, artigos/guias/vídeos/canais reais. |
| 17 | Estados e modais | Parcial | Componentes existentes não cobrem consistentemente os caminhos reais. |

## 8. Testes e verificação efetivamente realizados

| Verificação | Resultado |
|---|---|
| bunx vitest run --maxWorkers=2 | EXIT0; 227 arquivos, 3031 testes passando e 35 TODO; 124,35s |
| Probes do editor com configuração isolada | EXIT0; 6/6 reproduções; 1,56s. PASS confirma defeito, não release. |
| node --test scripts/db-audit/*.test.mjs | EXIT0; 136/136 |
| bun run typecheck | EXIT0 |
| bun run build | EXIT0; 6,84s; avisos de tooling/chunks descritos abaixo |
| Harness campaign-state-transitions + R07/R08 | Baseline passou; ambos defeitos reproduzidos em PostgreSQL17 |
| Harness delivery-leases + R09 | Baseline passou; conclusão tardia com token atual observada |
| Harness draft-recipients | Passou na reexecução isolada; houve falha anterior de startup do container |
| Harness campaign-transitions RPC | Passou na reexecução; houve falha de startup do container |
| check-migration-drift | EXIT0 apenas estrutural:415; comparação remota pulada por ausência de DESTINO_URL |
| git diff --check | EXIT0 para arquivos rastreados; artefatos novos têm validação separada |
| lint-ratchet | EXIT1; baseline1189, atual1130, removidas60, novas1; prefer-const em talkx-send/index.ts:193:34 (campErr) |
| Aceite browser autenticado | NÃO EXECUTADO; conector sem extensão |
| Testes integrados do provedor / envio | NÃO EXECUTADOS; nenhuma mensagem externa enviada |
| Banco canônico / staging completo | NÃO VERIFICADOS nesta rodada |
| Deploy canário / rollout / observação | NÃO EXECUTADOS nesta rodada |

A primeira configuração dos probes usou mergeConfig e incluiu por concatenação a suíte src; cinco probes falharam por caminho incorreto do mock de useAuth, não por defeito produtivo novo. Corrigiu-se apenas o harness, isolou-se include e reexecutaram-se os seis probes com sucesso. A suíte src foi depois executada separadamente com o resultado da tabela.

Build emitiu avisos de opções esbuild/oxc/rolldown, base Browserslist antiga e chunk grande. São dívida de tooling/performance a medir, não razão para alterar thresholds e declarar qualidade perfeita. Os avisos jsdom de navegação/canvas na suíte não equivalem a teste de browser real.

### Reproduzir de forma segura

Executar da raiz, sem apontar env para produção:

    bunx vitest run src/components/talkx/__tests__/useCampaignEditor.test.tsx src/hooks/integrations/__tests__/useTalkXSegments.test.ts --maxWorkers=2
    bash scripts/db-audit/talkx-campaign-state-transitions.test.sh
    bash scripts/db-audit/talkx-delivery-leases.test.sh
    bunx vitest run --maxWorkers=2
    node --test scripts/db-audit/*.test.mjs
    bash scripts/db-audit/talkx-draft-recipients.test.sh
    bash scripts/db-audit/talkx-campaign-transitions.test.sh
    bun run typecheck
    bun run build
    node scripts/ci/lint-ratchet.mjs

Os scripts SQL criam e removem somente seus containers descartáveis. Não usar containers Supabase de outros projetos presentes na máquina.

## 9. Sequência recomendada para corrigir sem repetir a falha

Esta seção é recomendação para próxima execução, não implementação realizada.

1. **Fechar a baseline e rastreabilidade (001–010).** Versionar referências/manifesto/decisões em carvão, definir fonte real de cada indicador e mapear dependências. Não declarar fases posteriores prontas por avanço parcial.
2. **Reabrir integridade recente.** Transformar R01–R08 em testes de regressão do comportamento correto. Corrigir ID vazio, hidratação, assinatura de autosave, handler/template/AST, INSERT e cascata. Acrescentar teste de edição legítima de limites.
3. **Reconciliar desenho de dados e engine antes de deploy.** Definir revisão de draft, snapshot final, job durável, tentativa, chave idempotente, resultado unknown e política de lease/ACK tardio.
4. **Simular adversidades no motor real com stub.** Duas abas; resposta perdida; pause entre claim e POST; cancelamento entre SELECT final e UPDATE; opt-out no meio do lote; seletor indisponível; provedor aceita e desconecta; lease expira; worker cai; retorno duplicado/fora de ordem.
5. **Tratar legado por evidência.** Inventário agregado autorizado no banco canônico, sem imprimir mensagens/PII. Não transformar sending ambíguo em pending e reenviar por conveniência.
6. **Fechar audiência/supressão.** AST fail-closed, paginação determinística, revisão de preflight, união/deduplicação canônica e elegibilidade junto ao efeito externo.
7. **Retomar fidelidade visual pela tela08.** Aprovar a composição em carvão na dimensão original, com mensagem visível no passo1 e estado compartilhado no passo2. Não trocar fundo global para azul, não substituir PNG de referência pelo resultado implementado.
8. **Conectar métricas por evento real.** Provider IDs, deduplicação/ordenação, atribuição e golden dataset. Até existir fonte, mostrar indisponível; isso não elimina a pendência funcional.
9. **Entregar capacidades ausentes e fechar cada tela.** CRM/importação, ajuda, pausada, relatório completo, RFM, sobreposição e todas abas/ações do inventário. Não considerar controles disabled ou em breve como entrega.
10. **Release somente após gates.** Testar migrations em schema representativo e compatibilidade N/N-1; abrir PR, exigir checks, merge controlado, implantar canário autorizado, provar SHA/versões/SQL no destino canônico e observar indicadores com critério de interrupção.

### Matriz mínima de cenários a acrescentar

| Eixo | Casos obrigatórios |
|---|---|
| Identidade/autosave | New vs cópia vs edit; id vazio; duas abas; refresh; back/forward; resposta perdida; desmontagem; falha antes/depois de persistir recipients |
| Audiência | 0/1/501/1001/2001/5001/10001; AND/OR; AST inválida; telefone duplicado/formatado; contato removido; supressão expirada/restaurada |
| Autorização SQL | anon, proprietário ativo, outro proprietário, supervisor, perfil inativo, service; INSERT/UPDATE/DELETE/cascata/RPC; todas colunas protegidas |
| Agendamento | Duas zonas IANA; horários ambíguos/inexistentes; fora da janela; final de semana; recorrência; cancelamento simultâneo |
| Entrega | Timeout antes/depois da aceitação; ACK tardio; claim perdido; dois workers; worker cai; nova supressão; limite global; erro de banco no SELECT/finalização |
| Métricas | Zero real vs dado ausente; eventos duplicados/fora de ordem; duas campanhas para contato; replies sem atribuição; export além de2000; reconciliação de totais |
| UI | 17 telas e todas abas; loading/erro/vazio/sem permissão/desconectado;1672×941,1280×800,390×844; teclado;zoom200%; carvão preservado |
| Release | Schema original+migrations em ordem; Edge/Frontend N e N-1; canário; rollback sem perda; observação; SHA e runtime canônicos confirmados |

## 10. Condição honesta de encerramento

Uma melhoria só pode sair desta matriz como VERIFIED depois de evidência vinculada ao requisito e SHA, incluindo as camadas realmente afetadas. Critérios bloqueados por credenciais/serviços permanecem não verificados; não se fabrica evidência de ledger, screenshot ou entrega externa.

**Situação final desta revisão: diagnóstico ampliado e testado; implementação integral, paridade das 17 telas e sincronização do banco canônico NÃO certificadas.**
