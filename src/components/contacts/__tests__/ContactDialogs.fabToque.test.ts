import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guarda do botão verde flutuante de Contatos (etapa 18 do plano de 50 etapas).
 *
 * Medição em navegador (390x844, build real) mostrou que o defeito não era
 * empilhamento: o FAB é portal no `body` com `z-20` e vence todo card (`z-auto`).
 * O que falhava era a FORMA da área clicável — `rounded-full` recorta também o
 * hit-test, então os quatro cantos da caixa 56x56 pertenciam ao conteúdo atrás
 * (`ContactCard`/scroller) e o toque no canto não abria o diálogo.
 *
 * A correção é o pseudo-elemento `::after` absoluto do próprio botão, que não é
 * recortado pelo `border-radius` do pai e não cria stacking context novo.
 * Sem o pseudo, o pescoço de toque volta a ser só o círculo inscrito.
 */
describe('ContactDialogs — botão flutuante recebe toque na caixa inteira', () => {
  const fonte = readFileSync(
    resolve(process.cwd(), 'src/components/contacts/ContactDialogs.tsx'),
    'utf8',
  );

  /** Só a tag do FAB, para as asserções abaixo não pegarem vizinhos. */
  const fab = (() => {
    const inicio = fonte.indexOf('data-testid="contact-create-fab"');
    expect(inicio, 'o FAB precisa manter o data-testid').toBeGreaterThan(-1);
    const abre = fonte.lastIndexOf('<button', inicio);
    const fecha = fonte.indexOf('>', inicio);
    return fonte.slice(abre, fecha);
  })();

  it('cobre a caixa toda com ::after (cantos clicáveis)', () => {
    // Geometria real: sem `absolute` o `inset-0` não cobre nada.
    expect(fab).toContain('after:absolute');
    expect(fab).toContain('after:inset-0');
    expect(fab).toContain("after:content-['']");
    // O overlay precisa receber o hit, não ser fantasma.
    expect(fab).not.toContain('pointer-events-none');
    expect(fab).not.toMatch(/after:(hidden|invisible|content-none)/);
  });

  it('não sobe acima do backdrop do menu móvel (z-30)', () => {
    expect(fab).toContain('z-20');
    // Teto numérico: cobre `z-100+`, arbitrary `z-[40]` e `style zIndex`.
    const camadas = [...fab.matchAll(/[:\s"']z-(?:\[(\d+)\]|(\d+))/g)].map((m) =>
      Number(m[1] ?? m[2]),
    );
    const inline = [...fab.matchAll(/zIndex['"]?\s*[:=]\s*['"]?(\d+)/g)].map((m) => Number(m[1]));
    const todas = [...camadas, ...inline];
    expect(todas.length).toBeGreaterThan(0);
    expect(Math.max(...todas)).toBeLessThan(30);
  });

  it('continua portal no document.body, fora do scroller que recortaria o fixed', () => {
    expect(fonte).toMatch(/createPortal\(\s*<Tooltip>/);
    expect(fonte).toMatch(/createPortal\([\s\S]*?,\s*document\.body\s*,?\s*\)/);
  });
});
