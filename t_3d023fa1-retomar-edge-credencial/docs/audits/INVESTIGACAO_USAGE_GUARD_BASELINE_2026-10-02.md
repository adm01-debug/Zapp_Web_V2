# supabase-usage-guard — estado do baseline (investigação medida, 02/10/2026)

**Pergunta:** o check `supabase-usage-guard` estaria vermelho na main por baseline
obsoleto em `scripts/db-audit/known-violations.json`.

**Resposta medida: não.** O check está **verde** e o baseline **não tem entrada
obsoleta**. Nenhuma alteração de baseline foi feita — mudar o arquivo sem violação
obsoleta afrouxaria o ratchet sem necessidade.

## Prova — dois ambientes independentes

| onde | comando/ref | resultado |
|---|---|---|
| **Local** (main, `af2591bc`) | `node scripts/db-audit/supabase-usage-guard.mjs` | `exit=0` · `Violacoes totais: 1 \| no baseline: 1 \| novas: 0` · nenhuma obsoleta · `OK: nenhuma violacao nova.` |
| **CI** (run `37047520616`, HEAD `af2591bc`) | step `Validar .from() e .rpc() contra o catalogo` | **`success`** |
| **CI** (PR #1666) | `🔍 Lint & TypeCheck` | **`pass`** |

O `types-sync` na main também está `success` (run `37047520687` e anteriores).

## Estado do baseline

`known` tem **uma** entrada:
`from:department_whatsapp_configs:src/hooks/team-chat/useDepartmentManagement.ts`.

Ela **não é obsoleta**: o guard reporta `no baseline: 1`, isto é, a violação
**continua existindo** no código. O ratchet remove uma entrada apenas quando a
violação **some** — este não é o caso.

`kick_talkx_campaign` **já foi removida** do baseline pela própria esteira
(`types-sync` de 02/10/2026, run `37001256206`), quando o catálogo passou a
incluí-la; o registro está no campo `_resolvido` do próprio arquivo.

## O "vermelho" que existe: PR #1584, obsoleto e de outro dono

`#1584` (`claude/fix-known-violations-kick-261002-1240`, aberto às 12:22) propõe
remover `kick_talkx_campaign` do baseline. Ele está **`CONFLICTING`/`DIRTY`** e tem
`Contrato DB offline` = **fail**, com (run `37006300741`, 12:23):

```
Violacoes totais: 2 | no baseline: 1 | novas: 1
  supabase/functions/talkx-send/index.ts:835  .rpc('kick_talkx_campaign')
```

Ele removeu a entrada **antes** de o catálogo incluir a RPC; a violação virou
**nova** → fail. A esteira depois resolveu sozinha (catálogo regenerado com a RPC +
entrada removida do baseline). **A correção do #1584 já está na main**: o PR ficou
sem propósito e deve ser **fechado**, não mergeado — decisão do dono, não deste chat.

## Não há violação latente esperando a regeneração do catálogo

As tabelas novas que o `DB Live Guard` acusa como drift ainda não estão no
`schema-catalog.json` da main, mas **não são citadas** por `.from()`/`.rpc()` em
`src/` nem em `supabase/functions/` (verificado por busca no código):

- `ai_usage_logs` (IA-051) — colunas `attempt`, `job_id`, `request_id`;
- `talkx_campaign_optouts`, `talkx_optout_keywords` (migration
  `20261002581230_talkx_v4_x029_optout.sql`) — **0 ocorrências** no catálogo e
  **0 usos** no código.

Como o guard só acusa alvo **citado no código** e **ausente do catálogo**, nenhuma
delas vira violação nova quando o catálogo for regenerado — o baseline não apodrece
por causa delas.

## Pendência real (fora deste escopo)

`Contrato DB vivo` = **failure** no HEAD `af2591bc` por **artefatos derivados
defasados** (o banco já tem as colunas; manifesto/catálogo commitados ainda não):
12 colunas, 3 defaults e 3 constraints `só em banco`. É o trabalho do
**`types-sync` (PR #1666)** — mesmo fluxo do #1639. Não duplicado aqui.

## Conclusão operacional

Nenhuma mudança no repositório além deste registro. Para o guard voltar a vermelho
por baseline, seria preciso que uma violação conhecida **desaparecesse do código** —
e nesse momento o próprio guard imprime as chaves a remover, com o comando pronto.
