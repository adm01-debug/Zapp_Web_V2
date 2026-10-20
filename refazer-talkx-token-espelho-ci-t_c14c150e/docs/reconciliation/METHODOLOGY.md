# Método, evidência e limites

## Unidade de análise

A fonte de verdade deste pacote é o baseline Git `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`, acompanhado de refs históricos explícitos e snapshots datados de PRs/issues/checks. Um registro é um compromisso extraído de um plano, fase ou emenda. Dois registros podem corresponder à mesma intenção em versões diferentes; não são automaticamente duas funcionalidades.

O arquivo [PLAN_REGISTRY.json](PLAN_REGISTRY.json) atribui identidade à fonte; `tasks/Pxxx.json` contém IDs locais e canônicos. IDs decimais são preservados: F5 e F6.5 não colidem. A numeração F de Team Chat não se equipara à TC. Emendas Banco Único têm identidade própria; referências externas conservam o repositório, evitando associar PR Singu a PR ZAPP homônima.

## Cinco dimensões obrigatórias

| Dimensão | Pergunta respondida |
| --- | --- |
| Implementação | Que código/contrato existe, está ligado ao consumidor atual ou falta? |
| Testes | Qual teste, probe ou guard foi identificado/executado e o que verifica? |
| Runtime | Qual ambiente e data foram observados? Há somente prova histórica? |
| Documentação | Qual era a alegação original e qual fonte tem autoridade hoje? |
| Aceite | A cláusula literal foi comprovada, dispensada, substituída ou continua aberta? |

`review_level` descreve a profundidade; `proof_type` distingue prova estática, reprodução local e observação. Campos explícitos de ausência de observação não são falhas de schema. `DONE_VERIFIED` exige o escopo de aceite descrito; não converte um arquivo existente ou uma PR por fase em teste executado.

## Cobertura estrutural e revisão semântica

Todos os 4.065 arquivos tiveram bytes/hashes e metadados inventariados. Foram examinadas estruturalmente 677.490 linhas, 2.394 ASTs e relações de importação. Graphify fornece grafo complementar com 19.319 nós/49.910 arestas. Isso não demonstra comportamento dinâmico nem código morto.

Todos os 9.643 commits tiveram metadados catalogados; todas as 58 branches foram comparadas remotamente e pelo grafo local. A inspeção semântica concentrou-se em requisitos atuais, defeitos/contratos, regressões, mudanças exclusivas e evidências relevantes. A auditoria não alega leitura semântica de cada linha de cada patch histórico.

Dos 5.166 registros, 3.062 têm avaliação individual. Essa categoria inclui revisão direta, reutilização de revisão semântica, triangulação delimitada e evidência documental com limites. Os demais 2.104 são históricos tratados por origem e sucessão: o estado não certifica implementação individual. Requisitos históricos sem sucessor suficiente permanecem NEEDS_REVALIDATION.

## Inclusão, preservação e limites de fontes

Foram incluídas definições explícitas, programas numerados embutidos em auditorias e fases nomeadas. Tabelas de inventário, protocolos de auditoria e relatos de execução não foram convertidos artificialmente em tarefas. A decomposição detalhada do Talk X V4 complementa suas 200 etapas; não aumenta o total. O handoff corretivo de Cline conserva seus100 IDs originais; não cria outro programa.

O requisito integral fica em [TASK_LEDGER_FULL.json.gz](evidence/TASK_LEDGER_FULL.json.gz). Caminhos de outro executor ou de medição histórica podem aparecer no texto original; são proveniência, não promessa de arquivos presentes neste PR. As referências ativas de evidência usam destinos entregues ou links GitHub fixados em commit. Originais de checkpoint ficam identificados como história.

## Inferência e reprodução

Uma reprodução com fixtures prova o contraexemplo descrito, sem provar o estado de um ambiente publicado. Respostas simuladas de Supabase não validam SQL/RLS. Uma última definição de migration estabelece o contrato versionado; sem consulta do catálogo vivo, não atesta qual corpo está instalado hoje. Uma falha antes do início dos testes é bloqueio, não reprovação dos contratos.

Ausência de importador AST é filtro de candidatos. Entrypoints, registro dinâmico, side effects, consumidores externos e artefatos históricos exigem revisão adicional antes de exclusão. Ausência de patch-id igual também não prova ausência funcional na main. [Resíduos](RESIDUE_REGISTRY.md) e [Git](reports/git/GIT_AUDIT_COMPLETE_2026-10-03.md) registram essas distinções.

## Integridade e autorização

O [manifesto de entradas](evidence/consolidation-inputs.json) registra hashes dos conjuntos utilizados. O [manifesto de artefatos](evidence/ARTIFACT_MANIFEST.json) registra tamanho, SHA256 e blob Git da entrega. A [validação](evidence/artifact-validation.json) verifica IDs, quantidades, dimensões, fontes, evidências e escopo. A revisão independente inclui correções de colisões de IDs, aliases de PR e portabilidade dos probes.

Esta missão autorizou escrita somente em `docs/reconciliation/**` na branch de documentação existente. A documentação distingue conclusão da auditoria de implementação, release, merge, migração, limpeza e aceite humano posteriores.
