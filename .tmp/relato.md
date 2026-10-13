Especialista: iris

## O que mudou e por quê
- src/components/contacts/useContactFormValidation.ts: novo `normalizeContactPhone(raw)` — normaliza com `normalizeE164BR` (@/lib/calls/phone) e grava só dígitos com DDI 55 (formato do webhook), validando DDD (11–99) e recusando DDI explícito que não seja +55; devolve a razão em pt-BR. `validatePhone` e o erro do campo `phone` passaram a usar essa função (fim do "Formato inválido (mín. 10 dígitos)").
- src/components/contacts/useContactsCRUD.ts: `handleAddContact` e `handleEditContact` normalizam o telefone antes de gravar (`phone: phone.phone`, só dígitos com 55); telefone inválido não grava e chama `feedback.warning(<razão>)`. Antes `newContact.phone.replace(/\D/g,'')` guardava o número sem DDI (ex.: `11999999999`), criando um segundo contato para o mesmo número.

## Prova
- vermelho antes: `cp .tmp/normalizado.ts` (base) + `npx vitest run src/components/contacts/__tests__/useContactsCRUD.test.tsx` → `Tests  11 failed | 18 passed (29)` (base grava `phone: "14155552671"` no lugar do normalizado).
- verde depois: `npx vitest run src/components/contacts/__tests__/useContactsCRUD.test.tsx src/components/contacts/__tests__/useContactFormValidation.test.ts` → `Test Files  2 passed (2); Tests  66 passed (66)`.
- paridade webhook × cadastro manual: teste compara o telefone gravado no insert com `jidToPhone('5511999999999@s.whatsapp.net')` de @/adapters/evolutionAdapter → igual.
- regressão: `npx vitest run src/components/contacts src/components/inbox/contact-details` → `Test Files  55 passed (55); Tests  503 passed (503)`.
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (49s)`.

## O que NÃO fiz e por quê
- Não toquei em src/lib/calls/phone.ts (`normalizeE164BR`) — fora dos arquivos permitidos; a validação de DDD e de DDI estrangeiro ficou no componente.
- Não alterei o dedupe (`checkDuplicate` por sufixo de 8 dígitos): com o telefone agora canônico, o sufixo continua casando com o que o webhook grava; nenhum teste mudou de comportamento.
