import type { LucideIcon } from 'lucide-react';
import { Copy, History, Pause, Play, Send, Square, Trash2, Undo2, UserMinus, XCircle } from 'lucide-react';
import type { TileColor } from './constants';
import type { ConfirmReasonField, TalkXTone } from './dialogs';

// ════════════════════════════════════════════════════════════════════════════
// X049 — presets do modal único do kit.
// Os cinco primeiros são os do mock 17, com o texto literal da prancha
// (`docs/talkx/v4/inventario/A_telas_01_17.md`, itens T17-030…T17-052). Os
// demais são confirmações que o produto já tem, com o texto que a tela usa
// hoje (fonte anotada em cada um). `{nome}` no `description` vira o nome da
// entidade em negrito entre aspas.
// ════════════════════════════════════════════════════════════════════════════

export interface TalkXDialogPreset {
  /** Texto da barra de título. */
  title: string;
  /** Título exibido no corpo (o mock mostra os dois). */
  subtitle: string;
  description: string;
  consequence?: string;
  tone: TalkXTone;
  icon: LucideIcon;
  iconColor: TileColor;
  confirmLabel: string;
  cancelLabel: string;
  /** Rótulos das linhas de dado, na ordem do mock. */
  detailLabels?: readonly string[];
  reasonField?: ConfirmReasonField;
}

/** Os cinco do mock 17 (T17-030…T17-052), texto literal da prancha. */
export const PRESETS_DO_MOCK = {
  excluirCampanha: {
    title: 'Excluir Campanha', subtitle: 'Excluir campanha',
    description: 'Tem certeza que deseja excluir a campanha {nome}?',
    consequence: 'Esta ação não pode ser desfeita.',
    tone: 'danger', icon: Trash2, iconColor: 'red',
    confirmLabel: 'Excluir', cancelLabel: 'Cancelar',
  },
  duplicarCampanha: {
    title: 'Duplicar Campanha', subtitle: 'Duplicar campanha',
    description: 'Deseja criar uma cópia da campanha {nome}?',
    consequence: 'Uma nova campanha será criada com todas as configurações desta.',
    tone: 'primary', icon: Copy, iconColor: 'blue',
    confirmLabel: 'Duplicar', cancelLabel: 'Cancelar',
  },
  removerSupressao: {
    title: 'Remover da Supressão', subtitle: 'Remover da supressão',
    description: 'Deseja remover este contato da lista de supressão?',
    consequence: 'O contato poderá receber mensagens nas próximas campanhas.',
    tone: 'violet', icon: UserMinus, iconColor: 'violet',
    confirmLabel: 'Remover', cancelLabel: 'Cancelar',
  },
  cancelarCampanha: {
    title: 'Cancelar Campanha', subtitle: 'Cancelar campanha',
    description: 'Tem certeza que deseja cancelar a campanha {nome}?',
    consequence: 'O envio será interrompido imediatamente e os contatos pendentes não receberão as mensagens.',
    tone: 'danger', icon: Square, iconColor: 'red',
    confirmLabel: 'Cancelar', cancelLabel: 'Voltar',
  },
  confirmarDisparo: {
    title: 'Confirmar Disparo', subtitle: 'Confirmar disparo',
    description: 'Deseja iniciar o envio da campanha {nome}?',
    tone: 'success', icon: Send, iconColor: 'green',
    confirmLabel: 'Confirmar envio', cancelLabel: 'Cancelar',
    detailLabels: ['Segmento', 'Destinatários', 'Mensagens', 'Envio'],
  },
} as const satisfies Record<string, TalkXDialogPreset>;

