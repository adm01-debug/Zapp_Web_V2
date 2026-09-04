/** Chaves dos diálogos do painel de chat — fonte única para ChatPanel, ChatDialogs e handlers. */
export type DialogKey = 'quickReplies' | 'slashCommands' | 'transferDialog' | 'scheduleDialog' |
  'callDialog' | 'globalSearch' | 'chatSearch' | 'interactiveBuilder' | 'forwardDialog' |
  'locationPicker' | 'aiAssistant' | 'catalogDirect' | 'whisper' | 'templatesWithVars' |
  'realtimeTranscription' | 'closeDialog';

export type DialogState = Record<DialogKey, boolean>;

export type ActiveTool = 'chatSearch' | 'objections' | 'university' | 'aiAssistant' | 'summary' | null;
