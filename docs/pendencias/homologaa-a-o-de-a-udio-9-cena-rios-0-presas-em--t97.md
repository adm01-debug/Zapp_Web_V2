# T97 — Homologação de áudio (9 cenários) + 0 presas em ringing

- **Estado**: BLOQUEADO
- **Prioridade**: P0
- **Anexo**: 03 · **Seção**: 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

## Descrição e origem

Homologação de áudio (9 cenários) + 0 presas em ringing.

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): BLOQUEADO.
- **Planejado**: 9 linhas reais com ids
- **Existe hoje** (evidência da auditoria): docs/telefonia/HOMOLOGACAO.md com tabela vazia (:69-77); cenário 8 cita linha wpp2 que não existe (CAPACIDADES.md:26)
- **Falta**: Executar com agente real
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, integrações

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Módulo nunca foi homologado ("só aqui é pronto")

## Dependências

OP-01, OP-02, Joaquim

## Critério de aceite

- 9 linhas reais com ids
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).