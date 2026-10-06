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

O timestamp e o `external_ref` **fazem parte da assinatura**: reenviar o mesmo
corpo com a mesma assinatura e um timestamp novo → **401** (replay bloqueado), e
trocar o `external_ref` depois de assinar → **401**. A assinatura calculada só
sobre o corpo (formato anterior à v1) **não é aceita**.

- Sem os headers, ou timestamp fora da janela, ou assinatura inválida → **401**.
- Corpo acima de 4 KB → **413**.
- `external_ref` ausente, vazio ou não-string → **400** (a assinatura nem é
  verificada).

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
| `external_ref`  | string   | **sim**     | identidade estável do evento; entra na assinatura e é a chave de idempotência — ausente/vazio → **400**, repetido → `duplicate` |
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
| 400    | —                                     | JSON inválido, `action` != `"convert"`, `recipient_id` ou `external_ref` ausente/vazio |
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
**obrigatório desde o esquema v1**. Se o site reenviar o webhook (retry,
reload, double-submit do checkout), a repetição com o mesmo `external_ref` devolve
`duplicate: true` e **não** cria uma segunda linha de conversão — a receita da
campanha não infla. Como ele entra na assinatura, ninguém pode trocar a
identidade do evento de um corpo já assinado, e nenhuma conversão fica de fora
do dedupe atômico do banco.
