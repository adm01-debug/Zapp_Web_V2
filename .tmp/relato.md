Especialista: Hugo (area-front-hooks)

## O que mudou e por quê
- src/hooks/business/useBusinessHours.ts: `saveSettings` deixou o laço de `upsert` dia a dia e passa a gravar a semana em UMA chamada da RPC atômica `save_business_hours` (`p_connection_id`, `p_days` com os 7 dias) — uma função no banco = uma transação, então falha no meio não grava metade da semana. A RPC não toca `away_messages`: a mensagem de ausência só é gravada quando a tela que a edita passa `away` (parâmetro agora opcional, ação separada do horário).
- src/components/settings/ScheduleSettings.tsx: `handleSave` chama `await saveSettings(hours)` (sem `away`) e deixa de destruturar `awayMessage`. Esta aba não edita a mensagem de ausência, então não a cria sozinha — quem salva a ausência é a aba Mensagens, com `saveSettings([], away)`, que continua funcionando. Comentários ajustados (upsert -> RPC; texto diz o que o código faz).
- Testes: o contrato dos dois arquivos foi trocado de `upsert` para a RPC, provando a atomicidade e a ausência de escrita de `away_messages` pela aba de horário.

## Prova
- vermelho antes (fonte da base `dia/2026-10-13` + os testes novos): `npx vitest run src/hooks/__tests__/useBusinessHours.test.tsx src/components/settings/__tests__/ScheduleSettings.test.tsx` -> `Test Files 2 failed (2); Tests 6 failed | 8 passed (14)`
- verde depois: `npx vitest run src/hooks/__tests__/useBusinessHours.test.tsx src/components/settings/__tests__/ScheduleSettings.test.tsx` -> `Test Files 2 passed (2); Tests 14 passed (14)`
- contrato dos vizinhos (a mensagem de ausência continua salvando): `npx vitest run src/hooks/__tests__/useBusinessHours.test.tsx src/components/settings/__tests__/ScheduleSettings.test.tsx src/components/settings/__tests__/MessagesSettings.test.tsx` -> `Test Files 3 passed (3); Tests 20 passed (20)`

## Chamadores do contrato alterado (conferidos)
- `src/components/settings/MessagesSettings.tsx` (`saveSettings([], away)`) e `src/components/connections/BusinessHoursDialog.tsx` (`saveSettings(hours, away)`): como `away` virou opcional e a RPC só sai quando `hours.length > 0`, os dois seguem salvando o que salvavam. `MessagesSettings.test.tsx` (que garante "nenhuma escrita em business_hours sai desta aba") continua passando.

## O que NÃO fiz e por quê
- Não removi a gravação de `away_messages` do hook: ela é usada pela aba Mensagens, que edita a ausência (fora do meu escopo de arquivos). O que a tela de horário deixou de fazer é criá-la sozinha.
- Não mexi na migration/RPC (cartão pai, t_7fa76169): apenas a chamo pelo nome/assinatura que ela expõe.
## Arquivos do cartão pai na branch (por que ficam)
- `supabase/migrations/20261013050848_templates_global_e_save_business_hours.sql`, `supabase/tests/templates_global_e_business_hours_atomico.sql` e `src/integrations/supabase/types.ts` não são edição minha: são a faixa do cartão PAI (t_7fa76169, sha d9e0c46f1) que eu trouxe para esta base com `git cherry-pick` da faixa `dia/2026-10-13..d9e0c46f1`. Sem eles a RPC `save_business_hours` que este cartão passa a chamar não existe: `types.ts` é o tipo que autoriza a chamada e a migration é o corpo da função. Tirá-los deixa o diff deste cartão sem a RPC que o título promete, então ficam.
- A migration também troca as policies `message_templates_is_global_insert_requer_staff` / `..._update_requer_staff` — é do cartão pai (`is_global` exige staff), não deste cartão; eu não toquei em `message_templates`, em policy nem em RLS. Meu diff é só o front (hook, tela e os dois testes).
