# RD-001 — linha de base visual e de medida do módulo Contatos (ANTES do redesign)

Especialista: worker (testes) (area-testes-do-produto)

## O que mudou e por quê
- `scripts/qa/contatos-redesign-baseline.cjs` (novo): roteiro Playwright do projeto (sem dependência nova — `tsx` já é devDependency) que sobe o dev do Vite na primeira porta livre a partir de 5500, abre `/?view=contacts` em 4 larguras (390/768/1280/1672 px) e 2 temas, e grava captura + números. Reusa as fixtures de `e2e/`: `contacts-page.ts` (`gotoContacts`, `contactCards`), `talkx-demo.ts` (`installFakeSession`) e `mapa-mocks.ts` (`bloquearRedeReal`, `mockAppShell`) — a MESMA receita de `e2e/contacts-snapshots.spec.ts`; não reimplementa login nem espera de carga.
- `docs/audits/contatos-redesign-baseline/*.png` (8, novo): capturas de ANTES, todas ≤ 300 KB.
- `docs/audits/CONTATOS_REDESIGN_BASELINE_2026-10-12.md` (novo): números de ANTES nas 4 larguras e 2 temas, com o método de cada número e as notas de honestidade.

## Como rodar (1 comando)
`npx tsx scripts/qa/contatos-redesign-baseline.cjs`

## Prova
- vermelho antes: `BASELINE_SO=1280xdark npx tsx scripts/qa/contatos-redesign-baseline.cjs` com a asserção do KPI mutada para `'999'` → `EXIT=1` e `[rd-001] erro: Error: 1280px dark: 3 tentativas sem rodada limpa (expect(locator).toHaveText(expected) failed)` — o roteiro FALHA quando a tela não é a esperada.
- verde depois: `npx tsx scripts/qa/contatos-redesign-baseline.cjs` → `EXIT=0` e 8/8 combinações com `0 falhas` e `relatório escrito em docs/audits/CONTATOS_REDESIGN_BASELINE_2026-10-12.md`. Nessa rodada `1280px light` veio instável e foi REFEITA (`rodada 1 instável (expect(locator).toBeAttached() failed) — refazendo`), provando o guarda de retry.

## Ponto do juiz: "não achei um teste que falharia sem a sua mudança"
- Aqui não cabe `*.test.*` novo: o produto do cartão é um ROTEIRO de medição (Playwright dirigido por `tsx`), não uma regra de produto. As funções que sobrariam para testar (`medirNaPagina`, `relatorioMarkdown`) são internas do próprio roteiro — testá-las testaria o teste, não o produto —, e um arquivo de teste novo seria arquivo fora da lista do cartão (recusa).
- A prova equivalente está na seção Prova acima, por MUTAÇÃO no roteiro: com a asserção do KPI trocada por `'999'` ele sai `EXIT=1` (`expect(locator).toHaveText(expected) failed`); restaurada, sai `EXIT=0` com 8/8 combinações limpas. É o mesmo efeito de um teste: o roteiro FALHA quando a tela real não é a esperada.

## O que NÃO fiz e por quê
- Não usei o Supabase de produção nem dado real de cliente: sessão falsa (`installFakeSession`) + backend 100% mockado + `bloquearRedeReal` (redeBarrada = 0 nas 8 rodadas).
- Não toquei em código de produção do produto: só os 3 arquivos/diretório do cartão.
- Não gravei "peso do chunk" de build: `ContactsView` não é code-split; registrei a soma dos módulos do diretório de Contatos servidos pelo Vite (`request.sizes()`), método idêntico a ser usado no "depois".
- Achado FORA do escopo: o console acusa HTML inválido (`<li>` dentro de `<li>`) no breadcrumb do `PageHeader` do módulo Contatos. É pré-existente, ficou registrado no relatório, e eu não corrigi (não é o meu cartão).
