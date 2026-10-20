Especialista: senior (area-front-hooks)
Titulo: fix(chat): useMessagePins sem subscription realtime morta — espelho volta a passar
Branch de entrega: v2/mensagens-favoritar-fixar-reportar-lembr-2610111604c123 (patch em .tmp/fix.patch, pronto para aplicar sobre a1915bc8f9)

Ponto 1 — node: the repository has no unresolved or dead Realtime subscriptions.
Causa: `useMessagePins.ts` abria channel realtime em `public.message_pins`, tabela
ausente de `scripts/db-audit/realtime-publication-baseline.json`. A guarda lista a
subscription em `absentFromPublication` e reprova. A subscription seria morta em
produção mesmo se o teste passasse (tabela fora da publicação `supabase_realtime`,
que só a trilha de banco pode alterar — front não traz DDL).
O que mudei:
- `src/hooks/chat/useMessagePins.ts`: removido o `useEffect` de realtime (19 linhas)
  e o `useEffect` do import; docstring atualizada (sem realtime; lista revalida via
  `onSettled` + `staleTime` 30 s). API pública inalterada (mesmos exports/retorno).
- `src/hooks/chat/__tests__/useMessagePins.test.tsx`: caso antigo da subscription
  trocado por `não abre channel de realtime (message_pins está fora da publicação)`,
  que monta o hook e exige `h.channels` vazio; mock do channel enxutado (sem
  `.on`/`.subscribe` mortos) e header atualizado.
Teste que prova:
- Guarda: `node --test scripts/db-audit/check-realtime-subscriptions.test.mjs` —
  VERMELHO antes: `absent: ['public.message_pins']` (1 fail); VERDE depois: 12 pass,
  0 fail. Prova de causalidade: com `useMessagePins.ts` retirado temporariamente,
  12 pass / 0 fail; com ele de volta, o fail retorna.
- Hook: vitest `useMessagePins.test.tsx` — VERMELHO antes: novo teste falha por
  asserção contra o hook antigo (`h.channels` com 1 entrada; 1 failed | 4 passed);
  VERDE depois: 16 passed nos 4 arquivos de hooks da entrega.
Sem defeito novo (2a passada): `rg` por `useMessagePins|messagePinsKey|PIN_LIMIT` em
`src/` — só o hook e o próprio teste usam; nenhum componente de produção importa.
`known-violations.json` e usos `.from`/`.rpc` intactos: saída do
`supabase-usage-guard.mjs` é byte a byte idêntica antes/depois da correção
(`diff` vazio; o exit 1 pré-existe nos dois estados e vem de outro cartão —
`from:department_whatsapp_configs` — e de baseline obsoleta de outro cartão —
`rpc:talkx_campaign_window_open` — ambos fora deste diff).
O que NAO fiz (decisão): não incluí `message_pins` na publicação/baseline. Isso
exige migration (`ALTER PUBLICATION`) da trilha de banco (cartoes t_3f7a2b9b /
t_f025e4be); fiz o hook funcionar sem realtime até lá. Follow-up sugerido à
trilha de banco: incluir a tabela na publicação + baseline e, num cartao futuro,
reintroduzir a subscription.

Arquivos (lista exata, 2):
src/hooks/chat/useMessagePins.ts
src/hooks/chat/__tests__/useMessagePins.test.tsx

Comandos (todos no scratch, raiz da árvore = entrega + patch):
- `node --test scripts/db-audit/check-realtime-subscriptions.test.mjs` → 12 pass, 0 fail (antes: fail com absent `public.message_pins`)
- `./node_modules/.bin/vitest run src/hooks/chat/__tests__/useMessagePins.test.tsx src/hooks/chat/__tests__/useMessageFavorites.test.tsx src/hooks/chat/__tests__/useReportMessage.test.tsx src/hooks/chat/__tests__/useRemindMessage.test.tsx` → 4 passed, 16 passed
- `node scripts/db-audit/supabase-usage-guard.mjs` antes e depois → `diff` vazio (idêntico)
- `node scripts/ci/implicit-any-ratchet.mjs` → 0 errors, exit 0
- `./node_modules/.bin/tsc -b --force` → exit 0
- Patch: 119 linhas / 4846 bytes (2 arquivos), sem ref de projeto de produção.
