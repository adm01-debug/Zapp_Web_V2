Especialista: edgar

## Sensibilidade
- O diff toca o rate limit da Edge (`enforceRateLimit` em message-delivery) e o caminho de `service_role` da mesma função.
- Nenhuma proteção afrouxada no egress: o diff APERTA (passa a rejeitar host arbitrário). A única mitigação de rate limit
  subiu o teto de 60 para 100/min, para bater com o throttle que o próprio cliente já aplica.
- Prova do caso NEGADO: `_shared/__tests__/evolution-api-media-hosts.test.ts` — loopback, link-local, IP literal e domínio
  fora da lista devolvem null/erro.
- Sem referência ao banco ou endpoint de produção; sem segredo.

## Escopo e números (branch × base `dia/2026-10-13`)
- A branch inclui o range do PAI que o cartão manda cherry-pickar (t_ea8decbb = 3 commits: message-delivery/index.ts e
  index.test.ts). Meu trabalho é o commit `65bd3a418`, sobre esse range.
- `git diff --stat dia/2026-10-13..HEAD` = 10 arquivos; 4 são de teste (`src/services/__tests__/chat.service.test.ts`,
  `supabase/functions/_shared/__tests__/evolution-api-media-hosts.test.ts` — meus; `supabase/functions/message-delivery/index.test.ts`
  e `src/hooks/__tests__/useMessageStatus.test.tsx` — o último REMOVIDO por ordem do cartão).

## O que mudou e por quê
- supabase/functions/_shared/evolution-api-proxy.ts: `resolvePrivateBucketUrl` deixava passar QUALQUER https quando a URL
  não era objeto do Storage (é o trecho que o cartão aponta). Agora a URL não-Storage só passa se `resolveMediaEgressUrl`
  (política de `_shared/media-egress.ts`) aceitar; senão lança `media_url de host não permitido`. A política de envio
  (`outboundMediaEgressPolicy`) soma: Storage do projeto (SUPABASE_URL), Evolution (EVOLUTION_API_URL), CDN do WhatsApp,
  extras do operador (MEDIA_EGRESS_ALLOWED_*) e `imagedelivery.net` — o CDN de imagens do catálogo, a MESMA constante
  `CF_IMAGES_HOST` de `src/lib/cfImages.ts` (sem ele, foto de produto quebraria).
- supabase/functions/message-delivery/index.ts: o teto do `enforceRateLimit` era 60/min, abaixo do throttle do cliente
  (`src/lib/sendThrottle.ts`: 5 envios a cada 3 s ≈ 100/min). Passou a `MESSAGE_DELIVERY_RATE_LIMIT_PER_MINUTE = 100`.
- src/services/chat.service.ts: `uploadAudio` subia sempre `.webm`/`audio/webm`; agora nome e contentType saem do tipo do
  blob (helper `resolveAudioUploadMeta`), com fallback webm.
- `useMessageStatus`: REMOVIDO por ordem explícita do cartão ("remova código morto"). Os 3 arquivos que o cartão não lista —
  `src/hooks/chat/useMessageStatus.ts`, `src/hooks/__tests__/useMessageStatus.test.tsx` e a linha de export em
  `src/hooks/chat/index.ts` — são, juntos, o próprio código morto; remover exige tocar nos três. O teste removido era o
  teste do código que o cartão mandou remover (não é afrouxamento de teste de comportamento vivo).

## Prova
- vermelho antes (fonte no stash): `npx vitest run src/services/__tests__/chat.service.test.ts` → `Tests 1 failed | 3 passed`
  (esperava `contact-1/1234567890.ogg`); `deno test .../evolution-api-media-hosts.test.ts` → `error: Type checking failed`.
- verde depois:
  - `npx vitest run src/services/__tests__/chat.service.test.ts` → `Test Files 1 passed (1); Tests 4 passed (4)`
  - `deno test --allow-env --allow-net supabase/functions/_shared/__tests__/evolution-api-media-hosts.test.ts` → `ok | 4 passed | 0 failed`
  - `deno test --allow-env --allow-net --allow-read message-delivery/index.test.ts _shared/__tests__/evolution-api-proxy-circuit-breaker.test.ts _shared/__tests__/media-egress.test.ts` → `ok | 36 passed | 0 failed`

## O que NÃO fiz e por quê
- `useAudioRecorder.uploadAudio` e o nome do arquivo em `ChatPopup` ainda têm `.webm` fixo (mesmo defeito). Não estão nos
  ARQUIVOS QUE PODE TOCAR do cartão — deixei registrado em comentário no cartão para um próximo item.
