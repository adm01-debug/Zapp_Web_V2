## Descrição

A seção "Linha do tempo de SLA" do painel do contato já existia (commit anterior desta
branch), mas quatro coisas ficaram frouxas e o revisor recusou. Causa raiz em cada uma:
(1) o teste provava a persistência embrulhando a seção num `Accordion` próprio, o que
não mostra se ela vive no acordeão que realmente salva estado — agora um teste renderiza
o `ContactDetails` de verdade e prova que abrir a seção grava `sla-timeline` no
`localStorage` e que remontar reabre; (2) a linha vertical que liga os marcos era um
`DrawLine` único de cor fixa — agora é um trecho por intervalo, pintado pela SITUAÇÃO do
marco acima (`ok`→`success`, `warning`→`warning`, `breached`→`destructive`) e neutro
(`--muted-foreground`) no marco sem prazo; (3) o grupo de filtros por tipo não tinha
teclado — agora tem roving tabindex (←/→/↑/↓, Home/End, Enter/Espaço) e Esc limpa os
filtros, tudo no próprio elemento (nenhum listener global, nada para limpar no unmount);
(4) faltava prova do estado de carregamento e da garantia de que, com movimento reduzido,
os itens da lista não se deslocam.

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
  - prova por mutação (6 defeitos plantados, todos pegos) e medição de contraste dos tokens do trilho
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
- [x] lint: `zapp-verify . --rapido` → `OK lint 5s` (e o ratchet de lint no commit: `baseline=0, atual=0, novas=0`)
- [ ] build: não rodado neste cartão (a verificação rápida não inclui build)
- [x] testes unitários: `npx vitest run src/components/inbox/contact-details/__tests__/SlaTimelineSection.test.tsx` → `Tests 13 passed (13)`
- [x] db:guard / contrato de migrations: `zapp-verify . --rapido` → `OK db_guard 0s`, `OK migrations 1s` (nenhuma migration)
- [x] prova red-first / mutation do teste novo: `.tmp/mutantes.sh` → 6 mutantes, 6 pegos:
      `trecho ok com tom errado`, `trecho neutro sem token neutro`, `sem roving tabindex`,
      `sem Esc limpando filtros`, `sem estado de carregamento`, `persistencia do acordeao`;
      a árvore volta limpa (`git status --short` vazio) e o teste volta verde.

## Checklist

- [x] Código segue o padrão do projeto (AGENTS.md / CLAUDE.md lidos)
- [x] Self-review realizado no diff completo
- [x] Sem console.log ou debug code
- [x] Sem secrets/credenciais hardcoded
- [x] Tipos TypeScript corretos
- [ ] RLS policies consideradas (se DB) — não se aplica (sem DDL)
- [x] Documentação atualizada (se necessário) — comentários de topo do componente
- [x] Hooks de pre-commit/pre-push passaram sem `--no-verify`

## Achados fora do escopo (NÃO corrigidos)

- `src/components/inbox/contact-details/sidebar/sidebarSections.ts` — o lint-ratchet
  reporta `baseline=0` para este arquivo, então ele nasceu no cartão anterior desta
  branch; nada a corrigir aqui.
- A medição de contraste do TRILHO em navegador real não foi feita: exigiria uma spec
  nova em `e2e/` (e o projeto/`testMatch` correspondente em `playwright.config.ts`),
  arquivos que não estão na lista deste cartão. Medido até onde o escopo permite: a classe
  aplicada a cada trecho (teste com mutação) e o token resolvido (ver notas).

## Notas para Reviewer

- **Cores do trilho, com números.** Pares medidos com a fórmula e o parser de tokens do
  próprio repo (`scripts/qa/contraste-contatos.mjs`), fundo `--muted`/20 sobre `--card`
  (o cartão da seção), nos dois temas:
  `ok`/`--success` (tokens.css:145 e :465) → 5,46:1 claro / 7,39:1 escuro;
  `warning`/`--warning-text` (:158 e :476) → 5,21:1 / 9,56:1;
  `breached`/`--destructive-text` (:159 e :477) → 6,61:1 / 5,77:1;
  `na`/`--muted-foreground` (:127 e :453) → 5,87:1 / 8,94:1. Pior caso 5,21:1, acima dos
  3:1 exigidos para elemento gráfico e dos 4,5:1 de texto (o mesmo token serve ao selo).
- **Prova por mutação** está em `.tmp/mutantes.sh` (restaura por `git show HEAD:<arquivo>`;
  nada de cópia sobrando no `.tmp`). Vermelho: cada mutante derruba o teste. Verde: 13/13.
- **O que o teste NÃO prova:** cor renderizada (jsdom não calcula layout nem carrega o CSS
  do app) e tamanho/espaçamento. O que ele prova é estrutura, estado e teclado, e a classe
  de token que o componente aplica a cada trecho — ligada ao status por mutação.
- **Acessibilidade/estado:** estados vazio / carregando / erro / cheio cobertos por teste;
  o vazio explica o que fazer e não esconde os filtros; falha de leitura não vira "sem marcos".
- Nenhuma dependência nova, nenhum token novo, nenhum componente compartilhado alterado.
