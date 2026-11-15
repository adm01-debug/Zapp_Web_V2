# Dossiê — hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c

- Ref: `origin/hermes/telefonia-fase8-motion-a11y-responsivo-2610031530007c` · tip `e31ccad51` · merge-base `81efc3c2a` (2026-10-03) · 1 commit, sem PR.
- Commit: `e31ccad51 feat(telefonia): motion da secao 2.8 sob useReducedMotion (T75)`.

## Propósito
T75 (Telefonia, seção 2.8): com `prefers-reduced-motion: reduce` nenhuma animação da tela de Telefonia pode rodar (duração 0s). A branch cria um hook central `src/hooks/useMotionSeguro.ts` (wrapper de `useReducedMotion`) e o aplica em 5 componentes (KPI grid com fade 150 ms + stagger, troca de painel 120 ms, alerta de chamada, keypad, hover do histórico). Como `useReducedMotion` passa a ser chamado em produção, acrescenta `useReducedMotion: () => false` em 21 mocks de `framer-motion` nos testes.

## Como a main atende hoje (prova)
| Necessidade da branch | Onde a main cobre | Evidência |
|---|---|---|
| Decisão central "anima ou não" | `MotionConfig reducedMotion="user"` global + `useReducedMotion` por componente (convenção CT-70) | `origin/main:src/App.tsx:85-88`; `src/components/catalog/__tests__/CT70_reducedMotion.test.tsx:129-147` exige o padrão por arquivo |
| KPI: fade 150 ms, 0 s sob redução | `CallKpiCard` (nível do tile, não do grid) | `origin/main:src/components/calls/CallKpiCard.tsx:27,37,39` (`initial={reduzirMovimento ? false : …}`, `duration: reduzirMovimento ? 0 : 0.15`); teste `telefoniaMotion.test.tsx:93-110` |
| Painel da ligação: 120 ms, 0 s sob redução | `ActiveCallPanel` (`AnimatePresence mode="wait"`) | `origin/main:src/components/calls/ActiveCallPanel.tsx:48,68-74`; teste `telefoniaMotion.test.tsx:113-129` |
| Keypad `whileTap` desligado sob redução | `MotionConfig reducedMotion="user"` desliga animações de transform (scale) globalmente | `origin/main:src/App.tsx:88`; `Keypad.tsx:74` segue `whileTap={{ scale: 0.92 }}` |
| IncomingCallAlert spring (y/scale) sob redução | idem MotionConfig (y/scale são transform) | `origin/main:src/components/calls/IncomingCallAlert.tsx:235-239` |
| Hover do histórico `motion-reduce:transition-none` | CSS global zera `transition-duration` sob redução | `origin/main:src/styles/accessibility.css:77-83` (importado em `src/index.css:7`) |
| 21 mocks com `useReducedMotion: () => false` | todos os 21 arquivos na main usam `vi.mock('framer-motion', async (importOriginal) => …{ ...actual, … })` → `useReducedMotion` real disponível | `git grep -c "\.\.\.actual" origin/main -- <cada arquivo>` = 1 em todos os 21 |
| `VoIPPanel.test.tsx` (2 `waitFor`) | arquivo apagado na main | `git log --diff-filter=D`: `ecfdb26ff 2026-10-09 feat: lote 2026-10-09 (#1911)`; substituído por `TelefoniaView*.test.tsx` |
| `CampaignsView.test.tsx` | arquivo apagado na main | `025d0258d` / `9c0a82cf4` (2026-10-16, lote 880 cartões); nenhum `CampaignsView*.test` em `origin/main` |
| `GroupsView.test.tsx` | `missing_in_main = 0` | já idêntico |

