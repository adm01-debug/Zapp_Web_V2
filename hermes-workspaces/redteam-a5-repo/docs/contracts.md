# Contratos das Edge Functions

## Formato único de erro de validação (HTTP 422)

Toda falha de validação de payload responde `422 Unprocessable Entity` com:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Payload inválido: um ou mais campos falharam na validação.",
    "fields": [
      { "path": "message", "message": "Mensagem é obrigatória", "code": "invalid_type" }
    ]
  }
}
```

- `path` usa dot-notation (`script.0.text`); erro de raiz usa `(root)`.
- `code` é o código do Zod (`invalid_type`, `too_small`, `invalid_enum_value`, ...).
- Fonte: `validationErrorResponse()` em `supabase/functions/_shared/schemas.ts`.
- Erros de **auth** (401/403), **rate limit** (429) e **negócio** continuam nos formatos atuais — 422 é exclusivo de validação de payload.

## Versionamento de contrato (webhooks)

- Header `x-contract-version: 2` seleciona v2; ausência ou qualquer outro valor = **v1** (default, retrocompatível).
- Toda resposta 422 ecoa `x-contract-version` para debug.
- Implementação: `supabase/functions/_shared/contracts.ts` (`getContractVersion`, `parseVersioned`).

| Webhook | v1 (default) | v2 |
|---|---|---|
| `evolution-webhook` | exige `event` + `instance`; `data` opcional; passthrough | + `data` obrigatório como objeto |
| `elevenlabs-webhook` | objeto JSON qualquer (passthrough) | exige `type` ou `event_type` |

Eventos **desconhecidos** da Evolution continuam ACKados com 200 nas duas versões (decisão deliberada: evitar retry storm da Evolution GO).

## Depreciação de versão

1. Anunciar sunset → definir `V1_SUNSET` (ISO date) em `contracts.ts`.
2. Respostas v1 passam a emitir headers `Deprecation: true` + `Sunset: <data>` (RFC 8594) sem mudança de comportamento.
3. Após a data: trocar o default de `getContractVersion` para 2 em um minor.
4. Testes de compatibilidade em `tests/contracts/webhooks-versioning.contract.test.ts` garantem que payloads v1 seguem aceitos durante toda a janela.

## Rodando os testes de contrato

```sh
npm run test:contracts   # vitest run --config vitest.contracts.config.ts
```

160 casos: formato de erro, negociação de versão, retrocompatibilidade v1/v2 e, por schema, payload válido / campo ausente / tipo incorreto / valor vazio. O teste "nenhum schema exportado ficou fora da tabela" força cobertura de schemas novos.
