# A06B — Nome acessível do play com nome do arquivo

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P2
- **Anexo**: 06 · **Seção**: 3.3 Miniaturas/figurinhas, filtro de data, janela, play, A06b/A07

## Descrição e origem

Nome acessível do play com nome do arquivo.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/06-inbox-arquivos-design.md` (3.3 Miniaturas/figurinhas, filtro de data, janela, play, A06b/A07).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: aria-label "Tocar áudio audio-a1.wav"
- **Existe hoje** (evidência da auditoria): AudioPlayButton.tsx:212 'Pausar áudio' : 'Tocar áudio'; :234 "Progresso do áudio" genéricos
- **Falta**: Incluir nome + teste
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Leitor de tela não distingue vários áudios

## Dependências

Nenhuma registrada.

## Critério de aceite

- aria-label "Tocar áudio audio-a1.wav"
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).