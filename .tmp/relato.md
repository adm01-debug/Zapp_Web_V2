Especialista: complexo (area-front-hooks)

## O que mudou e por quê
- `src/components/keyboard/GlobalKeyboardProvider.tsx`: dono único do atalho — `global-search` alterna a paleta única e `open-global-search` abre a mesma paleta (antes só disparava a paleta antiga).
- `src/components/CommandPalette.tsx`: REMOVIDO — segunda paleta com ouvinte próprio de ⌘/Ctrl+K (o defeito: dois donos do atalho).
- `src/pages/Index.tsx`: removida a montagem duplicada da paleta antiga.
- `src/hooks/integrations/useModuleCommandItems.ts` (novo): módulos do NavigationService, filtrados por papel via filterNavItems, viram comandos `module-<id>` com ação `onNavigate(id)` (navegação sem abrir o módulo).
- `src/components/keyboard/CommandPaletteHost.tsx`: injeta os módulos como `navigationCommands` da paleta única.
- `src/components/ui/command-palette.tsx`: nova prop opcional `navigationCommands` (padrão mantém a lista antiga; outros usos não mudam).
- `src/hooks/integrations/useTalkXCommandItems.ts`: campanha grava `?campaign=<id>`; segmento/template levam à aba deles e só então navegam ao módulo (com `popstate` se já estiver no Talk X).
- Testes: `src/components/keyboard/__tests__/paleta-unica.test.tsx` (novo, 6 casos); ajustados `MobileShellSearch.test.tsx` (usa a paleta única), `idsMortosNaNavegacao.test.tsx` (saiu o bloco da paleta antiga), `Index.keyboard-dashboard-view.test.tsx` e `command-palette-acoes.test.tsx`.

## Prova
- vermelho antes (executor, sem o ouvinte `open-global-search` e sem a injeção de módulos): `npx vitest run src/components/keyboard/__tests__/paleta-unica.test.tsx` → `5 failed | 1 passed`.
- verde depois (medi por mim): mesmo comando → `Test Files 1 passed (1)` / `Tests 6 passed (6)`.
- regressão (medi por mim): `npx vitest run` nos 4 arquivos ajustados → `Test Files 4 passed (4)` / `Tests 16 passed (16)`.
- verificação (medi por mim): `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (70s)` (tipos, lint, migrations OK; banco não se aplica — sem migration).

## O que NÃO fiz e por quê
- Campo de busca em `TalkXView.tsx`/`kit/dialogs.tsx`, consulta própria com limite 50 e 3 grupos de até 8: as 2 tentativas worker provaram que não há ponto de costura (linhas citadas não existem); a entrada do Jev recortou o cartão para a unificação em paleta única, que é o que a lacuna X054 exige. Nada nesses arquivos foi tocado.
- `e2e/talkx.spec.ts`: não criado; a prova é o teste de integração novo, que compõe provider, host e NavigationService reais.
- Perda visível honesta: o grupo "Recentes" da paleta antiga (`zapp-recent-modules`) deixou de existir; a paleta única não guarda recentes.
- `segment=`/`template=` na URL ainda sem consumidor para abrir o item individual (aba certa abre; item individual, não).
- Commit `12744c1f6`; sem banco, Edge, migration, dependência, produção, push ou PR.
