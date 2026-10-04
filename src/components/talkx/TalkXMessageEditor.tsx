import React, { useCallback, useMemo, useRef } from 'react';
import { Bold, Italic, List, Smile, Hash, Link2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * V26 — editor de mensagem único do Talk X.
 *
 * Antes: o passo 2 do wizard era um `<Textarea>` cru e o editor de template tinha
 * a sua própria toolbar + textarea. Os dois agora usam ESTE componente, então a
 * inserção no cursor, o contador por limite do provedor, o highlight de
 * `{{variavel}}` e o aviso de variável desconhecida valem para os dois.
 *
 * O highlight é um overlay: um `<pre>` com o MESMO texto fica ATRÁS de um
 * `<textarea>` com o texto transparente (só o cursor aparece), sincronizado em
 * scroll. Fonte/line-height/padding são idênticos nos dois para o overlay cair
 * exatamente sobre o texto digitado.
 */

/** Emojis comuns do WhatsApp — inseridos no cursor. */
const EMOJIS = ['😊', '😂', '🎉', '👍', '🙏', '❤️', '🔥', '✨', '📌', '✅', '🚀', '🎁', '⏰', '📎', '💰', '💬'];

const TOOL_BUTTON =
  'h-7 w-7 rounded flex items-center justify-center text-foreground-secondary hover:text-foreground hover:bg-muted/50 disabled:opacity-40 disabled:pointer-events-none';

/** Um segmento inteiro de placeholder, para quebrar o texto no highlight. */
const PLACEHOLDER_TOKEN = /\{\{[^}]*\}\}/;
/** Captura o nome de qualquer `{{ ... }}` (mesma forma que `personalizePreview`). */
const PLACEHOLDER_CAPTURE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Compara variáveis sem depender de chaves, espaços ou caixa: `{{Nome}}` ≡ `nome`. */
function normalizeVariable(raw: string): string {
  return raw.replace(/[{}]/g, '').trim().toLowerCase();
}

export interface TalkXMessageEditorHandle {
  /** Insere markup na posição atual do cursor (painéis de variáveis externos). */
  insertAtCursor: (text: string) => void;
  focus: () => void;
}

export interface TalkXMessageEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Altura inicial do textarea (o overlay acompanha). */
  rows?: number;
  disabled?: boolean;
  /** Limite de caracteres do provedor: alimenta o contador e o aviso visual. */
  limit?: number;
  /** Variáveis conhecidas (ex.: `{{nome}}`). Ausente = não valida desconhecidas. */
  knownVariables?: readonly string[];
  /** Conteúdo extra abaixo do contador. */
  footer?: React.ReactNode;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  className?: string;
}

