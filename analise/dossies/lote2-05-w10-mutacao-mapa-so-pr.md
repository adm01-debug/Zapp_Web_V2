# Dossiê — `claude/w10-mutacao-mapa-so-pr`

**Veredito:** SUPERADA  
**Confiança:** ALTA  
**Tip SHA:** `a2e1c193963448ec649faeb6f997fb95e0abb779`  
**Analisado em:** 2026-10-23

## Evidências

- `git merge-base origin/claude/w10-mutacao-mapa-so-pr origin/main` → `95f6ad07f` (base comum existe)
- `git diff 95f6ad07f..origin/claude/w10-mutacao-mapa-so-pr --stat` → 1 arquivo: `.github/workflows/ci.yml`
- Conteúdo do branch: adiciona `if: github.event_name == 'pull_request'` ao job `mutation-mapa` no `ci.yml`
- `grep -n "mutation-mapa" .github/workflows/ci.yml` → job presente em main
- `grep -n "github.event_name == 'pull_request'" .github/workflows/ci.yml` → condição presente em main (confirmado em main atual)

## Conclusão

Guard `if: github.event_name == 'pull_request'` para o job `mutation-mapa` está presente na main atual. Conteúdo absorvido. Pode ser deletada com segurança.
