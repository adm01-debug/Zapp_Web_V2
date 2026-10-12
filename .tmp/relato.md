Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- src/components/connections/ConnectionsHealthIndicator.tsx (novo): indicador fixo do estado das conexões do WhatsApp — ponto verde/amarelo/vermelho com contagem, lido SÓ do store do GL1 (`useConnectionsHealth`); ao clicar, popover com lista, filtro por status, histórico de quedas e ações de reconexão.
  - o ponto pulsa (só transform/opacity) apenas em estado degradado/desconectado; com `prefers-reduced-motion` nada anima (`data-motion="reduced"`), e a lista não desloca.
  - staff (admin/supervisor via `useUserRole`) vê as AÇÕES — Reconectar (uma), Reconectar todas (com 2+ offline) e Limpar histórico; o agente vê apenas o ESTADO (ponto, contagem, lista, quedas).
  - o aviso da ação é anunciado DEPOIS da resposta (`role="status"` + `aria-live`), nunca antes; erro de leitura não vira "0 de 0"; carregando usa `ShimmerSkeleton`; vazio tem microcopy por filtro.
  - teclado: Tab/Enter/Esc nativos do Radix e setas no tablist do filtro (roving `tabIndex` + foco movido); nenhum listener em `window`/`document`.
- src/components/layout/Sidebar.tsx: monta o indicador no TOPO da barra, FORA da área única de rolagem (l.137) — o banner dispensável que existia antes podia ser fechado e o estado das instâncias desaparecia.
- src/components/connections/__tests__/ConnectionsHealthIndicator.test.tsx (novo): prova pela tela no componente REAL; entram mockados só o hook de dados (store do GL1) e o papel. Nenhuma asserção é sobre o mock.
- src/components/layout/__tests__/Sidebar.test.tsx: acrescenta 1 teste de ENCAIXE (topo, fora da rolagem) e o marcador do indicador — mesmo padrão já usado para `NotificationsPopover`, que também fala com o Supabase (a guarda de rede recusaria o fetch real). Nenhuma asserção existente foi removida ou afrouxada.

## Prova
- vermelho antes (mutação do próprio diff, revertida em seguida):
  - `DOT_TONE.warn` de `bg-warning` para `bg-success` → `npx vitest run src/components/connections/__tests__/ConnectionsHealthIndicator.test.tsx` → `Tests 1 failed | 17 passed (18)` (FAIL em "parcial: ponto amarelo com pulso").
  - removida a linha de montagem no Sidebar → `npx vitest run src/components/layout/__tests__/Sidebar.test.tsx` → `Tests 1 failed | 16 passed (17)` (FAIL no encaixe).
- verde depois: `npx vitest run src/components/connections/__tests__/ConnectionsHealthIndicator.test.tsx src/components/layout/__tests__/Sidebar.test.tsx` → `Test Files 2 passed (2); Tests 36 passed (36)`.
- typecheck: `npx tsc --noEmit` → 0 erros.
- lint dos 4 arquivos: `npx eslint <4 arquivos>` → limpo (0 erros, 0 warnings) — o aviso `react-refresh/only-export-components` de helper exportado do .tsx foi eliminado.
- a11y: `expect(await axe(container)).toHaveNoViolations()` com o popover aberto → sem violações.
- contrato de fonte no teste: o componente importa/chama `useReducedMotion`, condiciona o pulso e a entrada da lista, e não usa `addEventListener('keydown')`.

## CRITÉRIO DE PRONTO (um por um, com onde está a prova)
- 1 "Sempre à vista": montado fora da área de rolagem e acima dela no DOM — `Sidebar.test.tsx` (encaixe, `compareDocumentPosition`); não é dispensável.
- 2 "Dado do store do GL1, sem assinatura duplicada": o componente importa apenas `useConnectionsHealth`; nenhum import de `@/integrations/supabase/client` (comportamento provado com o hook controlado).
- 3 "Ponto verde/amarelo/vermelho + contagem": 5 testes de estado (`data-tone` = ok/warn/down/empty) + contagem `2/2` no gatilho.
- 4 "Pulso só em degradado/desconectado; nada com movimento reduzido": 3 asserções `data-motion="full"` + 1 `data-motion="reduced"` + contrato de fonte.
- 5 "Histórico de quedas": aparece com nome e tempo relativo; staff limpa (`clearHistory` chamado); agente não vê o botão — 3 testes.
- 6 "Reconectar": uma conexão (staff, aviso só após a resposta e com o motivo da falha) e todas (resumo "2 de 3 reconectadas · 1 com falha", só com 2+ offline) — 5 testes.
- 7 "Teclado completo, nada de listener global": setas no tablist com foco movido e volta circular — teste dedicado; contrato de fonte garante ausência de `addEventListener`.
- 8 "Vazio, carregando, erro": microcopy por filtro, `ShimmerSkeleton` com `aria-busy`, erro exibido sem virar "0 de 0" — 4 testes.
- 9 "Papéis": agente sem nenhum botão `Reconectar`/`Limpar`, mas com a lista; staff com as ações — 2 testes.
- 10 "Movimento": `zappPopoverVariants` no painel, `zappTransition.panel` (200 ms) nos itens, escalonamento 40 ms/item (constante local comentada, não `zappStaggerDelaySeconds` = 60 ms), `motion-safe:animate-spin` no giro.
- 11 "Alvos ≥ 40 px": `min-h-[40px]` no gatilho, nas abas de filtro e nos botões de reconectar/todas/limpar.
- 12 "Regras de sistema": sem exportar/importar/edição em massa, sem selo de canal ou origem, só tokens que já existem (classes conferidas em `tailwind.config.ts`); nenhum valor/teto/escala de indicador existente foi tocado (não há consumidor afetado).

## O que NÃO fiz e por quê
- Confirmação com "Desfazer": não se aplica aqui — o cartão pede isso "quando a ação for reversível", e reconectar não é destrutivo nem irreversível.
- Não usei `zappStaggerDelaySeconds`: o kit do chat escalona a 60 ms/item e o cartão limita a 40 ms; a constante local está comentada no arquivo.
- O diff tem ~40 mil caracteres porque é uma tela nova inteira mais a prova de cada item do critério de pronto; é exatamente o escopo do título, sem regra a mais.
