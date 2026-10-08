# Conversões do Talk X — endpoint de registro (talkx-link POST)

Este documento descreve como o **site de destino** de um link rastreável registra
uma conversão (compra, cadastro, etc.) atribuída a um destinatário de campanha.

## Endpoint

```
POST /functions/v1/talkx-link
```

> O mesmo endpoint `talkx-link` atende o clique (GET) e a conversão (POST). O
> POST é público e **sem sessão** — a autenticação é por assinatura HMAC, não por
> JWT.

## Autenticação (obrigatória)

Sem o secret configurado no ambiente (`TALKX_CONVERT_SECRET`), o endpoint
responde **503** (indisponível). Com o secret, toda requisição precisa de dois
headers:

| Header               | Valor                                                              |
| -------------------- | ------------------------------------------------------------------ |
| `x-talkx-timestamp`  | Timestamp UNIX em **milissegundos** (aceito com tolerância de ±5 min) |
| `x-talkx-signature`  | `HMAC-SHA256(secret, payload_canonico)` em hex, minúsculo           |

A assinatura (**esquema v1**) é calculada sobre a representação canônica:

```
v1\n<timestamp>\n<external_ref>\n<corpo_cru>
```

ou seja, `["v1", timestamp, external_ref, corpo_cru].join("\n")`, onde
`timestamp` é o valor exato enviado em `x-talkx-timestamp`, `external_ref` é o
campo `external_ref` do JSON e `corpo_cru` são os bytes exatos enviados, sem
reformatação. A comparação é em tempo constante.

O timestamp e o `external_ref` **fazem parte da assinatura v1**: reenviar o
mesmo corpo com a mesma assinatura e um timestamp novo → **401** (replay
bloqueado), e trocar o `external_ref` depois de assinar → **401**.

Para coexistência com o emissor externo já publicado, o formato anterior à v1
(`HMAC-SHA256(secret, corpo_cru)`) também é aceito até a data configurada em
`TALKX_LEGACY_SIGNATURE_ACCEPT_UNTIL` (ISO 8601 ou epoch em milissegundos). Se a
variável não vier preenchida, o padrão local é `2026-10-20T23:59:59.999-03:00`
(14 dias da decisão de 06/10). Cada requisição legada aceita registra aviso de
depreciação no log. Depois da data-limite, só o esquema v1 é aceito.

- Sem os headers, ou timestamp fora da janela, ou assinatura inválida → **401**.
- Corpo acima de 4 KB → **413**.
- `external_ref` ausente, vazio ou não-string no esquema v1 → **400**. No
  formato legado ele continua opcional até a data-limite.

## Corpo da requisição (JSON)

```json
{
  "action": "convert",
  "recipient_id": "<uuid do destinatário — o `r` do link>",
  "value": 150.00,
  "source": "checkout",
  "external_ref": "pedido-12345",
  "link_id": "<uuid do link clicado, opcional>",
  "currency": "BRL",
  "occurred_at": "2026-10-03T12:00:00Z",
  "attribution": { "produto": "caneca" }
}
```

| Campo           | Tipo     | Obrigatório | Observação                                                        |
| --------------- | -------- | ----------- | ----------------------------------------------------------------- |
| `action`        | string   | sim         | sempre `"convert"`                                                |
| `recipient_id`  | string   | sim         | vem do parâmetro `r` da URL do link                               |
| `value`         | number   | não         | valor da conversão; `texto`/negativo/não-finito → **422**          |
| `external_ref`  | string   | **sim no v1** | identidade estável do evento; entra na assinatura v1 e é a chave de idempotência — no legado permanece opcional até a data-limite |
| `source`        | string   | não         | canal (padrão `"webhook"`)                                        |
| `link_id`       | string   | não         | link clicado; rejeitado se for de outra campanha                  |
| `currency`      | string   | não         | moeda (padrão `"BRL"`)                                            |
| `occurred_at`   | string   | não         | instante da conversão (ISO 8601)                                  |
| `attribution`   | object   | não         | metadados livres (jsonb)                                          |

## Respostas

| Código | Corpo                                | Significado                                      |
| ------ | ------------------------------------- | ------------------------------------------------ |
| 200    | `{ "success": true, "campaign_id": ... }` | conversão gravada                            |
| 200    | `{ "duplicate": true, "campaign_id": ... }` | `external_ref` repetido — **não** duplica   |
| 400    | —                                     | JSON inválido, `action` != `"convert"`, `recipient_id` ausente ou `external_ref` ausente/vazio no v1 |
| 401    | —                                     | autenticação ausente/inválida/vencida           |
| 404    | —                                     | `recipient_id` não encontrado                   |
| 413    | —                                     | corpo acima de 4 KB                             |
| 422    | `{ "error": "invalid_value" }`        | `value` inválido ou link de outra campanha      |
| 500    | `{ "error": "conversion_failed" }`    | falha genérica (sem texto do banco)             |
| 503    | —                                     | `TALKX_CONVERT_SECRET` não configurado          |

A resposta **nunca** inclui texto de erro do banco.

## Snippet de referência (Node.js)

```js
import { createHmac } from "node:crypto";

const TALKX_CONVERT_SECRET = process.env.TALKX_CONVERT_SECRET;
const TALKX_LINK_ENDPOINT = "https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/talkx-link";

async function registrarConversao({ recipientId, value, externalRef, linkId, source = "checkout" }) {
  const body = JSON.stringify({
    action: "convert",
    recipient_id: recipientId,
    value,
    external_ref: externalRef,
    link_id: linkId ?? undefined,
    source,
  });

  const timestamp = String(Date.now());
  // Esquema v1: a assinatura cobre versão + timestamp + external_ref + corpo,
  // então cada reenvio exige assinatura nova e um replay capturado não vale.
  const payloadCanonico = ["v1", timestamp, externalRef, body].join("\n");
  const signature = createHmac("sha256", TALKX_CONVERT_SECRET).update(payloadCanonico).digest("hex");

  const res = await fetch(TALKX_LINK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-talkx-timestamp": timestamp,
      "x-talkx-signature": signature,
    },
    body,
  });

  if (res.status === 401 || res.status === 503) {
    throw new Error(`Conversão não registrada (${res.status}) — confira o secret e o relógio`);
  }
  if (res.status === 422) {
    // value inválido ou link de outra campanha — corrigir antes de reenviar
    console.warn("Conversão rejeitada: valor/link inválido");
    return { status: "rejected" };
  }

  const payload = await res.json();
  return payload.duplicate ? { status: "duplicate" } : { status: "recorded" };
}
```

## Por que `external_ref`

O `external_ref` é a identidade estável do evento e a chave de idempotência —
**obrigatório no esquema v1**. Durante a janela de coexistência, o formato legado
pode omitir esse campo para não quebrar o emissor já publicado; depois da
data-limite, só o v1 é aceito. Se o site reenviar o webhook (retry, reload,
double-submit do checkout), a repetição com o mesmo `external_ref` devolve
`duplicate: true` e **não** cria uma segunda linha de conversão — a receita da
campanha não infla. Como ele entra na assinatura v1, ninguém pode trocar a
identidade do evento de um corpo já assinado.
