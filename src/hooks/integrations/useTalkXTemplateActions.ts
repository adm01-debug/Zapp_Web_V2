/**
 * X090 — fonte ÚNICA das ações de template do Talk X (cartão, lista, biblioteca
 * lateral e cabeçalho do editor). Antes, cada tela tinha o seu botão solto:
 * 3 botões no cartão (`TPL`), um `AlertDialog` próprio para excluir (`TPL`) e
 * Duplicar/Testar avulsos no cabeçalho do editor (`EDT`).
 *
 * O que este hook entrega HOJE, contra o schema real (`talkx_templates`):
 *  - Editar  → o chamador abre o editor (o hook não navega);
 *  - Duplicar → cria a cópia (INSERT em `talkx_templates`, o mesmo caminho do
 *    `duplicateTemplate`) e devolve a LINHA criada, para o chamador abrir a
 *    cópia;
 *  - Testar  → `talkx-send` (`action=test`); o servidor responde 403 a quem não
 *    é admin/supervisor (`is_admin_or_supervisor`), por isso `canTest` usa o
 *    mesmo gate;
 *  - Aprovação → transição de `status` pelo MESMO
 *    `update_talkx_template_with_snapshot` que o editor já usa (o CHECK do banco
 *    aceita draft/review/approved);
 *  - Excluir → DELETE por id.
 *
 * FORA desta entrega (dependem de trilha de BANCO/Edge, proibidas neste cartão):
 *  - Arquivar/Desarquivar → `talkx_templates` não tem marca de arquivo e o CHECK
 *    de `status` só aceita draft/review/approved; a coluna `archived_at` e a RPC
 *    de arquivo são de X083/X085. O item NÃO é oferecido no menu: a interface não
 *    promete o que o código não faz.
 *  - `duplicate_talkx_template` (X085) → a cópia é criada pelo INSERT do front.
 *  - `approved_by/approved_at` (CAP-078) → não existem; a tela mostra o selo de
 *    status, não o autor da aprovação.
 *  - `talkx_template_in_use` (X085) → a guarda de exclusão é do banco. O caminho
 *    de erro já é reconhecido aqui (`isTemplateInUseError`) para o dia em que a
 *    RPC chegar, sem inventar a mensagem antes disso.
 */
import { useCallback, useMemo } from 'react';
import { useTalkXTemplates, type TalkXTemplate } from '@/hooks/integrations/useTalkXTemplates';
import { useUserRole } from '@/hooks/system/useUserRole';

export type TalkXTemplateStatus = 'draft' | 'review' | 'approved';

/** Código da guarda de exclusão do banco (X085, trilha de banco). */
export const TEMPLATE_IN_USE_ERROR = 'talkx_template_in_use';

/** O erro veio da guarda `talkx_template_in_use`? (ainda não existe no banco) */
export function isTemplateInUseError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : (typeof error === 'object' && error !== null && 'message' in error)
      ? String((error as { message: unknown }).message)
      : '';
  return message.includes(TEMPLATE_IN_USE_ERROR);
}

export interface TalkXTemplateActions {
  /** Testar: o `talkx-send` (`action=test`) só aceita admin/supervisor. */
  canTest: boolean;
  /** Aprovar/Devolver: transição de status com papel (admin/supervisor). */
  canApprove: boolean;
  duplicate: (template: TalkXTemplate) => Promise<TalkXTemplate | null>;
  remove: (template: TalkXTemplate) => Promise<void>;
  /**
   * Devolve a LINHA atualizada (a RPC de snapshot devolve a linha gravada, com
   * `updated_at` novo). O editor usa o `updated_at` devolvido como
   * `expectedUpdatedAt` do próximo salvar — sem isto, aprovar no editor e
   * salvar em seguida cai em `talkx_template_stale_version`.
   */
  setStatus: (template: TalkXTemplate, status: TalkXTemplateStatus) => Promise<TalkXTemplate>;
  /** Alguma das mutações acima em andamento (o gatilho do ⋮ mostra o giro). */
  busy: boolean;
}

export function useTalkXTemplateActions(): TalkXTemplateActions {
  const { duplicateTemplate, deleteTemplate, updateTemplate } = useTalkXTemplates();
  const { isAdmin, isSupervisor } = useUserRole();

  const privileged = isAdmin || isSupervisor;

  /** Devolve a CÓPIA criada (o chamador abre a cópia no editor). */
  const duplicate = useCallback(
    async (template: TalkXTemplate) => (await duplicateTemplate.mutateAsync(template)) ?? null,
    [duplicateTemplate],
  );

  const remove = useCallback(
    async (template: TalkXTemplate) => { await deleteTemplate.mutateAsync(template.id); },
    [deleteTemplate],
  );

  /**
   * Só o `status` muda: a RPC de snapshot grava o template inteiro, então os
   * outros campos vão como estão na linha atual (é o que o editor já faz).
   *
   * A RPC avança o `updated_at` e devolve a linha gravada: `setStatus` repassa
   * essa linha para quem chamou (o editor usa o `updated_at` novo no próximo
   * salvar). Antes devolvia `void` e o editor ficava com o `expectedUpdatedAt`
   * velho, recusado com `talkx_template_stale_version`.
   */
  const setStatus = useCallback(
    async (template: TalkXTemplate, status: TalkXTemplateStatus) => {
      return updateTemplate.mutateAsync({
        id: template.id,
        expectedUpdatedAt: template.updated_at,
        name: template.name,
        content: template.content,
        description: template.description,
        category: template.category,
        media_url: template.media_url,
        media_type: template.media_type,
        tags: template.tags ?? [],
        status,
        custom_variables: template.custom_variables ?? [],
      });
    },
    [updateTemplate],
  );

  const busy = Boolean(
    duplicateTemplate.isPending || deleteTemplate.isPending || updateTemplate.isPending,
  );

  return useMemo(
    () => ({ canTest: privileged, canApprove: privileged, duplicate, remove, setStatus, busy }),
    [privileged, duplicate, remove, setStatus, busy],
  );
}
