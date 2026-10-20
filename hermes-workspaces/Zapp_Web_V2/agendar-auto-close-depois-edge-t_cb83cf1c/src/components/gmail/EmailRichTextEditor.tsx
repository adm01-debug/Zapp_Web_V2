import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, Link2, List, ListOrdered, Redo2, Undo2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmailRichTextEditorProps {
  content: string;
  onChange: (html: string, text: string) => void;
  onSubmit: () => void;
}

function normalizeLink(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withProtocol);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function EmailRichTextEditor({ content, onChange, onSubmit }: EmailRichTextEditorProps) {
  const submitRef = useRef(onSubmit);
  useEffect(() => { submitRef.current = onSubmit; }, [onSubmit]);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [StarterKit.configure({
      heading: false,
      codeBlock: false,
      horizontalRule: false,
      link: { openOnClick: false, autolink: true, linkOnPaste: true, protocols: ['http', 'https', 'mailto'] },
    })],
    content,
    editorProps: {
      attributes: {
        class: 'ProseMirror min-h-[200px] px-3 py-2 text-sm text-foreground outline-none',
        'aria-label': 'Mensagem',
        'data-placeholder': 'Escreva sua mensagem...',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.isComposing && !event.repeat) {
          event.preventDefault();
          submitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: updatedEditor }) => onChange(updatedEditor.getHTML(), updatedEditor.getText({ blockSeparator: '\n' })),
  });

  if (!editor) return <div className="min-h-[200px] animate-pulse rounded-lg border border-border bg-input" aria-label="Carregando editor" />;

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const raw = window.prompt('Endereço do link (https:// ou mailto:)', previous || 'https://');
    if (raw === null) return;
    const href = normalizeLink(raw);
    if (!href) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  const toolbarButton = (label: string, active: boolean, action: () => void, icon: React.ReactNode, disabled = false) => (
    <Button type="button" variant="ghost" size="icon" className={cn('h-7 w-7', active && 'bg-primary/15 text-primary')} aria-label={label} aria-pressed={active} disabled={disabled} onClick={action}>{icon}</Button>
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-input">
      <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1" role="toolbar" aria-label="Formatação da mensagem">
        {toolbarButton('Negrito', editor.isActive('bold'), () => editor.chain().focus().toggleBold().run(), <Bold className="h-3.5 w-3.5" />)}
        {toolbarButton('Itálico', editor.isActive('italic'), () => editor.chain().focus().toggleItalic().run(), <Italic className="h-3.5 w-3.5" />)}
        {toolbarButton('Lista com marcadores', editor.isActive('bulletList'), () => editor.chain().focus().toggleBulletList().run(), <List className="h-3.5 w-3.5" />)}
        {toolbarButton('Lista numerada', editor.isActive('orderedList'), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="h-3.5 w-3.5" />)}
        {toolbarButton('Inserir link', editor.isActive('link'), setLink, <Link2 className="h-3.5 w-3.5" />)}
        {toolbarButton('Remover link', false, () => editor.chain().focus().unsetLink().run(), <Unlink className="h-3.5 w-3.5" />, !editor.isActive('link'))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        {toolbarButton('Desfazer', false, () => editor.chain().focus().undo().run(), <Undo2 className="h-3.5 w-3.5" />, !editor.can().undo())}
        {toolbarButton('Refazer', false, () => editor.chain().focus().redo().run(), <Redo2 className="h-3.5 w-3.5" />, !editor.can().redo())}
      </div>
      <EditorContent editor={editor} className="[&_.ProseMirror_a]:text-primary [&_.ProseMirror_a]:underline [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-primary/40 [&_.ProseMirror_blockquote]:pl-3 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6" />
    </div>
  );
}
