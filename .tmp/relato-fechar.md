Especialista: edgar
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 29s;OK lint 4s;OK migrations 0s

## FATOS MEDIDOS PELO FECHAR (14/10 09:18, gerados por máquina: valem mais que números escritos à mão)
```
 .../__tests__/consumo-pago-no-ledger.test.ts       |   2 +-
 .../functions/ai-transcribe-audio/index.test.ts    | 150 +++++++++++++++++
 supabase/functions/ai-transcribe-audio/index.ts    | 187 +++++++++++++++++++--
 3 files changed, 325 insertions(+), 14 deletions(-)
```
- Nenhum arquivo de teste alterado neste cartão (há código alterado SEM teste novo: o revisor exige teste que prove)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts; padrão sensível: caminho:supabase/functions/_share, padrão:service_role|SERVICE


## Sensibilidade
- Padrões tocados: `service_role` (o cliente de Storage já existente em `downloadAudio`), consumo PAGO (`ai_usage_logs`) e o tratamento de erro do handler.
- Nenhuma proteção foi afrouxada: o teto de 25 MiB continua sendo conferido TAMBÉM nos bytes após baixar (o `info` só antecipa a recusa); o rate limit por IP, a autz de mensagem e a checagem de magic bytes seguem intactos. A guarda de consumo (`consumo-pago-no-ledger`) passou a exigir esta função — não foi possível declará-la como dívida.
- Nenhuma referência ao banco/endpoint de produção: testes offline, `fetch` global stubado, sem credencial real.
- O que muda para quem chama: nada no corpo da resposta. Só aparecem dois desfechos novos, ambos falha: `504` quando o provedor/Storage estoura o tempo, e `500` sem texto (`{"error":"Internal server error"}`) no lugar do `error.message` interno.

## O que mudou e por quê
- `supabase/functions/ai-transcribe-audio/index.ts`:
  - Importa `logAiUsageDetached` e grava UMA linha em `ai_usage_logs` por chamada ao STT (`function_name: ai-transcribe-audio`, `billing_unit: "second"`, `usage_unknown: true`, tokens NULL). A rota cobra por segundo e não devolve a quantidade: a ausência é DECLARADA, não virou zero. A tentativa abortada por timeout também é registrada (pode ter sido cobrada).
  - `AbortSignal.timeout`: 60 s no STT (novo 504) e 20 s no download (novo 504). O `signal` também vai no `init` do `fetch`; um invólucro `abortable` garante que um `fetch` pendurado não trave o handler.
  - Tamanho ANTES de baixar: `storage.info(path)` lê `metadata.size` e recusa > 25 MiB sem baixar o objeto; a conferência nos bytes reais após o download continua.
  - `500` sem detalhe interno: o ramo passou a usar `internalErrorResponse` (corpo fixo) em vez de devolver `error.message`.
- `supabase/functions/ai-transcribe-audio/index.test.ts`: 3 testes novos (linha no ledger; 504 com `fetch` pendurado; 500 sem vazar o detalhe interno).
- `supabase/functions/_shared/__tests__/consumo-pago-no-ledger.test.ts`: removida `ai-transcribe-audio` de `PENDENTES_DECLARADAS` (a dívida declarada foi fechada).

## Ramo de erro: antes × depois
- Provedor/Storage estoura o tempo: antes não havia teto (o handler ficava preso). Depois: 504 + estado `failed` + linha de consumo.
- Erro inesperado: antes `500` com `error.message` interno; depois `500` com corpo fixo. O `log.error` interno continua com o detalhe (não muda o diagnóstico do servidor).

## Prova
- vermelho antes: `deno test … consumo-pago-no-ledger.test.ts` com `index.ts` na base → `SL-013: o inventário de provedor pago é FECHADO … FAILED` / `FAILED | 3 passed | 1 failed` (a função falava com provedor pago sem registrar consumo).
- verde depois: `deno test … supabase/functions/ai-transcribe-audio/index.test.ts` → `ok | 14 passed | 0 failed`; `deno test … consumo-pago-no-ledger.test.ts` → `ok | 4 passed | 0 failed`.
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO` (dependencias/tipos/lint/migrations OK; banco não exigido por este cartão).

## Aviso do juiz (não procede)
- "código alterado sem nenhum teste novo/alterado neste commit": NÃO PROCEDE — o mesmo commit inclui `supabase/functions/ai-transcribe-audio/index.test.ts` (+150 linhas, 3 testes G4) e a mudança do guard `consumo-pago-no-ledger.test.ts`; o vermelho→verde acima é a prova, no mesmo commit.

## O que NÃO fiz e por quê
- Não tratei o limite por IP (é o item G1 / cartão próprio).
- Não mexi em `elevenlabs-scribe-token` nem no PK-01 (`t_26f07b15`), que é de outra área/frente.
- O timeout do download vive dentro de `downloadAudio` (produção), que nos testes é injetado, então o 504 do download não tem teste unitário; o critério do cartão pede o 504 do `fetch` do STT, que está provado.
