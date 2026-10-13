## Verificação (linhas cruas)

- `zapp-verify . --rapido` → `OK db_guard 0s` | `OK tipos 126s` | `OK lint 5s` | `OK migrations 1s` | `VERIFY: VERDE SEM BANCO (132s)`
- `npx vitest run src/components/inbox/contact-details/__tests__/SlaTimelineSection.test.tsx` → `Test Files  1 passed (1)` | `Tests  13 passed (13)`
- `.tmp/mutantes.sh` → 6 defeitos plantados, 6 pegos (`MUTANTE PEGO` ×6) e `Test Files 1 passed, Tests 13 passed` na árvore restaurada
- `git status --short` → vazio

## Pontos do revisor (corrigir)

**Ponto 1: a seção não estava provada DENTRO do acordeão persistido.** O teste antigo
embrulhava `SlaTimelineSection` num `Accordion` próprio, o que não mostra se ela vive no
acordeão que salva estado. Agora existe um teste que renderiza o `ContactDetails` real
(`src/components/inbox/ContactDetails.tsx`), clica no gatilho da seção, lê
`contact-sidebar-accordion-state@v2` no `localStorage` (contém `sla-timeline`), desmonta e
REMONTA, e exige a seção aberta (`aria-expanded="true"`). O mutante
`persistencia do acordeao` (gravar vira no-op em `sidebarSections.ts`) derruba o teste.

**Ponto 2: o trilho tinha cor fixa.** Em `SlaTimelineSection.tsx` a linha passou de um
`DrawLine` único para um trecho por intervalo, pintado pela SITUAÇÃO do marco acima:
`ok`→`success`, `warning`→`warning`, `breached`→`destructive`, `na`→`--muted-foreground`
(neutro). O teste lê o `path` renderizado de cada trecho (`sla-rail-<id>` com
`data-status`) e exige a classe de token certa. Mutantes `trecho ok com tom errado` e
`trecho neutro sem token neutro` derrubam o teste. Contraste dos 4 pares, nos dois temas,
em "Notas para Reviewer".

**Ponto 3: teclado incompleto no grupo de tipos.** Em `SlaTimelineSection.tsx` o grupo
ganhou roving tabindex (←/→/↑/↓ e Home/End movem o foco; Enter/Espaço acionam o chip
focado; um único chip na ordem do Tab) e Esc limpa os filtros — tudo em `onKeyDown` do
próprio elemento, sem listener global, logo nada para remover no unmount. O teste usa
`fireEvent.keyDown`, confere `document.activeElement` e `aria-pressed`. Mutantes
`sem roving tabindex` e `sem Esc limpando filtros` derrubam o teste.

**Ponto 4: faltavam o estado de carregamento e a garantia de movimento reduzido.** Um
teste congela a leitura de `sla_rules` (promessa pendente no mock) e exige
`sla-timeline-loading` com `shimmer-skeleton` e nenhuma lista; outro liga
`useReducedMotion` e exige `data-motion="reduced"` nos itens e nos trechos, com o item da
lista sem deslocamento inicial (sem `translateY`). O mutante `sem estado de carregamento`
derruba o teste.

**Ponto 5: relato desalinhado com o histórico.** Esta branch nasce de `dia/2026-10-13`
(`BASE` impresso pelo `hermes-tarefa-iniciar`); o relato anterior é que dizia
`dia/2026-10-11`. Este relato registra a base correta, a cor de cada trecho do trilho
(`SlaTimelineSection.tsx`, mapa `RAIL_TONE`) e a montagem dentro do acordeão persistido.

## Descrição

A seção "Linha do tempo de SLA" do painel do contato foi entregue no commit anterior desta
branch. Causa raiz de cada correção: (1) o teste provava a persistência num `Accordion`
próprio, escondendo se a seção vive no acordeão que realmente salva estado — agora um
teste renderiza o `ContactDetails` real e prova que abrir a seção grava `sla-timeline` no
`localStorage` e que remontar reabre; (2) a linha que liga os marcos era um `DrawLine`
único de cor fixa — agora é um trecho por intervalo, pintado pela SITUAÇÃO do marco
acima, com neutro no marco sem prazo; (3) o grupo de filtros por tipo não tinha teclado —
agora tem roving tabindex e Esc limpando filtros, no próprio elemento (nenhum listener
global); (4) faltavam a prova do estado de carregamento e a garantia de que, com movimento
reduzido, os itens da lista não se deslocam.

## Tipo de Mudança

- [x] 🐛 Bug fix (correção de bug)
- [ ] ✨ Nova feature (funcionalidade nova)
- [ ] 💥 Breaking change (mudança que quebra compatibilidade)
- [ ] 📚 Documentação
- [x] 🎨 Estilo/UI
- [ ] ♻️ Refatoração
- [ ] ⚡ Performance
- [x] ✅ Testes
- [ ] 🔧 DevOps/CI
- [ ] 🔒 Segurança

