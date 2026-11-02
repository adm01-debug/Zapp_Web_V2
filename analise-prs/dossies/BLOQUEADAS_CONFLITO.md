# Dossiers das 6 PRs com Conflito

## PR #2526 — dirty após main avançar
**Veredito:** BLOQUEADO_CONFLITO  
Conflito após push de merges successivos na main. Auto_merge ativo mas não pôde executar.

## PR #2533 — chore: migration reconciliation 20261030145126
**Veredito:** BLOQUEADO_CONFLITO  
Migration de reconciliação ficou dirty após main avançar. Precisaria ser rebaseada.

## PR #2536 — supersedido por #2560
**Veredito:** BLOQUEADO_CONFLITO  
PR #2560 (`fix(e2e): workers 1→2`) mergeou o mesmo fix. #2536 é agora obsoleta.

## PR #2542 — fix: N-008 DB Guard
**Veredito:** BLOQUEADO_CONFLITO  
Dirty após main avançar. Precisaria ser atualizada contra main atual.

## PR #2563 — dirty após #2567 mergear o mesmo fix
**Veredito:** BLOQUEADO_CONFLITO  
PR #2567 (`fix(ci): deno install --frozen=false`) já mergeou o fix. #2563 é obsoleta.

## PR #2571 — dirty + auto_merge ativo com conflito pendente
**Veredito:** BLOQUEADO_CONFLITO  
Auto_merge estava ativo mas havia conflito pendente. Não resolvível sem intervenção.
