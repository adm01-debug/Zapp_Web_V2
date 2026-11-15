# Dossiê — fix__f1a-lote-b-batch12 (branch `origin/fix/f1a-lote-b-batch12`, PR #2088)

- tip `ced1c1b497c8` · merge-base `9d65fed626e0` (2026-10-18) · 2 commits, 1 arquivo (`src/styles/utilities.css`, +218/-126).
- Triagem anterior (2026-11-08) dizia `JA_NA_MAIN` — confirmado aqui com evidência.

## Propósito
1. `29f850746 chore(fmt): prettier em utilities.css` — só reformatação (um-liner → bloco, aspas `"`→`'`, ordem de classes no `@apply`). Zero mudança de comportamento (`git diff -w` mostra só reflow).
2. `ced1c1b49 fix: área segura mobile (safe-area-*) e rolagem sem barra (scrollbar-none)` — cria as classes `.safe-area-top`, `.safe-area-bottom`, `.scrollbar-none` e `body { overscroll-behavior-y: none }` (cartão t_edd11f2d), que o `src/` já usava em ~15 pontos sem regra CSS.

## Arquivo × achado × evidência

| Arquivo | Hunk | Achado | Evidência |
|---|---|---|---|
| `src/styles/utilities.css` | regras `.safe-area-top/.safe-area-bottom/.scrollbar-none/body overscroll` | **JÁ NA MAIN** (texto diferente, mesma função) | `origin/main:src/styles/utilities.css:72-82` — bloco `@media (max-width: 767px) { .safe-area-top { padding-top: env(safe-area-inset-top, 0); } .safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 0); } .scrollbar-none { -ms-overflow-style: none; scrollbar-width: none; } .scrollbar-none::-webkit-scrollbar { display: none; } body { overscroll-behavior-y: none; } }`. Entrou em `4b9585052 (#2156)` (`git log -S'safe-area-inset-top' origin/main -- src/styles/utilities.css`). Protegido por teste `origin/main:src/styles/__tests__/mobileAreaSeguraRolagem.test.ts:132-175` (contrato: toda classe `safe-area-*`/`scrollbar-none` usada no `src/` tem definição; checa `env(safe-area-inset-*, 0)`, `display:none` no webkit e `overscroll-behavior-y` no body). `index.html:5` tem `viewport-fit=cover`. |
| `src/styles/utilities.css` | reformatação prettier (104 linhas "faltando" / 98 "removidas ainda na main") | **RUÍDO** (cosmético) | `git diff -w origin/main origin/fix/f1a-lote-b-batch12 -- src/styles/utilities.css` → só reflow de blocos, `"`→`'` em `[data-testid=...]` e reordenação de classes dentro de `@apply` (plugin tailwind). Nenhum workflow em `.github/workflows` roda `prettier --check` (grep sem resultado), logo não há CI que exija esse formato. Aplicar hoje = churn puro (AGENTS.md: zero churn). |

### Única diferença semântica (valor baixo)
Na branch, `.safe-area-top`/`.safe-area-bottom` ficam **fora** de `@media`, valendo em qualquer largura; na main ficam **dentro** de `@media (max-width: 767px)` (comentário da main: "Safe areas and touch scrolling on mobile"). Efeito prático: em telas ≥768px com área segura (iPad com indicador de home em modo PWA/fullscreen) a main não aplica padding; em celulares (o alvo do cartão) o resultado é idêntico. `env(..., 0)` cai para 0 onde não há inset, então a versão global não causaria respiro indevido. É escolha de escopo, não bug; não contradiz regra de negócio. Se o dono quiser cobrir tablets, basta mover as duas linhas para fora do `@media` em `src/styles/utilities.css:74-75` (main) — o teste da main continua passando (ele procura a regra em qualquer nível, `regras()` percorre `@media`).

## Veredito
**INCORPORADA.** O fix funcional (classes de área segura + rolagem sem barra + anti pull-to-refresh) está na main com teste de contrato; o resto da branch é prettier sem efeito. Nada a portar. Branch pode ser apagada (o hunk abaixo fica registrado para a nuance de escopo, caso alguém queira).

## Hunk de referência (branch, para a nuance de escopo em tablets)
```css
/* branch: fora de @media (global) */
.safe-area-top { padding-top: env(safe-area-inset-top, 0); }
.safe-area-bottom { padding-bottom: env(safe-area-inset-bottom, 0); }

@media (max-width: 767px) {
  .scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
  .scrollbar-none::-webkit-scrollbar { display: none; }
  body { overscroll-behavior-y: none; }
}
```

## Verificação adversarial

**Concordo: INCORPORADA. Branch pode ser apagada.** (verificado em 2026-11-15, `origin/main` = `e322d379`)

