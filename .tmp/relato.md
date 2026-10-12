Especialista: worker (design) (design-system-zapp)

## O que mudou e por quê
- `src/styles/tokens.css`: removidos `--badge-new` e `--dash-tile-violet`; ficou um comentário que explica onde cada consumidor foi parar. `--dash-violet` **não** foi removido (ver "O que NÃO fiz").
- `src/styles/components.css`: a regra `.catalog-badge--new` (badge de "Novidade" do Catálogo) trocou o HSL cru `hsl(268 …)` por `hsl(var(--violeta) / 0.15)` + `hsl(var(--violeta-text))` — era o único violeta solto fora de token no Catálogo.
- `src/components/catalog/CatalogProductCard.tsx` e `ProductDetailDialog.tsx`: badge do Kit passou a `bg-violeta text-violeta-foreground`.
- `src/components/contacts/contactTypeConfig.tsx` (Fornecedor), `src/components/queues/queueColors.ts`, `src/components/team-chat/TeamConversationList.tsx`, `src/components/inbox/tabs/journey/JourneyStatsHero.tsx`, `src/components/omnichannel/OmnichannelManager.tsx`, `src/lib/journey/model.ts`: passaram a usar o par `--violeta`/`--violeta-text`.
- `src/components/dashboard/**` (DashboardCard, DashboardKpiCard, AIQuickAccess, ScheduledReportsManager, NowPanel, goalsStatus, IntegrationsHub): os tiles violeta sólidos passaram de `bg-dash-tile-violet`/`bg-dash-violet` + `text-white` para `bg-violeta` + `text-violeta-foreground`. Isso é obrigatório: `--violeta` clareia no tema escuro, então manter `text-white` reprovaria AA no escuro; `--violeta-foreground` é o par previsto pelo sistema (claro = branco, escuro = roxo escuro).
- `scripts/ia/ensaio-provisionamento.mjs`: referência ao token antigo trocada.
- Testes atualizados para as classes reais: `CT40_badgeTokens.test.tsx`, `DashboardCard.test.tsx`, `coresCruasInboxCrm.test.tsx`, `corCruaTokens.test.tsx`, `lib/journey/__tests__/model.test.ts`.

## Prova
- Novo contrato `tests/contracts/contraste-violeta-consolidada.contract.test.ts` (24 casos): lê a classe REAL de cada componente (ou a regra CSS real), resolve os tokens `--*` de `tokens.css` + `accessibility.css`, e mede WCAG 2.1 em **claro, escuro, claro+alto contraste e escuro+alto contraste**.
- Prova de mutação (vermelho → verde): troquei o par de texto da badge de Fornecedor por `--violeta-foreground` (o erro real de usar a cor de preenchimento como texto) → `AssertionError: expected 1.2988… to be greater than or equal to 4.5` (claro), `1.3114…` (escuro), `1.1524…` (escuro+alto contraste); restaurei o par `--violeta-text` → verde.
- Verde: `npx vitest run --config vitest.contracts.config.ts tests/contracts/contraste-violeta-consolidada.contract.test.ts` → `Test Files 1 passed (1); Tests 24 passed (24)`.
- Suítes afetadas: `npx vitest run src/components/dashboard src/components/integrations …` → `Test Files 102 passed (102); Tests 747 passed (747)`.
- `npm run typecheck` → `tsc -b --force` sem erro.

## O que NÃO fiz e por quê
- **`--dash-violet` ficou em `tokens.css`** (e o mapeamento `violet`/`tile-violet` no `tailwind.config.ts`). Único consumidor restante é o módulo **Talk X**, que tem cartão próprio (`t_6ea4e0f2`, já concluído, branch `d9fcb0114` na fila do integrador) e remove os usos dele. O passo 3 do cartão é condicional ("remover depois que nenhum lugar mais as usar") e, nesta base, o Talk X ainda as usa — apagar agora quebraria o Talk X no tema escuro. Depois da integração do Talk X, sobra só apagar a variável + os 2 mapeamentos.
- `--kpi-tile-purple` não foi tocado: é 258° (roxo de tile de KPI) e não estava na lista do cartão.
- Nenhuma captura nem arquivo gerado; diff só de texto.
