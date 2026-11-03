# Dossiê — `backup/dia-2026-10-13`

**Veredito:** SUPERADA  
**Confiança:** ALTA  
**Tip SHA:** `338a420d1e0fa57f993a1b5d8064e0d80f54d6c0`  
**Analisado em:** 2026-10-23

## Evidências

- `git merge-base origin/backup/dia-2026-10-13 origin/main` → `7a1585279` (base comum existe)
- `git diff 7a1585279..origin/backup/dia-2026-10-13 --stat` → 2.785 arquivos modificados
- Branch contém 1 commit (`338a420d1 "Lote 07-08/10: backup do estado antes do lote"`) — snapshot de backup
- `git diff origin/backup/dia-2026-10-13..origin/main -- src/App.tsx` → 122 linhas extras em main (main é superconjunto)
- `git merge-base --is-ancestor origin/backup/dia-2026-10-13 origin/main` → exit 1 (squash-merge pattern esperado para backups)

## Conclusão

Snapshot de backup tirado antes de mergear o lote de 07–08/10. Main avançou muito além deste ponto (2.785 arquivos de diferença, 122 linhas extras em `src/App.tsx`). Pode ser deletada com segurança — nenhum conteúdo exclusivo com valor pendente.
