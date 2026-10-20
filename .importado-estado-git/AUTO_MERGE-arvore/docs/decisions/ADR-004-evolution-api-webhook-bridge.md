# ADR-004: Evolution API Webhook Bridge Pattern

## Status: Aceito
## Data: 2025-04-01

## Contexto
O sistema recebe mensagens WhatsApp via Evolution API e precisa processar eventos (messages.upsert, contacts.update, etc.) de forma confiável e segura.

## Decisão
Implementamos uma Edge Function (`evolution-webhook`) como bridge que:
1. Recebe webhooks da Evolution API
2. Valida e normaliza os payloads
3. Sincroniza contatos e mensagens com o banco de dados
4. Emite logs estruturados para monitoramento

## Consequências
- ✅ Processamento centralizado de todos os eventos WhatsApp
- ✅ Normalização de dados antes de persistência
- ✅ Logs de telemetria para debugging de integração
- ❌ Single point of failure — se a Edge Function cair, mensagens são perdidas
- Mitigação: Evolution API reenvia webhooks com retry automático
