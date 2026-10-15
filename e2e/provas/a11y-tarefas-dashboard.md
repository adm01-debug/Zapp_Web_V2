# Prova — régua axe de Tarefas / Quadro / Dashboard (N-079)

Comando (dev server próprio na porta 5399, para não reusar o dev server de outro workspace que ocupa 5173):

    PLAYWRIGHT_BASE_URL=http://127.0.0.1:5399 npx playwright test e2e/a11y-tarefas-dashboard.spec.ts --project=chromium-a11y

## Vermelho antes (sem os `aria-label` de ModeSwitcher e OnboardingChecklist; resto igual)

    "id": "button-name"                 (.tmp/vermelho.log:109)  ?view=tasks mobile
    "id": "aria-progressbar-name"       (.tmp/vermelho.log:192)  ?view=dashboard mobile
    "id": "button-name"                 (.tmp/vermelho.log:221)  ?view=dashboard mobile
    "id": "aria-progressbar-name"       (.tmp/vermelho.log:270)  ?view=dashboard desktop
    "id": "button-name"                 (.tmp/vermelho.log:299)  ?view=dashboard desktop
      3 failed
      1 passed (38.2s)

O `1 passed` é `?view=tasks` em desktop: nesse viewport o texto do ModeSwitcher (`.hidden sm:inline`)
fica visível e nomeia os botões; os 3 casos que falham são os que dependem dos `aria-label` corrigidos
(recorte mobile do switcher + checklist presente no dashboard).

## Verde depois (com as correções)

      4 passed (41.7s)     (.tmp/verde_final.log:100)

Logs completos desta prova (força-adicionados, o `.tmp` é ignorado pelo git): `.tmp/vermelho.log`,
`.tmp/verde_final.log`, `.tmp/verify4.log`.
