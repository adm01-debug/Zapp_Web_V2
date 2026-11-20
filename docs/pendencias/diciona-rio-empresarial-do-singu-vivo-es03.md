# ES-03 — Dicionário empresarial do Singu vivo

- **Estado**: BLOQUEADO
- **Prioridade**: P2
- **Anexo**: 04 · **Seção**: 3.8 E-mail — sidebar de contato/empresa (ES-01–ES-50)

## Descrição e origem

Dicionário empresarial do Singu vivo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.8 E-mail — sidebar de contato/empresa (ES-01–ES-50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Leitura autorizada
- **Existe hoje** (evidência da auditoria): contrato só local
- **Falta**: Leitura autorizada
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Campo "Sobre" pode ter significado errado

## Dependências

Admin do Singu

## Critério de aceite

- Leitura autorizada
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).