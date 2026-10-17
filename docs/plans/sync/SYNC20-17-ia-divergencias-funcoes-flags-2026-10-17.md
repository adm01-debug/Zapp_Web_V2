# SYNC20-17 — IA: funções e flags divergentes entre HEAD e origin

Recorte IA da trilha Edge/config do plano de sincronização (F06). Só diagnóstico:
nenhuma função, flag, migration ou arquivo de código foi alterado; nenhum deploy, nenhum push,
nenhum custo novo.

- **HEAD** = `d723a90107` (branch local do dia, `dia/2026-10-17`)
- **origin** = `origin/main` = `a9b4d6c6fb`
- Data da medição: 17/10/2026
- Escopo: funções Edge de IA (`ai-*`, `chatbot-l1`, `classify-*`, `elevenlabs-*`, `voice-*`,
  `automation-suggest-reply`), o arquivo de flags `_shared/ai-feature-flags.ts` e a dependência de
  banco que cada lado exige para a IA funcionar.
- Fora de escopo: as outras camadas do F06 (CI, workflows, deploy), já cobertas no cartão irmão do
  mapa F06/F07/F15 (rama própria, ainda **não** integrada ao HEAD).

## Como regerar (read-only)

```bash
git fetch origin
# inventário de funções de IA (conta, só-origin, só-HEAD, entrypoint divergente)
python3 - <<'PY'
import json, subprocess
def rows(ref):
    m = json.loads(subprocess.run(['git','show',f'{ref}:supabase/deployment-manifest.json'],
                                  capture_output=True, text=True).stdout)
    IA = ('ai-','chatbot-l1','classify-','elevenlabs','voice-','automation-suggest-reply')
    return {f['name']: f for f in m['functions'] if f['name'].startswith(IA)}
def blob(ref, path):
    return subprocess.run(['git','rev-parse',f'{ref}:{path}'], capture_output=True, text=True).stdout.strip()
a, b = rows('HEAD'), rows('origin/main')
for n in sorted(set(a) & set(b)):
    if blob('HEAD',a[n]['entrypoint']) != blob('origin/main',b[n]['entrypoint']):
        print('entrypoint divergente:', n)
    elif a[n]['source_sha256'] != b[n]['source_sha256']:
        print('entrypoint igual, bundle divergente:', n)
print('só origin:', sorted(set(b)-set(a)), '| só HEAD:', sorted(set(a)-set(b)))
PY
# migrations
comm -13 <(git ls-tree -r --name-only HEAD -- supabase/migrations | sort) \
         <(git ls-tree -r --name-only origin/main -- supabase/migrations | sort) | grep -Ei 'ai|feature_flag|chatbot'
```

## 1. Resumo medido

| Item | HEAD | origin | Diferença |
| --- | --- | --- | --- |
| Funções Edge de IA | 27 | 29 | 2 só-origin, 0 só-HEAD |
| Entrypoint divergente (IA) | — | — | 5 funções |
| Entrypoint igual, hash de bundle divergente | — | — | 22 funções |
| Funções de IA idênticas (entrypoint **e** bundle) | — | — | 0 |
| Compartilhados de IA divergentes | — | — | 1 (`_shared/ai-feature-flags.ts`) |
| Capacidades de IA (`AiCapability`) | 10 | 11 | +`copilot_live` (CV-010) |
| Mapa função→capacidade | 13 entradas | 14 entradas | +`copilot-live` |
| Teste do portão de flags (linhas) | 485 | 122 | −363 linhas na origin |
| Migrations | 878 | 1074 | 197 só-origin, 1 só-HEAD, 3 comuns divergentes (nenhuma de IA) |
| Migrations só-origin do assunto IA | — | 4 | ver §3 |

Funções de IA com `verify_jwt = false`: **1** (`elevenlabs-webhook`), igual nos dois lados.

## 2. Funções de IA

**Só na origin (2)** — não existem em HEAD:
- `supabase/functions/ai-usage-outbox-drain/` (consumidor durável da outbox de uso)
- `supabase/functions/automation-suggest-reply/`

**Só em HEAD:** nenhuma.

**Entrypoint divergente (5)** — mesmo nome, código diferente:

| Função | diff `index.ts` (HEAD→origin) | Assunto do diff |
| --- | --- | --- |
| `ai-suggest-reply` | 25 linhas | seam de teste no `search_knowledge_base` + para de logar o nome do contato (LGPD) |
| `ai-transcribe-audio` | 219 linhas | teto de tempo no download e no STT (`DOWNLOAD_TIMEOUT_MS`/`STT_TIMEOUT_MS`, 504), `logAiUsageDetached`, tamanho conferido antes de baixar |
| `elevenlabs-sfx` | 12 linhas | log só com metadados (LGPD) |
| `elevenlabs-sts` | 97 linhas | refatoração de validação de áudio |
| `voice-changer` | 171 linhas | `logAiUsageDetached`, limites de áudio, `jsonResponse` |

