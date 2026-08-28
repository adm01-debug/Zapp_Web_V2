# 🔄 HANDOFF — ZAPP-WEB × Evolution API Security Improvements

> ⚠️ **DOCUMENTO HISTÓRICO — REFERÊNCIAS DE BANCO DESATUALIZADAS (auditoria 2026-08-28)**
> O projeto Supabase citado abaixo como "Supabase ZAPP" (`allrjhkpuscmgbsnmjlv`)
> é um banco **antigo e desativado**. O banco oficial do ZAPP é
> `https://tnnnlkbymytvtqngbbqh.supabase.co` (ver `docs/DEPLOYMENT.md`).
> Mantido apenas como registro histórico — não usar como referência operacional.

**Data:** 2026-04-12  
**Sessão:** Execução sequencial de 10 melhorias rumo a 10/10  
**Status:** MELHORIA 1/10 — 95% COMPLETA  

---

## 🎯 MISSÃO

Implementar 10 melhorias de segurança, resiliência e qualidade no webhook do ZAPP-WEB para Evolution API. **Execução mode**: Claude executa diretamente via MCP, sem pedir confirmação ao usuário.

---

## 📦 REPOSITÓRIO

| Campo | Valor |
|-------|-------|
| **GitHub** | `adm01-debug/zapp-web` |
| **Branch** | `main` |
| **Supabase ZAPP** | `allrjhkpuscmgbsnmjlv` |
| **Supabase CRM** | `pgxfvjmuubtbowutlide` |
| **Evolution Instance** | `wpp2` |
| **Stack** | React 18.3.1 + Vite 5 + TypeScript + Supabase + shadcn/ui |

---

## ✅ COMMITS JÁ REALIZADOS

| SHA | Descrição |
|-----|-----------|
| `40edca60` | `docs:` gaps analysis + webhook events documentation |
| `f56a2326` | `feat:` Chat Controller endpoints |
| `e21581d3` | `feat:` evolution-health edge function |
| `cb18f69d` | `docs:` atualização de progresso |
| `8dce955b` | `feat:` módulo HMAC-validation + docs/WEBHOOK_SECURITY.md |

---

## 🔧 MELHORIA 1/10 — SEGURANÇA WEBHOOK (95% COMPLETA)

### O que já foi feito

O arquivo `evolution-webhook/index.ts` foi preparado localmente com:

| Componente | Status | Descrição |
|------------|--------|-----------|
| **HMAC-SHA256 Validation** | ✅ | Valida assinatura do webhook com constant-time comparison |
| **Rate Limiting** | ✅ | 200 req/min por IP, retorna 429 com `Retry-After` |
| **Security Headers** | ✅ | HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection |
| **Presence Enhanced** | ✅ | Persiste `last_seen_at` e `presence_status` no contato |
| **19 Event Handlers** | ✅ | Todos preservados do original |

### O que falta

1. **Corrigir desbalanceamento de sintaxe** (falta 1 `}` e 1 `)`)
2. **Fazer commit** do arquivo final para o GitHub
3. **SHA do arquivo atual:** `d0b6e64b2a8598de742bee5fd35005dd61721d6e`

### Código de Segurança a Inserir

```typescript
// No início do arquivo, após imports e corsHeaders:

async function validateHmacSignature(
  req: Request,
  bodyText: string
): Promise<{ valid: boolean; reason?: string }> {
  const webhookSecret = Deno.env.get('WEBHOOK_SECRET') || Deno.env.get('EVOLUTION_WEBHOOK_SECRET');
  
  if (!webhookSecret) {
    console.warn('[Security] WEBHOOK_SECRET not configured - skipping signature validation');
    return { valid: true, reason: 'no_secret_configured' };
  }

  const signatureHeader = req.headers.get('X-Hub-Signature-256') 
    || req.headers.get('X-Webhook-Signature')
    || req.headers.get('X-Signature');

  if (!signatureHeader) {
    return { valid: false, reason: 'missing_signature_header' };
  }

  const signatureMatch = signatureHeader.match(/^sha256=([a-f0-9]+)$/i);
  const receivedSignature = signatureMatch ? signatureMatch[1].toLowerCase() : signatureHeader.toLowerCase();

  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(webhookSecret);
    const messageData = encoder.encode(bodyText);

    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Constant-time comparison
    if (receivedSignature.length !== expectedSignature.length) {
      return { valid: false, reason: 'signature_length_mismatch' };
    }

    let result = 0;
    for (let i = 0; i < receivedSignature.length; i++) {
      result |= receivedSignature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
    }

    return result === 0 ? { valid: true } : { valid: false, reason: 'signature_mismatch' };
  } catch (error) {
    console.error('[Security] HMAC validation error:', error);
    return { valid: false, reason: 'validation_error' };
  }
}

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_REQUESTS = 200;
const RATE_LIMIT_WINDOW_MS = 60000;

function checkRateLimit(clientIp: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(clientIp, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= RATE_LIMIT_REQUESTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetTime - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}

function getClientIp(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || req.headers.get('x-real-ip') 
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
}

function getSecurityHeaders(): Record<string, string> {
  return {
    ...corsHeaders,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  };
}
```

