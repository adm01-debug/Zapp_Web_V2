# Session Handoff — ponto de retomada

## Regra
Antes de continuar, sincronizar main e reconsultar PRs/issues abertos. O repo é altamente concorrente.

## Próxima sequência
1. IA — reconstruir plan → PR → commit → current state por IA-NNN.
2. Dashboard — reconstruir planos/redesigns → PRs → estado atual.
3. Catálogo — terminar classificação dos itens ainda abertos/validated-fail/externos.
4. Talk X — reconciliar X001–X200 contra STATUS e commits/PRs atuais.
5. Multiplix — separar os 39 abertos em CODE / RUNTIME / EXTERNAL / PILOT / HUMAN / OBSERVATION.
6. Telefonia — rebase T01–T100 contra PRs #1830/#1851/#1858/#1864 e posteriores.
7. Classificar todas as branches remotas: ACTIVE_WORK, OPEN_PR, MERGED, SUPERSEDED, UNIQUE, AUTOMATION, SAFE_TO_DELETE.
8. Auditar PRs e issues ainda abertos para evitar trabalho duplicado.
9. Code Truth por módulo usando Graphify + busca + testes.
10. Normalizar TODO/FIXME/deprecated/legacy/eslint-disable/ts-expect-error.
11. Gerar PLAN_REGISTRY e depois MASTER_LEDGER.json.
12. Só então produzir SAFE CLEANUP PLAN e Execution Waves.

## Não fazer ainda
- não excluir branches;
- não apagar código;
- não aplicar migration;
- não atualizar banco;
- não executar planos históricos diretamente;
- não marcar candidato como morto só por grep;
- não criar novo plano de centenas de etapas.

## Critério de sucesso da reconciliação
Ser capaz de responder para qualquer item: de onde veio, qual plano o substituiu, qual PR/commit o implementou, quais arquivos atuais o materializam, quais testes/runtime o provam, o que ainda falta e qual agente/tipo de trabalho é apropriado.
