# Grill Me — revisão de planos e decisões do ZAPP

Referência: 03/10/2026, America/Sao_Paulo. Head do ZAPP examinado: `400cffa4c71081a68c224274bcf5aacb667c54b9`. Publicação: branch `docs/reconciliation-checkpoint-20261003`, [PR #1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869).

## Resultado desta continuação

**Grill Me passa a integrar explicitamente o planejamento das ferramentas e o protocolo documental de revisão de decisões.** A referência upstream foi fixada, o protocolo foi registrado e uma revisão de 12 questões foi aplicada ao plano de Cartographer, Claude-Mem e Headroom. Instalação, invocação nativa da skill e entrevista interativa integral não foram realizadas.

A verificação não encontrou `grill-me` no plano anterior, nos nomes das pastas de skills examinadas ou no conteúdo da skill de convenções que essas pastas compartilham. O inventário cobre `.claude/skills` e `.agents/skills` no head acima; não inspeciona instalações globais, o computador do usuário ou uma VPS. Os caminhos, hashes e limites estão no [registro de evidências](evidence/grill-me-review-2026-10-03.json).

Esta entrega acrescenta seis tarefas GM, com identidade própria: três atividades documentais concluídas e três atividades de integração/validação ainda planejadas. As 18 tarefas AT continuam com seu estado de POC pendente. Os totais da reconciliação histórica permanecem inalterados.

## Fonte fixada

| Campo | Valor |
| --- | --- |
| Referência discutida com o usuário | `RobMitt/grill-me-skill` |
| Commit upstream | `31d61d68fc406f8cc2a944b4b10e6f23877720f1` |
| Blob SKILL.md | `d73468e6c55a0863aa3aec8a21cb0dbce56a7373` |
| Blob README.md | `5a4ccf44f8e86e096bb0c241010ae0d7db81fd8d` |
| Fonte imutável | [SKILL.md](https://github.com/RobMitt/grill-me-skill/blob/31d61d68fc406f8cc2a944b4b10e6f23877720f1/SKILL.md) e [README.md](https://github.com/RobMitt/grill-me-skill/blob/31d61d68fc406f8cc2a944b4b10e6f23877720f1/README.md) |

A skill original aprofunda um plano por perguntas sequenciais, respeita a dependência entre decisões, orienta investigar arquivos antes de perguntar e conclui com uma síntese das escolhas. Sua interface de perguntas documentada é `AskUserQuestion`. O projeto a apresenta para Claude Code/Cowork. Compatibilidade operacional com os outros agentes precisa de validação própria.

Existem skills homônimas. Os dois arquivos examinados não estabelecem relação de origem com Matt Pocock; a referência acima permanece a adotada para esta análise. Este adendo referencia a fonte e descreve uma aplicação ao projeto; não copia nem instala seu arquivo de skill.

## Papel e momento de uso

O grill-me entra antes da consolidação de um plano executável e em replanejamentos que alterem arquitetura, contratos, custo, dependências ou critérios de aceite. Também pode apoiar uma decisão entre propostas conflitantes.

Pequenas correções com escopo e aceite definidos seguem o fluxo existente. A retomada de uma sessão aproveita o registro de decisões e examina somente premissas afetadas por novas evidências. Esta regra preserva os registros anteriores e evita transformar toda tarefa curta em uma entrevista. A nova solicitação do usuário de reauditar exaustivamente as lacunas autoriza reabrir conclusões e ampliar a análise; o estado histórico permanece como referência, não como impedimento.

| Componente | Responsabilidade no fluxo proposto |
| --- | --- |
| Grill Me | Questionar premissas e explicitar decisões, dependências e lacunas antes de consolidar o trabalho. |
| Graphify e Cartographer | Fornecer evidência de estrutura e relações do código, respeitando cobertura e revisão analisada. |
| Claude-Mem | Recuperar contexto e histórico com origem, revisão e mecanismos de correção. |
| Headroom | Avaliar compressão do contexto com medição de custo, qualidade e recuperação do original. |
| Plano e registros versionados | Preservar o escopo, os critérios de aceite, as decisões documentadas e a evidência associada. |

Esse quadro é a divisão de responsabilidades proposta no [plano das ferramentas](AGENT_TOOLING_PLAN_2026-10-03.md), não uma declaração de integração operacional já entregue.

## Protocolo documental adotado

1. Fixar o plano, o commit e a decisão a examinar. Reutilizar requisitos, restrições e escolhas anteriores que continuam válidos.
2. Organizar as questões pelas suas dependências. Separar fatos verificáveis no projeto de escolhas que exigem contexto do usuário.
3. Investigar os fatos nas fontes adequadas. Registrar caminho, revisão, conclusão sustentada e limitação da evidência.
4. Para cada escolha ainda aberta, descrever alternativas e consequências. Manter a escolha como pendente quando não houver base para decidi-la.
5. Consolidar as respostas sustentadas e a lista de lacunas. Associar cada lacuna à tarefa de investigação, medição ou decisão correspondente.
6. Preparar uma mudança delimitada e seus critérios de aceite. A conclusão da revisão documental não altera o escopo de execução autorizado.

Este protocolo é uma adaptação documental para o ZAPP. Não acrescenta captura de memória, compressão, execução de código ou gestão automática de backlog à skill original.

### Perguntas e adaptação

Quando uma escolha do usuário for necessária, usar a interface de perguntas realmente disponível no agente e respeitar suas regras. A fonte original nomeia `AskUserQuestion`; a sessão atual dispõe de `request_user_input` para perguntas opcionais que melhorem materialmente o trabalho. Um adaptador não pode simular uma ferramenta inexistente nem presumir que todas as plataformas tenham as mesmas capacidades.

Preservar uma pergunta por vez quando houver uma entrevista. Perguntas de autorização seguem o canal e as regras próprios do ambiente; ausência de resposta não amplia permissões nem resolve uma decisão obrigatória. O trabalho documental já autorizado continua sem pedir novamente a mesma autorização.

Nenhuma pergunta ao usuário foi necessária para produzir este adendo: sua fonte, escopo e fatos de repositório puderam ser investigados. Isso não significa que todas as escolhas futuras de implantação estejam resolvidas.

## Revisão documental aplicada ao plano das ferramentas

As respostas abaixo distinguem conclusão baseada em fonte, proposta de organização e validação ainda pendente. O [registro estruturado](evidence/grill-me-review-2026-10-03.json) preserva os mesmos 12 IDs.

| ID | Questão examinada | Resultado e consequência |
| --- | --- | --- |
| GQ-01 | Qual Grill Me foi discutido? | Referência RobMitt identificada e fixada por commit/blob. Não substituir por um homônimo. |
| GQ-02 | Já estava incorporado? | Não localizado nas superfícies examinadas no head anterior. A inclusão documental é feita nesta atualização; instalação global continua desconhecida. |
| GQ-03 | Quando deve participar? | Proposta: antes de consolidar planos executáveis e em mudanças relevantes de direção. Não impor nova entrevista a cada ajuste pequeno. |
| GQ-04 | Quem responde às questões factuais? | O agente investiga fontes disponíveis primeiro. Decisões anteriores preservadas dispensam repetição de perguntas. |
| GQ-05 | Cartographer substitui Graphify? | O plano prevê comparação e contribuição adicional. O benefício real depende de AT-006; nenhuma substituição foi decidida. |
| GQ-06 | Um mapa pode liberar exclusões sozinho? | O plano AT exige revisar consumidores e evidência. Ausência de aresta não encerra a investigação nem autoriza remoção. |
| GQ-07 | A autoridade da memória é definida em que momento? | Ajuste de dependência: AT-003 e AT-016 antecedem captura/injeção persistente em AT-008 ou AT-012. Os IDs permanecem os mesmos. |
| GQ-08 | Uma memória antiga pode prevalecer sobre a decisão atual? | O plano exige origem/revisão e invalidação. Contexto recuperado não amplia permissões nem substitui evidência atual. |
| GQ-09 | O que provará o ganho do Headroom? | AT-013/AT-014 devem medir custo total, latência, detalhes críticos e recuperação do original. Nenhum resultado de economia foi medido nesta entrega. |
| GQ-10 | Uma integração bem-sucedida valida todos os agentes? | Cada combinação mantém seu próprio resultado. A adaptação do grill-me também terá evidência por agente. |
| GQ-11 | A API de perguntas é universal? | Não presumir. A adaptação ao runner e o teste de interação permanecem em GM-004/GM-005. |
| GQ-12 | O que está concluído agora? | Identidade, protocolo e revisão documental concluídos. Instalação, entrevista integral e validação operacional permanecem fora do resultado comprovado. |

### Dependência corrigida no plano AT

O quadro original numerava AT-016 depois das tarefas de configuração de memória e proxy. A numeração não deveria ser tomada como uma ordem obrigatória de execução, mas faltava explicitar essa precedência:

- **AT-003 + AT-016 → captura ou injeção de memória em AT-008/AT-012.**
- **AT-004 → comparação de mapas em AT-006 e atualização em AT-007.**
- **AT-013 + AT-014 + AT-015 → avaliação conjunta AT-017 → adoção AT-018.**
- **GM-004 → GM-005 → eventual rotina validada em GM-006.**

A primeira correção evita configurar duas fontes concorrentes de memória antes de definir quem registra, recupera, invalida e mantém o contexto. AT-016 se encerra pela política e pelos cenários de verificação definidos; a comprovação operacional de ausência de duplicações pertence a AT-010/AT-017, após a configuração. Essa separação remove a dependência circular entre decidir e testar.

## Tarefas GM e critérios de aceite

| ID | Trabalho | Estado desta entrega | Evidência/aceite |
| --- | --- | --- | --- |
| GM-001 | Identificar a skill discutida e fixar sua referência. | CONCLUÍDO DOCUMENTAL | Commit e blobs upstream identificados; conteúdo lido e identidade registrada. |
| GM-002 | Definir papel, gatilhos, limites e adaptação do protocolo ao ZAPP. | CONCLUÍDO DOCUMENTAL | Protocolo acima, vínculo com plano/ondas/handoff e limites de ferramenta/autorização explícitos. |
| GM-003 | Aplicar revisão documental ao plano atual das ferramentas. | CONCLUÍDO DOCUMENTAL | GQ-01 a GQ-12, conclusões e pendências rastreáveis; dependência AT-016 corrigida na ordem de preparação. |
| GM-004 | Preparar e configurar a adaptação executável da skill no agente escolhido. | PLANEJADO; NÃO EXECUTADO | Versão e destino definidos, regras da plataforma preservadas, interface de perguntas verificada e configuração reversível. |
| GM-005 | Verificar carregamento e comportamento em uma sessão de teste por agente. | PLANEJADO; NÃO EXECUTADO | Evidência de skill carregada, pesquisa antes da pergunta, uma escolha por vez, decisão pendente preservada e resumo fiel. |
| GM-006 | Avaliar a adoção recorrente nos planejamentos relevantes. | PLANEJADO; NÃO EXECUTADO | Caso real revisado, custo e utilidade observados, conflitos reduzidos com evidência, responsável e regra de reuso definidos. |

GM-004 a GM-006 não são encerrados por este arquivo existir. A escrita atual continua no [escopo documental já concedido](README.md), `docs/reconciliation/**`, no PR existente mantido em draft.

## Retomada

Ler este registro e o [plano de ferramentas](AGENT_TOOLING_PLAN_2026-10-03.md), conferir se o head ou alguma premissa mudou e continuar somente nas tarefas pendentes pertinentes. Preservar o histórico e reabrir a análise de cobertura e microfuncionalidades conforme a nova solicitação do usuário. Não apresentar a aplicação documental como instalação ou como entrevista integral da skill original.