## Tabela arquivo × achado
| Arquivo | Achado |
|---|---|
| `src/hooks/useMotionSeguro.ts` (+ `__tests__/useMotionSeguro.test.ts`) | OBSOLETA — abordagem substituída pela convenção `useReducedMotion` por componente + `MotionConfig` global |
| `src/components/calls/CallsKpiGrid.tsx` | fade 150 ms já em `CallKpiCard`; **stagger `i*0.03` (teto 5) não existe na main** — cosmético |
| `src/components/calls/TelefoniaView.tsx` | 120 ms já em `ActiveCallPanel`; **fade na troca Selected/Active/New no `TelefoniaView` não existe** (`SelectedCallPanel`/`NewCallPanel` não importam framer-motion) — cosmético |
| `src/components/calls/IncomingCallAlert.tsx`, `Keypad.tsx` | coberto por `MotionConfig reducedMotion="user"` |
| `src/components/calls/CallHistoryTable.tsx` | coberto por `accessibility.css:77-83` |
| 21 testes (`useReducedMotion: () => false`) | INCORPORADA de outra forma (`...actual`) |
| `VoIPPanel.test.tsx`, `CampaignsView.test.tsx` | OBSOLETA — apagados na main |

## Veredito
**OBSOLETA.** O aceite do T75 (0 s sob redução) está na main por outra arquitetura (hook por componente + `MotionConfig` global + CSS global), com testes em `src/components/calls/__tests__/telefoniaMotion.test.tsx`. Restam só dois detalhes cosméticos (valor baixo), preservados abaixo caso o dono queira.

## Hunks cosméticos não presentes na main (valor baixo)
### 1. Stagger dos tiles de KPI — `src/components/calls/CallsKpiGrid.tsx`
Portar para a convenção da main (sem hook novo): `const reduzir = useReducedMotion();` e no map:
```tsx
{TILES.map((t, i) => (
  <motion.div key={t.chave}
    initial={reduzir ? false : { opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ duration: reduzir ? 0 : 0.15, delay: reduzir ? 0 : Math.min(i, 4) * 0.03 }}>
    <CallKpiCard … />
  </motion.div>
))}
```
Atenção: `CallKpiCard` já faz o fade de 150 ms (`CallKpiCard.tsx:37-39`); se portar, mover o `delay` para uma prop do card em vez de aninhar dois fades.

### 2. Fade na troca de painel lateral — `src/components/calls/TelefoniaView.tsx` (~linha 271 na main)
```tsx
<motion.div
  key={selectedCall ? `detalhe-${selectedCall.id}` : sessaoAtiva ? 'ativa' : 'nova'}
  initial={reduzir ? false : { opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: reduzir ? 0 : 0.12 }}>
  {selectedCall ? <SelectedCallPanel …/> : sessaoAtiva ? <ActiveCallPanel …/> : <NewCallPanel />}
</motion.div>
```
Nota da branch: `AnimatePresence mode="wait"` não completa a saída em jsdom (painel novo nunca monta); animar só a entrada. `ActiveCallPanel` já tem o próprio fade de 120 ms — risco de fade duplo.

## Verificação adversarial

**Discordo do veredito OBSOLETA. Correto: PERDIDA_PARCIAL.** A triagem confirma-se em 9 das 10 linhas da
tabela de cobertura, mas a linha do `IncomingCallAlert` está **errada** — e com ela cai o hunk de maior
valor da branch.

### Refutação (prova)
A triagem afirma: "IncomingCallAlert spring (y/scale) sob redução → idem MotionConfig". Falso: o
`MotionConfig reducedMotion="user"` da main envolve **só** `<AppRoutes />`.

```
origin/main:src/App.tsx
200:  <ErrorBoundary fallback={null}>
201:    <Suspense fallback={null}>
202:      <DeferredProviders />      ← aqui dentro mora o IncomingCallAlert (App.tsx:116)
205:  </ErrorBoundary>
213:  <Suspense fallback={null}>
214:    <LazyMotionConfig>          ← o reducedMotion="user" começa aqui
215:      <AppRoutes />
216:    </LazyMotionConfig>
```

