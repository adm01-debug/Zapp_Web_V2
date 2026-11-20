# PAR-073 — Segmentos dinâmicos de contatos

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.6 CRM externo (Singu) — integração, sincronização e segurança

## Descrição e origem

Segmentos dinâmicos de contatos.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.6 CRM externo (Singu) — integração, sincronização e segurança).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Segmentos com regra
- **Existe hoje** (evidência da auditoria): Segmentos do Talk X existem
- **Falta**: Segmento "sem resposta há 30 dias"
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Nenhuma registrada.

## Critério de aceite

- Segmentos com regra
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).