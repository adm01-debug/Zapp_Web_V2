# Dossiê — `backup/dia-2026-10-14`

**Veredito:** SUPERADA  
**Confiança:** ALTA  
**Tip SHA:** `f5885801b111986d8f36c1c163b0e54bbe020ab1`  
**Analisado em:** 2026-10-23

## Evidências

- `git merge-base origin/backup/dia-2026-10-14 origin/main` → `7a1585279` (base comum existe)
- `git diff 7a1585279..origin/backup/dia-2026-10-14 --stat` → 3.184 arquivos modificados
- Branch contém 1 commit — snapshot de backup (padrão `backup/dia-*`)
- `git diff origin/backup/dia-2026-10-14..origin/main -- src/App.tsx` → 108 linhas extras em main (main é superconjunto)
- `git merge-base --is-ancestor origin/backup/dia-2026-10-14 origin/main` → exit 1 (squash-merge pattern esperado)

## Conclusão

Snapshot de backup tirado antes do lote de 14/10. Main avançou além deste ponto (3.184 arquivos de diferença, 108 linhas extras em `src/App.tsx`). Pode ser deletada com segurança.
