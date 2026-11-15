# Dossiê — claude_pink__pensive-keller-kjgdal (PR #2900)

- Ref: `origin/claude_pink/pensive-keller-kjgdal` · tip `e835093` · merge-base `49af49e` (2026-11-09)
- Commits: `b8ecf54a5 fix: adiciona \\ ao replace de sanitização regex (CodeQL js/incomplete-sanitization #64-65)` + merge de main.
- Diff: 1 arquivo, 1 linha (`scripts/ai-context/gerar.mjs` L393).

## Propósito
Corrigir alerta CodeQL js/incomplete-sanitization (#64/#65): o sanitizador `expr.replace(/[.$]/g, '\\$&')` usado para montar `new RegExp(...)` no bloco de menu/papéis não escapava `\`. A branch troca para `/[.$\\]/g` (2 ocorrências na mesma linha).

## Arquivo × achado × evidência

| Arquivo | Achado | Evidência |
|---|---|---|
| `scripts/ai-context/gerar.mjs` | INCORPORADA por superset | `origin/main:scripts/ai-context/gerar.mjs:413` usa `expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')` nas 2 ocorrências — escapa `\` e todos os demais metacaracteres de regex (inclui o `.$\` da branch). Commit `861877059` (2026-11-09, "fix(contexto): escapa backslash no sanitizador de regex do gerador de contexto"), corpo cita o mesmo CodeQL #64/#65; também alterou `scripts/ai-context/gerar.unit.mjs` (+34, teste do sanitizador) e `scripts/regras_negocio/generate.py` (mesmo fix). |

A linha `missing_in_main` apontada pela checagem mecânica difere apenas porque a main adotou a classe de caracteres mais ampla; o comportamento pretendido (escape de `\`) está contido.

## Veredito
**INCORPORADA** (confiança alta). Nada a recuperar. `apagar_branch_seguro = true`.

## Verificação adversarial

Papel: refutar o veredito INCORPORADA. **Não foi possível refutar — concordo.**

Tentativas de refutação e resultado:

1. **Procurar qualquer hunk da branch ausente na main.** `git diff 49af49e origin/claude_pink/pensive-keller-kjgdal` devolve exatamente 1 arquivo / 1 linha (`scripts/ai-context/gerar.mjs`, linha 393 na branch): `/[.$]/g` → `/[.$\\]/g`, duas ocorrências na mesma linha. Os 2 commits da branch são `b8ecf54a5` (o fix) + `e83509308` (merge de main) — não há segundo hunk candidato.
2. **Confirmar que a substituição na main cobre a necessidade (abri o arquivo da main na linha citada).** `git show origin/main:scripts/ai-context/gerar.mjs` linha **413** usa, nas mesmas duas ocorrências: `expr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`. O conjunto de escape da branch `{. $ \}` é subconjunto estrito do da main `{. * + ? ^ $ { } ( ) | [ ] \}` — o `\` que o CodeQL apontava está escapado. **Superset confirmado, não equivalência frágil.**
3. **Verificar se sobrou alguma ocorrência não corrigida na main** (fix parcial seria lacuna real): `git show origin/main:scripts/ai-context/gerar.mjs | grep -nF '/[.$]/'` → **zero ocorrências**. O mesmo padrão em outros pontos do arquivo (linhas 547 e demais) já usa a classe ampla; `scripts/regras_negocio/generate.py` na main usa `re.escape(...)` em todos os pontos equivalentes (linhas 297, 527, 804, 1335, 1340, 2024), que é o escape completo do Python.
4. **Verificar se o fix da main não foi revertido depois.** O fix está presente no `origin/main` atual (leitura direta acima), não só no histórico. Commit `861877059b4507db3946bc9c34bb010609a7b5c2` (2026-11-09, "fix(contexto): escapa backslash no sanitizador de regex do gerador de contexto"), cujo corpo cita o mesmo `CodeQL js/incomplete-sanitization (#64/#65)`.

Ressalva sem impacto no veredito (anotada para não virar falsa prova): o commit da main também alterou `gerar.unit.mjs` (+34), mas os dois testes adicionados cobrem `stripComments` com `//` dentro de string e workflow com CRLF — **não** há teste unitário do sanitizador de regex. A afirmação do dossiê de que a main traz "teste unitário" do sanitizador é imprecisa; isso não cria lacuna atribuível a esta branch (ela também não trazia teste), apenas não deve ser citada como evidência.

Veredito final: **INCORPORADA**. `apagar_branch_seguro = true` (apagar a branch fecha a PR #2900, cujo tip é o mesmo `e835093`; sem conteúdo a perder).
