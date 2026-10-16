Especialista: worker (sql) (area-sql-banco)

# SL-010b (cartão [retomar]): o pedido NÃO TEM OBJETO na ponta atual

## Como resolvi o motivo do cartão (conflito com a ponta do dia)
O workspace já está na ponta: `dia/2026-10-16` = `dia/2026-10-15` = `d723a90107` = `HEAD`
(`git for-each-ref refs/heads/dia/`), árvore limpa. Não havia o que trazer — nenhum merge/rebase
foi necessário. E, conferido o pedido no código ATUAL, **as 9 Edge ElevenLabs do pedido já leem a
flag no servidor**: o defeito do pedido já foi corrigido por entregas que entraram na ponta antes
deste cartão. Portanto **fecho sem commit de código**, como o cartão manda nesse caso.

Não fiz cherry-pick da branch antiga (`v2/sl-010b-kill-switch-elevenlabs-26100819465821` @
`afc6b27269`): o conteúdo dela foi SUPERADO na ponta por outro caminho e trazê-la de volta
reintroduziria o módulo `_shared/ai-kill-switch.ts` (que não existe mais) e duplicaria a guarda já
presente em cada função. Confirmei que os 3 commits daquela branch não são ancestrais do `HEAD`
(`git merge-base --is-ancestor` devolve NÃO) — não é regressão, é entrega refeita por outra via.

## Prova 1 — a guarda existe e vem ANTES da chamada ao provedor, nas 9 funções
Comando: `grep -n` da guarda e da URL `api.elevenlabs.io`, por arquivo (`guard = leitura da flag`,
`prov = chamada paga`), comparando as linhas:

    elevenlabs-tts/index             OK  guarda=32 < provedor=53
    elevenlabs-tts-stream/index      OK  guarda=33 < provedor=54
    elevenlabs-sfx/request           OK  guarda=18 < provedor=40
    elevenlabs-sts/index             OK  guarda=113 < provedor=162
    elevenlabs-dialogue/index        OK  guarda=58 < provedor=81
    elevenlabs-voice-design/index    OK  guarda=23 < provedor=44
    elevenlabs-agent-token/index     OK  guarda=27 < provedor=44
    elevenlabs-scribe-token/index    OK  guarda=27 < provedor=42
    voice-changer/index              OK  guarda=50 < provedor=89

Quem entregou isso na ponta (já integrado, `git log --oneline -S`):
- `51e29781c3` (14/10) — tts, tts-stream, sfx (`request.ts`) e sts;
- `98124a6590` (14/10) — agent-token e scribe-token (emissão de token);
- `368c087d3c` (14/10) — dialogue, voice-design e voice-changer.

## Prova 2 — a suíte exercita a guarda real e está verde AGORA
Comando (mesmo do CI, `ci.yml` linha 96, restrito aos 10 arquivos de teste envolvidos):

    deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read \
      --allow-net=127.0.0.1 supabase/functions/_shared/__tests__/ai-feature-flags.test.ts \
      supabase/functions/elevenlabs-{tts,tts-stream,sfx,sts,dialogue,voice-design,agent-token,scribe-token}/index.test.ts \
      supabase/functions/voice-changer/index.test.ts      → exit=0

Linha de resultado: `ok | 68 passed | 0 failed (1s)`
Log cru: `.tmp/deno-kill-switch-elevenlabs.log`

Cada uma das 9 funções tem teste NEGADO que mede o efeito do cartão (flag desligada → 503 e ZERO
chamada ao provedor), por exemplo: `elevenlabs-tts/index.test.ts` "IA-009: flag de voz desligada ->
503 AI_DISABLED e ZERO chamada ao provedor pago"; `voice-changer/index.test.ts`
"IA-009/SL-010b: capacidade de voz desligada -> 503, sem provedor e sem consumir limite";
`elevenlabs-sfx/index.test.ts`, `elevenlabs-sts/index.test.ts`,
`elevenlabs-agent-token/index.test.ts`, `elevenlabs-scribe-token/index.test.ts` idem com o mesmo
título; `elevenlabs-tts-stream/index.test.ts` idem; `elevenlabs-dialogue/index.test.ts` e
`elevenlabs-voice-design/index.test.ts` cobrem preview+create.