### Modificação do serve()

```typescript
serve(async (req) => {
  const securityHeaders = getSecurityHeaders();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: securityHeaders });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: securityHeaders });
  }

  // Rate Limiting
  const clientIp = getClientIp(req);
  const rateCheck = checkRateLimit(clientIp);
  if (!rateCheck.allowed) {
    return new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), {
      status: 429,
      headers: { ...securityHeaders, 'Content-Type': 'application/json', 'Retry-After': String(rateCheck.retryAfter) },
    });
  }

  // Read body as text for HMAC
  const bodyText = await req.text();
  
  // HMAC Validation
  const hmacResult = await validateHmacSignature(req, bodyText);
  if (!hmacResult.valid) {
    return new Response(JSON.stringify({ error: 'invalid_signature', reason: hmacResult.reason }), {
      status: 401,
      headers: { ...securityHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload: WebhookPayload = JSON.parse(bodyText);
    // ... resto do código original ...
```

---

## 📋 MELHORIAS 2-10 (PENDENTES)

| # | Melhoria | Descrição | Arquivo/Local |
|---|----------|-----------|---------------|
| 2 | **Retry Exponential Backoff** | Adicionar retry com backoff em `sendMessage` | `src/hooks/evolution/useEvolutionMessaging.ts` |
| 3 | **Dead-Letter Queue** | Tabela `failed_messages` + reprocessamento | Nova tabela + edge function |
| 4 | **Job pg_cron Reconciliação** | Reconciliar mensagens órfãs às 04:00 | SQL migration |
| 5 | **CI/CD GitHub Actions** | Workflow lint/test/deploy | `.github/workflows/ci.yml` |
| 6 | **.env.example** | Template + limpar .env do histórico | `.env.example` |
| 7 | **Testes E2E** | Playwright/Vitest | `tests/` |
| 8 | **RLS Policies** | Auditar policies permissivas | SQL migrations |
| 9 | **types.ts** | Regenerar tipos | `supabase gen types` |
| 10 | **Docs Finais** | Consolidar documentação | `docs/` |

---

## 🚨 RISCOS CRÍTICOS

| ID | Risco | Prioridade |
|----|-------|-----------|
| R-001 | `.env` commitado no repo | 🔴 CRÍTICO |
| R-002 | Tokens expostos em chat | 🔴 CRÍTICO |
| R-005 | Zero testes E2E | 🟡 Médio |
| R-007 | Sem CI/CD | 🟡 Médio |

---

## ⚡ PROMPT PARA NOVA SESSÃO

```
CONTINUE A MISSÃO ZAPP-WEB EVOLUTION SECURITY:

Contexto: Leia docs/HANDOFF_EVOLUTION_SECURITY_2026-04-12.md

1. MELHORIA 1 (95% → 100%):
   - Baixar evolution-webhook/index.ts do GitHub
   - Adicionar módulo de segurança (HMAC + Rate Limit)
   - Modificar serve() para validar antes de processar
   - Melhorar handler presence.update (persistir last_seen_at, presence_status)
   - Commit: feat: webhook security (HMAC + rate limiting) + enhanced presence handler

2. MELHORIAS 2-10:
   - Executar sequencialmente sem pedir confirmação
   - 2: Retry exponential backoff
   - 3: Dead-letter queue
   - 4: pg_cron reconciliação
   - 5: CI/CD GitHub Actions
   - 6: .env.example
   - 7: Testes E2E
   - 8: RLS policies
   - 9: types.ts
   - 10: Docs finais

MODO: Execução direta via MCP. Reportar resumo no final.
```

---

## 🔐 CONFIGURAÇÃO DE SEGURANÇA

```bash
# Supabase Edge Function secrets:
WEBHOOK_SECRET=seu-secret-seguro-aqui

# Evolution API webhook config:
{
  "webhook": {
    "url": "https://xxx.supabase.co/functions/v1/evolution-webhook",
    "webhookSecret": "seu-secret-seguro-aqui"
  }
}
```

---

## 📊 COBERTURA ATUAL

| Categoria | Cobertura |
|-----------|-----------|
| Mensagens | ✅ 190% |
| Instância | ✅ 100% |
| Chat Controller | ✅ 94% |
| Grupos | ✅ 125% |
| Health | ✅ 100% |

---

*HANDOFF gerado em 2026-04-12 para continuidade da missão.*
