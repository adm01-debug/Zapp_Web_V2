Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 294s;OK lint 6s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 17:48, gerados por máquina: valem mais que números escritos à mão)
```
 .../ui/__tests__/timers-unmount.test.tsx           | 263 +++++++++++++++++++++
 src/components/ui/command-palette.tsx              |  24 +-
 src/components/ui/form.tsx                         |  10 +-
 src/components/ui/micro-interactions/buttons.tsx   |  13 +-
 src/components/ui/offline-indicator.tsx            |  22 +-
 src/components/ui/skip-link.tsx                    |  31 ++-
 src/components/ui/toggle-group.tsx                 |  16 +-
 7 files changed, 357 insertions(+), 22 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 11 passed (11)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — Jev inseguro sobre o relato


Nota de vocabulário: nada aqui usa "assinatura"/HMAC/signature — a entrega é só de temporizadores, skip link e memoização de contexto.

## O que mudou e por quê (UI-11, 2ª passada da auditoria do doc 13)

1) Temporizadores limpos no unmount (cada id em `useRef`, limpo no retorno do efeito/unmount):
- src/components/ui/skip-link.tsx:64,71-84 — o aviso "Pressione Tab" (3 s) agora guarda o id em `indicatorTimerRef` e limpa no unmount; antes o `setTimeout` disparado no keydown sobrevivia ao componente.
- src/components/ui/command-palette.tsx:130-138 — os dois ajustes adiados (reset ao fechar, foco ao abrir) ficaram em `resetTimerRef`/`focusTimerRef` e o retorno do efeito limpa o que estiver pendente.
- src/components/ui/micro-interactions/buttons.tsx:51-56,76 — cada ripple agenda a própria remoção; os ids vão para `rippleTimersRef` e são limpos no unmount.
- src/components/ui/offline-indicator.tsx:89,93-95,105-107 — o prazo de 3 s do aviso "Conexão restaurada" (`useOfflineStatus`) ficou em `wasOfflineTimerRef`, limpo no unmount e sem empilhar prazo novo.
- src/components/ui/quick-peek.tsx:59,64,71-83 — JÁ estava em `timerRef` com limpeza no BASE: nada foi mudado aqui (o teste do cartão passa nesse arquivo mesmo sobre o BASE).

2) Skip link sem varredura permanente e sem `<nav>` vazio:
- src/components/ui/skip-link.tsx:106 — `new MutationObserver(detect)` sobre `document.body` (`childList`, `subtree`) no lugar do `setInterval` que varria a tela a cada 1,5 s.
- src/components/ui/skip-link.tsx:114 — `if (availableTargets.size === 0) return null`: sem alvo na tela não existe `<nav>` vazio.

3) Valor de contexto estável (`useMemo`) em ToggleGroup e Form*:
- src/components/ui/toggle-group.tsx:19 — `React.useMemo(() => ({ variant, size }), [variant, size])`.
- src/components/ui/form.tsx:28 — `React.useMemo(() => ({ name: props.name }), [props.name])`; src/components/ui/form.tsx:70 — `React.useMemo(() => ({ id }), [id])`.

4) Aviso de lint que a minha própria inserção deslocou (mesmo arquivo do cartão):
- src/components/ui/command-palette.tsx:107-118,128 — `executeCommand` virou `React.useCallback(..., [onNavigate, onOpenChange])` e o efeito do teclado passou a listá-lo nas dependências. O `react-hooks/exhaustive-deps` já existia no baseline (linha 113) e apareceu como "nova ocorrência" porque o meu bloco de timers empurrou o efeito para a linha 124; além do deslocamento, o handler realmente capturava fechamento velho de `onNavigate`/`onOpenChange`. Foi o que reprovou o lint na 1ª passada do fechar (`.tmp/verify...log`: `FALHOU lint ... novas=1`), e agora some do código em vez de mudar de linha.

## Prova

Teste novo: src/components/ui/__tests__/timers-unmount.test.tsx (11 casos). Usa `vi.useFakeTimers()` + `vi.getTimerCount()` pelo caminho REAL de cada componente, agenda o temporizador, desmonta e exige contagem zero; renderiza os componentes reais (`SkipLinks`, `CommandPalette`, `RippleButton`, `ConnectionToast`/`useOfflineStatus`, `QuickPeek`, `ToggleGroup`+`ToggleGroupItem`, `FormField`/`FormItem`), sem mock que já traga a resposta.

- vermelho antes (voltei os 6 arquivos ao BASE com `git show HEAD:<arquivo> > <arquivo>` — sem `git stash`, que é global neste repo):
  `npx vitest run src/components/ui/__tests__/timers-unmount.test.tsx` → `Tests 9 failed | 2 passed (11)`
  (as 2 verdes são quick-peek, já corrigido no BASE, e o aviso do toast aparecendo; as 9 vermelhas são exatamente os defeitos deste cartão).
- verde depois:
  `npx vitest run src/components/ui/__tests__/timers-unmount.test.tsx` → `Test Files 1 passed (1); Tests 11 passed (11)`.
- vizinhança (skip link, paleta, botões, a11y dos primitivos, quick-peek na lista virtual e atalhos do dashboard):
  `npx vitest run src/components/ui/__tests__ src/components/inbox/__tests__/VirtualizedRealtimeList.quickPeek.test.tsx src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx` → `Test Files 23 passed (23); Tests 171 passed (171)`.
- lint dos 7 arquivos do diff:
  `npx eslint <os 7 arquivos>` → `3 problems (0 errors, 3 warnings)` — os 3 são `react-refresh/only-export-components` que já estão no baseline; o `exhaustive-deps` da paleta não aparece mais.
- commit 2 (a correção do aviso): `2278810add fix(a11y): corrige dependencia do efeito de teclado da paleta` — pre-commit: `Lint ratchet (staged, 1 arquivo(s)): baseline=2, atual=1, mantidas=1, removidas=1, novas=0` / `OK: nenhuma nova divida de lint foi introduzida`. Paleta re-testada depois: `Test Files 4 passed (4); Tests 26 passed (26)`.

## CRITÉRIO DE PRONTO, item a item

1. "Nenhum timer pendente após unmount nos 6 componentes (teste)" — PROVADO para todo temporizador que cada componente agenda: skip-link (0 após o Tab + unmount), quick-peek (0), ripple do botão (volta à linha de base após unmount, e nenhum aviso do React ao avançar 2 s), `useOfflineStatus`/toast (0), command-palette fechada (1 → 0) e command-palette aberta (o foco adiado sai na desmontagem: a contagem cai).
   Fato medido sobre biblioteca (não é pendência deste cartão): o `<Dialog>` do Radix em estado aberto agenda 2 temporizadores próprios que continuam pendentes após o unmount (medido com `<Dialog open>` puro: montado 2, desmontado 2), e o `motion.button` do framer-motion deixa 1 (medido com o botão montado e sem clique). Nenhum dos dois está em ARQUIVOS QUE PODE TOCAR; por isso os testes da paleta aberta e do ripple usam a queda/linha de base da contagem para isolar o temporizador do cartão. Os 5 temporizadores que o cartão aponta chegam a zero (ou à base) no unmount.
2. "Skip link: MutationObserver no lugar do intervalo; não renderizar `<nav>` vazio" — PROVADO: skip-link.tsx:106 (`new MutationObserver(detect)`, sem `setInterval` no arquivo) e skip-link.tsx:114 (early return). Testes: "não abre varredura por intervalo e limpa o aviso de Tab no unmount" (0 temporizadores ao montar; 1 após o Tab; 0 após unmount) e "não renderiza `<nav>` vazio quando nenhum alvo existe na tela" (`container.innerHTML` vazio).
3. "useMemo em ToggleGroup e Form*" — PROVADO por comportamento e por arquivo: um item memoizado dentro do `ToggleGroup` não é avisado no re-render com as mesmas props (sem o `useMemo` era avisado de novo); no formulário real (`useForm` + `Form`/`FormField`/`FormItem`/`FormControl`), re-renderizar a tela não re-renderiza o campo após a montagem.

## Fora do escopo deste cartão (registrado em `kanban_comment`, não corrigido aqui)

- `setInterval` em `src/components/ui/accessible-toast.tsx:158` e `src/components/ui/motion/effects.tsx:89`: arquivos que não estão na lista do cartão.
- Os temporizadores internos do Radix Dialog e do framer-motion medidos acima: moram em `src/components/ui/dialog.tsx`/`node_modules`, fora da lista.

Entrega: 2 commits (`7085ef511d` e `2278810add`), 7 arquivos, `+351/-19` no primeiro e o ajuste de dependência no segundo.
