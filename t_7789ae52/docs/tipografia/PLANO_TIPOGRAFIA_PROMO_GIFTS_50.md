# Tipografia do Zapp Web V2 igual à do Promo_Gifts_V4 — plano em 50 etapas

Branch: `feat/tipografia-promo-gifts` (base `origin/main@57ee3f86`) · Referência: `Promo_Gifts_V4@8a45ce6`
Worktree isolado: `/workspace/repos/Zapp_Web_V2-fontes` (não toca o worktree do outro agente)

Legenda: ✅ feito · 🟡 pendente · ⛔ avaliado e não aplicado (motivo na linha)

## Diagnóstico em uma frase

As **famílias já são as mesmas** nos dois projetos (Plus Jakarta Sans no texto, Outfit nos títulos, mono padrão do Tailwind).
A diferença visível está no **peso e no espaçamento entre letras no modo escuro**: o Promo tem uma camada que o Zapp não tem.

| Medição renderizada (Chromium, `/auth`, dark) | Zapp `main` | Zapp esta branch | Promo Gifts V4 |
|---|---|---|---|
| body | Jakarta 500 · −0,24px | Jakarta 450 · +0,16px | Jakarta 450 · +0,16px |
| pesos usados no texto | 500 / 600 / 700 | 450 / 550 / 650 / 800 | 400 / 450 / 550 / 650 / 800 |
| famílias | Jakarta · Outfit · ui-monospace | idem | Jakarta · Outfit |
| light mode (Zapp) | 500 · −0,24px | 500 · −0,24px (inalterado) | — (Promo é sempre dark) |

## F0 — Isolamento do trabalho concorrente

1. ✅ Worktree principal `/workspace/repos/Zapp_Web_V2` está em `feat/catalog-f4-e41-cards` com alterações não commitadas → não é tocado.
2. ✅ Worktrees do outro agente (`-coluna`, `-fix`, `-inbox`, `-painel`) conferidos com `git diff origin/main...<branch>`: nenhum altera `index.html`, `tailwind.config.ts`, `src/index.css` ou `src/styles/*`.
3. ✅ O redesign da inbox (`redesign/inbox-fidelidade-carvao`) documenta "Plus Jakarta Sans / Outfit já configuradas — não mudar" → famílias ficam intactas.
4. ✅ Branch `feat/tipografia-promo-gifts` criada em worktree próprio a partir de `origin/main@57ee3f86`.
5. ✅ `node_modules` por symlink (lockfile idêntico ao `main`); nada instalado no repo.
6. ✅ Clone raso do Promo_Gifts_V4 em `/tmp/pg4` como referência somente leitura.

## F1 — Referência: Promo_Gifts_V4

7. ✅ Tokens: `--font-sans: 'Plus Jakarta Sans'` e `--font-display: 'Outfit'` (`src/index.css:195-196`, `src/lib/theme-presets.ts:952-953`).
8. ✅ Carregamento: Google Fonts CSS2 — Outfit 400·500·600·700·800 e Jakarta 300·400·500·600·700, `display=optional` (`index.html`).
9. ✅ Tailwind: `fontFamily.sans/display` via variável; `mono` sem override (stack padrão do Tailwind).
10. ✅ Títulos h1–h6 em Outfit; utilitários `.text-display*` e `.font-action-button`.
11. ✅ Camada de peso (`src/index.css:519-561`): `body` 500/−0,015em; `.dark body` 450/+0,01em; `.dark p,span,label,td,th,li` 450; `.dark .text-muted-foreground` 450; `.dark .font-medium` 550; `.dark .font-semibold` 650; `.dark .font-bold` 800/−0,01em. O app força `class="dark"` no `<html>`.
12. ✅ Fontes fora da UI principal: Playfair/DM Serif/Great Vibes/Inter via @fontsource só em `/magazine`; Montserrat/Roboto só no PDF de proposta → fora do escopo.
13. ✅ Glifos: o woff2 servido do Plus Jakarta Sans não tem `cv02/cv03/cv04/cv11` (GSUB: calt, ccmp, dnom, frac, liga, numr, pnum, tnum) — conferido com fontkit.

## F2 — Estado atual do Zapp

14. ✅ Famílias já idênticas: `src/styles/tokens.css:49-50`, `src/index.css:26`, `tailwind.config.ts:16-19`.
15. ✅ Carregamento: Jakarta 400–700 e Outfit 500–800, `display=swap` → faltam Jakarta 300 e Outfit 400.
16. ✅ CSP (`vercel.json:28`) libera `fonts.googleapis.com` e `fonts.gstatic.com`; fontes carregam em produção (confirmado no Chromium).
17. ✅ `body` (`src/styles/base.css:21-30`): 500, −0,015em, `font-feature-settings` cv02–cv11 (resquício do Inter, sem efeito no Jakarta), `optimizeLegibility`.
18. ✅ Não existe camada de peso para o dark → é a diferença visual principal.
19. ✅ `base.css` não está em `@layer`: sai antes do preflight no bundle, então o preflight anula `font-size/font-weight` de h1–h6 e a família de `code/pre` (offsets no CSS do build: 13825 vs 47804).
20. ✅ Mono: `code/pre` já renderizam com o stack mono do Tailwind (igual ao Promo) via preflight; `.text-code` (JetBrains Mono) tem 0 usos.
21. ✅ A escala de tamanhos do Zapp (`tailwind.config.ts:31-44`) embute tracking por tamanho (xs/sm +0,01em, lg/xl −0,01em, 2xl+ −0,02 a −0,05em); o Promo usa a escala padrão, sem tracking.

