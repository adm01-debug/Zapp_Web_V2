import React from 'react';

/**
 * X189 — renderizador mínimo de markdown dos artigos da Ajuda.
 *
 * O projeto não tem renderizador de markdown nas dependências e a regra do
 * cartão é não instalar dependência nova. Então este módulo cobre só o que os
 * artigos usam — títulos, parágrafos, listas, negrito, código e link https —
 * e monta nós React: nada de `dangerouslySetInnerHTML`, nada de HTML cru. O
 * que o parser não reconhece sai como texto, nunca como marcação.
 */

type TalkXHelpBlock =
  | { kind: 'heading'; level: 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] };

/** O título do artigo vem do frontmatter (h1 do leitor), então `#` vira h2. */
function parseHelpMarkdown(source: string): TalkXHelpBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: TalkXHelpBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push(list.ordered ? { kind: 'ol', items: list.items } : { kind: 'ul', items: list.items });
    list = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = Math.min(4, Math.max(2, heading[1].length)) as 2 | 3 | 4;
      blocks.push({ kind: 'heading', level, text: heading[2].trim() });
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    const ordered = /^\d+[.)]\s+(.+)$/.exec(trimmed);
    if (bullet || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((bullet ? bullet[1] : ordered?.[1] ?? '').trim());
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();
  return blocks;
}

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;

/** Negrito, `código` e link http(s); qualquer outro texto sai literal. */
function renderHelpInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = new RegExp(INLINE.source, 'g');
  let last = 0;
  let position = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${position}`;
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={key} className="text-2xs bg-muted/50 px-1 py-0.5 rounded">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(
        <a
          key={key}
          href={match[2]}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary hover:underline"
        >
          {match[1]}
        </a>,
      );
    }
    last = match.index + token.length;
    position += 1;
  }

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function HelpMarkdown({ source }: { source: string }) {
  const blocks = parseHelpMarkdown(source);
  return (
    <>
      {blocks.map((block, index) => {
        const key = `help-block-${index}`;
        if (block.kind === 'heading') {
          const Tag = `h${block.level}` as 'h2' | 'h3' | 'h4';
          const size = block.level === 2 ? 'text-base' : 'text-sm';
          return (
            <Tag key={key} className={`${size} font-semibold text-foreground pt-2`}>
              {renderHelpInline(block.text, key)}
            </Tag>
          );
        }
        if (block.kind === 'paragraph') {
          return (
            <p key={key} className="text-sm text-foreground-secondary leading-relaxed">
              {renderHelpInline(block.text, key)}
            </p>
          );
        }
        const List = block.kind === 'ol' ? 'ol' : 'ul';
        return (
          <List
            key={key}
            className={`space-y-1.5 pl-4 text-sm text-foreground-secondary leading-relaxed ${
              block.kind === 'ol' ? 'list-decimal' : 'list-disc'
            }`}
          >
            {block.items.map((item, itemIndex) => (
              <li key={`${key}-item-${itemIndex}`}>{renderHelpInline(item, `${key}-item-${itemIndex}`)}</li>
            ))}
          </List>
        );
      })}
    </>
  );
}
