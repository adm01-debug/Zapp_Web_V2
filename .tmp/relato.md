Especialista: hugo
## O que mudou e por quê
- src/hooks/ui/useUiPreferences.ts: carimbo de tempo por chave na chave reservada `__atualizadoEm` (viaja no cache e no upsert); leitura resolve o conflito chave a chave (vence o mais recente, empate = servidor) e devolve o que o local venceu para a fila; envio só sai depois de leitura bem-sucedida (tenta ler primeiro; sem leitura, a fila espera).
- src/hooks/ui/__tests__/useUiPreferences.test.tsx: 4 asserções exatas atualizadas para o formato com carimbos + 6 testes novos (pontos 1, 2 e 3).
- src/hooks/ui/__tests__/useUiPreferences.integracao.test.tsx: 1 asserção exata atualizada + 1 teste novo (ponto 2 no consumidor useDensity).
- src/hooks/ui/__tests__/useUiPreferences.conta-tema-favoritos.test.tsx: arquivo novo com 4 testes (ponto 4: useThemePreset e useQuickReplies).
## Prova
- vermelho antes (motor original + export shim, testes novos): `npx vitest run src/hooks/ui/__tests__/useUiPreferences.test.tsx` → `Tests 7 failed | 7 passed (14)` (falham os 4 testes de comportamento novos: conflito por chave, upload do cache antigo, edição offline recarregada, envio sem leitura).
- verde depois: `npx vitest run src/hooks/ui/__tests__/useUiPreferences.test.tsx src/hooks/ui/__tests__/useUiPreferences.integracao.test.tsx src/hooks/ui/__tests__/useUiPreferences.conta-tema-favoritos.test.tsx` → `Test Files 3 passed (3); Tests 24 passed (24)`.
- regressão dos consumidores: `npx vitest run src/hooks/ui/__tests__/ src/components/settings/theme/__tests__/` → `Test Files 18 passed (18); Tests 394 passed (394)`; mais 8 arquivos de quem usa os 5 hooks (atalhos, tema, favoritos) → `Test Files 8 passed (8); Tests 42 passed (42)`.
## Pontos do revisor
- Ponto 1: carimbo por chave (`__atualizadoEm` dentro de `prefs`, em src/hooks/ui/useUiPreferences.ts: `UI_PREFERENCES_TIMESTAMPS_KEY`, `mesclarPorRecencia`); edição offline recarregada vence a conta pelo carimbo e volta à fila; valor só no cache (formato antigo, sem carimbos) é enviado. Teste que prova: `conflito vence o mais recente por chave`, `valor que só existe no cache (formato antigo, sem carimbos) é enviado à conta` e `edição offline recarregada antes de subir não se perde` (vermelho antes e verde depois acima).
- Ponto 2: cenários com `localStorage.getItem`/`setItem` lançando erro no motor (`storage bloqueado na leitura`, `storage bloqueado na escrita`) e no consumidor useDensity (`storage bloqueado: o consumidor continua funcionando e a conta recebe`); nada quebra e a conta recebe. Nota honesta: os 2 do motor passam também no motor antigo (o `try/catch` já existia) — são guarda de regressão; o do consumidor exercita o caminho novo ponta a ponta.
- Ponto 3: `enviarPendentes` tenta `loadFromServer` quando `serverPrefs === null` e desiste sem enviar se continuar sem leitura (src/hooks/ui/useUiPreferences.ts). Teste que prova: `sem leitura bem-sucedida o envio NÃO sai` (vermelho antes: upsert chamado; verde depois: `expect(h.upsert).not.toHaveBeenCalled()` e, após `atualizarDoServidor`, 1 upsert mesclado).
- Ponto 4: `useUiPreferences.conta-tema-favoritos.test.tsx` — `useThemePreset: o tema da conta vence o cache e o updateConfig sobe no upsert`, `useThemePreset: edição durante a leitura atrasada`, `useQuickReplies: favoritos da conta vencem o cache e o toggle sobe no upsert`, `useQuickReplies: edição durante a leitura atrasada`. Todos verdes.
## FAIXA DO PAI
Sem cherry-pick neste refazer: trabalhei direto na branch do cartão, que já continha a faixa do pai (migration `20261013143000_user_ui_preferences`, tipos e prova SQL — aprovadas e intocadas aqui) e a entrega anterior. Meu diff contra HEAD nesta sessão: motor + 2 arquivos de teste alterados e 1 arquivo de teste novo.
## O que NÃO fiz e por quê
- Não toquei na migration nem em `src/integrations/supabase/types.ts`: a faixa do pai foi declarada correta pelo revisor.
- Não alterei os 5 hooks consumidores: o contrato deles (`serverPrefs` sem a chave reservada, mesmos nomes) foi preservado de propósito; nenhum doc fora do relato precisou mudar (o comportamento novo está nos comentários do motor).
- Sem identificador de produção em código, teste ou relato.
