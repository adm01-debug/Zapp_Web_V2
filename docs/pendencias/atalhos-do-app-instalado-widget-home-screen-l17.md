# L-17 — Atalhos do app instalado / widget home screen

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 08 · **Seção**: 3.4 Notificações, PWA e idioma

## Descrição e origem

Atalhos do app instalado / widget home screen.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/08-legado-e-codigo.md` (3.4 Notificações, PWA e idioma).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: IMPROVEMENT P3.10, FORGOTTEN 3.14
- **Existe hoje** (evidência da auditoria): public/manifest.json com 4 shortcuts (Chat, Teams, Email, Contatos); depende de PWA (L-15)
- **Falta**: —
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Baixo

## Dependências

L-15

## Critério de aceite

- IMPROVEMENT P3.10, FORGOTTEN 3.14
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).