## F3 — Decisões

22. ✅ Não trocar famílias: já são as do Promo.
23. ✅ Títulos: 244 de 249 tags h1–h5 já têm classe de peso explícita → portar as regras de título do Promo afetaria 5 tags. Não aplicado.
24. ✅ Especificidade: `.dark span` (0,1,1) vence `.font-extrabold` (0,1,0); no Promo, extrabold/black dentro de span caem para 450. No Zapp há 1 caso (`src/components/inbox/ai-tools/SentimentTab.tsx:34`, `font-black`) → guarda necessária.
25. ✅ Regra de porte: a camada pode subir pesos (como no Promo), nunca rebaixar uma classe explícita.
26. ✅ Manter `display=swap`: com `optional`, um primeiro acesso lento deixa a sessão inteira na fonte do sistema — o oposto do objetivo.

## F4 — Implementação

27. ✅ `index.html`: pedir Jakarta 300·400·500·600·700 e Outfit 400·500·600·700·800 (preload + stylesheet). Faces só baixam quando usadas.
28. ✅ `src/styles/base.css`: `.dark body` 450 / +0,01em.
29. ✅ `.dark p, span, label, td, th, li, .text-muted-foreground` 450 — sem a cor quente do Promo; o Zapp mantém a paleta dele.
30. ✅ `.dark .font-medium` 550 · `.dark .font-semibold` 650 · `.dark .font-bold` 800/−0,01em, na mesma ordem do Promo (muted antes dos pesos, para classe explícita vencer).
31. ✅ Guardas `.dark .font-extrabold` 800 e `.dark .font-black` 900.
32. ⛔ `:root .font-bold` 850: é código morto no Promo (sempre dark, `.dark .font-bold` vence) e só mudaria o light do Zapp.
33. ⛔ `line-height: 1.6` do body, cor `hsl(24 10% 98%)`, links com peso 800: não é fonte; mexe em layout e paleta.
34. ⛔ Escala de títulos do Promo (h1 até `text-6xl`): quebraria cabeçalhos densos do CRM.
35. ⛔ Remover `font-feature-settings` cv* e trocar JetBrains na `.text-code`: zero efeito visual → churn.
36. ⛔ Arquivo CSS novo / import extra: o bloco cabe na seção de tipografia do `base.css`; menos arquivos para conflitar.

## F5 — Mapeamento de faces

37. ✅ Pesos intermediários resolvem pela regra de matching do CSS para faces carregadas: 450→500, 550→600, 650→700, 800→700 (Jakarta) / 800 (Outfit). Mesmas faces do Promo → mesmo resultado.
38. ✅ Nenhuma face nova além de Jakarta 300 e Outfit 400.
39. 🟡 Opcional: remover o `letterSpacing` da escala de tamanhos do Zapp (etapa 21) para tracking 100% igual ao Promo em `text-base`/`lg`/`xl`/`2xl+`. Afeta light e dark — decisão sua.

## F6 — Validação

40. ✅ `vite build` do `main` (baseline) e da branch: ambos `exit=0`.
41. ✅ Bloco presente no CSS final (`.dark body{letter-spacing:.01em;font-weight:450}…`) e URLs de fonte com os novos pesos.
42. ✅ Chromium headless, `/auth` em dark: body 450/+0,16px — igual ao Promo em produção (tabela acima).
43. ✅ Light mode inalterado: body 500/−0,24px e pesos 500/600/700, idênticos ao `main`.
44. ✅ Regressão de layout em `/auth` (1440px e 390px): 0 mudanças de quebra de linha, 0 overflow, altura do documento igual; maior variação de largura 12px.
45. 🟡 Conferir no preview da Vercel as telas densas logadas: Inbox, Talk X (Campanhas), Catálogo, Configurações.
46. 🟡 CI verde no PR.

## F7 — Entrega

47. ✅ Commits separados e reversíveis: pesos carregados (`index.html`) · camada dark (`base.css`) · este plano.
48. ✅ PR em rascunho contra `main`, sem auto-merge.
49. 🟡 Antes do merge: rebase em `main` (o outro agente mergeia com frequência); nenhum branch dele toca estes arquivos hoje.
50. 🟡 Merge só com seu `APROVADO`. Rollback = revert do commit da camada dark (1 arquivo).