Cada uma dessas (e as só-origin) tem teste próprio na origin
(`ai-usage-outbox-drain` 265, `automation-suggest-reply` 353, `ai-transcribe-audio` 242,
`voice-changer` 695, `ai-suggest-reply` 80, `elevenlabs-sfx` 58, `elevenlabs-sts` 36 linhas).

**Entrypoint igual, bundle divergente (22):** todas as outras funções de IA comuns aos dois lados.
O `source_sha256` do manifesto cobre o bundle (entrypoint **+** `_shared/*`), então a mudança de um
compartilhado muda o hash de todas. Exemplo concreto: `chatbot-l1/index.ts` é **idêntico** nos dois
refs (`git rev-parse` devolve o mesmo blob), mas o hash de bundle mudou — por causa de
`_shared/ai-feature-flags.ts`. Nenhuma dessas 22 tem divergência de código próprio.

## 3. Flags de IA (`_shared/ai-feature-flags.ts`)

Divergência inteira (16 linhas) é a capacidade nova:

| | HEAD | origin |
| --- | --- | --- |
| `AiCapability` | 10 valores, termina em `chatbot_l1` | 11 valores, `+ "copilot_live"` |
| `AI_CAPABILITY_BY_FUNCTION` | 13 entradas | 14 (`+ "copilot-live": "copilot_live"`) |

**`copilot_live` (CV-010) — o que a origin tem e o que não tem:**

- Commit que introduziu, na origin: `fbd422204a` — *feat: CV-010 — adiciona capacidade copilot_live
  ao ai-feature-flags*.
- **A função não existe.** Não há `supabase/functions/copilot-live/` em nenhuma das duas refs, e
  `copilot_live` não é referenciado por nenhum código além do próprio mapa e do teste. A entrada
  `"copilot-live"` é uma capacidade **declarada e sem consumidor** — não desliga nada hoje.
- **A flag não precisa de seed.** O CHECK de chave da tabela (`^[a-z0-9][a-z0-9_.-]{0,63}$`) aceita
  `ai.capability.copilot_live`, e o desenho é "linha ausente = LIGADA". Nenhuma migration da origin
  semeia `ai.capability.*`.

**Conflito medido (vermelho/verde), porque isso muda a ordem do resgate:**

```bash
deno test --allow-all --no-check supabase/functions/_shared/__tests__/ai-feature-flags.test.ts
```

- HEAD, como está: `ok | 22 passed | 0 failed`.
- HEAD **com o `ai-feature-flags.ts` da origin** (só o arquivo, sem mexer no teste):
  `FAILED | 21 passed | 1 failed` — *"a chave é uma por capacidade do desenho IA-009, sem faltar nem
  inventar" / o mapa de funções->capacidades divergiu do desenho IA-009*.

Ou seja: **resgatar só o arquivo de flag da origin derruba o teste local.** A origin "resolveu" isso
trocando o teste: o mesmo commit `fbd422204a` substituiu o arquivo de 485 linhas por um de 122
(363 linhas a menos de cobertura do portão). Na branch `codex/sincronizacao-ledger-20261016` o
mesmo CV-010 foi feito do jeito certo: **arquivo novo** `__tests__/ai-feature-flags-copilot-live.test.ts`,
sem apagar o teste grande. Resgate da flag deve seguir o caminho do ledger (atualizar a expectativa
no teste de 485 linhas ou trazer o arquivo extra), nunca trazer o teste da main.

## 4. Dependência de banco

Migrations: HEAD 878, origin 1074 → 197 só-origin, 1 só-HEAD, 877 comuns, das quais 3 divergem em
conteúdo (nenhuma do assunto IA). Das 197 só-origin, **4 são do assunto IA**:

**4.1 `20261015211127_chatbot_flows_ai_l1.sql` — bloqueia o Chatbot IA inteiro em HEAD**

- O código já está igual nos dois lados: `supabase/functions/chatbot-l1/index.ts` é idêntico, e
  `src/components/settings/ChatbotL1Config.tsx` grava `trigger_type: 'ai_l1'` nos dois refs.
