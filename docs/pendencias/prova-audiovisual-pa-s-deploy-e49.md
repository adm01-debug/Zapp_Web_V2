# E49 — Prova audiovisual pós-deploy

- **Estado**: PARCIAL
- **Prioridade**: P3
- **Anexo**: 06 · **Seção**: 3.5 Controles de volume da sidebar (S01–S50) e Volume de mídia (E01–E50)

## Descrição e origem

Prova audiovisual pós-deploy.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.5 Controles de volume da sidebar (S01–S50) e Volume de mídia (E01–E50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): PARCIAL.
- **Planejado**: Ouvir áudio/vídeo em conversa real
- **Existe hoje** (evidência da auditoria): Só UI/persistência no E2E
- **Falta**: Ver S05–S08
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

—

## Dependências

idem

## Critério de aceite

- Ouvir áudio/vídeo em conversa real
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).