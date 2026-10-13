Especialista: complexo (auditoria de teste RTL + inspeção de componente; sem escrita de código)

## Veredito
VEREDITO: defeito inexistente na base — nada a corrigir, nenhum commit. O diff deste workspace está vazio.

## O que foi verificado e por quê
- `src/components/talkx/TalkXSuppression.tsx`: `editReasonOptions` não existe no arquivo; nenhum item com `value=""` (o único `value=""` em `src/components/talkx/` é um `<option>` nativo em `TalkXCampaignRunning.tsx:896`, fora do escopo).
- `REASON_CODES` tem os 6 códigos do enum (`opt_out`, `invalid_number`, `bounce`, `no_commercial_permission`, `lgpd`, `manual`), idênticos ao tipo `ReasonCode` local (linha 36) e ao enum `talkx_blacklist_reason` em `src/integrations/supabase/types.ts`.
- `openEdit` faz `setEditReason(entry.reason_code ?? 'manual')` (nunca `""`); `openBulkEdit` usa `'keep'`, cujo item `Manter atual` só é renderizado no modo bulk; o `Select` é controlado (`value={editReason}`, sempre string definida). Todo valor possível de `editReason` corresponde a um item renderizado.
- Falhas silenciosas (critério 4): não existe sentinela-placeholder neste código (a premissa do "disabled" não se aplica); `'keep'` nunca é persistido (`saveEdit` só grava quando `editReason !== 'keep'`); `openEdit`/`openBulkEdit` sempre zeram motivo/expiração/data ao abrir, e fechar define `editing` null — sem estado residual entre abrir/fechar.

## Prova
- Suite de guarda do cartão-irmão (arquivo em `v2/teste-rtl-select-reason-null-261013013039ca`, executada aqui a partir do branch, sem commit): `npx vitest run src/components/talkx/__tests__/TalkXSuppression.editReasonVazio.test.tsx` → `Test Files 1 passed (1); Tests 3 passed (3)` na base intacta.
- Prova por mutação (minha, revertida em seguida com `git checkout --`): injetei `<SelectItem value="">` no modal → `Test Files 1 failed (1); Tests 3 failed (3)`; após reverter, 3/3 verdes. O teste é sensível ao defeito e chama a tela real (mocks só de fronteira: cliente supabase, auth, atividade, sonner); a lista esperada hardcoded é a especificação dos 6 rótulos, não tautologia.
- Suite pré-existente do módulo: `npx vitest run` nos 10 arquivos `TalkXSuppression.*.test.tsx` + `TalkXSuppressionReasons.test.tsx` → `Test Files 10 passed (10); Tests 71 passed (71)`.
- `git diff dia/2026-10-13...v2/remover-value-vazio-editreasonoptions-261013090512ee --stat`: só `.tmp/relato.md` (zero código — confirma o relato do cartão-irmão). `git diff ...v2/teste-rtl-select-reason-null-261013013039ca --stat`: só relato + 1 arquivo novo de teste (nenhuma mudança em produção).

## O que NÃO fiz e por quê
- Não commitei nada: auditoria sem defeito não tem o que commitar (diff vazio, confirmado por `git status --short` limpo).
- NÃO CONCLUÍ o critério 5 integralmente: `zapp-verify . --rapido` → `VERIFY: VERMELHO em tipos`, 2 execuções, causa `tsc saiu 137 em app` (processo Killed por OOM; máquina com load ~58 e 42/47 GB usados, `free`/`uptime` medidos na hora). `jev-juiz falha` no log: `environment`. Como o diff está vazio, o vermelho não tem relação com este cartão; segui a regra do juiz (rodei 1x extra, repetiu, registro e sigo sem mexer em código). Demais portões medidos: `OK dependencias`, `OK db_guard`.
