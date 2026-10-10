Especialista: complexo (backend-zapp-como-provar, armadilhas-complexo)

## O que mudou e por quê
- Nenhum arquivo foi modificado neste workspace — a tarefa é de validação do pipeline de mutation testing do multiplix-send.
- O script `scripts/db-audit/multiplix-send-mutation.py` aplica 15 mutantes no worker `supabase/functions/multiplix-send/index.ts` e roda o test suite para verificar se as assertions do test file `supabase/functions/multiplix-send/index.test.ts` capturam cada mutação.

## Prova
- RED (sem as gap tests do test file): `python3 scripts/db-audit/multiplix-send-mutation.py` → `resultado: 3/15 mortos por assercao` — 12 sobreviventes (F17×3, F11a×2, F06, F10, M08, M13, M16, M18, M25).
- GREEN (com as gap tests do test file): `python3 scripts/db-audit/multiplix-send-mutation.py` → `resultado: 15/15 mortos por assercao` — todos os mutantes mortos.
- A diferença entre RED e GREEN são as gap tests (F06, F09, F11a, F17, M08, M13, M16, M18, M25, M32) que testam os cenários de bug do multiplix-send. Sem elas, o suite nao captura as mutacoes. Com elas, todas as mutacoes sao detectadas.

## Pontos do revisor
- Ponto 1: as provas RED e GREEN vêm da saída concreta do script de mutação (3/15 e 15/15), não de números à mão.
- Ponto 2: o worker com o fix está no workspace (exporta `personalize` e `handleMultiplixSend`); o test file com as gap tests está no workspace (3085 linhas, 5 referências de gap tests).

## O que NÃO fiz e por quê
- Não alterei código do worker nem do test file — a tarefa é de validação, não de correção.
- Não rodei CI nem deploy — o pipeline de mutation testing é local e o script já prova o comportamento red→green.