# Fontes recuperados: edge functions que rodam em produção sem fonte versionada

Estas funções **não têm fonte no repositório**. O texto em cada `index.ts.txt` foi recuperado do
**bundle publicado** (Management API → corpo `ESZIP2.3` → source map embutido → `sourcesContent`),
sem republicar nada. É cópia fiel do `index.ts` que estava em produção; o `sha256` abaixo é o do
arquivo salvo aqui, para conferência.

**Situação em 01/10/2026:** as duas do Sicoob seguem **no ar**; as duas de lockout foram
**removidas de produção** (junto com as declarações em `supabase/config.toml` e em
`scripts/edge-deploy/legacy-functions.json`) e os arquivos desta pasta ficam como histórico.

| função | versão publicada | publicado em (UTC) | `verify_jwt` | sha256 do fonte | módulo no bundle |
|---|---|---|---|---|---|
| `check-account-lock` | v162 | 2026-09-05T06:50:50Z | `false` | `a5361127e867947928403f0e042744c802e887a4f6019a6231f4856ead8422cf` | `functions/check-account-lock/index.ts` |
| `record-failed-login` | v160 | 2026-09-05T06:50:50Z | `false` | `b174d665f60d2ec136d2e29d7b916e3d7127165c88bcad6b1599ccb20707aa18` | `functions/record-failed-login/index.ts` |
| `sicoob-bridge` | v209 | 2026-09-29T12:57:52Z | `true` | `246f8edb416b1db51540ba0183c847536beea800240cb133de50b7e061170c2f` | `functions/sicoob-bridge/index.ts` |
| `sicoob-bridge-reply` | v209 | 2026-09-29T12:57:52Z | `true` | `4cbe87b0edb091b79eeb452d9312cbac2cc9d286435d33d688b889b358fba432` | `functions/sicoob-bridge-reply/index.ts` |

Os quatro arquivos foram conferidos **byte a byte** contra o `sourcesContent` do bundle publicado
no momento deste PR: idênticos. A extensão `.ts.txt` é deliberada — `.ts` solto aqui seria
capturado pelo lint (`eslint.config.js` varre `**/*.{ts,tsx}`) e pela análise do Sonar, que não
excluem esta pasta; como texto, o arquivo fica inerte para as duas ferramentas.


## Por que não ficam em `supabase/functions/`

A árvore `supabase/functions/` é varrida por `scripts/edge-deploy/manifest-lib.mjs`: **todo
diretório com `index.ts` vira função gerenciada**, entra em `functions[]` do manifesto e é
publicada no próximo deploy de escopo `all`. Trazer estes fontes para lá republicaria as funções
sem que ninguém tenha pedido — por isso a recuperação vive aqui, fora da árvore de deploy.

As duas do Sicoob estão declaradas em `orphan_allowlist` no `supabase/deployment-manifest.json`:
elas rodam sem fonte versionada e a atestação pós-deploy filtra o excedente remoto por essa lista
(`manifest-lib.mjs`). Sem a declaração, **toda** publicação reprovava em
`Remote function set mismatch` e o passo pós-deploy queimava 144 amostras (~24 min). As duas de
lockout foram removidas de produção em 01/10/2026 e saíram das listas: `legacy-functions.json`
ficou vazio e as exceções de `verify_jwt` saíram do `config.toml`.

## Como restaurar (se for decidido)

1. `git mv docs/edge-functions-recovered/<slug>/index.ts.txt supabase/functions/<slug>/index.ts`
2. As duas de lockout: os oito símbolos que elas importam de `_shared/validation.ts` **existem
   hoje** (`handleCors`, `errorResponse`, `jsonResponse`, `requireEnv`, `Logger`, `enforceRateLimit`,
   `getClientIP`, `sanitizeString`). Como as funções foram removidas de produção em 01/10/2026,
   restaurá-las é trazê-las para `supabase/functions/` — lá viram funções gerenciadas, com deploy e
   atestação próprios (o `manifesto` passa a exigir version bump e `verify_jwt` conferido); a
   exceção de `verify_jwt = false` volta a ser necessária se elas forem chamadas antes de existir
   sessão.
3. As duas do Sicoob: os schemas `SicoobBridgeNewMessageSchema`, `SicoobBridgeMarkReadSchema` e
   `SicoobBridgeReplySchema` **não existem mais** em `_shared/schemas.ts` (removidos no desligamento
   do Sicoob). Restaurar exige recriá-los, e religar o Sicoob é decisão de negócio.
4. Regenerar o manifesto no **mesmo commit**: `node scripts/edge-deploy/generate-manifest.mjs`.

## Como reverificar a fidelidade do que está aqui

```bash
TOK=$(cat ~/.supabase/access-token)
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.supabase.com/v1/projects/tnnnlkbymytvtqngbbqh/functions/<slug>/body" -o <slug>.body

# extrai sourcesContent do source map embutido e compara com o arquivo do repo
/usr/bin/python3 - <<'PY'
import json, hashlib, sys
slug = "<slug>"
body = open(slug + ".body", "rb").read()
dec = json.JSONDecoder()
k = body.find(b'"sourcesContent"')
arr, _ = dec.raw_decode(body[body.find(b"[", k):].decode("utf-8", "replace"))
for src, content in zip(["index.ts"], arr):
    h = hashlib.sha256(content.encode()).hexdigest()
    print(slug, src, len(content), h)
PY

sha256sum docs/edge-functions-recovered/<slug>/index.ts.txt   # tem de bater
```
