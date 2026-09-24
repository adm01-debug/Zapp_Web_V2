import { List } from 'lucide-react';
import { InteractiveButton, InteractiveListSection } from '@/types/chat';
import { getButtonTypeIcon } from './ButtonTypeHelpers';

interface MessagePreviewProps {
  body: string;
  headerText: string;
  footer: string;
  messageType: 'buttons' | 'list';
  buttons: InteractiveButton[];
  listButtonText: string;
  sections: InteractiveListSection[];
}

export function MessagePreview({ body, headerText, footer, messageType, buttons, listButtonText, sections }: MessagePreviewProps) {
  if (!body && buttons.length === 0 && sections.length === 0) return null;

  return (
    <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
      <p className="text-xs text-muted-foreground mb-2">Prévia da mensagem:</p>
      <div className="p-3 rounded-xl bg-primary text-primary-foreground max-w-[280px]">
        {headerText && <p className="font-semibold text-sm mb-1">{headerText}</p>}
        <p className="text-sm whitespace-pre-wrap">{body || 'Mensagem...'}</p>
        {footer && <p className="text-xs opacity-70 mt-1">{footer}</p>}

        {messageType === 'buttons' && buttons.length > 0 && (
          <div className="flex flex-col gap-1 mt-2 pt-2 border-t border-primary-foreground/20">
            {buttons.map((btn) => (
              <div key={btn.id} className="flex items-center justify-center gap-1 px-3 py-1.5 rounded-md bg-primary-foreground/20 text-xs">
                {getButtonTypeIcon(btn.type)}
                <span>{btn.title || 'Botão'}</span>
              </div>
            ))}
          </div>
        )}

        {messageType === 'list' && (
          <div className="mt-2 pt-2 border-t border-primary-foreground/20">
            <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-primary-foreground/30 text-xs">
              <List className="w-4 h-4" />
              <span>{listButtonText || 'Ver opções'}</span>
            </div>
            {sections.length > 0 && (
              <div className="mt-2 space-y-1">
                {sections.slice(0, 2).map((section, i) => (
                  <div key={i} className="text-3xs opacity-70">
                    • {section.title || `Seção ${i + 1}`}: {section.rows.length} itens
                  </div>
                ))}
                {sections.length > 2 && (
                  <div className="text-3xs opacity-50">+{sections.length - 2} mais seções...</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
