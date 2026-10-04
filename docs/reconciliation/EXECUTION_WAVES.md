# Ordem futura de correções — sem execução automática

A auditoria encerrou sua missão documental. Esta sequência organiza as próximas escolhas técnicas a partir dos achados já individualizados; não autoriza implementação, banco, deploy, exclusão ou merge. Não substitui os IDs de origem por outro plano numerado de centenas de tarefas.

| Ordem | Frente | Entradas | Trabalho concreto a preparar | Aceite para encerrar a frente |
| --- | --- | --- | --- | --- |
| 0 | Evidência de banco e CI | Drift 779/781, tipos/catálogo/grants, bootstrap offline e observação 403 | Separar defeito de infraestrutura e drift real; validar snapshots e autoridades antes de alterações SQL. | Run identifica ambiente, commit, versões e resultado; contratos realmente executados; proposta específica revisável. |
| 1 | Isolamento e contratos de execução | Team Chat TC-001 a TC-009; Multiplix MX01 a MX08; TRA-002 a TRA-006; webhooks IA/Gmail | Definir contratos únicos por consumidor, identidade e conexão; impedir sucesso silencioso, replay e isolamento incorreto. | Testes adversariais de identidade/RLS/idempotência e fluxo integrado em ambiente autorizado; nenhum mock apresentado como produção. |
| 2 | Resultado funcional e cálculo | Telefonia: filtros/gravação/Bitrix; SQL Dashboard; sentimentos; Arquivos; Catálogo; Gmail | Corrigir o menor conjunto causal preservando entregas posteriores. | Contraexemplo atual falha antes e passa depois; integração e rótulo correspondem ao dado real. |
| 3 | Aceite visual, operação e medição | Talk Me, Skins, Volume, layout, SalesView, Catálogo, IA e SIP | Executar somente aceites ainda válidos; respeitar reversões/dispensas decididas. | Matriz de estados real, medição após último patch, amostra declarada, chamada SIP e observação quando necessárias. |
| 4 | Resíduos e integração seletiva | 84 candidatos AST, barrels, legados e branches divergentes | Reavaliar consumidores depois dos contratos; selecionar alterações por causa. | Prova de ausência de consumidor/efeito, dependência migrada, autorização específica e rollback; preservar histórico obrigatório. |

## Decisões que antecedem mudanças

Team Chat precisa resolver a autoridade e os contratos divergentes F/TC. Banco Único precisa confirmar a arquitetura desejada frente ao Cloud canônico. UI da sidebar, PWA/push, instalação de políticas e certas capacidades de IA têm decisões próprias. A restauração de contraste revertido por decisão expressa exige nova decisão, sem reabrir automaticamente o fechamento anterior.

## Como usar o ledger

Selecione um achado em [FINDINGS.md](FINDINGS.md), siga suas chaves canônicas para o plano e leia implementação/testes/runtime/documentação/aceite. Agrupe os requisitos que compartilham uma causa; preserve referências históricas. Prepare a alteração mais delimitada, critérios e evidência antes de pedir uma aprovação final quando ela for necessária.

Não somar todos os PARTIAL/NOT_IMPLEMENTED de versões antigas. Não repetir uma migration arquivada para fechar checkbox. Não tomar PR merged como prova de publicação ou observação. As matrizes de [trabalho ativo](ACTIVE_WORK_REGISTRY_2026-10-03.md), [resíduos](RESIDUE_REGISTRY.md) e [riscos](OPEN_RISKS.md) delimitam as dependências.

## Frente de apoio: Cartographer, Claude-Mem, Headroom e Grill Me

O [plano de ferramentas dos agentes](AGENT_TOOLING_PLAN_2026-10-03.md) registra os três componentes e as tarefas AT-001 a AT-018: preparação, mapa do código, memória entre sessões, compressão de contexto e avaliação conjunta. Esta frente pode acompanhar as ondas acima; a instalação das ferramentas não é condição para corrigir os defeitos prioritários.

Estado: planejamento explícito, POCs pendentes e instalação/operação no ambiente do usuário não comprovadas. Os critérios de adoção incluem compatibilidade por agente, coexistência com Graphify, evidência de continuidade, qualidade após compressão, custo líquido e restauração. As tarefas AT são posteriores ao inventário e não alteram os totais do MASTER_LEDGER histórico.

### Revisão das decisões com Grill Me

O [protocolo Grill Me](GRILL_ME_PLAN_REVIEW_2026-10-03.md) integra a preparação de planos executáveis e os replanejamentos relevantes. A aplicação documental GQ-01 a GQ-12 já foi registrada; GM-004 a GM-006 conservam instalação/adaptação executável e validação como trabalho pendente. As 18 tarefas AT permanecem planejadas, e as seis GM têm estados próprios.

Dependência corrigida: AT-003 e AT-016 antecedem captura ou injeção persistente em AT-008/AT-012. Definir a autoridade da memória antes de configurar os consumidores evita tratar a numeração do backlog como uma ordem suficiente. Pequenas correções com escopo e aceite definidos seguem seu fluxo, sem reabrir decisões já resolvidas.
