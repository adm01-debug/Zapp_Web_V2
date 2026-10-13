# Plano: paridade V3 → V2, doc 13 (components/ui), 2ª passada — 13/10/2026

Documento auditado: `Zapp_Web_V3/docs/estado/13-components-ui.md` (V3 em origin/main de 13/10/2026; o doc em si não mudou). 1ª passada: 12/10 (cartões UI-01..UI-10). Esta passada: 4 leitores somente leitura (fluxos e dados; 116 primitivos arquivo a arquivo; motion/empty/mobile + achados A1–A9 da V3; auditoria da V2 por si mesma). Relatórios: `docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_PARTE1..4`.

## Resultado
- Nenhum item de severidade alta herdado da V3: a V2 é melhor em reduzir movimento, toasts acessíveis (montados), paleta (proteção de resposta atrasada, grupos por papel), chunkReload, mobile shell, Skeleton com variantes e Progress com aria-valuenow.
- Defeitos reais NA V2 achados (muitos a V3 também tem): Ctrl+K quebrado (4 fixme do E2E), 3 sistemas de toast, Skeleton anunciando "Loading..." em cada bloco, framer-motion ignorando prefers-reduced-motion, localStorage sem proteção no provedor raiz, ~1.000 linhas mortas em ui/, 4 componentes de empty state, alvos de toque < 44px, ícones sem nome acessível (~35%), toast cobrindo a barra mobile, cabeçalho mobile com id cru, login 403 mal explicado, atalhos configuráveis sem efeito.
- Correções à 1ª passada: UI-08 está correto (liga a fluxo real; na V3 os itens eram decorativos); UI-07 (PhoneInput da V3 prefixa +55 em qualquer número) → UK-17; UI-05a (sonda não pode ser auth.getSession nem a Edge `health`) → UK-18; UI-10 já tem 17 testes na V2 (só tooltip e plural).
- Decisões do dono SEM cartão: subir react-day-picker 8 → 10; manter o tema com sombra e foco de 2px (V3 é "plano"); tecla global `M` (manter E16); destinos de menu da V3 sem equivalente (`realtime-monitor`, `search-insights` sem cartão: fica para a frente admin/monitoramento).

## Cartões (prefixo UK; ids em `ids.json`)
| Id | Perfil | Escopo |
|---|---|---|
| UK-00 | worker | grava auditorias e plano em docs |
| UK-01 | iris | Skeleton sem "Loading..."; SkeletonRegion |
| UK-02 | iris | MotionConfig na raiz; loops das ilustrações; AnimatedCounter/Typewriter |
| UK-03 | iris | paleta: combobox/listbox/aria-activedescendant |
| UK-04 | iris | reações por teclado + plural |
| UK-05 | iris | chart: valor 0 no tooltip, chaves |
| UK-06a | hugo | um só sistema de toast (adaptador sobre Sonner) |
| UK-07 | iris | um só empty-state; apaga mortos |
| UK-08 | iris | remove ~1.000 linhas mortas de ui/ |
| UK-09 | iris | timers com limpeza; skip-link sem setInterval |
| UK-10 | iris | MobileDrawer acessível ou removido |
| UK-11 | designer | alvos de toque 44px; contraste do X; 2 cores literais |
| UK-12 | iris | emoji-picker resiliente |
| UK-13a/b | workertestes/iris | varredura de ícones sem nome + correção mobile/inbox |
| UK-14 | workertestes | testes de contrato dos primitivos de overlay e boundaries |
| UK-15 | hugo | guarda beforeunload no chunkReload |
| UK-16 | iris | Button aria-busy; overflow de Badge/Tabs/Card; Label |
| UK-17 | iris | PhoneInput sem +55 forçado (ajuste ao UI-07) |
| UK-18 | hugo | sonda de conectividade correta (ajuste ao UI-05a) |
| UK-19 | hugo | **Ctrl/Cmd+K**: um dono, alterna, devolve foco, converte os fixme |
| UK-20 | hugo | localStorage seguro em 12 pontos |
| UK-21 | iris | Sonner mobileOffset |
| UK-22 | iris | título do cabeçalho mobile |
| UK-23 | workerauth | login 403 com mensagem neutra |
| UK-24 | designer | #root-loading |
| UK-25 | hugo | atalhos configuráveis sem executor |
| UK-26 | hugo | remove helpers de feedback mortos |

Encadeamento por arquivo: UK-06a depois de UK-02 (AppProviders); UK-07 depois de UK-02; UK-10 depois de UK-08; UK-13b depois de UK-13a; UK-21 e UK-26 depois de UK-06a.

## Validação final (Claude)
Por cartão: ler o relato, conferir o diff na branch viva, rodar o critério de pronto, ver se integrou na `dia`. Recusas voltam como `[refazer N]` ao senior. Casos especiais: UK-19 (fixme viram testes), UK-06a (1 só toaster), UK-14 (`it.fails` = defeitos a corrigir), UK-17/UK-18 (sobre UI-07/UI-05a).
