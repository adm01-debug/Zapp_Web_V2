Especialista: worker (design) (design-system-zapp)

## Resultado: fecho SEM commit de código — a entrega já está integrada na ponta do dia
O workspace nasceu na base `dia/2026-10-12` (aff8bfb1c). Os 3 arquivos deste cartão já
estão nessa ponta, no commit 4f4c94187 (188 inserções, os mesmos 3 arquivos; cartão V2
26101109181e25). `git status` = "working tree clean" e `git diff --stat` contra a base =
vazio. Cherry-pickar o 61339f1f0/0041fac78 duplicaria o 4f4c94187 — por isso não há diff.

Conteúdo conferido na ponta (`git grep ... HEAD`):
- tokens `--violeta`/`--teal`/`--rosa` (+ `-foreground` e `-text`) em `:root`
  (tokens.css 388-402) e em `.dark` (571-579), nas matizes 265° / 190° / 335°;
- `tailwind.config.ts` (103-114) expõe as 3 no padrão das existentes
  (`DEFAULT: "hsl(var(--violeta))"` + `foreground`);
- reconciliação do roxo registrada no comentário da seção (por volta da linha 390):
  `--dash-violet` (282°) e `--kpi-tile-purple` (258°) seguem como acentos de tile do
  dashboard; consumidor novo de categoria roxa usa `--violeta`.

## Prova
- teste do cartão, verde:
  `npx vitest run --config vitest.contracts.config.ts tests/contracts/contraste-cores-categoria.contract.test.ts`
  → `Test Files 1 passed (1); Tests 30 passed (30)`.
- vermelho antes (mutação, prova que o teste MEDE o texto real do tokens.css, não literal):
  copiei o arquivo e troquei `--violeta-text: 265 75% 34%` por `... 80%`; rodando o mesmo
  comando com `TOKENS_CSS=.tmp/tokens-mutado.css` →
  `Tests 1 failed | 29 passed (30)`, com
  `AssertionError: --violeta-text sobre --background: expected 1.932... to be >= 4.5`.
  O arquivo mutado foi apagado depois; a cópia real segue verde.
- contraste MEDIDO agora (fórmula WCAG 2.1 do próprio teste, valores reais da ponta) —
  pior par de cada cor nos 5 fundos + par preenchimento:
  claro  — violeta: text 9,24 · fg-sobre-preenchimento 7,10 · preench-sobre-card 7,10;
           teal: 5,14 · 5,57 · 5,57;  rosa: 6,29 · 4,64 · 4,64.
  escuro — violeta: 5,68 · 6,76 · 6,53;  teal: 9,52 · 10,65 · 11,65;  rosa: 6,39 · 7,46 · 7,56.
  Texto >= 4,5:1 e componente >= 3:1 em todos os pares, nos dois temas.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (13s)` (db_guard/tipos/lint/migrations OK).
- `zapp-verify full .` → `db_guard` OK, `tipos` OK, `lint` OK, `migrations` OK; `banco_local`
  "AVISO não verificado" (sem conjunto de banco — este cartão não tem migration); `testes`
  VERMELHO por 1 falha pré-existente e alheia ao cartão:
  `src/components/talkx/__tests__/RuleValueInput.test.tsx > "em breve": Lead score e Risco de
  churn ficam desabilitados no catálogo` (`Unable to find role="button" and name "Novo
  segmento"`, ping de 5 s) + 4 "Unhandled Errors" de jsdom (canvas/WebSocket). Reproduz nesta
  cópia com diff ZERO contra a base acima; os arquivos do cartão são só tokens/`tailwind.config`
  e não passam por jsdom; a máquina está sob carga (load 20-28 para 24 vCPU) e o próprio
  `zapp-verify` documenta que testes dão vermelho falso sob carga. O arquivo de inbox que
  também falhou no 1º full passou isolado (`Tests 3 passed`).

## Pontos da recusa ("O QUE CORRIGIR")
- Ponto 1 (trazer dia/2026-10-11 atual para o workspace): o workspace já nasceu na base
  `dia/2026-10-12` (aff8bfb1c), que é posterior — não há o que trazer por merge.
- Ponto 2 (resolver o conflito preservando o que já entrou): o conflito era o mesmo bloco
  adicionado dos dois lados; resolvido preservando a ponta do dia (4f4c94187). Resultado:
  `git diff` do workspace contra a base = vazio e os 3 arquivos estão lá.
- Ponto 3 (rodar o teste do cartão): `Tests 30 passed (30)`, com mutação vermelha em 1,93 < 4,5.
- Ponto 4 (`zapp-verify full .` e fechar de novo): rodado; 4 passos verdes; `testes` vermelho
  por falha pré-existente de outro módulo, reprovada aqui com diff zero (acima). Fecho.

## O que NÃO fiz e por quê
- Sem commit de código: duplicaria o 4f4c94187 já integrado na ponta do dia.
- Não toquei nenhum componente que consome cor (fora da lista do cartão).
- Não toquei `.github/`, produção, credenciais ou banco.