/** Confirmações que o produto já tem, sem prancha de mock. */
export const PRESETS_DO_PRODUTO = {
  // TalkXLiveMonitor.tsx:288-290
  pausarCampanha: {
    title: 'Pausar Campanha', subtitle: 'Pausar campanha',
    description: 'Tem certeza que deseja pausar a campanha {nome}?',
    consequence: 'Os envios em andamento serão concluídos, mas novos envios não serão iniciados.',
    tone: 'primary', icon: Pause, iconColor: 'blue',
    confirmLabel: 'Pausar agora', cancelLabel: 'Cancelar',
    reasonField: { label: 'Motivo da pausa', placeholder: 'Ex.: aguardando aprovação do cliente…' },
  },
  // TalkXLiveMonitor.tsx:297-298
  retomarCampanha: {
    title: 'Retomar Campanha', subtitle: 'Retomar campanha',
    description: 'Tem certeza que deseja retomar a campanha {nome}?',
    consequence: 'Os envios serão continuados a partir de onde pararam.',
    tone: 'primary', icon: Play, iconColor: 'blue',
    confirmLabel: 'Retomar', cancelLabel: 'Cancelar',
  },
  // TalkXCampaignScheduled.tsx:370-379
  cancelarAgendamento: {
    title: 'Cancelar Agendamento', subtitle: 'Cancelar agendamento',
    description: 'Cancelar o agendamento da campanha {nome}?',
    consequence: 'A campanha voltará para Rascunhos. Você pode reagendar ou editar a qualquer momento.',
    tone: 'danger', icon: XCircle, iconColor: 'red',
    confirmLabel: 'Cancelar agendamento', cancelLabel: 'Manter agendamento',
  },
  // TalkXSegments.tsx:202-211
  excluirSegmento: {
    title: 'Excluir Segmento', subtitle: 'Excluir segmento',
    description: 'Tem certeza que deseja excluir o segmento {nome}?',
    consequence: 'Será excluído permanentemente. Campanhas já criadas não serão afetadas.',
    tone: 'danger', icon: Trash2, iconColor: 'red',
    confirmLabel: 'Excluir', cancelLabel: 'Cancelar',
  },
  // TalkXTemplates.tsx:187
  excluirTemplate: {
    title: 'Excluir Template', subtitle: 'Excluir template',
    description: 'Tem certeza que deseja excluir o template {nome}?',
    consequence: 'O template será excluído permanentemente.',
    tone: 'danger', icon: Trash2, iconColor: 'red',
    confirmLabel: 'Excluir', cancelLabel: 'Cancelar',
  },
  // TalkXTemplateEditor.tsx:200
  excluirVariante: {
    title: 'Excluir Variante', subtitle: 'Excluir variante',
    description: 'Tem certeza que deseja excluir esta variante?',
    consequence: 'A atribuição A/B dos envios será apagada.',
    tone: 'danger', icon: Trash2, iconColor: 'red',
    confirmLabel: 'Excluir', cancelLabel: 'Cancelar',
  },
  // TalkXTemplateEditor.tsx:124,356
  descartarAlteracoes: {
    title: 'Descartar Alterações', subtitle: 'Descartar alterações',
    description: 'Tem alterações não salvas. Descartar?',
    consequence: 'As alterações não salvas serão perdidas.',
    tone: 'primary', icon: Undo2, iconColor: 'blue',
    confirmLabel: 'Descartar', cancelLabel: 'Continuar editando',
  },
  // TalkXTemplateEditor.tsx:271
  restaurarVersao: {
    title: 'Restaurar Versão', subtitle: 'Restaurar versão',
    description: 'Restaurar esta versão?',
    consequence: 'Os campos atuais serão substituídos.',
    tone: 'primary', icon: History, iconColor: 'blue',
    confirmLabel: 'Restaurar', cancelLabel: 'Cancelar',
  },
} as const satisfies Record<string, TalkXDialogPreset>;

export type TalkXDialogPresetKey = keyof typeof PRESETS_DO_MOCK | keyof typeof PRESETS_DO_PRODUTO;

export const DIALOG_PRESETS: Record<TalkXDialogPresetKey, TalkXDialogPreset> = {
  ...PRESETS_DO_MOCK,
  ...PRESETS_DO_PRODUTO,
};
