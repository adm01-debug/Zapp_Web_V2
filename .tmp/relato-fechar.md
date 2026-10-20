Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 1182s;OK lint 6s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 17:40, gerados por máquina: valem mais que números escritos à mão)
```
 src/__tests__/a11y/icon-button-names.test.ts       | 168 +++++++++++++++
 src/__tests__/a11y/icon-buttons-baseline.json      | 151 +++++++++++++
 src/__tests__/a11y/scan-icon-buttons.ts            | 236 +++++++++++++++++++++
 src/components/inbox/AISuggestions.tsx             |   1 +
 src/components/inbox/AdvancedMessageMenu.tsx       |   2 +-
 src/components/inbox/AudioMessagePlayer.tsx        |   2 +-
 src/components/inbox/CRMAutoSync.tsx               |   3 +-
 src/components/inbox/InteractiveMessageBuilder.tsx |   6 +-
 src/components/inbox/KeyboardShortcutsHelp.tsx     |   1 +
 src/components/inbox/MessageContextActions.tsx     |   1 +
 src/components/inbox/TemplatesWithVariables.tsx    |   4 +-
 .../__tests__/botoes-icone-nomes-a11y.test.tsx     |  65 ++++++
 .../inbox/contact-details/sidebar/SidebarRow.tsx   |   2 +-
 13 files changed, 633 insertions(+), 9 deletions(-)
```
- Testes alterados neste cartão (3 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 22 passed (22)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — padrão sensível: padrão:verifyHmac|signature


FAIXA DO PAI: commits 054f28fee7 (`test(a11y): trava botão de ícone sem nome acessível (UK-13/UK-13b)`)
do cartão t_9d25b0a2 (UK-13a) — trazidos por cherry-pick, NÃO são deste cartão. Motivo: o UK-13a não está
integrado em dia/2026-10-15, e o critério de pronto deste cartão depende da varredura e da linha de base
que ele entrega (`src/__tests__/a11y/`). Sem esse commit não existe nem a varredura nem o arquivo de linha
de base para encolher.

## O que mudou e por quê
- 9 arquivos de `src/components/inbox/**`: nome acessível (`aria-label` pt-BR) nos 13 botões de ícone que
  apareciam como ocorrência na varredura (AdvancedMessageMenu, AISuggestions, AudioMessagePlayer,
  CRMAutoSync x2, InteractiveMessageBuilder x3, KeyboardShortcutsHelp, MessageContextActions,
  TemplatesWithVariables x2, contact-details/sidebar/SidebarRow). Só prop de acessibilidade: nenhum
  comportamento, texto visível ou estilo mudou.
- `src/components/inbox/contact-details/sidebar/SidebarRow.tsx`: o `aria-label` foi declarado também no
  `Button` que usa `asChild` (o `<a>` já tinha o seu nome); assim a varredura enxerga o nome no próprio
  botão, sem depender do repasse do `Slot`.
- `src/components/inbox/__tests__/botoes-icone-nomes-a11y.test.tsx` (novo): renderiza o componente REAL e
  cobra o nome por `getByRole('button', { name })` — TemplatesWithVariables (editar/usar template),
  InteractiveMessageBuilder (remover botão da composição) e KeyboardShortcutsHelp (gatilho do popover).
- `src/__tests__/a11y/icon-buttons-baseline.json`: linha de base regenerada pela varredura, 46 -> 21
  ocorrências (o arquivo só encolheu, nenhuma entrada nova). Das 25 removidas, 12 já tinham sido
  corrigidas por cartões irmãos (admin, dashboard, calls, contacts, cognitive, queues, catalog,
  leaderboard, reports, ConversationSummary, ObjectionDetector, SummaryResult, VoiceChanger) que não
  encolheram a linha de base — por isso o teste do ratchet estava VERMELHO na base, com 12 avisos de
  "linha de base com entrada já corrigida" e nenhum de ocorrência nova.

## Prova
- vermelho antes (mesma mudança, o `aria-label` do `KeyboardShortcutsHelp` retirado por um instante):
  `npx vitest run src/components/inbox/__tests__/botoes-icone-nomes-a11y.test.tsx`
  -> `Test Files 1 failed (1); Tests 1 failed | 2 passed (3)`, falha na linha 63
  `Unable to find an accessible element with the role "button" and name "Atalhos de teclado"`.
- verde depois (arquivo restaurado):
  `npx vitest run src/components/inbox/__tests__/botoes-icone-nomes-a11y.test.tsx`
  -> `Test Files 1 passed (1); Tests 3 passed (3)`.
- varredura + teste novo juntos:
  `npx vitest run src/__tests__/a11y/icon-button-names.test.ts src/components/inbox/__tests__/botoes-icone-nomes-a11y.test.tsx`
  -> `Test Files 2 passed (2); Tests 22 passed (22)`.
- suíte inteira do inbox (nenhum teste que já passava foi quebrado):
  `npx vitest run src/components/inbox/__tests__/`
  -> `Test Files 112 passed (112); Tests 790 passed | 1 expected fail | 1 todo (792)`.
- contagem da varredura antes/depois, medida com o mesmo scanner em `.tmp/scan.ts` (não commitado):
  antes `TOTAL projeto: 34 em 24 arquivos` / `ALVO mobile+inbox: 13`; depois
  `TOTAL projeto: 21 em 15 arquivos` / `ALVO mobile+inbox: 0`.

## Critério de pronto, item por item
1. **Zero ocorrências em mobile/ e inbox/ na varredura:** `src/components/inbox/__tests__/botoes-icone-nomes-a11y.test.tsx`
   (3 componentes reais) e `src/__tests__/a11y/icon-button-names.test.ts` (ratchet) verdes, e a varredura
   devolve 0 em mobile+inbox. `src/components/mobile/**` não precisou de nada: os 8 `size="icon"` de lá
   (MiniChatPiP, MobileHeader, NotificationsPanel, VoiceDictationButton) já têm nome acessível.
2. **Linha de base menor e teste verde:** `src/__tests__/a11y/icon-buttons-baseline.json` com 21 entradas
   (era 46) e `npx vitest run src/__tests__/a11y/icon-button-names.test.ts` verde.
3. **Testes dos arquivos que toquei:** o arquivo novo acima cobre 3 dos 9 componentes alterados; os outros
   6 (AdvancedMessageMenu, AISuggestions, AudioMessagePlayer, CRMAutoSync, MessageContextActions,
   SidebarRow) ficam cobertos pela varredura/ratchet, que reprova qualquer botão de ícone sem nome novo
   em `src/components/inbox/**`.

## Aviso do juiz barato ("teste novo não chama o código")
Não procede. O teste novo `src/components/inbox/__tests__/botoes-icone-nomes-a11y.test.tsx` importa e
RENDERIZA os componentes reais (`TemplatesWithVariables`, `InteractiveMessageBuilder`,
`KeyboardShortcutsHelp`) e consulta o nome acessível no DOM com `getByRole('button', { name })` — o
vermelho→verde acima saiu de tirar/repôr um `aria-label` do componente real, não de um literal. O outro
teste do diff (`scan-icon-buttons.ts` + `icon-button-names.test.ts`) é a varredura do UK-13a, declarada na
FAIXA DO PAI: ele lê o fonte DE PROPÓSITO, porque o critério 1 do cartão é justamente "zero ocorrências
na varredura".

## NÃO FEITO (e por quê)
- Não mexi no `TETO_BASELINE` nem em mais nada de `src/__tests__/a11y/icon-button-names.test.ts` — o
  arquivo não está na lista de arquivos que eu posso tocar; com 21 entradas o teto de 46 continua válido.
- As 21 ocorrências que sobram estão em dashboard, admin, calls, contacts, cognitive, queues, catalog,
  leaderboard e reports: fora do escopo deste cartão (mobile/inbox).
