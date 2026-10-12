Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/ui/dialog.tsx: `DialogContent` injeta uma descrição oculta em pt-BR (`aria-describedby` + `sr-only`) quando o chamador NÃO informa a prop; a chave é conferida com `hasOwnProperty` no objeto de props, então `aria-describedby={undefined}` passado de propósito continua sem descrição nenhuma (vários diálogos da V2 usam isso para silenciar o aviso do Radix).
- src/components/ui/skip-link.tsx: o `SkipLink` põe `tabindex=-1` em alvo não focável antes de chamar `focus()` (o atalho não cumpria o papel em `<main>`/`<section>`); o indicador de Tab guarda o id em `useRef` e o limpa no desmonte; a detecção de alvos virou `MutationObserver` no lugar do `setInterval` de 1,5 s.
- src/components/ui/visually-hidden.tsx: `useAnnounce` guarda o `setTimeout` em `useRef`, limpa o anterior antes de reagendar e limpa no desmonte.
- src/components/ui/offline-indicator.tsx: `useOfflineStatus` guarda o `setTimeout` do aviso "voltou" em `useRef` e o limpa no desmonte/na troca de estado.
- src/components/ui/table.tsx: `TableHead` emite `scope="col"` por padrão (override continua aceito).
- src/components/ui/sparkline.tsx: o SVG decorativo passou a `aria-hidden="true"`.
- src/components/ui/avatar.tsx: `AvatarGroup` troca `key={index}` por chave derivada do conteúdo (`src-alt-fallback-index`).
- Mock seguro: sem rede, sem produção; nenhum Supabase.

## Prova
- vermelho antes: `npx vitest run src/components/ui/__tests__/robustez-primitivos.test.tsx` (com os 7 primitivos restaurados para a base) → `Test Files 1 failed (1); Tests 8 failed | 2 passed (10)` — as 8 falhas são exatamente (a) descrição injetada, (b) tabindex do alvo, (c) três limpezas de timer, (d) scope, (e) aria-hidden e (f) chave do avatar; as 2 que passam são as de "não injetar", que já eram o comportamento da base.
- verde depois: `npx vitest run src/components/ui/__tests__/robustez-primitivos.test.tsx` → `Test Files 1 passed (1); Tests 10 passed (10)`.
- regressão dos testes existentes do atalho: `npx vitest run src/components/ui/__tests__/skip-link.test.tsx src/components/ui/__tests__/skip-link.a11y.test.tsx` → `Test Files 2 passed (2); Tests 8 passed (8)`.
- commit: `fix(ui): endurece primitivos de UI com paridade acessivel da V3`.

## O que NÃO fiz e por quê
- Não portei tokens de design/classes da V3 (bordas, cores, `text-[10px]` do avatar xs, remoção do `aria-label` do atalho): o cartão pede só robustez, e token visual é do worker (design).
- Não troquei o `window.setInterval` do indicador por uma dependência nova: usei `MutationObserver`, que já existe no ambiente.
- O `useOfflineStatus` mantém o `useEffect` com dep `[isOnline]` (igual à V3); por isso o aviso "voltou" tem o mesmo ciclo da V3 — fora do escopo deste cartão.