## Mecanismo vigente na ponta (o cartão pedia `evaluateAiKillSwitch`; a ponta usa `ai-feature-flags`)
O pedido manda importar `evaluateAiKillSwitch` de `_shared/ai-kill-switch.ts` e usar a chave
`ai.provider.elevenlabs` além de `ai.capability.voice`. Na ponta esse módulo NÃO existe
(`git ls-tree -r --name-only HEAD -- supabase/functions/_shared | grep -i kill` = vazio;
`git grep -n "evaluateAiKillSwitch" HEAD -- supabase/functions` = vazio). O mecanismo que a ponta
usa, e que é o vigente, é `_shared/ai-feature-flags.ts`:
- funções com `Deno.serve` inline leem `readCapabilityFlag(aiCapabilityFlagKey("voice"))` e negam com
  `jsonResponse({ error: { code: "AI_DISABLED" } }, 503, req)`;
- dialogue, voice-design e voice-changer chamam `enforceAiCapability({ functionName, req })`, que
  nega com 503 e código `AI_CAPABILITY_DISABLED` (`ai-feature-flags.ts:169-177`).
Mesmo desfecho exigido pelo cartão (flag desligada = 503 e nenhuma chamada ao provedor). A decisão
pedida pelo cartão está tomada e escrita no código: a família de voz/áudio INTEIRA responde à chave
única `ai.capability.voice` (`ai-feature-flags.ts:67-72`); chave por provedor (`ai.provider.*`) e por
conexão ficaram declaradas como escopo do cartão irmão SL-010/IA-039 (`ai-feature-flags.ts:19-22`).
Não existe migration semeando `ai.capability.*` na ponta (as 3 de `feature_flags` são outras), e o
desenho vigente é "linha ausente = LIGADA" (`ai-feature-flags.ts:11-16`) — logo não falta chave e
não há migration a criar.

## O que NÃO fiz e por quê
- Não mudei código: o único commit desta branch é este relato (`chore(ia): confere que o kill switch
  ja existe na ponta nas 9 Edge ElevenLabs`), como o cartão manda quando o defeito já não existe;
  `git diff HEAD -- supabase src` = vazio.
- Não editei nenhuma das 9 funções nem os testes: as 9 já fazem o pedido e a suíte delas está verde.
- Não criei migration: o desenho vigente não semeia as chaves e a ausência vale LIGADA.
- Fronteira: o pedido é de Edge (`supabase/functions/elevenlabs-*`, `voice-changer/*`), área do
  worker (edge). Não toquei em nada fora da minha área; como a entrega não tem objeto, não há parte
  de banco pendente para outro especialista — nada a delegar.

## Evidência limpa de verificação (comandos rodados nesta sessão)
    $ deno test --config scripts/ci/deno.json --frozen --allow-env --allow-read --allow-net=127.0.0.1 \
        supabase/functions/_shared/__tests__/ai-feature-flags.test.ts \
        supabase/functions/elevenlabs-{tts,tts-stream,sfx,sts,dialogue,voice-design,agent-token,scribe-token}/index.test.ts \
        supabase/functions/voice-changer/index.test.ts
    ok | 68 passed | 0 failed (1s)            exit=0     (log: .tmp/deno-kill-switch-elevenlabs.log)

    $ for f in <os 9 arquivos>; do grep -n guarda "$f"; grep -n api.elevenlabs.io "$f"; done
    9/9 OK — guarda ANTES da chamada ao provedor:
    tts 32<53, tts-stream 33<54, sfx/request 18<40, sts 113<162, dialogue 58<81,
    voice-design 23<44, agent-token 27<44, scribe-token 27<42, voice-changer 50<89

A verificação completa (`zapp-verify . --rapido`) é rodada pelo próprio `hermes-tarefa-fechar` nesta
entrega.

CONCLUSÃO: concluído — o pedido do SL-010b não tem objeto na ponta de 16/10 (já entregue e verde);
nenhuma mudança de código, nenhuma migration, nada a integrar além deste relato.
