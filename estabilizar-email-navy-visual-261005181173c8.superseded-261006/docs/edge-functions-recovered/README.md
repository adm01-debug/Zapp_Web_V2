# Fontes recuperados de edge functions que rodam (ou rodaram) sem fonte na árvore de deploy

Cada `index.ts.txt` é **cópia fiel do `index.ts` publicado** naquela função, recuperada do bundle
(Management API → corpo `ESZIP2.3` → source map embutido → `sourcesContent`), sem republicar nada.
O `sha256` abaixo é do arquivo salvo aqui e foi conferido contra o `sourcesContent` publicado.

**Situação em 01/10/2026:** as duas do Sicoob seguem **no ar**; as duas de lockout foram
**removidas de produção** (junto com as declarações em `supabase/config.toml` e em
`scripts/edge-deploy/legacy-functions.json`) e os arquivos desta pasta ficam como histórico.

| função | situação em 01/10/2026 | conteúdo publicado em (UTC) | `verify_jwt` | sha256 do fonte | sources embutidos |
|---|---|---|---|---|---|
| `check-account-lock` | **removida** de produção | 2026-09-05T06:50:50Z | `false` (à época) | `a5361127e867947928403f0e042744c802e887a4f6019a6231f4856ead8422cf` | `index.ts` + `_shared/*` (ver nota) |
| `record-failed-login` | **removida** de produção | 2026-09-05T06:50:50Z | `false` (à época) | `b174d665f60d2ec136d2e29d7b916e3d7127165c88bcad6b1599ccb20707aa18` | idem |
| `sicoob-bridge` | **no ar** | 2026-09-29T12:57:52Z | `true` | `246f8edb416b1db51540ba0183c847536beea800240cb133de50b7e061170c2f` | `index.ts`, `_shared/validation.ts`, `_shared/hmac-validation.ts`, `_shared/schemas.ts` |
| `sicoob-bridge-reply` | **no ar** | 2026-09-29T12:57:52Z | `true` | `4cbe87b0edb091b79eeb452d9312cbac2cc9d286435d33d688b889b358fba432` | idem |

A coluna "conteúdo publicado em" vem do campo `updated_at`, que é a data do **bundle** — é o
identificador estável de conteúdo, junto com o `sha256`.

**O campo `version` não é a versão da função.** Medido em 01/10/2026: as 71 funções do projeto
subiram exatamente +1 ao mesmo tempo (168→169, 166→167, 215→216…), mantendo `updated_at` e
`ezbr_sha256` idênticos — é um contador global de deploys do projeto, que sobe a cada publicação de
qualquer função. Por isso ele não aparece nesta tabela: número de versão aqui não identifica
conteúdo.

**O bundle embute as dependências compartilhadas — e elas divergem do `main`.** Medido em
01/10/2026 no `sicoob-bridge`: o `_shared/validation.ts` embutido tem **seis** origens na allowlist
de CORS (`zapp-web-v2.vercel.app`, `zappwebv2-juca1`, `zappwebv2-git-main-juca1`,
`pronto-talk-suite.lovable.app`, `id-preview--1d419c34-…lovable.app` e `…lovableproject.com`),
enquanto o `_shared/validation.ts` do `main` tem **uma** (`https://zapp-web-v2.vercel.app`). Ou
seja: trazer um fonte daqui para a árvore de deploy **não reproduz** o que está no ar — o
comportamento de CORS muda pela dependência compartilhada atual. Restaurar exige comparar também os
`_shared` publicados.

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

O fonte **original** vive dentro do bundle publicado, no `sourcesContent` do source map embutido.
**Não** use `supabase functions download` para conferir esta pasta: medido em 01/10/2026 no
`sicoob-bridge`, ele extrai uma versão **transformada** do módulo (5872 bytes, com
`Deno.serve(async (req)=>{` sem espaços) contra os 5589 bytes do original, e ainda **sobrescreve
`supabase/functions/_shared/*`** com o que está publicado, deixando a árvore de deploy suja (o
download roda em container e grava os arquivos como `root`).

Medição de referência (01/10/2026): `sicoob-bridge/index.ts` = `246f8edb…`, que bate com o arquivo
arquivado aqui; `_shared/validation.ts` publicado = `5b61ce7b…` contra `21cdf66a…` no `main` — a
divergência de CORS descrita acima.

```bash
TOK=$(cat ~/.supabase/access-token)
curl -s -H "Authorization: Bearer $TOK" \
  "https://api.supabase.com/v1/projects/tnnnlkbymytvtqngbbqh/functions/<slug>/body" -o <slug>.body

# extrai TODOS os sourcesContent do(s) source map(s) embutidos e imprime o hash de cada um
/usr/bin/python3 - <slug>.body <<'PY'
import json, hashlib, sys
ANCORA = '"sourcesContent"'
corpo = open(sys.argv[1], "rb").read().decode("utf-8", "replace")
dec, idx, achados = json.JSONDecoder(), 0, []
while True:
    k = corpo.find(ANCORA, idx)
    if k < 0:
        break
    idx = k + len(ANCORA)   # avanca SEMPRE: sem isso o laco relê o mesmo mapa e trava
    inicio = corpo.rfind('{"version":3', max(0, k - 6000), k)
    if inicio < 0:
        continue
    try:
        mapa, _ = dec.raw_decode(corpo[inicio:])
    except ValueError:
        continue
    for src, conteudo in zip(mapa.get("sources") or [], mapa.get("sourcesContent") or []):
        if conteudo is not None:
            print(src, len(conteudo), hashlib.sha256(conteudo.encode()).hexdigest())
PY

sha256sum docs/edge-functions-recovered/<slug>/index.ts.txt   # tem de bater
```
