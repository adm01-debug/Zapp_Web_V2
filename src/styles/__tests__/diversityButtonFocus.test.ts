import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/styles/diversity-overrides.css', 'utf8');

const declarationsFor = (selectorPattern: RegExp) => {
  const rule = css.match(new RegExp(`${selectorPattern.source}\\s*\\{([^}]*)\\}`, 's'));
  return rule?.[1] ?? '';
};

describe('Diversity — foco de botões padrão', () => {
  it('mantém neutro o ring decorativo fora do foco', () => {
    const neutralReset = declarationsFor(
      /html\[data-preset-id="diversity"\] \[class\*="ring-primary"\],\s*html\[data-preset-id="diversity"\] \[class\*="ring-2"\],\s*html\[data-preset-id="diversity"\] \[class\*="ring-1"\]/,
    );

    expect(neutralReset).toContain('box-shadow: none !important');
    expect(neutralReset).toContain('--tw-ring-color: transparent !important');
  });

  it('restaura um indicador explícito e não transparente só em focus-visible', () => {
    const focusVisible = declarationsFor(
      /html\[data-preset-id="diversity"\] button:focus-visible,\s*html\[data-preset-id="diversity"\] \[role="button"\]:focus-visible/,
    );

    expect(focusVisible).toContain('0 0 0 2px hsl(var(--background))');
    expect(focusVisible).toContain('0 0 0 4px hsl(var(--primary))');
    expect(focusVisible).not.toMatch(/box-shadow:\s*none|transparent/);
  });
});
