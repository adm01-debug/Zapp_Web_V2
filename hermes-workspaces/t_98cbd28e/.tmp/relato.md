# Relato t_98cbd28e — ai-usage outbox
Especialista: coordenador

## Reconstrução do workspace
- Workspace limpo criado em `/home/joaquim_ataides/hermes-workspaces/t_98cbd28e` a partir de `dia/2026-10-07` via arquivo do Git, porque os modos usuais de workspace Git foram bloqueados pelo HERMES-GUARD nesta sessão.
- Apliquei o conteúdo do commit anterior `78d70101f` como patch restrito aos dois arquivos permitidos. As referências originais `094b96138` e `538de4318` existem e tocam os mesmos dois arquivos.

## Conferência do código
- [x] devolverPendenciaAOutbox retorna resposta.ok
- [x] gravarNaOutbox propaga resultado do reenfileiramento
- [x] registrarFalhaDeLog emite marcador se gravarNaOutbox false
- [x] teste de conflito com falha no reenfileiramento
- [x] stub simula PATCH de reenfileiramento com erro

## Arquivos alterados contra `dia/2026-10-07`
- supabase/functions/_shared/ai-usage.ts: alterado (32389 -> 48423 bytes)
- supabase/functions/_shared/ai-usage.test.ts: alterado (39274 -> 60452 bytes)
- .tmp/relato.md: relato temporário desta verificação

## Estatística do commit reaproveitado
```
78d70101f fix(edge): propaga falha na baixa da outbox de uso de IA
 supabase/functions/_shared/ai-usage.test.ts | 585 +++++++++++++++++++++++++++-
 supabase/functions/_shared/ai-usage.ts      | 505 ++++++++++++++++++++++--
 2 files changed, 1056 insertions(+), 34 deletions(-)
```

## Teste focal — saída integral
Comando: `deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 supabase/functions/_shared/ai-usage.test.ts`

