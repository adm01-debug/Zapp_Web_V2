# Ferramentas de apoio aos agentes — Cartographer, Claude-Mem e Headroom

Data de referência: 03/10/2026, America/Sao_Paulo. Repositório: `adm01-debug/Zapp_Web_V2`.

## Estado e motivo deste adendo

Os três nomes foram discutidos como candidatos a prova de conceito, mas não foram localizados no plano consolidado examinado no head `9b7339d53e08ee6bfdce86b06a52a111fc2b231e` do [PR #1869](https://github.com/adm01-debug/Zapp_Web_V2/pull/1869). Este adendo corrige a omissão documental. A busca nominal no branch padrão também não encontrou ocorrências de Cartographer, Claude-Mem ou Headroom; esse resultado não comprova ausência de uma instalação global, local ou em VPS.

**Estado dos três: incluídos no planejamento; POC pendente; instalação e operação no ambiente do usuário não comprovadas.** Nenhuma tarefa de instalação, captura de memória, proxy ou benchmark foi executada por esta atualização.

“claude-men” é interpretado como **Claude-Mem**, conforme o contexto da discussão. A referência de Cartographer é `kingbootoshi/cartographer`; existem projetos homônimos. Versões exatas e distribuição escolhida serão fixadas antes de qualquer POC.

Este é um adendo posterior ao inventário. Os 18 itens AT abaixo têm identidade própria e não alteram os 5.166 registros, 62 fontes e 104 achados do baseline histórico. O [MASTER_LEDGER](MASTER_LEDGER.json) permanece o registro da reconciliação original. Este documento é a fonte das tarefas de avaliação de ferramentas, ligada à [ordem de correções](EXECUTION_WAVES.md).

## Papéis propostos e evidência disponível

| Componente | Papel no trabalho do ZAPP | O que a fonte primária documenta | Estado no projeto |
| --- | --- | --- | --- |
| Cartographer | Mapa navegável do código e contexto por tarefa, com rastreabilidade até arquivos e revisões. | A v2 oferece CLI/MCP, grafo local, briefs delimitados, verificação de atualização e auditorias de remoção. O plugin legado de Claude Code é uma modalidade distinta. [Fonte C] | Planejado; versão, modo de uso e POC pendentes. |
| Claude-Mem | Continuidade entre sessões: decisões, investigações, erros recorrentes e ponto de retomada. | Captura observações de ferramentas, produz resumos e recupera contexto futuro. O projeto anuncia suporte a vários agentes, incluindo Codex e Hermes. [Fonte M] | Planejado; compatibilidade e recuperação no ambiente do usuário pendentes. |
| Headroom | Redução mensurável de contexto enviado ao modelo, preservando acesso às evidências originais. | Oferece biblioteca, proxy, MCP e wrap para Claude Code/Codex; também possui funções de memória. [Fonte H] | Planejado; benefício, compatibilidade e restauração da configuração pendentes. |

A presença de suporte na documentação upstream não atesta funcionamento no Claude, Codex ou Hermes usados pelo usuário. Para Headroom/Hermes, a rota genérica por proxy ou MCP é uma hipótese a validar; o README consultado não lista um wrap específico para Hermes.

**Decisão de arquitetura para a POC:** ferramentas no ambiente de desenvolvimento e auditoria dos agentes. Sua incorporação ao runtime do produto exige uma decisão separada. Graphify já integra as orientações do repositório e possui uma extração documentada em [Code Truth](CODE_TRUTH_STRUCTURAL_SWEEP_2026-10-03.md); a avaliação de Cartographer deve reutilizar essa referência e medir a contribuição adicional.

## Tarefas e critérios de aceite

Todos os itens abaixo estão em **PLANEJADO / POC NÃO EXECUTADA**. Responsabilidade funcional: engenharia e orquestração dos agentes; responsável nominal ainda não designado. A ordem sugerida é preparação comum, Cartographer, Claude-Mem, Headroom e avaliação conjunta. Esta frente pode acompanhar as ondas de correção, sem bloquear o tratamento dos defeitos prioritários.

| ID | Trabalho a executar no escopo apropriado | Evidência necessária para concluir |
| --- | --- | --- |
| AT-001 | Fixar repositório upstream, versão/commit, licença, dependências, modalidade local/serviço e versões dos agentes. | Matriz reproduzível por ferramenta e por agente, com origem e data; nenhum nome ambíguo. |
| AT-002 | Levantar instalações existentes e preparar ambiente isolado, orçamento da POC e comparação sem ferramentas. | Inventário do ambiente efetivamente acessado, configuração inicial preservada, tarefas/amostras idênticas e custos de referência. |
| AT-003 | Definir escopo dos dados e regras de retenção, isolamento por projeto/branch, exportação e restauração. | Lista explícita de arquivos/fontes permitidos; credenciais excluídas; escrita em bancos de negócio fora da POC. |
| AT-004 | Avaliar a CLI/MCP v2 do Cartographer sobre checkout de SHA fixo. | Comandos, versões, manifesto e artefatos locais; cobertura e limitações por linguagem/tipo de arquivo. |
| AT-005 | Conferir mapas de rotas, componentes, hooks, serviços, funções de backend, migrations, CI e infraestrutura. | Amostra confrontada com fontes reais; integrações externas identificadas como referências ou snapshots, sem presumir inspeção de serviços vivos. |
| AT-006 | Comparar consultas por tarefa com Graphify e com os achados da reconciliação. | Relações confirmadas, omissões e falsos positivos registrados; ganho de navegação medido sem converter ausência de aresta em prova de código morto. |
| AT-007 | Validar atualização incremental e uso do contexto por cada agente escolhido. | Mudança controlada deixa o mapa anterior desatualizado, atualização corrige o mapa e o agente cita os arquivos/revisão corretos; reversão reproduzível. |
| AT-008 | Configurar Claude-Mem no ambiente de teste e confirmar o provedor e o destino da memória. | Configuração revisável de hooks/serviço/armazenamento; captura e consulta demonstradas com dados sintéticos. |
| AT-009 | Demonstrar continuidade entre duas sessões independentes. | Sessão A registra decisão com evidência; sessão B recupera a decisão, sua origem e pendência sem receber novamente o histórico completo. |
| AT-010 | Verificar isolamento, invalidação e correção de lembranças. | Outro projeto não recebe contexto do ZAPP; mudança de branch/decisão não faz memória antiga prevalecer sobre código atual; exportação e remoção testadas. |
| AT-011 | Verificar a matriz ferramenta × agente: Cartographer, Claude-Mem e Headroom com Claude Code, Codex e Hermes. | Cada combinação recebe estado próprio: validada, incompatível ou pendente. Sucesso em um agente não encerra os demais. |
| AT-012 | Selecionar o modo mínimo de Headroom e preservar a configuração original. | Roteamento identificado e reversível; modelo/provedor escolhidos mantidos; funcionalidades adicionais ativadas somente conforme o escopo definido. |
| AT-013 | Comparar tarefas do ZAPP com e sem compressão. | Mesmos SHA, modelo e tarefas; tokens de entrada/saída/cache, latência, custo total e qualidade registrados, incluindo o custo adicional da ferramenta. |
| AT-014 | Exercitar casos em que detalhes são essenciais à auditoria. | Erros raros em logs, IDs, condições SQL, diferenças de contrato e decisões restritivas continuam detectáveis; recuperação do original funciona na sessão que consome o resumo. |
| AT-015 | Validar falha, indisponibilidade e remoção da configuração. | Comportamento do agente conhecido quando proxy/cache falha; nenhuma mudança silenciosa de modelo; configuração anterior restaurada e verificada. |
| AT-016 | Definir a autoridade da memória entre Claude-Mem e Headroom. | Uma fonte primária de continuidade, com política explícita para a outra; ausência de injeção duplicada, conclusões contraditórias e retenção acidental. |
| AT-017 | Executar uma avaliação conjunta sobre uma tarefa real, em cópia controlada. | Mapa, memória e compressão rastreados separadamente; resultado funcional comparável à referência; limitações preservadas no relatório. |
| AT-018 | Registrar decisão de adoção e roteiro de operação por agente. | Parecer adotar/ajustar/descartar com métricas, configuração exata, responsável, manutenção, recuperação e vínculo para evidências. |

## Regras de encerramento

Uma tarefa só muda para concluída quando sua evidência existe e o ambiente/commit são identificáveis. “Planejado”, “configurado”, “executado”, “validado” e “adotado” são estados diferentes. Compatibilidade anunciada, existência de um comando, README ou instalação de pacote não encerram a integração.

As decisões e restrições do usuário prevalecem sobre resumos recuperados. Memórias devem remeter à fonte e à revisão; uma lembrança antiga não autoriza alteração de código, banco, infraestrutura ou instruções. Auditorias de remoção continuam subordinadas ao [plano de limpeza segura](SAFE_CLEANUP_PLAN.md).

O ganho de Headroom será medido no trabalho do ZAPP. Percentuais publicados pelo fornecedor não são metas nem resultados deste projeto. O aceite exige qualidade preservada nos casos críticos, recuperação dos originais e benefício líquido observado.

## Referências e limites da atualização

- **Fonte C:** [Cartographer — repositório e README](https://github.com/kingbootoshi/cartographer), consultado em 03/10/2026 no fuso America/Sao_Paulo.
- **Fonte M:** [Claude-Mem — repositório e README](https://github.com/thedotmack/claude-mem), consultado na mesma data.
- **Fonte H:** [Headroom — repositório e README](https://github.com/headroomlabs-ai/headroom), consultado na mesma data.
- **Fonte do estado do projeto:** arquivos README, EXECUTION_WAVES, SESSION_HANDOFF e conteúdo retornado do PR #1869 no head `9b7339d53e08ee6bfdce86b06a52a111fc2b231e`; buscas nominais no branch padrão.
- **Escopo de gravação vigente:** [README da reconciliação](README.md), somente `docs/reconciliation/**` na branch documental existente; PR mantido em draft.

As fontes upstream são mutáveis; AT-001 exige fixar a revisão utilizada na POC. Esta publicação registra o plano e atualiza seu manifesto de integridade. Não certifica instalações locais/VPS, resultados de benchmark, execução dos 18 itens ou funcionamento do produto.
