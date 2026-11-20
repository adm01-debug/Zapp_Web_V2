# X018 — Limites por minuto/dia/conexão

- **Estado**: PARCIAL
- **Prioridade**: P0
- **Anexo**: 01 · **Seção**: 3.3 Talk X — Fase 2 · Motor seguro (X010–X023: 11 concluídos, 3 pendentes)

## Descrição e origem

Limites por minuto/dia/conexão.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/01-talkx-multiplix.md` (3.3 Talk X — Fase 2 · Motor seguro (X010–X023: 11 concluídos, 3 pendentes)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Teto por número que soma todos os motores
- **Existe hoje** (evidência da auditoria): supabase/migrations/20261002551230_talkx_limits_ritmo.sql:175,189 conta o Multiplix por multiplix_recipients.sent_at; o worker novo grava multiplix_delivery_items.sent_at
- **Falta**: Contar itens do Multiplix e testar 2 motores no mesmo número
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, UI, jobs

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Talk X + Multiplix no mesmo chip podem passar do teto diário sem aviso → risco de bloqueio do WhatsApp da empresa

## Dependências

Nenhuma registrada.

## Critério de aceite

- Teto por número que soma todos os motores
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).