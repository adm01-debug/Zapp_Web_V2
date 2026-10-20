Especialista: senior (area-edge-api)
## O que mudou e por quê
- ESTADO.md:121 — âncora da fileira `talkx-link` de `supabase/functions/talkx-send/index.ts:455` para `:124`. A entrega deslocou o construtor da URL de rastreio para a linha 124 (a 455 passou a ser `for (const row of (settingsRows ?? [])...)`, sem o nome da edge). Linha 124 contém `/functions/v1/talkx-link?` — chamador real, grupo B mantido. Nenhuma asserção da guarda foi afrouxada.
- Reaproveitados sem alteração (byte-idênticos ao sha da ponta): os 7 arquivos da entrega — `supabase/functions/_shared/talkx-tracking-token.ts`, `supabase/functions/talkx-link/index.ts`, `supabase/functions/talkx-link/index.test.ts`, `supabase/functions/talkx-send/index.ts`, `supabase/functions/talkx-send/index.test.ts`, `supabase/functions/talkx-send/process-recipient.ts`, `scripts/db-audit/talkx-e90-links-contract.test.mjs`.

FAIXA DO PAI: arquivos acima vindos do commit 4e8144dd5 do cartão t_0bb8577 (entrega original) — reaproveitados como base; minha mudança é só ESTADO.md:121.

## Prova
- vermelho antes (base + entrega, sem meu fix): `node --test scripts/ci/docs-estado-registry-convention.unit.mjs` → `ℹ tests 11 / ℹ pass 10 / ℹ fail 1` + `âncora desatualizada: supabase/functions/talkx-send/index.ts:455 não cita \`talkx-link\`` (log: .tmp/vermelho.log)
- verde depois (com meu fix): mesmo comando → `ℹ tests 11 / ℹ pass 11 / ℹ fail 0` (log: .tmp/verde.log)
- `node --test scripts/db-audit/talkx-e90-links-contract.test.mjs` → `ℹ tests 16 / ℹ pass 16 / ℹ fail 0`
- `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/talkx-link/index.test.ts supabase/functions/talkx-send/index.test.ts` → `ok | 95 passed | 0 failed`
- `node --test scripts/ci/check-talkx-docs.unit.mjs` → `ℹ tests 11 / ℹ pass 11 / ℹ fail 0`
- `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (238s)`, EXIT=0 (AVISO banco_local esperado: sem migration no cartão)

## Pontos do revisor
- Ponto 1: resolvido — ESTADO.md:121 agora cita `supabase/functions/talkx-send/index.ts:124`, linha que contém a própria edge `talkx-link` (URL `/functions/v1/talkx-link?s=…&r=…` montada com o token opaco); prova: guarda 11/11 acima. Causa raiz: a entrega moveu o código e a âncora ficou velha — nenhum outro teste do arquivo quebrou (falha era 1 em 11).

## O que NÃO fiz e por quê
- Não rodei o `ci_espelho.sh` de ponta a ponta: a guarda da sessão bloqueia a execução direta (mesma ressalva da entrega original); executei diretamente o item quebrado mais as suítes irmãs, deno, contrato e verify.
- Sem commit: a guarda de git desta sessão bloqueia escrita sem `.hermes-tarefa` (o iniciar está congelado em modo V1); workspace com os arquivos prontos para o integrador, sem migration e sem tocar produção.

## Arquivos (delta exato contra dia/2026-10-12)
- ESTADO.md (1 linha: fileira talkx-link, :455 → :124)
- scripts/db-audit/talkx-e90-links-contract.test.mjs (da entrega 4e8144dd5, idêntico)
- supabase/functions/_shared/talkx-tracking-token.ts (da entrega 4e8144dd5, idêntico)
- supabase/functions/talkx-link/index.test.ts (da entrega 4e8144dd5, idêntico)
- supabase/functions/talkx-link/index.ts (da entrega 4e8144dd5, idêntico)
- supabase/functions/talkx-send/index.test.ts (da entrega 4e8144dd5, idêntico)
- supabase/functions/talkx-send/index.ts (da entrega 4e8144dd5, idêntico)
- supabase/functions/talkx-send/process-recipient.ts (da entrega 4e8144dd5, idêntico)

Base: dia/2026-10-12. Ponta reaproveitada: 4e8144dd5 (branch v2/refazer-talkx-token-espelho-ci-t-0bb8577-26101201311420).
