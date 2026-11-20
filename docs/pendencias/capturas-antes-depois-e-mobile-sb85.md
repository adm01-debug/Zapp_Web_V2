# SB-85 — Capturas antes/depois e mobile

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P3
- **Anexo**: 04 · **Seção**: 3.3 Sidebar "Detalhes do Contato" em 3 seções (02/10)

## Descrição e origem

Capturas antes/depois e mobile.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/04-contatos-crm-email.md` (3.3 Sidebar "Detalhes do Contato" em 3 seções (02/10)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: PNGs em docs/design/evidence/sidebar-3-secoes/
- **Existe hoje** (evidência da auditoria): só orfaos.md
- **Falta**: PNGs
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Sem prova visual

## Dependências

Nenhuma registrada.

## Critério de aceite

- PNGs em docs/design/evidence/sidebar-3-secoes/
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).