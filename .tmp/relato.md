Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- `src/hooks/ui/useOnboarding.ts`: a conclusão do tour deixou de ser inferida da EXISTÊNCIA de uma linha em
  `user_settings` (salvar uma preferência "concluía" o tour por acidente) e passou a LER E GRAVAR a coluna
  `onboarding_completed`, via react-query sob a chave `['user-settings','onboarding-completed', userId]`.
  - `resetOnboarding`: `setQueryData(false)` + UPDATE `onboarding_completed = false` no `user_id` (o cartão pede
    UPDATE). `setQueryData` atinge TODAS as instâncias do hook — por isso o overlay do tour (Index) reaparece na
    hora, sem recarregar, depois do botão de Configurações.
  - `completeOnboarding`: `setQueryData(true)` + upsert `onboarding_completed = true` com `onConflict: 'user_id'`
    (upsert porque quem nunca mexeu em preferências não tem linha; o upsert toca só essa coluna, não as outras
    preferências; o `ignoreDuplicates` antigo foi removido, senão concluir de novo após um reset ficaria em false).
  - `hasCompletedOnboarding`: `null` sem usuário e durante o carregamento; `true` em erro (mantém o comportamento
    anterior de não cobrir a tela do usuário por falha de rede); senão, a coluna.
  - O `localStorage` do tour saiu: era uma segunda fonte da verdade que faria um aparelho com cache velho NÃO
    ver o tour depois do reset em outro aparelho. Agora o banco decide — "outro dispositivo" lê a coluna.
- `src/hooks/__tests__/useOnboarding.test.tsx`: testes que chamam o hook real dentro de um `QueryClientProvider`.
  Cobrem: leitura da coluna (`true`/`false`), ausência de linha = false, coluna `false` mesmo com localStorage
  antigo (prova de que a coluna manda), erro de banco = true, conclusão (upsert com a coluna + cache), conclusão
  mantida quando a gravação falha, reset (UPDATE + cache) e propagação para uma SEGUNDA instância do hook no
  mesmo cache sem recarregar.
- INDISPENSÁVEIS, herdados do cartão pai (`git cherry-pick -x 7b98bb8f8 ca17fe3d8`, commits 469dd8367 e abbe5fd25):
  `supabase/migrations/20261013044344_user_settings_onboarding_completed.sql`,
  `supabase/tests/user_settings_onboarding_completed.sql`, `src/integrations/supabase/types.ts`. Este cartão é a
  ETAPA 2 e manda entregar "sobre 71c5372e2" (o cartão pai), que não está na base local: sem a coluna
  `onboarding_completed` não existe o que ler/gravar, e sem os tipos gerados (`types.ts`) o check `tipos` do
  `zapp-verify` reprova. Nada nesses três arquivos foi alterado por mim além do cherry-pick literal.

## Prova
- vermelho antes (hook da base + o teste desta entrega): `npx vitest run src/hooks/__tests__/useOnboarding.test.tsx`
  → `Test Files 1 failed (1); Tests 6 failed | 4 passed (10)`
- verde depois (mesmo comando, hook novo): `Test Files 1 passed (1); Tests 10 passed (10)`
- consumidores (Configurações + componentes de onboarding): `npx vitest run
  src/hooks/__tests__/useOnboarding.test.tsx src/components/settings/__tests__/SettingsView.test.tsx
  src/components/onboarding` → `Test Files 7 passed (7); Tests 66 passed (66)`
- verificação rápida no fechar: `zapp-verify . --rapido` → `OK db_guard; OK tipos; OK lint; OK migrations` /
  `VERIFY: VERDE SEM BANCO`

## O que NÃO fiz e por quê
- Não toquei em `SettingsView`/`Index`: o botão já chama `resetOnboarding` e o `Index` já observa
  `hasCompletedOnboarding === false` — o único elo que falhava era o estado não ser compartilhado, que é este diff.
- Não usei realtime: o cartão não pede e "outro dispositivo" resolve na próxima leitura da coluna.
