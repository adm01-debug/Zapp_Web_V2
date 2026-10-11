Especialista: senior (docs; pedido original worker (docs))

Ponto 1: “retirado pelo limpador: quebra o ESPELHO DO CI no empilhamento (node: ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge)”
- O que mudei: reapliquei o trabalho anterior do cartão por cherry-pick da branch indicada e adicionei a correção aprovada no cartão t_21beeef9: em `ESTADO.md`, as âncoras `arquivo:linha` foram reposicionadas para a ponta atual de `dia/2026-10-11`, mantendo a regra da guarda intacta (cada âncora precisa existir e a linha precisa conter a própria edge). Mantive também `FEATURE_REGISTRY.md`, `TESTING_CONVENTION.md` e `scripts/ci/docs-estado-registry-convention.unit.mjs` dentro do escopo original do SL-122.
- Vermelho antes: rodei o comando específico do item do espelho sobre o estado anterior reaplicado (`b3536e521` + `2e674b5da`): `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → falhou em `ESTADO.md cita só âncoras reais, e cada âncora contém a própria edge`, com `AssertionError [ERR_ASSERTION]: âncora desatualizada: src/components/ai/ChurnPredictionDashboard.tsx:179 não cita ai-churn-analysis`; resumo `tests 11`, `pass 10`, `fail 1`.
- Observação do comando pedido: tentei executar literalmente `zapp-verify full .` antes da correção, mas a chamada da ferramenta estourou o limite de execução sem devolver log; por isso capturei o vermelho no mesmo item node apontado pela recusa. Depois da correção, `zapp-verify full .` rodou até o fim e ficou verde.
- Verde depois: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11`, `pass 11`, `fail 0`.
- Verificação completa depois: `zapp-verify full .` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `OK testes`, `OK build`, `VERIFY: VERDE SEM BANCO`.
- Verificação rápida exigida: `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO`.

Arquivos tocados (`git diff --name-only 616782983...HEAD`):
- `ESTADO.md` — documento de inventário de edges e âncoras corrigidas.
- `FEATURE_REGISTRY.md` — documento do pedido original restaurado junto do SL-122.
- `TESTING_CONVENTION.md` — documento do pedido original restaurado e alinhado à quarentena real.
- `scripts/ci/docs-estado-registry-convention.unit.mjs` — guarda executável que prova os três documentos.

Autorrevisão de escopo:
- `git diff --stat 616782983...HEAD` → 4 arquivos, todos do pedido original; sem arquivo fora do título.
- `git diff 616782983...HEAD | wc -c` → 51000 bytes, abaixo do limite de recusa por tamanho.
- `git diff --check 616782983...HEAD` → sem saída.
- Scan do diff por referência ao banco de produção → sem referência nova no diff.
- Não alterei DDL, Edge Function, dependência, fluxo de exportação/importação nem código de produto fora dos documentos/guarda do SL-122.