`IncomingCallAlert` é renderizado em `origin/main:src/App.tsx:116`, dentro de `DeferredProviders`
(`App.tsx:102-127`) — **ramo irmão** do `LazyMotionConfig`, nunca descendente. O escopo é travado por teste:
`origin/main:src/components/contacts/__tests__/ContactsView.contratoFonte.test.ts:26` exige literalmente
`/<LazyMotionConfig>\s*<AppRoutes\s*\/>\s*<\/LazyMotionConfig>/`. Logo o `MotionConfig` não alcança o alerta,
nem hoje nem por acidente de ordem.

E `accessibility.css:69-83` também não cobre: ele zera `animation-duration`/`transition-duration` do **CSS**;
o `y`/`scale` do `motion.div` é `style.transform` escrito a cada frame pelo framer-motion (JS), fora do
alcance de `!important` em `transition-duration`.

Resultado em produção, com `prefers-reduced-motion: reduce`: `origin/main:src/components/calls/IncomingCallAlert.tsx:235-239`
continua animando `y: -100 → 0` + `scale: 0.9 → 1` com spring (`stiffness 300, damping 25`) a cada chamada
recebida — translação de 100 px, não solicitada, exatamente o que o aceite do T75 proíbe. A branch tem o
conserto em 3 linhas (`git diff 81efc3c2a origin/hermes/…:src/components/calls/IncomingCallAlert.tsx`):
`transition={m.anima ? {spring} : { duration: 0 }}`.

Valor: **médio** (defeito de acessibilidade real em produção, não cosmético; é o aceite declarado da etapa),
não baixo. Portar sem o hook novo, na convenção da main:
`const reduzir = useReducedMotion(); … transition={reduzir ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 25 }}`
(e `initial={reduzir ? false : { y: -100, opacity: 0, scale: 0.9 }}`).

### O que a triagem acertou (reconferido por mim)
- `MotionConfig reducedMotion="user"` existe: `App.tsx:85-88`. Cobre `Keypad.tsx:74` (`whileTap scale`), que
  só é montado dentro de `AppRoutes` (ActiveCallPanel/NewCallPanel). OK.
- `CallKpiCard.tsx:27,37,39` — `useReducedMotion`, fade 0,15 s, duração 0 sob redução. OK.
- `ActiveCallPanel.tsx:46-48,68-74` — `useReducedMotion`, 0,12 s, `toque` desligado sob redução. OK.
- `telefoniaMotion.test.tsx` existe em `origin/main` e mede o aceite no DOM (KPI 0,15 s → 0; painel 0,12 s → 0;
  `whileTap` 0,98 → nenhum; histórico sem stagger). OK.
- `accessibility.css:77-83` cobre o `transition-colors` CSS do `CallHistoryTable.tsx:76`. O
  `duration-[120ms]` da branch é cosmético. OK.
- 21 testes: `git show origin/main:<arquivo> | grep -c '\.\.\.actual'` = 1 em **todos os 21**, e todos existem
  em `origin/main`. A linha `useReducedMotion: () => false` é desnecessária. OK.
- `VoIPPanel.test.tsx` apagado em `ecfdb26ff` (2026-10-09, #1911); `CampaignsView.test.tsx` apagado em
  `025d0258d` (2026-10-16). OK.
- `git grep useMotionSeguro origin/main` → vazio; o hook central em si é OBSOLETO (convenção da main é por
  componente). OK — a lacuna é o comportamento, não o hook.

### Lacuna adicional que a triagem não viu (fora da branch)
Pelo mesmo motivo (ramo fora do `MotionConfig`), `origin/main:src/components/calls/CallDialog.tsx:343,364,386,397`
usa `whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}` sem nenhum `useReducedMotion` — e o `CallDialog` é
montado pelo `IncomingCallAlert`. E `IncomingCallAlert.tsx:251-252` tem `animate={{ scale: [1,1.2,1] }}` com
`repeat: Infinity`, também sem portão (a branch não conserta esse). Mesma causa raiz: tudo em
`DeferredProviders` está fora do `reducedMotion="user"`.