```
[0m[32mCheck[0m supabase/functions/_shared/ai-usage.test.ts
[0m[38;5;245mrunning 48 tests from ./supabase/functions/_shared/ai-usage.test.ts[0m
logAiUsageDetached: com EdgeRuntime.waitUntil, entrega a promessa ao runtime sem bloquear ... [0m[32mok[0m [0m[38;5;245m(26ms)[0m
logAiUsageDetached: sem EdgeRuntime.waitUntil, AGUARDA a promessa até o insert concluir ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
ai-proxy: os logs de consumo usam `await logAiUsageDetached` (nunca `void logAiUsage`) ... [0m[32mok[0m [0m[38;5;245m(2ms)[0m
IA-051 normalizeCorrelationId: aceita uuid (e canoniza em minúsculas) ... [0m[32mok[0m [0m[38;5;245m(327µs)[0m
IA-051 normalizeCorrelationId: NENHUM dado pessoal passa como identificador de log ... [0m[32mok[0m [0m[38;5;245m(190µs)[0m
IA-051 extractAiRequestId: lê o header do cliente e só aceita uuid ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-051 normalizeAttempt: inteiro pequeno sim, o resto não ... [0m[32mok[0m [0m[38;5;245m(128µs)[0m
IA-051 logAiUsage: grava request_id/job_id/attempt na linha do log ... [0m[32mok[0m [0m[38;5;245m(832µs)[0m
IA-051 logAiUsage: PII entregue como identificador é gravada como NULL, não como dado pessoal ... [0m[32mok[0m [0m[38;5;245m(951µs)[0m
IA-052 logAiUsage: a rota EFETIVA chega ao log sob chaves canônicas ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-052 logAiUsage: provedor de fallback é registrado como quem atendeu ... [0m[32mok[0m [0m[38;5;245m(982µs)[0m
IA-052 logAiUsage: SEM rota, os campos ficam ausentes — nunca inferidos do padrão ... [0m[32mok[0m [0m[38;5;245m(4ms)[0m
IA-052 logAiUsage: id de provedor não-uuid e modalidade desconhecida não viram lixo ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-052 logAiUsage: o metadata do chamador é preservado junto da rota ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-052 normalizeModality: aceita a lista canônica e rejeita o resto ... [0m[32mok[0m [0m[38;5;245m(196µs)[0m
IA-053 extrairUsageDoStream: só medição declarada conta; o resto é ausência ... [0m[32mok[0m [0m[38;5;245m(672µs)[0m
IA-053 medirStream: entrega os bytes INTACTOS e mede o uso do último chunk ... [0m[32mok[0m [0m[38;5;245m(4ms)[0m
IA-053 medirStream: cancelamento no meio é registrado como saída PARCIAL ... [0m[32mok[0m [0m[38;5;245m(809µs)[0m
IA-053 medirStream: falha no meio do stream vira registro com erro ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-053 logAiUsage: consumo não medido grava NULL, e não zero ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-053 logAiUsage: consumo medido grava o número e NÃO marca unknown ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-054 o fallback NÃO vira duas ações: origem que falhou + destino que atendeu ... [0m[32mok[0m [0m[38;5;245m(542µs)[0m
IA-054 retry da fila: três tentativas do mesmo job continuam UMA ação ... [0m[32mok[0m [0m[38;5;245m(187µs)[0m
IA-054 consumo sem medição não entra na soma como zero ... [0m[32mok[0m [0m[38;5;245m(128µs)[0m
IA-054 falha e cancelamento COM consumo cobram; negação sem chamada não ... [0m[32mok[0m [0m[38;5;245m(159µs)[0m
IA-054 a mesma linha duas vezes conta UMA (reentrega de insert não dobra) ... [0m[32mok[0m [0m[38;5;245m(130µs)[0m
IA-054 linha sem identidade de ação conta tentativa, nunca ação ... [0m[32mok[0m [0m[38;5;245m(272µs)[0m
IA-054 identidade da ação: o clique manda, o job é o plano B ... [0m[32mok[0m [0m[38;5;245m(191µs)[0m
IA-054 reconciliação vazia não inventa número ... [0m[32mok[0m [0m[38;5;245m(136µs)[0m
IA-055 reajuste de preço NÃO reescreve o relatório do passado ... [0m[32mok[0m [0m[38;5;245m(560µs)[0m
IA-055 fronteira da vigência: início inclusivo, fim exclusivo ... [0m[32mok[0m [0m[38;5;245m(233µs)[0m
IA-055 sem tarifa vigente o custo é NULL, nunca zero ... [0m[32mok[0m [0m[38;5;245m(198µs)[0m
IA-055 unidade não se mistura: tarifa de segundo não paga token ... [0m[32mok[0m [0m[38;5;245m(229µs)[0m
IA-055 empate de vigência: a tarifa reconciliada vence a interna ... [0m[32mok[0m [0m[38;5;245m(199µs)[0m
IA-055 o resultado declara a FONTE da tarifa usada ... [0m[32mok[0m [0m[38;5;245m(256µs)[0m
IA-055 zero medido ≠ preço ausente, e valor inválido não passa ... [0m[32mok[0m [0m[38;5;245m(326µs)[0m
IA-TIMEOUT-001 a linha leva event_id gerado no produtor e o insert é UPSERT por ON CONFLICT ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-TIMEOUT-001 conteúdo idêntico com eventos distintos grava DUAS linhas (não colapsa) ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-TIMEOUT-001 reentrega do MESMO evento não duplica nem perde ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-TIMEOUT-001 resposta perdida DEPOIS da escrita: a restrição impede a duplicata ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-TIMEOUT-001 falha transitória retenta e o consumo TERMINA gravado ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-TIMEOUT-001 insert esgotado vai para a OUTBOX durável e reprocessa UMA vez ... [0m[32mok[0m [0m[38;5;245m(4ms)[0m
IA-TIMEOUT-001 pendente cuja linha JÁ existe é baixado sem novo consumo (sem duplicar) ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-TIMEOUT-001 falha no PATCH de baixa mantém pendente e não conta como finalizado ... [0m[32mok[0m [0m[38;5;245m(775µs)[0m
IA-TIMEOUT-001 falha EXTERNA ao insert vai para a outbox durável — sem catch mudo ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m
IA-TIMEOUT-001 outbox indisponível: o marcador de console é o ÚLTIMO recurso ... [0m[32mok[0m [0m[38;5;245m(572µs)[0m
IA-TIMEOUT-001 outbox JA ENTREGUE volta a fila quando o mesmo evento falha de novo ... [0m[32mok[0m [0m[38;5;245m(852µs)[0m
IA-TIMEOUT-001 conflito com falha no reenfileiramento emite marcador de perda ... [0m[32mok[0m [0m[38;5;245m(1ms)[0m

[0m[32mok[0m | 48 passed | 0 failed [0m[38;5;245m(97ms)[0m

```
