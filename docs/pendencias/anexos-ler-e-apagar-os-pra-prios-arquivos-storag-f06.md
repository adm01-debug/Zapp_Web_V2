# F06 — Anexos: ler e apagar os próprios arquivos (storage)

- **Estado**: NÃO IMPLEMENTADO
- **Prioridade**: P1
- **Anexo**: 03 · **Seção**: 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

## Descrição e origem

Anexos: ler e apagar os próprios arquivos (storage).

> Origem: `docs/audits/funcionalidades-pendentes-2026-10-11/03-telefonia-teamchat.md` (3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação).

## Estado real conferido

- **Estado reportado pela auditoria** (12/10/2026): NÃO IMPLEMENTADO.
- **Planejado**: Policies SELECT/DELETE por current_profile_id()
- **Existe hoje** (evidência da auditoria): 20260927270012_team_chat_e21_storage_select_policy.sql:3 compara pasta com auth.uid() (pasta real é profiles.id, uploadTeamMedia.ts:33-35); nenhuma migration posterior toca o bucket
- **Falta**: Recriar policies
- **Verificação byte-a-byte**: conferência no código e no banco a fazer na Fase 2, antes de tocar no item (protocolo anti-regressão §7).

## Camadas afetadas

banco, RLS/permissões, UI

## Regras de negócio aplicáveis

Ver `docs/pendencias/_regras-de-negocio.md` (consolidado na Fase 0). Conferir no item específico na Fase 2.

## Raio de impacto

Remetente não apaga o próprio anexo; leitura depende só do vínculo pela mensagem

## Dependências

trilha de banco

## Critério de aceite

- Policies SELECT/DELETE por current_profile_id()
- Integração de ponta a ponta (banco → functions → UI → permissões), sem regressão e sem perder dado (protocolo §5).