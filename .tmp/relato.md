Especialista: Íris (area-front-componentes)

## Motivo do retomar (conflito) e como resolvi
Conferi no código ATUAL da ponta de dia/2026-10-12 se o defeito do pedido ainda existia.
Já NÃO existe: a própria entrega anterior já está integrada na ponta. O commit com o título
idêntico está na base do meu workspace.

Prova (git log do arquivo):
- `git log --oneline -5 -- src/components/settings/SettingsView.tsx`
  → `656284628 feat(settings): agrupa abas de Configurações em dois níveis (categoria + abas)`
- `git rev-parse HEAD` e `git merge-base HEAD dia/2026-10-12` → ambos `96dd72dc5` (base = ponta do dia)
- `git show HEAD:src/components/settings/SettingsView.tsx | grep -n TAB_GROUPS` → `68:const TAB_GROUPS ...`
  (a navegação em dois níveis já está no arquivo da ponta)

O único delta entre a branch antiga e a ponta atual é uma troca de token de tema já aplicada
pela ponta (`bg-whatsapp` → `bg-primary`), que não pertence a este cartão e foi preservada:
- `git diff v2/settingsview-agrupar-15-abas-2610101751a09c HEAD -- src/components/settings/SettingsView.tsx`
  → só a linha do botão Salvar (`bg-whatsapp` → `bg-primary`).

Como o defeito já está resolvido no código atual, fecho SEM commit de código (diff vazio), conforme
o cartão manda.

## O que mudou e por quê
Nada. Nenhum arquivo tocado — a correção pedida já entrou na ponta de dia/2026-10-12 pelo commit
`656284628`.

## Prova do critério de pronto no código da ponta
1. Abas em grupos lógicos, sem scroll horizontal: `SettingsView.tsx` monta `TAB_GROUPS` (5 grupos:
   Atendimento, Inteligência artificial, Qualidade, Aparência, Sistema) numa `<nav>` com
   `flex flex-wrap` (nível 1) e um `<TabsList>` com `flex flex-wrap h-auto ... gap-1` (nível 2).
   Não há mais `overflow-x`, fade nem seta pulsante na barra.
2. Nenhuma aba perdida: 16 entradas em `TABS_META` (12 staff-only + 4 pessoais), todas presentes
   em algum grupo de `TAB_GROUPS`.
3. Teste da área (verde, executado agora):
   `npx vitest run src/components/settings/__tests__/SettingsView.test.tsx`
   → `Test Files  1 passed (1); Tests  9 passed (9)`
   Os 9 casos cobrem o guard RBAC das 12 abas staff-only, o min-h 44px no celular e o agrupamento
   em dois níveis (5 grupos, 16 abas sem órfã/duplicata, troca de grupo).

## O que NÃO fiz e por quê
- Não usei cherry-pick: o conteúdo do commit antigo (`5534b8e93` / branch
  `v2/settingsview-agrupar-15-abas-2610101751a09c`) já está presente na ponta; trazê-lo de novo
  duplicaria histórico sem mudar arquivo.
- Não criei commit de código nem teste novo: o cartão manda fechar sem commit quando o defeito já
  está corrigido, e o teste que prova o comportamento já existe na ponta.
