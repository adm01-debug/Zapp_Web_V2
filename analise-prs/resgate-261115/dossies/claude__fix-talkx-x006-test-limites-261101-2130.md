# Dossiê — claude__fix-talkx-x006-test-limites-261101-2130 (PR #2516)

**Branch:** `origin/claude/fix-talkx-x006-test-limites-261101-2130` · tip `992c155d1` · merge-base `1252bb5a4` · 1 commit
**Commit:** `992c155d1 fix(talkx): adicionar caso de aceite X006 no TalkX.test.tsx`
**Triagem anterior (2026-11-08):** OBSOLETA · pré-classificação mecânica: TRABALHO_AUSENTE_APLICA_LIMPO

## Propósito
Adicionar ao `src/components/talkx/__tests__/TalkX.test.tsx` um `describe('Talk X — Limites de Envio (X006)')` com 4 casos unitários sobre `limitsPayload()` (segundos → ms, janela "HH:mm" → "HH:mm:00", janela vazia → null) + remover 1 linha de comentário redundante no teste `handles exact hour`.

## Arquivo × achado × evidência

| Arquivo | Status mecânico | Achado | Evidência na main |
|---|---|---|---|
| `src/components/talkx/__tests__/TalkX.test.tsx` | ABSENT_APPLIES_CLEAN (49 linhas ausentes) | **Intenção já coberta em outros arquivos de teste da main** — os 4 casos têm equivalente (mesma função `limitsPayload` ou mesma asserção via UI) | ver tabela abaixo |

### Hunk a hunk (branch → main)

| Caso na branch | Equivalente na main | Linha |
|---|---|---|
| `digitar 10 gera payload com send_interval_min=10000` (min 10→10000, max 20→20000) | `TalkXLimitsDialog.test.tsx` "digitar 10 no intervalo mínimo entrega send_interval_min=10000 (ms), nunca 10" — asserções `toBe(10000)`/`toBe(20000)` | `src/components/talkx/__tests__/TalkXLimitsDialog.test.tsx:95,104-105`; também `TalkXCampaignRunning.limits.test.tsx:121,137-138` (fio completo até `updateCampaignLimits`) |
| `grava piso correto: 3 s → 3000 ms` (fast 3/8 → 3000/8000) | `talkxLimits.test.ts` "perfil fast devolve 3000–8000" + "10 s salva 10000" (`secondsToMs`, a mesma função que `limitsPayload` usa em `talkxCampaignRules.ts:98-99`) | `src/components/talkx/__tests__/talkxLimits.test.ts:16-17,28-29`; `src/components/talkx/tracking/talkxCampaignRules.ts:96-105` |
| `janela de envio é convertida para o formato do banco` ('08:00'→'08:00:00', business_hours_only=true) | `TalkXLimitsDialog.test.tsx` "trocar para Lento…" asserta `send_window_start='08:00:00'`, `send_window_end='18:00:00'`; "janela em branco vira null" asserta `business_hours_only` true | `TalkXLimitsDialog.test.tsx:119-120,177` |
| `janela vazia → null no payload` | `TalkXLimitsDialog.test.tsx` "janela em branco vira null (o par precisa ser válido no servidor)" — chama `limitsPayload` direto, `toBeNull()` em start/end | `TalkXLimitsDialog.test.tsx:170-176` |
| Remoção de 1 linha de comentário em `handles exact hour` (`// Need to find values that give exactly 60 min`) | Comentário ainda está na main (`TalkX.test.tsx:246-247`) — cosmético, sem efeito | valor: nenhum |

Observação: a main foi além da branch — `TalkXLimitsDialog.test.tsx:158-168` cobre também o bug de `Math.max` silencioso (min>max) e `:146-155` a lista branca de chaves da RPC. O modal foi extraído para `tracking/TalkXLimitsDialog.tsx` (X154/TL-161) e os testes acompanharam (commits `025d0258d`, `41853318c` em `origin/main`).

