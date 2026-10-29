import { useCallback, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { TileColor } from './constants';
import {
  TalkXConfirmDialog,
  type ConfirmCheck,
  type ConfirmDetail,
  type ConfirmReasonField,
  type TalkXTone,
} from './dialogs';

// ════════════════════════════════════════════════════════════════════════════
// X050 — `useTalkXConfirm`: a confirmação do kit em forma de Promise, no lugar
// dos `window.confirm` das telas (fechar o editor, excluir variante e restaurar
// versão). Quem chama espera a resposta: `if (!(await confirmar(preset))) return;`.
//
// O modal é o MESMO `TalkXConfirmDialog` que os presets usam, então a caixinha
// cinza do navegador desaparece e a confirmação ganha a cara do sistema.
// Fica fora do barrel (`talkxShared`), como o `dialogPresets`: é peça interna
// do kit, consumida só por quem precisa confirmar sem ter um modal na tela.
// ════════════════════════════════════════════════════════════════════════════

/** Pedido de confirmação: os campos de um preset do kit (título, pergunta, tom…). */
export interface TalkXConfirmRequest {
  title: string;
  subtitle?: string;
  description: string;
  consequence?: string;
  entityName?: string;
  tone?: TalkXTone;
  icon: LucideIcon;
  iconColor?: TileColor;
  confirmLabel?: string;
  cancelLabel?: string;
  details?: ConfirmDetail[];
  checks?: ConfirmCheck[];
  reasonField?: ConfirmReasonField;
}

interface PedidoAberto extends TalkXConfirmRequest {
  resolver: (confirmado: boolean) => void;
}

/**
 * Devolve `{ confirmar, dialogo }`: `confirmar(preset)` abre o modal e resolve
 * `true` no botão de confirmação, `false` no cancelar, no "✕" ou no Esc.
 * `dialogo` tem de ser renderizado pela tela que chama o hook.
 */
export function useTalkXConfirm() {
  const [pendente, setPendente] = useState<PedidoAberto | null>(null);

  const confirmar = useCallback(
    (pedido: TalkXConfirmRequest) => new Promise<boolean>((resolver) => {
      setPendente({ ...pedido, resolver });
    }),
    [],
  );

  const responder = useCallback((confirmado: boolean) => {
    setPendente((atual) => {
      atual?.resolver(confirmado);
      return null;
    });
  }, []);

  // Sem pedido em aberto não há modal: `icon` é obrigatório para desenhar.
  const dialogo = pendente ? (
    <TalkXConfirmDialog
      open
      onClose={() => responder(false)}
      onConfirm={() => responder(true)}
      title={pendente.title}
      subtitle={pendente.subtitle}
      description={pendente.description}
      consequence={pendente.consequence}
      entityName={pendente.entityName}
      tone={pendente.tone}
      icon={pendente.icon}
      iconColor={pendente.iconColor}
      confirmLabel={pendente.confirmLabel}
      cancelLabel={pendente.cancelLabel}
      details={pendente.details}
      checks={pendente.checks}
      reasonField={pendente.reasonField}
    />
  ) : null;

  return { confirmar, dialogo };
}
