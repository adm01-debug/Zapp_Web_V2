Especialista: senior (area-front-hooks; refazer-sem-diff-alheio)

## O que mudou e por quê
- `docs/talkx/ESTADOS.md`: apliquei o conteúdo regenerado pelo cherry-pick do commit recusado `0ff368cbb` sobre a ponta atual de `dia/2026-10-11`.
- `FEATURE_REGISTRY.md`: sincronizei o cabeçalho de base para `dia/2026-10-11`, mantendo a tabela com as 55 views calculadas a partir do `ViewRouter` atual.

## Pontos da recusa
- Ponto 1: parti do commit da entrega com `git cherry-pick 0ff368cbb`; o commit local final é o `HEAD` deste fechamento (sha informado no handoff do Kanban).
- Ponto 2: o item recusado do espelho (`node: FEATURE_REGISTRY.md lista exatamente as views do ViewRouter`) ficou verde. Prova específica: `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` retornou `tests 11`, `pass 11`, `fail 0`; a linha `FEATURE_REGISTRY.md lista exatamente as views do ViewRouter` passou. No espelho, rodei `/bin/bash --noprofile --norc /home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh . > .tmp/ci_espelho.out` e a checagem Python retornou `TARGET_PRESENT=False` para o alvo da recusa.
- Ponto 3: `zapp-verify . --rapido` retornou `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `VERIFY: VERDE SEM BANCO`.

## Arquivos alterados
```
FEATURE_REGISTRY.md
docs/talkx/ESTADOS.md
```

## Verificações executadas agora
- `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `tests 11`, `pass 11`, `fail 0`.
- `/bin/bash --noprofile --norc /home/joaquim_ataides/arquitetura-v2/integrador/ci_espelho.sh . > .tmp/ci_espelho.out` + checagem Python do alvo → `TARGET_PRESENT=False`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (15s)`.
- Autorrevisão de escopo: `git diff --name-only $(git merge-base HEAD dia/2026-10-11)...HEAD` lista `FEATURE_REGISTRY.md` e `docs/talkx/ESTADOS.md`; `git diff --stat` mostra `2 files changed, 69 insertions(+), 1 deletion(-)`.
