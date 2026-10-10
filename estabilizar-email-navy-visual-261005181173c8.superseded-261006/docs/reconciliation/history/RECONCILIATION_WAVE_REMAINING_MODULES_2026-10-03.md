# Reconciliation Wave — Remaining planned modules — 2026-10-03

## Team Chat
A auditoria de 29/09 provou histórico severamente inconsistente: V3 foi declarado concluído e depois rebaixado; plano de conclusão intermediário tinha 7 DONE / 16 PARCIAL / 3 regressões / 74 ausentes. O plano FINALIZACAO de 100 etapas é a autoridade declarada e aparece documentalmente 0/100.

Entretanto issues #1265/#1266/#1267 continuam abertas apesar de PRs posteriores #1309, #1313 e #1314 afirmarem corrigir exatamente os problemas. Logo as issues estão em NEEDS_REVALIDATION/STALE_ISSUE_CANDIDATE, não devem ser tomadas como prova de bug atual sem testar HEAD.

Team Chat continua uma das maiores frentes potenciais, mas o "0/100" também precisa ser rebaseado contra PRs posteriores.

## Mapa
Plano de finalização nasceu da auditoria 33 DONE / 17 PARCIAL / 8 defeitos / 1 perda de dados. O próprio documento recebeu evidências posteriores em 02/10 e há muitas PRs de fases subsequentes. Não usar o texto inicial como backlog; reconstruir por etapa/PR. O módulo tem histórico de correção de perda de endereço/coordenadas e fallback Search Box, portanto limpeza deve preservar migrations/auditoria.

## Email NAVY
O plano original de 100 etapas registra corretamente que era somente documental, mas o próprio cabeçalho foi atualizado dizendo que autorização posterior ocorreu e que o estado executado está em EMAIL_NAVY_IMPLEMENTATION_EVIDENCE_2026-10-02.md.

Git confirma implementação posterior:
#1712 implementação NAVY; #1751 completion; #1755 validação de produção; #1762 gaps de confiabilidade; #1763 homologação/teste DB; #1793 tema; #1846 preflight CRM; #1855 vínculo CRM/autorização.

Portanto EN-001..100 NÃO podem ser classificados como "planejados/não executados" a partir do corpo histórico do plano. A autoridade migra para evidence + Git + HEAD.

## Arquivos / Chat Panel
O plano de 50 etapas dizia inicialmente pendente, mas Git posterior mostra execução em fases:
#1731 fundação; #1750 toolbar/layout; #1772 lista/tabela/renderizador; #1780 thumbnails/viewer; #1845 encaminhamento real com cópia Storage/limites; #1865 paginação/contagens/estados. Também #1419 corrigiu acesso RLS/ingest de mídia recebida.

Logo o plano inicial está fortemente atrasado. Reconciliar etapas 01–50 antes de considerar qualquer uma pendente.

## GitHub Actions / CI
Plano de 100 etapas de 01/10 aparece com 39 checkboxes fechados / 61 abertos no Markdown, mas o próprio documento registra várias etapas SUPERADAS ou FEITAS posteriormente (E84, E91, E92, E96–E99 etc.). Além disso existem PRs abertos #1610, #1439, #1430, #1206 e issue #1454. Não executar as 61 caixas em sequência.

## Etiquetas
Plano de remoção deve ser tratado como migration/removal program, não dead-code cleanup simples. `ai_conversation_tags` é explicitamente fora do escopo. Antes de qualquer remoção, revalidar consumidores, backup/export e estado atual de PRs.

## Volume de mídia
Plano de 50 etapas contém implementação e medição posteriores dentro do próprio documento, além de bloqueios dependentes de aparelho/decisão. Classificar por runtime/hardware e não apenas código.

## Conclusão
Os módulos restantes repetem o mesmo padrão sistêmico: o plano nasce correto, execução ocorre em várias sessões/PRs, e o documento-base não acompanha integralmente o HEAD. MASTER_LEDGER precisa ser derivado de evidência e atualizado por automação.
