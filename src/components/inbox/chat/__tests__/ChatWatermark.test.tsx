import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { ChatWatermark } from '../ChatWatermark';

describe('ChatWatermark', () => {
  it('renderiza como decoração pura (aria-hidden, sem texto/interação)', () => {
    const { container } = render(<ChatWatermark />);
    const el = container.querySelector('.chat-watermark');
    expect(el).not.toBeNull();
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).toBeEmptyDOMElement();
  });

  it('mantém a calibração de tile/opacidade do padrão (PR #763) em tokens.css', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../../../../styles/tokens.css'),
      'utf8',
    );
    expect(css).toMatch(/--chat-pattern-tile:\s*441px/);
    expect(css).toMatch(/--chat-pattern-opacity:\s*0\.047/);
    expect(css).toMatch(/--chat-pattern-opacity:\s*0\.122/);
  });
});
