# Plano de revisão para limpeza segura

Baseline da evidência: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`, em 03/10/2026. **Este documento organiza uma execução futura; não autoriza exclusões, merges, deploys, alterações de guardas ou intervenções no banco.** A presente atualização utiliza evidências existentes e não executa novos testes.

## 1. Ponto de partida verificável

A varredura cobriu **4.065 arquivos**, com **2.394 arquivos analisados pelo parser TypeScript** e zero erros de parse. Os **84 arquivos sem importador estático** foram separados em 30 `DEAD_CANDIDATE`, 28 barrels, dez funcionalidades sem integração, 12 primitivas de UI, três pontos de entrada/configuração ativos e um suporte de teste. Nenhum recebeu `DEAD_CONFIRMED` ou `DELETE-A`. [Code Truth](CODE_TRUTH_STRUCTURAL_SWEEP_2026-10-03.md) e [classificação por caminho](evidence/residue-candidates.json).

No banco há **801 SQL de migrations: 779 ativas e 22 arquivadas**. A falha capturada de CI compara **779 arquivos ativos com 781 entradas no ledger**. Limpeza de arquivos não resolve essa divergência por definição; é necessário reconciliar a identidade e a procedência das duas versões extras e dos artefatos derivados. [Database Truth](DATABASE_TRUTH_STRUCTURAL_SWEEP_2026-10-03.md).

O inventário Git contém 58 branches e 197 commits exclusivos fora da main. A branch `claude/confident-babbage-ivgmmn` conserva trabalho funcional, histórico já recuperado e regressões em guardas. Esses conjuntos exigem decisões diferentes por caminho e commit. [Métricas Git](evidence/git-metrics.json) e [quarentena](evidence/branch_quarantine.json).

## 2. Ficha mínima antes de qualquer proposta

Cada candidato deve produzir uma decisão concreta, pequena e revisável. A ficha deve conter:

1. **Identidade:** caminho, objeto SQL ou ref Git; baseline, head e hash do conteúdo analisado.
2. **Responsabilidade:** comportamento atual, obrigação de um plano, contrato público ou histórico preservado.
3. **Consumidores:** imports/reexports, imports dinâmicos, entrada/configuração, registries, eventos, scripts, workflows, SQL/RPC por string e possíveis clientes externos, conforme o tipo de item.
4. **Sucessão:** implementação substituta, commits/PRs relacionados e evidência de migração dos consumidores; explicitar conflitos de autoridade ou decisão de produto pendente.
5. **Proposta:** diff exato e motivo pelo qual ele preserva o comportamento exigido; indicar eventuais mudanças de comportamento de forma expressa.
6. **Validação e reversão:** verificações necessárias para o risco concreto, resultado observado e caminho de reversão; separar evidência estática de runtime.
7. **Decisão:** estado da tarefa, disposição do código e confiança de exclusão em campos distintos, mantendo incertezas e dependências.

A [taxonomia](STATUS_TAXONOMY.md) define os estados. O [registro de resíduos](RESIDUE_REGISTRY.md) fornece a classificação inicial; o [grafo de imports](evidence/import-graph.json.gz), os [pontos de chamada](evidence/db-event-call-sites.json.gz) e o [manifesto Graphify](evidence/graphify_evidence_manifest.json) fornecem meios complementares para investigar consumidores. Uma consulta vazia não encerra a ficha automaticamente.

## 3. Sequência de trabalho por superfície

### C0 — Branches e trabalho exclusivo

Atualizar a comparação quando a limpeza for executada: uma conclusão sobre o SHA deste snapshot não se transfere automaticamente ao head posterior. Verificar tipo de ref, branch de destino, PRs associadas, worktree em uso, ancestralidade, commits exclusivos, equivalência de patches e conteúdo final. Não tratar refs simbólicas como branches removíveis nem presumir o estado da máquina original a partir deste clone. [Auditoria Git](reports/git/GIT_AUDIT_COMPLETE_2026-10-03.md) e [reconciliação das issues #1810 e #378](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

Preservar branches com PR aberta ou trabalho ainda sem disposição. `ahead=0` demonstra uma relação de grafo no corte analisado; é insuficiente, sozinho, para autorizar exclusão. Uma PR incorporada por squash também exige comparação do resultado, e uma branch pode ter sido reutilizada depois da PR. Os três casos classificados como ancestrais integrados no snapshot são candidatos a uma revisão de higiene, sem autorização automática. [Matriz de branches](evidence/branches.json) e [métricas de classificação](evidence/git-metrics.json).

Para `claude/confident-babbage-ivgmmn`, preservar a quarentena de **37 commits / 87 caminhos**. Se houver decisão de resgatar trabalho, produzir uma proposta seletiva sobre a base atual, por responsabilidade funcional. Não importar as duas regressões de guardas, reaplicar as 40 migrations já recuperadas ou incorporar documentos antigos como estado atual. [Disposição por arquivo](evidence/branch_quarantine.json) e [TC-014/TC-015](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

**Saída esperada:** ficha por branch com ação proposta, conteúdo preservado e evidência de equivalência. Nenhuma poda em lote é consequência deste plano.

### C1 — Documentação e autoridade dos planos

Manter origem, IDs, histórico e ligação com evidência atual. Marcar sucessão apenas quando houver prova ou decisão explícita; preservar planos anteriores como fontes. No caso Team Chat, F100 e TC100 coexistem sem revogação expressa entre si: data mais recente e semelhança de título não bastam para escolher autoridade ou somar seus itens como funcionalidades distintas. [Conflitos de autoridade](evidence/team_chat_plan_authority_conflicts.json) e [correspondência por conteúdo](evidence/team_chat_f_tc_crosswalk.json).

Revisar links antes de renomear ou mover documentos. Registros históricos de banco não devem reativar instruções canceladas, alterar o banco de referência ou converter ausência de evidência em conclusão de execução. [Auditoria de links](evidence/document-link-audit.json) e [reconciliação histórica de banco](reports/modules/HISTORICAL_DATABASE.md).

**Saída esperada:** diff documental com origem e destino dos links, sucessão explícita e pendências preservadas. A consolidação do ledger organiza a fila; não resolve sozinha decisões de produto, autoridade ou runtime.

### C2 — Imports, reexports e arquivos candidatos

Começar por um candidato cuja responsabilidade e consumidores possam ser demonstrados com baixo escopo. Os 30 `DEAD_CANDIDATE` e 28 barrels são filas de investigação `DELETE-B`. Os 12 componentes de UI e o suporte de teste permanecem `DELETE-D`; os três pontos de entrada/configuração e as dez funcionalidades planejadas permanecem `DELETE-X`. [Classificação dos 84 arquivos](evidence/residue-candidates.json).

Para imports ou exports isolados, verificar resolução do compilador, efeitos colaterais de módulo e eventual contrato de importação externa. Para retirar um arquivo inteiro, completar os consumidores aplicáveis, inclusive configuração, estilos, automações e strings. Uma biblioteca de componentes não perde sua responsabilidade apenas por faltar um importador no momento do snapshot.

**Saída esperada:** proposta por arquivo ou pequena unidade coesa, com consumidor ausente demonstrado no escopo relevante. Promoção para `DEAD_CONFIRMED` exige prova; não há quota ou promessa de remover os 84 itens.

### C3 — Código legado e funcionalidades sem integração

Quando há consumidor comprovado, a sequência é migrar o contrato e o consumidor, verificar o comportamento necessário e só então avaliar a retirada da compatibilidade. Esse tratamento se aplica às RPCs legadas de previews/unread do Team Chat e aos caminhos de Telefonia com consumidores comprovados, como `useCalls` e `CallDialog`. O caso `useCallHistory`, com importador de teste identificado no grafo, exige decisão própria de cobertura e contrato. [Consumidores Team Chat](evidence/teamchat_residue_candidates.json) e [grafo de imports com linhas](evidence/import-graph.json.gz).

Componentes Team Chat aproveitáveis devem ser confrontados com o Panel ativo e os requisitos dos planos. `canManageDepartments` ausente torna a gestão inacessível; habilitar apenas o botão deixaria contratos inválidos alcançáveis. A integração deve corrigir primeiro os contratos de banco e a autorização e, depois, expor a interface. Nenhuma exposição ativa de credenciais foi demonstrada pela auditoria. [Achados TC-005 e TC-006](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

**Saída esperada:** migração funcional com critérios de aceite e consumidores atualizados, ou decisão expressa de abandonar o requisito preservando a linhagem. A ausência de integração não é autorização de descarte.

### C4 — Scripts, testes, workflows e guardas

Mapear executores reais: package scripts, workflows, hooks, testes via subprocesso e runbooks manuais. Ler os efeitos do script antes de executá-lo; o nome `validate` não garante operação somente leitura. O validator Team Chat realiza POST com credencial privilegiada e possui teste consumidor, apesar dos contratos obsoletos. A decisão deve revisar esse par em conjunto. [Achado TC-012](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

Preservar contratos e verificações úteis ao substituir ferramentas. Não transformar bootstrap ausente, falha de conexão ou validação não executada em sucesso; não reduzir baselines globais ao escopo de um módulo. As regressões da branch em quarentena demonstram esse risco concreto. [TC-014](reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md).

**Saída esperada:** proposta com a mesma responsabilidade de validação demonstrada e com falhas relevantes detectáveis. Quantidade de testes, asserts tautológicos ou exit 0 isolado não comprovam esse resultado. [Qualidade de testes](evidence/test_quality_inventory.json).

### C5 — Banco, migrations e artefatos derivados

Preservar as **22 SQL arquivadas**, incluindo as sete `_superseded/`, e manter migrations aplicadas imutáveis. Arquivos `_foreign/` não se tornam candidatos a apply no banco atual por existirem no mesmo repositório. Os cancelamentos históricos dos passos 3–6 de 27/08 também não autorizam marcar versões como aplicadas por inferência de objetos semelhantes. [Inventário por caminho](evidence/database_surface_inventory.json) e [plano histórico reconciliado](reports/modules/HISTORICAL_DATABASE.md).

Antes de uma proposta de correção, comparar arquivo, ledger, definição efetiva e artefatos derivados com identidade e data explícitas. O drift de **779 contra 781** e as duas fixtures extras têm causa própria; sincronizar types/catalog/manifest/grants não resolve automaticamente o ledger. O DB offline capturado falhou no bootstrap, portanto não oferece prova de aprovação ou reprovação de RLS. [Evidência dos runs](reports/git/PR_ISSUE_AUDIT_2026-10-03.md).

Qualquer evolução de schema deve usar o fluxo vigente de mudança, conservar as guardas e produzir evidência posterior ao apply quando ele vier a ser autorizado. Não há, neste plano, ação de repair, DROP, remoção de migration aplicada ou alteração da origem considerada canônica.

**Saída esperada:** proposta de reconciliação por versão/objeto, com proveniência, impacto e aceite verificável. Comportamentos de sessão, RLS, Realtime e Storage continuam pendentes quando faltam cenários autenticados atuais.

## 4. Validação proporcional à alteração proposta

| Tipo de alteração futura | Verificação necessária para a decisão |
|---|---|
| Texto ou reorganização documental | Links, preservação de IDs/origem e consistência das referências; não exige uma suíte de produto sem risco concreto |
| Import/reexport ou arquivo TS | Consumidores e efeitos colaterais, typecheck/lint aplicáveis; build quando resolução ou empacotamento forem afetados |
| Comportamento de UI ou hook | Cenários dirigidos que distingam o caminho legítimo, erro e regressão relevante |
| Script, workflow ou guarda | Contrato de execução, entradas/saídas, falhas e privilégio; testes existentes pertinentes |
| SQL, RPC, RLS ou Storage | Contratos no ambiente apropriado, papéis e invariantes; prova posterior em ambiente autorizado quando o aceite depender de runtime |
| Branch | Ref e hashes atuais, PRs, ancestralidade, equivalência e trabalho em uso; não há teste de produto que substitua essa análise |

Reutilizar evidência válida e repetir verificações apenas quando o diff, a mudança de baseline ou uma incerteza concreta exigir. Novos testes devem detectar o comportamento errado relevante, sem apenas reproduzir a implementação. Os cinco guardas estáticos e os 150 testes locais já preservados têm escopo CI/deploy; não são um certificado genérico para qualquer futura limpeza. [Resultados estáticos](evidence/ci-static-guards.json), [contratos locais](evidence/ci-contract-tests.json) e [limites de teste Team Chat](evidence/test_quality_inventory.json).

## 5. Condições de fechamento de uma proposta

A revisão pode ser encerrada com preservação, integração, substituição, decisão de produto ou retirada tecnicamente demonstrada. Para qualquer alteração, registrar o diff efetivo, verificações executadas e limitações que permanecem. Manter `IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE`, `NEEDS_REVALIDATION` ou outro estado apropriado quando o requisito não foi integralmente demonstrado. [Taxonomia](STATUS_TAXONOMY.md).

O objetivo da próxima missão deve ser resolver uma responsabilidade concreta com evidência suficiente. Este plano não promete um número de exclusões, paridade de banco ou sucesso em runtime e não substitui a autorização necessária para executar a proposta escolhida.