## Veredito
**INCORPORADA** (confiança alta). Nenhuma asserção da branch está sem equivalente na main; a única diferença é organizacional (os testes vivem em `TalkXLimitsDialog.test.tsx`, `TalkXCampaignRunning.limits.test.tsx` e `talkxLimits.test.ts` em vez de `TalkX.test.tsx`). A triagem anterior ("OBSOLETA") estava direcionalmente certa: nada a portar.

## Lacunas a recuperar
Nenhuma. A remoção da linha de comentário em `TalkX.test.tsx:246` é cosmética (valor nenhum) e não justifica PR.

## apagar_branch_seguro
**true** — único arquivo, todas as intenções provadas na main por arquivo:linha.

## Verificação adversarial

Refutação tentada hunk a hunk sobre `git diff 1252bb5a4 origin/claude/fix-talkx-x006-test-limites-261101-2130` (único arquivo: `src/components/talkx/__tests__/TalkX.test.tsx`, +63/-2). Conclusão: **triagem confirmada — INCORPORADA**, nenhum hunk de valor ≥ médio fora da main.

| Hunk da branch | Está na main? | Prova (origin/main) |
|---|---|---|
| `import { limitsPayload } from '../tracking/talkxCampaignRules'` | sim, o módulo existe e já é importado por teste da main | `src/components/talkx/tracking/talkxCampaignRules.ts:96` (`limitsPayload`); importado em `src/components/talkx/__tests__/TalkXLimitsDialog.test.tsx:25` |
| `digitar 10 → send_interval_min=10000 / max=20000` | sim, duas vezes e mais forte (uma via UI até a RPC) | `TalkXLimitsDialog.test.tsx:95-106`; `TalkXCampaignRunning.limits.test.tsx:121,137-138` (assere `mutateAsync` com `limits.send_interval_min=10000`) |
| `fast 3 s → 3000 / 8 → 8000` | equivalente, não literal | `talkxLimits.test.ts:16-17` (`secondsToMs(10)=10000`) e `:28-29` (`intervalForProfile('fast')=[3000,8000]`). `limitsPayload` só chama `secondsToMs` (`talkxCampaignRules.ts:98-99`) e repassa `speed_profile` sem lógica — a variante numérica 3/8 não exercita caminho novo. Valor: **baixo** (duplicata numérica), abaixo do corte |
| `janela '08:00'→'08:00:00', '18:00'→'18:00:00'` | sim, ida-e-volta real | fixture `CAMPAIGN.send_window_start='08:00:00'` (`TalkXLimitsDialog.test.tsx:56-57`) → `limitsDraftFromCampaign` fatia para `'08:00'` (`talkxCampaignRules.ts:83-84`) → teste assere `'08:00:00'`/`'18:00:00'` no payload (`TalkXLimitsDialog.test.tsx:119-120`) |
| `business_hours_only=true no payload` | sim | `TalkXLimitsDialog.test.tsx:178` |
| `janela vazia → send_window_start/end null` | sim, mesma função chamada direto | `TalkXLimitsDialog.test.tsx:170-177` (`limitsPayload` com `windowStart:''` → `toBeNull()`) |
| remoção de 2 linhas de comentário em `handles exact hour` (troca por 1) | comentário segue na main | `TalkX.test.tsx:246-247`. A branch **perde** uma linha de explicação; aplicar seria regressão cosmética |

Checagens extras:
- Nada foi removido de propósito da main nesse caminho: `git log -S"limitsPayload" --oneline origin/main -- src/components/talkx/__tests__/TalkX.test.tsx` → vazio (o describe X006 nunca existiu nesse arquivo na main; não é reversão).
- `grep X006|limitsPayload|Limites` em `origin/main:src/components/talkx/__tests__/TalkX.test.tsx` → vazio, confirmando que o hunk aplica limpo; o `line_check.missing_in_main=49` é real, mas é ausência de **texto**, não de **cobertura**.
- A main cobre além da branch: `Math.max` silencioso (`TalkXLimitsDialog.test.tsx:158-168`), lista branca de chaves da RPC (`:146-155`), piso de 1 s recusado (`:123-133`), min>max recusado (`:135-144`).

`apagar_branch_seguro = true`. Lacunas adicionais: nenhuma.
