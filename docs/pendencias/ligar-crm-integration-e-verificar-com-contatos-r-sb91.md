# SB-91 — Ligar crm.integration e verificar com contatos reais

- **Estado**: BLOQUEADO
- **Prioridade**: P1
- **Anexo**: 04 · **Seção**: 3.3 Sidebar "Detalhes do Contato" em 3 seções (02/10)

## Descrição e origem

Ligar crm.integration e verificar com contatos reais.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.3 Sidebar "Detalhes do Contato" em 3 seções (02/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Rollout D1
- **Existe hoje** (evidência da auditoria): Flag crm.integration nasceu false (20260909120000:8) mas estava true em produção em 12/10; o que apaga tudo é o build publicado, gerado com "false"; .env.production:15 VITE_CRM_INTEGRATION_ENABLED=false
- **Falta**: Decisão + RPC aplicada
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Perfil Singu e dados do CRM não aparecem para ninguém em produção

## Dependências

Joaquim (D1) + SB-91

## Critério de aceite

- Rollout D1
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).