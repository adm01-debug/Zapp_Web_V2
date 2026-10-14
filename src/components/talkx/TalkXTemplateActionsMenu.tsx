/**
 * X090 — o menu ⋮ de ações do template, um só para o cartão, a linha da lista,
 * a biblioteca lateral e o cabeçalho do editor. Antes: 3 botões soltos no
 * cartão (`TPL`), `AlertDialog` próprio para excluir (`TPL`) e Duplicar/Testar
 * avulsos no cabeçalho do editor (`EDT`).
 *
 * Itens (o papel decide o que aparece, `useTalkXTemplateActions`):
 *  - Editar;
 *  - Duplicar → cria a cópia e devolve a linha criada para o chamador ABRIR a
 *    cópia (`onOpenCopy`);
 *  - Testar → só para admin/supervisor (é o que o `talkx-send` aceita);
 *  - Excluir → modal do kit (`TalkXConfirmDialog`), não `window.confirm`.
 *
 * Arquivar/Desarquivar NÃO está na lista: `talkx_templates` não tem marca de
 * arquivo (X083/X085, trilha de banco) e este cartão não pode criar DDL.
 */
import React, { useState } from 'react';
import { Pencil, Copy, Send, Trash2 } from 'lucide-react';
import { RowActionsMenu, type RowAction } from './talkxShared';
import { TalkXConfirmDialog } from './talkxShared';
import { TalkXTemplateTestDialog } from './TalkXTemplateTestDialog';
import { useTalkXTemplateActions } from '@/hooks/integrations/useTalkXTemplateActions';
import type { TalkXTemplate } from '@/hooks/integrations/useTalkXTemplates';

interface Props {
  template: TalkXTemplate;
  onEdit?: (template: TalkXTemplate) => void;
  /** Recebe a CÓPIA recém-criada (o chamador abre a cópia no editor). */
  onOpenCopy?: (copy: TalkXTemplate) => void;
  /** Depois de excluir — para a tela limpar a seleção, se houver. */
  onDeleted?: (id: string) => void;
  /** Nome acessível do gatilho; por padrão, o nome do template. */
  label?: string;
  /**
   * Quando informado, "Testar" chama este handler em vez de abrir a janela do
   * próprio menu — o EDITOR usa isso para testar o texto que está na tela
   * (ainda não salvo).
   */
  onTest?: (template: TalkXTemplate) => void;
}

export function TalkXTemplateActionsMenu({ template, onEdit, onOpenCopy, onDeleted, label, onTest }: Props) {
  const { canTest, duplicate, remove, busy } = useTalkXTemplateActions();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // O erro já vira toast dentro das mutations; o catch só evita promessa
  // rejeitada solta no clique.
  const handleDuplicate = () => {
    void duplicate(template)
      .then((copy) => { if (copy) onOpenCopy?.(copy); })
      .catch(() => { /* avisado no toast da mutation */ });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await remove(template);
      onDeleted?.(template.id);
    } catch {
      // avisado no toast da mutation
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const actions: RowAction[] = [
    // No EDITOR o item "Editar" não faz sentido (já é o editor): sem `onEdit`,
    // o item não aparece.
    ...(onEdit ? [{ label: 'Editar', icon: Pencil, onSelect: () => onEdit(template) }] : []),
    { label: 'Duplicar', icon: Copy, onSelect: handleDuplicate },
    ...(canTest ? [{ label: 'Testar', icon: Send, onSelect: () => (onTest ? onTest(template) : setShowTest(true)) }] : []),
    { label: 'Excluir', icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
  ];

  return (
    <>
      <RowActionsMenu actions={actions} label={label ?? `Ações do template ${template.name}`} busy={busy} />

      <TalkXConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void handleDelete()}
        icon={Trash2}
        iconColor="red"
        tone="danger"
        title="Excluir template?"
        description="O template sai da lista para todos. Templates já usados por campanha não podem ser apagados."
        entityName={template.name}
        confirmLabel="Excluir"
        loading={deleting}
      />

      {showTest && (
        <TalkXTemplateTestDialog template={template} open onClose={() => setShowTest(false)} />
      )}
    </>
  );
}
