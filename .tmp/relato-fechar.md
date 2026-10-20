Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 337s;OK lint 5s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 21:25, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/inbox/AudioMessagePlayer.tsx        |  64 ++++++--
 .../__tests__/AudioMessagePlayer.a11y.test.tsx     | 174 +++++++++++++++++++++
 2 files changed, 228 insertions(+), 10 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 7 passed (7)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: integrar — sem risco detectado


## O que mudou e por quê

Arquivo: `src/components/inbox/AudioMessagePlayer.tsx` (+ o teste novo abaixo). Todos os itens do "O QUE FAZER" do cartão.

- `aria-label` nos botões que só tinham ícone: play/pausa/recarregar (`AudioMessagePlayer.tsx:157`), velocidade (`:191`), transcrição (`:203` — agora alterna entre `Transcrever áudio` / `Mostrar transcrição` / `Ocultar transcrição`; o `title` antigo continua no lugar, então nada que já procurava por ele quebrou).
- Barra de posição como slider de verdade (`:162-173`): `role="slider"`, `tabIndex=0`, `aria-label`, `aria-valuemin/max/now` e `aria-valuetext` (tempo legível), com anel de foco visível. Teclado em `handleSeekKeyDown` (`:110-125`): ← / ↓ voltam 5 s, → / ↑ avançam 5 s (com teto em `duration` e piso em 0), Home vai ao início e End ao fim; o clique (mouse) segue no mesmo elemento `<audio>`, nada foi removido.
- Selo 'Falhou - Tentar novamente' deixou de ser `motion.div onClick` e virou `<button type="button">` de verdade (`:144`), mantendo as classes e o texto visível (o nome acessível vem do próprio texto). Ficou `button` puro em vez de `motion.button` porque o teste vizinho `AudioMessagePlayer.transcricao.test.tsx` mocka `framer-motion` com `motion.div`/`AnimatePresence` apenas — `motion.button` daria `undefined` e quebraria aquele teste, que não é meu.
- Status da transcrição (Transcrevendo / Falhou) com `role="status"` (`:213`), então a mudança de estado é anunciada; não coloquei um segundo live region no painel da transcrição para não haver anúncio duplicado.
- Waveform: a animação infinita do pulsar só é pedida quando a bolha está tocando E o sistema não pediu "reduzir movimento" (`:178-179`, via `prefereReduzirMovimento()` em `:18` + `useMemo` em `:43`). Com reduzir movimento ligado as barras ficam estáticas (estado final, valores iguais).

Arquivo novo: `src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx` (7 testes, renderizando o componente REAL; os mocks são os mesmos dos testes vizinhos do player — `motion.div` só copia as props de animação para `data-*`, não injeta estado).

## Prova

- vermelho antes: `npx vitest run src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx` com o `AudioMessagePlayer.tsx` da base (`git show dia/2026-10-15:...`) → `Test Files 1 failed (1); Tests 6 failed | 1 passed (7)` (falham os 6 casos do cartão: nomes, axe, slider/teclado, selo-button, `role=status`, reduzir movimento; passa só o caso que confere que, com movimento normal, o waveform pulsa).
- verde depois: `npx vitest run src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx src/components/inbox/__tests__/AudioMessagePlayer.transcricao.test.tsx` → `Test Files 2 passed (2); Tests 13 passed (13)`.
- `npx eslint src/components/inbox/AudioMessagePlayer.tsx src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx` → `0 errors` (permanece só o warning pré-existente de import do client Supabase na linha 5, anterior a este cartão; baseline do ratchet).

## CRITÉRIO DE PRONTO — item por item

1. Teste a11y no padrão `*.a11y.test.tsx` passa → `src/components/inbox/__tests__/AudioMessagePlayer.a11y.test.tsx`, caso "axe não acusa violação séria nem crítica" (as violações de impacto `critical|serious` são mapeadas para `<id>: <n> nó(s)` e o `expect` é `toEqual([])`); com o componente da base o mesmo caso reprova com `expected [ 'button-name: 1 nó(s)' ] to deeply equal []`; a suíte inteira dá `Test Files 2 passed (2); Tests 13 passed (13)`.
2. Seek por seta funciona → `AudioMessagePlayer.tsx:110-125` + caso "a barra de posição é um slider com valores e atalhos de teclado": com `duration` 120 s, → leva `audio.currentTime` a 5, ← a 0, End a 120, Home a 0, ↑ a 5 e ↓ a 0 (medido no elemento `<audio>` real, que é o alvo do clique também).
3. `zapp-verify . --rapido` verde → rodado pelo `hermes-tarefa-fechar` (bloco FATOS MEDIDOS do fechar).

## NÃO FEITO

- Nada do cartão ficou de fora. Não toquei em `useAudioPlayer.ts` (o seek por teclado usa o `audioRef` que o hook já devolve) nem em outro arquivo.
- Fora do escopo, registro uma vez: o aviso de lint `no-restricted-imports` do client Supabase (`AudioMessagePlayer.tsx:5`) é anterior a este cartão e é do worker (hooks) — a correção seria extrair o `invoke`/`resolveAudioUrl` para `src/services` ou `src/hooks`.
