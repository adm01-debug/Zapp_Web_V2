import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function returnedDivClasses(file) {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/\breturn\s*(?:\(\s*)?<div(?:\s+className="([^"]*)")?[\s>]/g)].map((match) => match[1] ?? '');
}

const cases = [
  {
    name: 'TalkX',
    file: 'src/components/talkx/TalkXView.tsx',
    expectedRoots: 4,
  },
  {
    name: 'Multiplix',
    file: 'src/components/multiplix/MultiplixView.tsx',
    expectedRoots: 2,
  },
];

for (const route of cases) {
  test(`${route.name} deixa o gutter exclusivamente com ViewContainer`, () => {
    const rootClasses = returnedDivClasses(route.file);

    assert.equal(
      rootClasses.length,
      route.expectedRoots,
      `${route.name}: o contrato precisa auditar todas as raízes <div> retornadas pela view`,
    );

    for (const className of rootClasses) {
      assert.doesNotMatch(
        className,
        /(?:^|\s)(?:[a-z]+:)*p(?:[trblxy])?-(?:\d+|\[[^\]]+\])(?:\s|$)/,
        `${route.name}: padding próprio "${className}" soma-se ao gutter de ViewContainer`,
      );
    }
  });
}