- O CHECK de `chatbot_flows.trigger_type` em HEAD
  (`20260315151618_8e3fca18-74ac-4877-84f4-d2a02cfaf24f.sql:46`) só aceita
  `('keyword','first_message','menu','webhook','schedule')`. Logo, **em HEAD a UI do Chatbot IA falha
  na primeira gravação com 23514**.
- A migration é aditiva: amplia o CHECK com `ai_l1` e cria o índice único parcial de **um** fluxo
  `ai_l1` ativo por `whatsapp_connection_id` (o `chatbot-l1` lê o fluxo com `maybeSingle()`, que
  estoura com duas linhas).

**4.2 `20261006203249_ai_replace_tags_preserva_humana.sql` — RPC de tags**

- `supabase/functions/ai-auto-tag/index.ts` chama `replace_ai_conversation_tags` e é **idêntico** nos
  dois refs; a definição que HEAD tem é a anterior (`20260930110000_ai_block03_analysis_persistence.sql`).
  Divergência é de **comportamento** da RPC (preservar tag de origem humana), não de assinatura.

**4.3 `20261011150527_feature_flags_rollout.sql` — mexe na tabela das flags**

- Aditivo nas colunas: `rollout_percentage`, `allowed_roles`, `allowed_user_ids`,
  `blocked_user_ids`, `expires_at`, `metadata`.
- Cria a RPC `public.evaluate_feature_flags()`, que **não tem consumidor em código** nem na origin
  (avaliação de flag no servidor, ainda sem chamador).
- Troca as policies: sai o SELECT amplo para `authenticated` (`feature_flags_select_authenticated`,
  `USING (true)`) e entram select admin/supervisor + escrita admin.
- **Risco direto:** `src/hooks/system/useFeatureFlag.ts` é idêntico nos dois lados e lê
  `feature_flags` **direto como usuário autenticado**. Com a policy nova, quem não é admin/supervisor
  recebe 0 linhas **sem erro** → a flag cai no `fallback` (false) → **flag silenciosamente desligada**
  para o usuário comum. O portão de IA **não** é afetado: ele lê a tabela com service role (ignora RLS).
- Semear 11 flags `chat_*` é efeito colateral dessa migration.

**4.4 `20261013213816_ai_sentiment_summary.sql`** — cria a RPC `ai_sentiment_summary(integer)`; zero
referências em código nas duas refs. Dependência de banco sem consumidor.

**Já satisfeito — as duas funções só-origin não pedem banco novo:**

- `ai_usage_outbox` (`20261008210159_ia_usage_outbox_duravel.sql` + `20261009012702_ia_outbox_stats_hmac.sql`)
  é **idêntica** nos dois lados → `ai-usage-outbox-drain` roda no banco de HEAD.
- `search_knowledge_base` (`20260318134952`) existe nos dois → `automation-suggest-reply` e
  `chatbot-l1` sem dependência nova.

## 5. Ordem que o resgate precisa respeitar

1. **`chatbot-l1` é migration, não código.** O código já está igual; o que falta em HEAD é a migration
   do §4.1, sem a qual o Chatbot IA só devolve 23514.
2. **A migration de rollout de flags não pode ir sozinha** (§4.3): ela desliga as flags para quem não
   é admin/supervisor, porque o front continua lendo a tabela direto. Ou vai junto com o front
   passando a consumir `evaluate_feature_flags`, ou não vai.
3. **CV-010 não é ganho de runtime.** É uma capacidade sem função e sem consumidor (§3); e trazer o
   arquivo de flag sem mexer no teste deixa HEAD vermelho (medido).
4. `ai-usage-outbox-drain` e `automation-suggest-reply` são resgate de código puro: banco já pronto,
   nenhuma migration pendente.

## 6. Coordenação (quem faz o quê)

- **worker (sql)** — as 4 migrations do assunto (§4). Nenhuma migration foi criada ou aplicada aqui.
- **worker (hooks)** — `src/hooks/system/useFeatureFlag.ts` (consumir `evaluate_feature_flags`) e
  `src/components/settings/ChatbotL1Config.tsx` (§4.1, §4.3). Não toquei nesses arquivos.
- **worker (ia)** — resgate das funções e do arquivo de flags, com o teste de 485 linhas preservado.

## 7. Fora do recorte (registrado)

- As outras 193 migrations só-origin e as 3 comuns divergentes (team_chat/storage, login_gate_rpc,
  team_receipts) não são do assunto IA.
- `elevenlabs-webhook` é a única função de IA com `verify_jwt = false` (nos dois lados); regra de
  rede/acesso é do worker (auth).
- Os totais de funções deste recorte batem com o mapa irmão F06/F07/F15 (81 funções ao todo em HEAD,
  84 na origin).
