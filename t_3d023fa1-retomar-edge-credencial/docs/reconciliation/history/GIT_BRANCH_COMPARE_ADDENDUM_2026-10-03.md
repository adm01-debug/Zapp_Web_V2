# Branch Compare Addendum — 2026-10-03

Compare realizado contra main `2e7cf81c...` para as 11 branches que tinham pelo menos uma PR mergeada mas ainda permanecem remotas.

## Resultado crítico
A hipótese "PR mergeada ⇒ branch pode ser apagada" é falsa neste repo.

Somente duas das 11 ficaram **ahead=0**:
- `claude/friendly-mccarthy-g4xd5z` — behind 248, ahead 0.
- `hermes/tarefas-b4-concluidas-7d-26093006501293` — behind 603, ahead 0.

Estas são candidatas DELETE-A para **branch remota**, sujeitas apenas à checagem final de PR/worktree local antes da limpeza.

As outras 9 têm commits exclusivos após/divergentes da main:
- confident-babbage: ahead 37 — enorme conjunto Team Chat + migrations; PRESERVAR.
- fix-ci-types-sync-husky-e2e: ahead 1.
- fix-db-live-guard-drift: ahead 11.
- fix-db-live-guard-missing-migrations: ahead 2.
- fix-gamification-guard-xp-cap: ahead 1.
- fix-multiplix-send-auth: ahead 1.
- acl-default-privileges: ahead 1.
- l5-followup: ahead 1.
- plano-volume-finalizacao: ahead 1.

Classificação dessas nove: STALE_WITH_VALUE / DELETE-D até reconciliar os commits exclusivos. Não apagar.

## Achado de alto impacto
`claude/confident-babbage-ivgmmn` contém 37 commits ahead e dezenas de arquivos Team Chat/migrations não presentes da mesma forma na main. A auditoria histórica já alertava que parte desse trabalho era perigosa/errada. A branch deve ser tratada como **evidence quarantine**, não como implementação a mergear nem lixo a apagar.

## Regra nova
Branch cleanup automatizado só pode considerar SAFE_TO_DELETE quando `ahead_by == 0` contra main e não houver PR aberta/worktree ativo. Ter PR mergeada é insuficiente.