export const TalkXMessageEditor = React.forwardRef<TalkXMessageEditorHandle, TalkXMessageEditorProps>(
  function TalkXMessageEditor(
    { value, onChange, placeholder, rows = 7, disabled = false, limit, knownVariables, footer, onKeyDown, className },
    ref,
  ) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const highlightRef = useRef<HTMLPreElement>(null);

    /** Insere na posição do cursor; sem seleção usa o placeholder informado. */
    const insertAtCursor = useCallback((prefix: string, suffix = '', selectedPlaceholder = '') => {
      const el = textareaRef.current;
      if (!el) return;
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const selected = value.slice(start, end) || selectedPlaceholder;
      const next = value.slice(0, start) + prefix + selected + suffix + value.slice(end);
      onChange(next);
      // Reposiciona o cursor depois da inserção (mesma técnica do editor antigo).
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        node.focus();
        const cursor = start + prefix.length + selected.length + suffix.length;
        node.setSelectionRange(cursor, cursor);
      });
    }, [onChange, value]);

    React.useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => insertAtCursor(text),
      focus: () => textareaRef.current?.focus(),
    }), [insertAtCursor]);

    // `null` = sem lista de conhecidas: destaca tudo, mas não acusa desconhecidas.
    const knownSet = useMemo(
      () => (knownVariables ? new Set(knownVariables.map(normalizeVariable)) : null),
      [knownVariables],
    );

    const usedVariables = useMemo(() => {
      const found = new Set<string>();
      for (const match of value.matchAll(PLACEHOLDER_CAPTURE)) found.add(normalizeVariable(match[1]));
      return Array.from(found);
    }, [value]);

    const unknownVariables = useMemo(
      () => (knownSet ? usedVariables.filter((variable) => !knownSet.has(variable)) : []),
      [knownSet, usedVariables],
    );

    // Quebra preservando os delimitadores (grupo de captura no split).
    const segments = useMemo(() => value.split(/(\{\{[^}]*\}\})/g), [value]);

    const syncScroll = useCallback(() => {
      const el = textareaRef.current;
      const pre = highlightRef.current;
      if (!el || !pre) return;
      pre.scrollTop = el.scrollTop;
      pre.scrollLeft = el.scrollLeft;
    }, []);

    const overLimit = typeof limit === 'number' && value.length > limit;

    return (
      <div className={cn('rounded-xl border border-border/70 bg-input/30 overflow-hidden', disabled && 'opacity-60', className)}>
        {/* Toolbar */}
        <div className="flex items-center gap-1 p-1 border-b border-border/60 bg-muted/20">
          <button type="button" title="Negrito (*texto*)" disabled={disabled} onClick={() => insertAtCursor('*', '*', 'texto')} className={TOOL_BUTTON}><Bold className="w-3.5 h-3.5" /></button>
          <button type="button" title="Itálico (_texto_)" disabled={disabled} onClick={() => insertAtCursor('_', '_', 'texto')} className={TOOL_BUTTON}><Italic className="w-3.5 h-3.5" /></button>
          <button type="button" title="Lista (- item)" disabled={disabled} onClick={() => insertAtCursor('\n- ', '', 'item')} className={TOOL_BUTTON}><List className="w-3.5 h-3.5" /></button>
          <div className="w-px h-4 bg-border/60 mx-0.5" />
          {/* Emoji */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" title="Emoji" disabled={disabled} className={TOOL_BUTTON}><Smile className="w-3.5 h-3.5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <div className="grid grid-cols-8 gap-0.5">
                {EMOJIS.map((emoji) => (
                  <DropdownMenuItem key={emoji} className="h-6 w-6 items-center justify-center p-0 text-base" onClick={() => insertAtCursor(emoji)}>
                    {emoji}
                  </DropdownMenuItem>
                ))}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          {/* Link */}
          <button type="button" title="Link (https://)" disabled={disabled} onClick={() => insertAtCursor('https://')} className={TOOL_BUTTON}><Link2 className="w-3.5 h-3.5" /></button>
          {/* Inserir variável no cursor */}
          {knownVariables && knownVariables.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" title="Inserir variável" disabled={disabled} className={TOOL_BUTTON}><Hash className="w-3.5 h-3.5" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-64 overflow-auto">
                {knownVariables.map((variable) => (
                  <DropdownMenuItem key={variable} className="text-xs font-mono" onClick={() => insertAtCursor(variable)}>
                    {variable}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Overlay de highlight atrás do textarea transparente */}
        <div className="relative">
          <pre
            ref={highlightRef}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 m-0 px-3 py-2 text-sm leading-relaxed font-mono text-foreground whitespace-pre-wrap break-words overflow-hidden"
          >
            {segments.map((segment, index) => (
              PLACEHOLDER_TOKEN.test(segment) ? (
                <span
                  key={index}
                  className={cn(
                    'rounded px-0.5',
                    knownSet === null || knownSet.has(normalizeVariable(segment))
                      ? 'text-primary-glow bg-primary/10'
                      : 'text-dash-amber bg-dash-amber/10 underline decoration-dotted',
                  )}
                >
                  {segment}
                </span>
              ) : (
                <React.Fragment key={index}>{segment}</React.Fragment>
              )
            ))}
            {/* Newline final: o <pre> precisa de uma linha extra para casar a altura do textarea. */}
            {'\n'}
          </pre>
          {/* O overlay acima e este textarea PRECISAM manter padding, fonte,
              line-height e quebra de linha idênticos — é o que alinha o
              destaque de {{variavel}} ao texto digitado. Medido em Chromium
              (V26): o textarea já aplica overflow-wrap: break-word por padrão
              da UA, então os dois quebram palavra longa no mesmo ponto. */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onScroll={syncScroll}
            onKeyDown={onKeyDown}
            rows={rows}
            disabled={disabled}
            placeholder={placeholder}
            spellCheck={false}
            style={{ caretColor: 'hsl(var(--foreground))' }}
            className="relative block w-full resize-none bg-transparent px-3 py-2 text-sm leading-relaxed font-mono text-transparent outline-none focus-visible:ring-0 placeholder:text-muted-foreground"
          />
        </div>

        {/* Contador por limite do provedor + aviso de variável desconhecida */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border/50 text-2xs">
          {unknownVariables.length > 0 ? (
            <span className="text-dash-amber" role="status">
              Variáveis desconhecidas: {unknownVariables.map((variable) => `{{${variable}}}`).join(', ')}
            </span>
          ) : (
            <span />
          )}
          {typeof limit === 'number' && (
            <span className={cn('tabular-nums shrink-0', overLimit ? 'text-dash-red font-semibold' : 'text-muted-foreground')}>
              {value.length}/{limit}{overLimit ? ` · ${value.length - limit} acima do limite` : ''}
            </span>
          )}
        </div>

        {footer}
      </div>
    );
  },
);
