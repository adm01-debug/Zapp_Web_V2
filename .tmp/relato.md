Especialista: Hugo (area-front-hooks)

Concluído: sim. Os três pontos do cartão estão no diff e a verificação passou verde.

## O que mudou e por quê
- src/hooks/system/useUserSettings.ts: `theme` e `language` deixaram de ser campos inertes do estado. Ao trocar na aba Aparência, `updateSettings` chama na hora o dono de cada um (`useTheme().setTheme` para o tema, `changeAppLanguage` — o mesmo caminho do `useLanguage().changeLanguage` — para o idioma), então a interface muda imediatamente e o cache do boot (`localStorage['theme']`/`['language']`) já sai com o código normalizado.
- src/hooks/system/useUserSettings.ts: hidratação no login — o que veio do banco (`user_settings.theme|language`) passa a valer neste dispositivo (`aplicarPreferencias`). Antes, salvar 'Escuro' em um computador não mudava nada no outro.
- src/hooks/system/useUserSettings.ts: `browser_notifications_enabled` saiu do upsert global. A coluna é posse do hook canônico `useNotificationSettings`, que grava no clique do interruptor; o upsert lia a cópia do mount e DESFAZIA a escolha do usuário ao clicar em "Salvar Alterações".
- src/hooks/system/useUserSettings.ts: guarda de corrida — `escolhaLocalRef` + flag `ativo`. Resposta atrasada do banco não sobrescreve o tema/idioma que o usuário acabou de escolher (nem no estado, nem nos donos), e resposta que chega depois do unmount não mexe mais em nada.
- src/i18n/index.ts: `normalizeLanguage` (`pt-BR`→`pt`, `en-US`→`en`) e `changeAppLanguage`; o boot (`lng:`) e o `useLanguage().changeLanguage` usam o mesmo caminho. Antes, o `pt-BR` que a aba Aparência grava no banco não existe em `resources` e o i18n caía no fallback — a interface ficava sempre em português.
- src/hooks/__tests__/useUserSettings.tema-idioma.test.tsx (novo): 6 testes com o hook real.
- src/hooks/__tests__/useUserSettings.test.tsx: 3 asserções do payload mudaram para o contrato novo. Todas ficaram MAIS ESTRITAS (antes exigiam `browser_notifications_enabled` no payload; agora exigem que a coluna NÃO esteja lá) — nada foi afrouxado.

## Prova
- vermelho antes: `npx vitest run src/hooks/__tests__/useUserSettings.tema-idioma.test.tsx` com os fontes de `dia/2026-10-13` → `Tests 5 failed | 1 passed (6)` (ex.: `expected { user_id: 'u1', …(6) } to not have property "browser_notifications_enabled"`; `expected 'dark' to be 'light'` na corrida).
- verde depois: `npx vitest run src/hooks/__tests__/useUserSettings.test.tsx src/hooks/__tests__/useUserSettings.tema-idioma.test.tsx` → `Test Files 2 passed (2); Tests 16 passed (16)`.
- regressão da área de Configurações: `npx vitest run src/components/settings/__tests__ …` → `Test Files 28 passed (28); Tests 437 passed (437)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` com `OK tipos`, `OK lint`, `OK db_guard` e `OK migrations`. O cartão não pede DDL nenhum (tema e idioma já existem em `user_settings`; a coluna de notificações é escrita pelo hook canônico), então o banco local não faz parte da prova deste diff.

## O que NÃO fiz e por quê
- Não toquei em src/components/settings/SettingsView.tsx nem em AppearanceSettings.tsx (arquivos de tela, área da Íris): o botão "Salvar Alterações" continua existindo e agora grava só campos que são posse deste hook (`theme`, `language`, `compact_mode`, `tts_*`), então o rótulo segue verdadeiro. Os `<Select>` já chamam `updateSettings`; a ligação aconteceu por dentro do hook, sem mudar o contrato da tela.
- Não mexi em useTheme.ts: o `setTheme` existente já grava `localStorage['theme']` e a classe no `<html>`; a hidratação passou a usá-lo.
- Nenhum DDL: o cartão cita "SQL" mas a coluna `user_settings.theme|language` já é usada por este hook.
