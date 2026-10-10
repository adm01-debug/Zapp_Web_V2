# Webhook Security - HMAC Signature Validation

## Overview

O ZAPP-WEB implementa validação de assinatura HMAC-SHA256 para webhooks recebidos da Evolution API. Isso garante que apenas requisições autênticas (originadas da Evolution API com o secret correto) sejam processadas.

## Como Funciona

### 1. Fluxo de Validação

```
Evolution API → envia payload + HMAC signature → Supabase Edge Function
                                                        ↓
                                              Extrai signature do header
                                                        ↓
                                              Computa HMAC do payload
                                                        ↓
                                              Compara signatures (timing-safe)
                                                        ↓
                                              ✓ Válido → Processa
                                              ✗ Inválido → Rejeita (401)
```

### 2. Headers Suportados

O sistema verifica os seguintes headers em ordem de precedência:

1. `x-hub-signature-256` (GitHub-style)
2. `x-signature` (Generic)
3. `x-webhook-signature` (Alternative)
4. `x-evolution-signature` (Evolution API specific)
5. `x-api-signature` (API Gateway style)

### 3. Formato da Assinatura

A assinatura pode estar em dois formatos:
- Com prefixo: `sha256=abc123...`
- Apenas hex: `abc123...`

## Configuração

### Variáveis de Ambiente (Supabase)

```bash
# Secret compartilhado com a Evolution API
EVOLUTION_WEBHOOK_SECRET=seu-secret-aqui
```

### Configuração na Evolution API

Ao configurar o webhook na Evolution API, defina o mesmo secret:

```json
{
  "enabled": true,
  "url": "https://xxxx.supabase.co/functions/v1/evolution-webhook",
  "webhookByEvents": true,
  "webhookBase64": false,
  "webhookSecret": "seu-secret-aqui"
}
```

## Uso no Código

### Método 1: WebhookSecurityService (Recomendado)

```typescript
import { WebhookSecurityService } from '../_shared/validation.ts';

const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET');

// strictMode=false permite requests sem signature (backwards compatible)
// strictMode=true rejeita requests sem signature
const security = new WebhookSecurityService(webhookSecret!, false);

serve(async (req) => {
  const validation = await security.validateRequest(req);
  
  if (!validation.valid) {
    return new Response(JSON.stringify({ error: validation.error }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const payload = JSON.parse(validation.payload!);
  // ... processar webhook
});
```

### Método 2: Função Helper

```typescript
import { createWebhookValidator } from '../_shared/validation.ts';

const validateWebhook = createWebhookValidator(
  Deno.env.get('EVOLUTION_WEBHOOK_SECRET')!,
  false // strictMode
);

serve(async (req) => {
  const validation = await validateWebhook(req);
  // ...
});
```

### Método 3: Validação Manual

```typescript
import { verifyHmacSignature, extractSignatureFromHeaders } from '../_shared/validation.ts';

serve(async (req) => {
  const signature = extractSignatureFromHeaders(req.headers);
  const payload = await req.text();
  const secret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET')!;
  
  if (signature && !await verifyHmacSignature(payload, signature, secret)) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  // ...
});
```

## Segurança

### Timing-Safe Comparison

A comparação de assinaturas usa algoritmo de tempo constante para prevenir ataques de timing:

```typescript
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do full comparison to maintain constant time
    let dummy = 0;
    for (let i = 0; i < a.length; i++) {
      dummy |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
```

### Web Crypto API

Usa a API nativa `crypto.subtle` para operações criptográficas, garantindo implementação segura e performática.

## Modos de Operação

### Non-Strict Mode (Default)

- Requests **com** signature: validados
- Requests **sem** signature: permitidos (backwards compatible)
- Útil durante migração ou quando Evolution API não envia signature

### Strict Mode

- Requests **com** signature válida: permitidos
- Requests **com** signature inválida: rejeitados (401)
- Requests **sem** signature: rejeitados (401)
- Recomendado para produção após configuração completa

## Troubleshooting

### Signature Inválida

1. Verifique se o secret é idêntico em ambos os lados
2. Confirme que o payload não foi modificado em trânsito
3. Verifique encoding (UTF-8)

### Signature Não Encontrada

1. Confirme que Evolution API está configurada com `webhookSecret`
2. Verifique se o header está sendo passado corretamente
3. Logs mostrarão `[HMAC] No signature found`

### Logs de Auditoria

Todos os eventos de validação são logados:

```
[HMAC] Signature validated successfully
[HMAC] Invalid signature received
[HMAC] No signature found, allowing request (non-strict mode)
[HMAC] Strict mode: rejecting request without signature
```

## Geração de Assinatura (Para Testes)

```typescript
const security = new WebhookSecurityService('my-secret');
const signature = await security.signPayload(JSON.stringify(testPayload));
console.log(signature); // sha256=abc123...
```

## Referências

- [RFC 2104 - HMAC](https://datatracker.ietf.org/doc/html/rfc2104)
- [Web Crypto API - SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto)
- [Evolution API Webhooks](https://doc.evolution-api.com/v1/webhooks)
