/**
 * Tamanho do texto das bolhas do chat (aba Aparência).
 *
 * Os níveis e o lembrete da escolha (localStorage + `--chat-font-size` no <html>) ficam em
 * `useChatTextSize.ts`; aqui só a tela. A pré-visualização usa a MESMA classe
 * `.chat-message-text` dos balões reais, então mostra exatamente o que a escolha faz.
 */
import { cn } from '@/lib/utils';
import { Type } from 'lucide-react';
import { CHAT_TEXT_SIZES, useChatTextSize } from './useChatTextSize';

export function ChatTextSize() {
  const { nivel, escolher } = useChatTextSize();

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Tamanho do texto do chat" className="flex flex-wrap gap-2">
        {CHAT_TEXT_SIZES.map((n) => {
          const ativo = n.id === nivel;
          return (
            <label
              key={n.id}
              className={cn(
                'cursor-pointer rounded-md border px-3 py-1.5 text-sm transition-colors',
                'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1',
                ativo
                  ? 'border-primary bg-primary/10 font-medium text-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40',
              )}
            >
              <input
                type="radio"
                name="chat-text-size"
                value={n.id}
                checked={ativo}
                onChange={() => escolher(n.id)}
                className="sr-only"
              />
              {n.label}
            </label>
          );
        })}
      </div>

      <div className="rounded-lg border border-border bg-muted/40 p-3" data-testid="chat-text-size-preview">
        <p className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Type className="h-3.5 w-3.5" aria-hidden="true" />
          Pré-visualização no chat
        </p>
        <p className="chat-message-text whitespace-pre-wrap leading-[1.45]">
          Olá! É assim que suas mensagens vão aparecer no chat.
        </p>
      </div>
    </div>
  );
}
