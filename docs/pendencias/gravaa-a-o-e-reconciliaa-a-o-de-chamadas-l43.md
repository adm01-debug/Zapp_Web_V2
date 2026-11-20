# L-43 — Gravação e reconciliação de chamadas

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 08 · **Seção**: 3.9 Telefonia e webhooks

## Descrição e origem

Gravação e reconciliação de chamadas.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.9 Telefonia e webhooks).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: CSF 17.4 ✅; CAPACIDADES.md "Falta configurar BITRIX_WEBHOOK_URL"
- **Existe hoje** (evidência da auditoria): get-call-recording e sync-call-records prontos; sync-call-records devolve 0 sem segredo e não tem agendador versionado ("agendamento do N8N", supabase/functions/sync-call-records/index.ts cabeçalho)
- **Falta**: configurar segredo + agendamento
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, functions, integrações, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Supervisor não ouve gravação

## Dependências

segredo BITRIX_WEBHOOK_URL

## Critério de aceite

- CSF 17.4 ✅; CAPACIDADES.md "Falta configurar BITRIX_WEBHOOK_URL"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).