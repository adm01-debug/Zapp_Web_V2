import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const APP_CHROME_FILES = [
  'src/components/email/EmailAttachmentPreviewDialog.tsx',
  'src/components/email/EmailChatBubble.tsx',
  'src/components/email/EmailChatInbox.tsx',
  'src/components/email/EmailChatReplyBar.tsx',
  'src/components/email/EmailChatThread.tsx',
  'src/components/email/EmailContactPanel.tsx',
  'src/components/email/EmailThreadList.tsx',
  'src/components/gmail/EmailComposer.tsx',
  'src/components/gmail/EmailRichTextEditor.tsx',
] as const;

const RAW_COLOR = /#[0-9a-f]{3,8}\b|rgba?\(/i;
const FIXED_TAILWIND_PALETTE = /\b(?:bg|text|border|ring|ring-offset|fill|stroke|from|via|to)-(?:black|white|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-|\/|\b)/;

describe('Email usa a paleta semântica global do ZAPP', () => {
  it.each(APP_CHROME_FILES)('%s não introduz cores visuais fixas', file => {
    const source = readFileSync(resolve(process.cwd(), file), 'utf8');

    expect(source).not.toMatch(RAW_COLOR);
    expect(source).not.toMatch(FIXED_TAILWIND_PALETTE);
  });
});

