# Dossiê — claude/feat-pausa-entrega-campanhas-261101-1400 (PR #2472)

**Propósito** (C121, parte 2): instância do WhatsApp pausada (`is_instance_paused` RPC) deve (a) barrar envio em `message-delivery` com 409 + `failClaim`, (b) pausar disparo Multiplix com motivo `instance_paused`, (c) impedir o `talkx-scheduler` de retomar campanhas Talk X enquanto a instância segue pausada (fail-closed), (d) textos de UI para o novo motivo. 14 commits, tip `c256899`, merge-base `1252bb5`.

**Onde foi parar na main**: commit `2cf0153ae chore(pacote 8): resgate de 5 frentes + 2 defeitos reais fechados antes do merge (#3135)` (2026-11-15) reintroduziu `_shared/instance_pause.ts` (+33), `message-delivery/index.ts` (+11), `multiplix-send/index.ts` (+15), `talkx-scheduler/index.ts` (+29), `talkxHealth.ts` (+1). Antes houve `e9da73ad4 revert(db): desfaz squash C121` e `6af86abe4 (#2853)`.

| Arquivo | Achado | Evidência (origin/main) |
|---|---|---|
| `ESTADO.md` | INCORPORADA (âncora gerada; main aponta `talkx-scheduler/index.ts:346`, válida — linha 340-346 é o bloco "Invocar talkx-send") | `ESTADO.md:119` |
| `src/components/multiplix/MultiplixMonitor.tsx` | **PERDIDA** — falta ramo `instance_paused`; UI mostra o slug cru `Pausado automaticamente: instance_paused`, enquanto `multiplix-send` já grava esse motivo | `MultiplixMonitor.tsx:482-490` (só legacy/daily_limit/connection_lost/outside_window); `multiplix-send/index.ts:916` grava `"instance_paused"`; `git grep instance_paused origin/main -- src/components/multiplix/` = vazio |
| `src/components/talkx/tracking/talkxHealth.ts` | INCORPORADA com texto diferente (`'a instância do WhatsApp foi pausada'`) | `talkxHealth.ts:42` |
| `supabase/functions/_shared/instance_pause.test.ts` | INCORPORADA — única diferença é `deno std 0.168.0` → `0.224.0` na main (bump intencional) | `git diff branch origin/main -- <arq>` = só a linha do import |
| `supabase/functions/_shared/instance_pause.ts` | IDENTICAL_TO_MAIN | PRESENT_BYTE |
| `supabase/functions/_shared/talkx-resume-policy.ts` + `__tests__/talkx-resume-policy.test.ts` | IDENTICAL_TO_MAIN | PRESENT_BYTE |
| `supabase/functions/message-delivery/index.ts` | INCORPORADA — import `:14`, checagem antes do carimbo/POST com `failClaim` + 409 em `:757-762`; comentário reescrito (sem a nota "regra 8") | `index.ts:14,753-762,796` |
| `supabase/functions/message-delivery/index.test.ts` | INCORPORADA e ampliada (3 testes C121: 409, fail-open, ordem) | `index.test.ts:302-346` |
| `supabase/functions/multiplix-send/index.ts` | INCORPORADA (comentário sem acentos, mesma lógica) | `index.ts:13,904-916` |
| `supabase/functions/talkx-scheduler/index.ts` | INCORPORADA; comentário fail-closed reescrito e mais completo | `index.ts:25,196-227,257-258` |
| `supabase/functions/talkx-send/process-recipient.ts` | PRESENT_REVERSE_APPLIES | mecânico |

**Veredito: PERDIDA_PARCIAL** — todo o backend e o Talk X entraram; falta só o texto amigável do motivo `instance_paused` no monitor Multiplix (2 linhas, UX, valor baixo). `apagar_branch_seguro=false` até portar.

## Lacuna a recuperar

`src/components/multiplix/MultiplixMonitor.tsx` — inserir antes do fallback `` `Pausado automaticamente: ${dispatch.pause_reason}` `` (main `:489-490`):