## Plano

- Plano do Claude: PLANO_SIDEBAR_CONTATO_3_SECOES_100_ETAPAS_2026-10-02.md (etapas do
  sidebar de contato) + `docs/audits/PLANO_CONTATOS_100_ETAPAS_2026-09-29.md`
- Passos executados:
  - persistência provada com render do `ContactDetails` real (`localStorage` + remontagem)
  - trilho colorido por situação do marco, um `DrawLine` por trecho
  - teclado completo no grupo de tipos (setas/Home/End/Enter/Espaço) e Esc limpando filtros
  - prova do estado de carregamento (skeleton) e do item sem deslocamento com movimento reduzido
  - prova por mutação (6 defeitos plantados, 6 pegos) e medição de contraste dos tokens do trilho
- Divergências do plano: o tom NEUTRO do trecho é `--muted-foreground` (mesmo token do
  marcador neutro), e não um tom do kit de movimento: o kit não tem tom neutro e está fora
  da lista de arquivos deste cartão. O `DrawLine` recebe esse token por classe
  (`[&>path]:!text-muted-foreground`) sobre o tom padrão.

## Banco de dados

Teste fora de produção: não se aplica.

nenhuma mudança

## Rollback

não se aplica

## Testes Realizados

- [x] typecheck: `zapp-verify . --rapido` → `OK tipos 126s`
- [x] lint: `zapp-verify . --rapido` → `OK lint 5s`; ratchet do commit → `baseline=0, atual=0, novas=0`
- [x] testes unitários: `npx vitest run …/SlaTimelineSection.test.tsx` → `Test Files 1 passed (1)`, `Tests 13 passed (13)`
- [x] db:guard / contrato de migrations: `OK db_guard 0s`, `OK migrations 1s` (nenhuma migration)
- [x] prova red-first / mutation: `.tmp/mutantes.sh` → 6 mutantes, 6 pegos; árvore restaurada sem diferença e verde de novo
- [x] build: não se aplica (nenhum arquivo de build/CI no diff)

## Checklist

- [x] Código segue o padrão do projeto (AGENTS.md / CLAUDE.md lidos)
- [x] Self-review realizado no diff completo
- [x] Sem console.log ou debug code
- [x] Sem secrets/credenciais hardcoded
- [x] Tipos TypeScript corretos
- [x] Sem DDL, sem RLS, sem migration (não se aplica)
- [x] Documentação atualizada (se necessário) — comentários de topo do componente
- [x] Hooks de pre-commit/pre-push passaram sem `--no-verify`

## Achados fora do escopo (NÃO corrigidos)

- `playwright.config.ts` + `e2e/` — a régua visual do trilho em navegador real é da linha
  de base visual (spec + `testMatch` novos); arquivos fora da lista deste cartão.
- `src/components/inbox/contact-details/sidebar/sidebarSections.ts` — o lint-ratchet
  reporta `baseline=0`, indicando arquivo criado no cartão anterior desta branch.

## Notas para Reviewer

- **Entrega concluída:** os 5 pontos do corrigir estão respondidos, cada um com teste e
  mutante que o derruba; verificação verde (`VERIFY: VERDE SEM BANCO (132s)`).

- **Cores do trilho, com números.** Pares medidos com a fórmula e o parser de tokens do
  próprio repo (`scripts/qa/contraste-contatos.mjs`), fundo `--muted`/20 sobre `--card`
  (o cartão da seção), nos dois temas:
  `ok`/`--success` (tokens.css:145 e :465) → 5,46:1 claro / 7,39:1 escuro;
  `warning`/`--warning-text` (:158 e :476) → 5,21:1 / 9,56:1;
  `breached`/`--destructive-text` (:159 e :477) → 6,61:1 / 5,77:1;
  `na`/`--muted-foreground` (:127 e :453) → 5,87:1 / 8,94:1.
  Pior caso 5,21:1 — acima dos 3:1 exigidos para elemento gráfico e dos 4,5:1 de texto.
- **Cobertura do teste:** estrutura, estado (vazio / carregando / erro / cheio), teclado e
  a classe de token aplicada a cada trecho, amarrada ao status por mutação; a razão de
  contraste de cada par de token do trilho está medida acima.
- **Prova por mutação:** `.tmp/mutantes.sh` restaura por `git show HEAD:<arquivo>`; nada de cópia
  sobrando no `.tmp`.
- **Acessibilidade/estado:** o vazio explica o que fazer e não esconde os filtros; falha de
  leitura não vira "sem marcos".
- Nenhuma dependência nova, nenhum token novo, nenhum componente compartilhado alterado.
