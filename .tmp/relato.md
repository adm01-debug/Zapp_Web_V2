Especialista: iris

## O que mudou e por quê
- `src/components/ui/supabase-connectivity-banner.tsx` (novo): faixa discreta no topo, tokens do sistema (`bg-warning`/`text-warning-foreground` no aviso, `bg-success`/`text-success-foreground` no retorno), texto pt-BR, `role="status"` + `aria-live="polite"`, botão "Tentar agora" que chama o `retryNow` da sonda do cartão pai, e "Conexão restabelecida" curto (some sozinho). Movimento só em `transform`/`opacity`, desligado por `useReducedMotion` quando o usuário pede movimento reduzido.
- `src/pages/Index.tsx`: SOMENTE a montagem — `SupabaseConnectivityBanner` entra como `lazy` e é renderizado ao lado do `OfflineIndicator`. Nada mais foi tocado.
- `src/components/ui/__tests__/supabase-connectivity-banner.test.tsx` (novo): prova do comportamento abaixo.

## Regra de convivência com o OfflineIndicator
O banner só aparece com o NAVEGADOR online e a sonda em `degraded`/`offline` (backend inacessível). Navegador offline não
renderiza nada aqui: esse estado continua sendo do `OfflineIndicator`. Por isso o banner e o OfflineIndicator nunca aparecem
juntos — o teste cobre exatamente esse par.

## Como a sonda foi reaproveitada
Consumo direto de `useSupabaseConnectivity()` (`status` + `retryNow`) e de `useNetworkStatus()` (`isOnline`), ambos já na
base pelo cartão pai (`v2/usesupabaseconnectivity-sonda-backend-26101215556681 @ caaac3797`, faixa inteira trazida por
`git cherry-pick` porque o pai estava done mas não integrado na branch do dia). O banner não sonda nada por conta própria.
`status === 'offline'` da sonda acontece tanto no navegador offline quanto no backend inacessível; o `useNetworkStatus`
distingue os dois casos (é o que garante a regra acima).

## Prova
- vermelho antes: `npx vitest run src/components/ui/__tests__/supabase-connectivity-banner.test.tsx` com o componente
  ainda ausente (arquivo movido para fora do módulo) → `Test Files 1 failed (1)` / `Tests no tests` (import não resolve).
- verde depois: `npx vitest run src/components/ui/__tests__/supabase-connectivity-banner.test.tsx` →
  `Test Files 1 passed (1)` / `Tests 9 passed (9)`.
- mapa de montagem (não regredir o shell): `npx vitest run src/pages/__tests__/Index.keyboard-dashboard-view.test.tsx` →
  `Test Files 1 passed (1)` / `Tests 3 passed (3)`.
- tipos/lint: `npx tsc --noEmit -p tsconfig.json` sem erro nos arquivos deste cartão; `npx eslint` nos dois arquivos
  novos sem saída (limpo).

## Casos de teste (nomes)
1. não aparece com a sonda online
2. não aparece antes da primeira resposta da sonda (checking)
3. aparece com o backend degradado
4. aparece com o backend inacessível (offline da sonda) e o navegador online
5. não duplica o OfflineIndicator: navegador offline não mostra o banner
6. anuncia por região viva (role=status + aria-live=polite)
7. o botão "Tentar agora" dispara uma nova sonda
8. mostra "Conexão restabelecida" ao voltar e some sozinho
9. respeita movimento reduzido: a faixa entra sem deslocamento inline

O teste monta o componente REAL; só as duas fontes de estado (a sonda e o status de rede do navegador) são dubladas — é o
contrato que o componente consome e o que os casos acima exercitam.

## O que NÃO fiz e por quê
- Não criei exportação, download ou persistência: o banner só mostra estado (nenhuma informação sai do sistema).
- Não mexi na sonda (`useSupabaseConnectivity`) nem no `OfflineIndicator`: a sonda é do cartão pai e o OfflineIndicator
  segue dono do estado de navegador offline.
- Sem migration, Edge Function ou dependência nova.
