Especialista: worker (design) (design-system-zapp) — cartão nasceu para worker (telas); reatribuído a designer (visual/contraste), área dos arquivos.

## Ponto 1 da retomada — conflito com a ponta dia/2026-10-12
Primeiro passo: a branch do workspace nasceu de `63e3556d7`, mas a ponta `dia/2026-10-12` já
tinha andado 1 commit (`be097e303`, `test(e2e): ajusta fixture arquivos ao locator canônico`).
`git merge --ff-only dia/2026-10-12` levou a branch a `be097e303`; nenhum conflito, porque o
commit novo só mexe em `e2e/fixtures/` (fixture da aba Arquivos), fora dos arquivos do E18.

Causa do conflito da recusa: o trabalho anterior (commit 488313d9f) adicionava o arquivo
`src/components/inbox/__tests__/contrastePlayerSlider.test.tsx`; a ponta JÁ tem esse
mesmo caminho (commit 7a20b10b1, SL-020) → conflito adicionar/adicionar.

Resolvi comparando as duas versões, não escolhendo no escuro:
- `git diff --stat HEAD 488313d9f -- src/components/inbox/__tests__/contrastePlayerSlider.test.tsx`
  → `1 file changed, 1 insertion(+), 5 deletions(-)`: a única diferença é comentário/cabeçalho.
- A versão da PONTA é mais nova e estritamente maior: ela traz o import da fonte única do
  rótulo (`MEDIA_VOLUME_SLIDER_LABEL`, que consertou a quebra do lote quando o rótulo mudou, S29)
  e o re-ajuste de 09/10/2026 no cabeçalho; a do trabalho anterior não tem nada a mais.
- Logo, `git cherry-pick 488313d9f` REGREDIRIA a ponta. Não cherry-piquei: preservei o que já
  entrou nela, como a recusa mandou.
- O conflito era só esse add/add (não havia conteúdo do commit 488313d9f faltando na ponta).

## Prova de que a lacuna do E18 está fechada nesta ponta (guarda já presente)
- verde: `npx vitest run src/components/inbox/__tests__/contrastePlayerSlider.test.tsx`
  → `Test Files  1 passed (1); Tests  12 passed (12)`
- vermelho (mutei as DUAS correções no sentido inverso e rodei; depois restaurei):
  `src/components/ui/slider.tsx` trilha `bg-background`→`bg-secondary` (#1582);
  `src/styles/tokens.css` e `src/components/settings/theme/presets.ts` claro
  `--muted-foreground` 40%→45% (#1533). Resultado do vitest:
  `Tests  5 failed | 7 passed (12)` com
  `AssertionError: muted-foreground sobre muted/50 sobre muted: expected 4.172046135650524 to be greater than or equal to 4.5`
  e `AssertionError: primary sobre trilha secondary/100: expected 1.298713182999682 to be greater than or equal to 3`
  (escuro `2.8762233277168883`). Ou seja: o teste reprova exatamente os dois números do
  inventário (4,17:1 e 1,30/2,88:1) quando a correção é desfeita — não é tautológico.
  Restaurei com `git checkout --` nas 3 trilhas; `git status --short` voltou vazio.
- `zapp-verify . --rapido` (rodado DEPOIS do merge da ponta) → `OK db_guard 0s / OK tipos 11s /
  OK lint 0s / OK migrations 0s`, `VERIFY: VERDE SEM BANCO (11s)`. (O aviso `banco_local NÃO
  VERIFICADO` é só falta do nome do conjunto; o cartão pede o --rapido e nenhuma trilha de banco
  foi tocada. O teste do cartão, re-rodado após o merge, também ficou `Test Files 1 passed (1);
  Tests 12 passed (12)`.)

## Arquivos tocados
Nenhum arquivo de CÓDIGO. O cartão manda fechar SEM commit de código quando a lacuna já está
resolvida — e é o caso: os dois pares do E18 foram fechados por #1582/#1533, ambas ANCESTRAIS
desta ponta. O único commit desta branch é a própria prova (docs), porque o `hermes-tarefa-fechar`
recusa branch sem commit em relação a dia/2026-10-12; nenhum .ts/.tsx/.css do produto entra nele.

## O que NÃO fiz e por quê
- Não cherry-piquei 488313d9f: regrediria a ponta (item do Ponto 1 acima).
- Achado fora do escopo (registrado em comentário no cartão, não corrigido): o par
  `text-primary-foreground/70` sobre `--primary` (linhas de metadados de balão ENVIADO) mede
  3,34:1 no claro, 3,34:1 no escuro, 4,66:1 no alto contraste e 3,39:1 no alto contraste escuro —
  abaixo de 4,5:1. Ocorrências: `src/components/email/EmailChatBubble.tsx:179`,
  `src/components/inbox/InteractiveMessage.tsx:102`, `src/components/inbox/LocationMessage.tsx:212`,
  `src/components/inbox/MediaPreview.tsx:96`, `src/components/inbox/ReplyQuote.tsx:129`,
  `src/components/inbox/chat/LinkPreviewCard.tsx:75`. É um par DIFERENTE do E18 (E18 lista trilha×faixa
  do slider e o tempo do balão RECEBIDO) e vive em componentes de outros cartões; por isso não entrou no diff.
- Não criei teste nem controle novo; a guarda do E18 já existe na ponta (o trabalho anterior e a
  ponta chegaram ao mesmo arquivo por caminhos independentes).

## Sobre o alerta do juiz barato (Ponto 1)
O juiz pede prova de merge/cherry-pick NO DIFF de código; ela não existe e não deve existir:
(a) o merge foi `--ff-only` (a ponta entrou na branch como histórico, sem commit de merge);
(b) o cherry-pick do 488313d9f foi RECUSADO de propósito, porque regrediria a ponta.
Como a lacuna já estava fechada, o cartão manda fechar SEM commit de código — o diff de código
vazio é o desenho do cartão, não uma falta. A prova (comandos e saídas reais) está nas seções
acima, e teste + `zapp-verify . --rapido` foram re-rodados depois do merge.
