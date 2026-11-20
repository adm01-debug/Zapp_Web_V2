# E45 — Prova de som real (audio.volume em 5 players)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.5 Controles de volume da sidebar (S01–S50) e Volume de mídia (E01–E50)

## Descrição e origem

Prova de som real (audio.volume em 5 players).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.5 Controles de volume da sidebar (S01–S50) e Volume de mídia (E01–E50)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Semear áudio/vídeo sintético e medir
- **Existe hoje** (evidência da auditoria): e2e/media-volume.spec.ts:159 test.fixme; contrato estático tests/contracts/media-volume-surfaces.contract.test.ts
- **Falta**: Fazer no banco local (dono recusou fixture em produção)
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Não há prova de que o slider muda o som ouvido

## Dependências

banco local com mídia

## Critério de aceite

- Semear áudio/vídeo sintético e medir
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).