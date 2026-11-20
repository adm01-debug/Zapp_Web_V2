# AC-002 — Certificação visual contra referência

- **Estado**: BLOQUEADO
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.7 E-mail NAVY (100 EN / 80 AC)

## Descrição e origem

Certificação visual contra referência.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.7 E-mail NAVY (100 EN / 80 AC)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: Pixel a pixel
- **Existe hoje** (evidência da auditoria): PNG referencias/01_EMAIL_DIRECAO_VISUAL.png ausente
- **Falta**: Artefato
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

Dono fornecer PNG

## Critério de aceite

- Pixel a pixel
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).