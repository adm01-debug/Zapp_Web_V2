# Dossiê — `ci/cors-zappweb-app-br`

**Veredito:** SUPERADA  
**Confiança:** ALTA  
**Tip SHA:** `0038a3348f1c025077cd5536a8de6c224afca744`  
**Analisado em:** 2026-10-23

## Evidências

- `git merge-base origin/ci/cors-zappweb-app-br origin/main` → `bb62612a1` (base comum existe)
- `git diff bb62612a1..origin/ci/cors-zappweb-app-br --stat` → 4 arquivos
- `git diff origin/ci/cors-zappweb-app-br..origin/main -- docs/deploy.md` → 0 linhas exclusivas da branch (main é superconjunto de deploy.md)
- `grep "zappweb.app.br" supabase/functions/_shared/cors.ts` → URL presente em main (CORS para o domínio canônico já incluída)

## Conclusão

Adicionou CORS para `zappweb.app.br` nas edge functions. Conteúdo absorvido pela main (main é superconjunto). Pode ser deletada com segurança.