Tentei refutar a triagem procurando qualquer hunk útil da branch ausente da main. Não existe, e a prova é
exaustiva, não amostral:

1. **Comparação atômica (não por linha).** Normalizei os dois arquivos (comentários removidos, todo
   espaço removido, `'`→`"`) e quebrei em átomos CSS (seletores e declarações), comparando multiconjuntos:
   a diferença total entre `origin/main:src/styles/utilities.css` e
   `origin/fix/f1a-lote-b-batch12:src/styles/utilities.css` são **5 átomos em cada lado, e são os mesmos 5
   `@apply` com as classes em outra ordem**:
   `@apply text-3xl md:text-4xl font-bold tracking-tight` (main) ↔ `@apply text-3xl font-bold tracking-tight md:text-4xl` (branch),
   e o análogo em `.text-display-xl`, `.text-display-2xl`, `.text-heading`, `.text-subheading`.
   Sem efeito: as utilidades não conflitam entre si e a variante `md:` é emitida em `@media`, que continua
   depois da declaração base nas duas ordens. Isso derruba de vez os 104 "missing_in_main" e os 98
   "removed_still_in_main" do `line_check` — são reflow prettier (`.gradient-text`, `.scrollbar-thin`,
   `.elevation-*`, `.glow-*`, aspas em `[data-testid=…]`), nenhuma declaração nova.
2. **O fix funcional está na main, com o mesmo texto.** `origin/main:src/styles/utilities.css:72-82` tem
   `@media (max-width: 767px)` com `.safe-area-top { padding-top: env(safe-area-inset-top, 0) }`,
   `.safe-area-bottom`, `.scrollbar-none` (+`-ms-overflow-style`, `scrollbar-width`,
   `::-webkit-scrollbar { display: none }`) e `body { overscroll-behavior-y: none }`. Chegou em
   `4b9585052 (#2156)` (`git log -S'safe-area-inset-top' --oneline origin/main -- src/styles/utilities.css`).
   Conferi que o bloco é válido: a indentação de 2 espaços é resíduo cosmético de todo o arquivo
   (`.font-display` em coluna 0 já fecha com `}` indentado), não há aninhamento que anule as regras.
   Teste de contrato vivo em `origin/main:src/styles/__tests__/mobileAreaSeguraRolagem.test.ts:132-186`
   (exige as regras e que toda classe `safe-area-*`/`scrollbar-none` usada no `src/` tenha definição).
3. **A única diferença de escopo é de valor baixo, confirmada e não ≥ médio.** Na branch
   `.safe-area-top/.safe-area-bottom` ficam fora de `@media`; na main, dentro de `max-width: 767px`.
   `MOBILE_BREAKPOINT = 768` (`origin/main:src/hooks/ui/use-mobile.tsx:3`) casa exatamente com o
   `max-width: 767px`, e os consumidores (`MobileHeader.tsx:76`, `MobileDrawerMenu.tsx:182,313`,
   `mobile-components.tsx:31`, `ChatInputArea.tsx:231`, `ChatMessageInput.tsx:131`,
   `TeamChatInputArea.tsx:114`) só renderizam/aplicam a classe sob `isMobile`. Resta um caso:
   `NotificationsPanel.tsx:86` leva `safe-area-top` e também aparece em `md:` — ou seja, em iPad ≥768px
   em modo PWA a main não aplica o inset. É nuance de tablet, não bug de celular. Não justifica
   PERDIDA_PARCIAL.
4. **Nada de CI obriga o formato prettier.** `git grep -niE 'prettier|--check' origin/main -- .github/
   scripts/ci/` não traz nenhum `prettier --check`; `prettier` só aparece como devDependency
   (`package.json:133-134`) e `lint` é `node scripts/ci/lint-ratchet.mjs`. Aplicar a reformatação hoje
   seria churn puro (AGENTS.md).
5. **Apagar é seguro.** PR #2088 está `state=closed`, `merged=false`, `mergeable_state=dirty`, fechada em
   2026-11-01 — não há PR aberta presa a esta branch. Único arquivo tocado em todo o intervalo
   `9d65fed626e0..ced1c1b497c8`: `src/styles/utilities.css` (`git diff --stat`), sem migration, edge ou
   workflow.

Opcional (não é lacuna de resgate): se o dono quiser cobrir iPad em PWA, mover as 2 linhas
`.safe-area-top`/`.safe-area-bottom` para fora do `@media` em `src/styles/utilities.css:74-75` da main —
o teste de contrato continua passando (ele busca a regra em qualquer nível). NÃO VERIFICADO por execução:
não rodei a suíte de testes nesta verificação (análise foi estática, só leitura).