```tsx
                : dispatch.pause_reason === 'outside_window'
                  ? 'Pausado automaticamente: fora da janela de envio'
+                  : dispatch.pause_reason === 'instance_paused'
+                  ? 'Pausado automaticamente: a instância foi pausada (retome manualmente depois)'
                  : `Pausado automaticamente: ${dispatch.pause_reason}`}
```

Nota: na main o botão "Retomar" já aparece para qualquer pausa não-legacy (`MultiplixMonitor.tsx`, `isPaused && !isLegacyUnqueued`), então o texto "retome manualmente depois" continua coerente.

## Verificação adversarial

**Concordo: PERDIDA_PARCIAL.** Tentei derrubar a triagem por dois lados (lacuna já na main / lacunas extras não vistas) e nenhum pegou.

A lacuna existe e não está na main:
- `git grep -n instance_paused origin/main -- src/` devolve só `src/components/talkx/tracking/talkxHealth.ts:42` e `src/integrations/supabase/types.ts:13916`. Nada em `src/components/multiplix/`.
- `origin/main:src/components/multiplix/MultiplixMonitor.tsx:479-490`: a cadeia trata `legacy_queue_unmaterialized` / `daily_limit` / `connection_lost` / `outside_window` e cai no fallback `` `Pausado automaticamente: ${dispatch.pause_reason}` `` (`:490`) — o operador lê o slug cru.
- Produtor confirmado na main: `origin/main:supabase/functions/multiplix-send/index.ts:905-916` grava `pause_reason = "instance_paused"`.
- Não foi remoção intencional: `git log -S'instance_paused' --oneline origin/main -- src/components/multiplix/MultiplixMonitor.tsx` = vazio (o ramo nunca existiu na main).
- Encaixa no código atual: o patch é 2 linhas na mesma cadeia ternária que a main tem hoje; único consumidor de `pause_reason` no front Multiplix é esse arquivo (`git grep -n pause_reason origin/main -- src/components/multiplix src/hooks` → só `MultiplixMonitor.tsx:394,479-490` + fixtures de teste), logo não há outro lugar a portar.

Resto do backend: realmente na main, e em versão superior — não há hunk adicional de valor ≥ médio.
- `message-delivery/index.ts:753-762` tem comentário C121 + `isInstancePaused` + `failClaim` + 409 **antes** do carimbo `mark_outbound_post_started` (`:766+`); as 5 linhas "faltantes" do JSON são só o comentário antigo (inclusive a nota "regra 8", obsoleta).
- `message-delivery/index.test.ts:302-350`: três testes C121 na main (409 sem POST, fail-open, guarda de ordem lendo o fonte) — a main checa `pausa > carimbo || pausa > envio`, mais forte que a versão da branch (só `pausa > envio`).
- `talkx-scheduler/index.ts:196-227,257-258`: `instanceIdByConnection`, `pausedInstances`, `instancePauseUnknown` fail-closed e o predicado passado a `selectResumableCampaigns` — comentário da main mais completo que o da branch.
- `talkx-send/process-recipient.ts:18,506,516` (não citado no dossiê como verificado): a main tem `isInstancePaused` e o motivo `"instance_paused"`; o `PRESENT_REVERSE_APPLIES` do JSON se confirma.
- `talkxHealth.ts:42` na main com texto equivalente; `instance_pause.test.ts` difere só no bump `deno std 0.168.0 → 0.224.0`.
- `ESTADO.md:119` (gerado): âncora da main `talkx-scheduler/index.ts:346` aponta para a linha do `resumeCandidates.map(... // talkx-send trata paused como retomada)`, dentro do bloco "Invocar talkx-send" (`:341`) — válida; a âncora `:358` da branch é que está velha.

`apagar_branch_seguro=false` confirmado: a branch guarda as 2 linhas do rótulo até serem portadas.
