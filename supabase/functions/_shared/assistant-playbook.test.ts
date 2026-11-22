import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  ASSISTANT_ATUACOES,
  playbookFor,
  playbookPromptBlock,
} from './assistant-playbook.ts';

Deno.test('playbook: toda atuação do CHECK do banco tem playbook próprio', () => {
  assertEquals([...ASSISTANT_ATUACOES].sort(), ['atendimento', 'compra', 'supervisao', 'venda']);
  const objetivos = ASSISTANT_ATUACOES.map((a) => playbookFor(a).objetivos.join('|'));
  assertEquals(new Set(objetivos).size, 4);
});

Deno.test('playbook: perfil ausente ou inválido cai no default atendimento', () => {
  assertEquals(playbookFor(null).atuacao, 'atendimento');
  assertEquals(playbookFor(undefined).atuacao, 'atendimento');
  assertEquals(playbookFor('marketing' as never).atuacao, 'atendimento');
});

Deno.test('playbook: venda e compra recebem treinos diferentes (Fase 4)', () => {
  const venda = playbookPromptBlock(playbookFor('venda'));
  const compra = playbookPromptBlock(playbookFor('compra'));
  assertEquals(venda === compra, false);
  assertEquals(venda.includes('objeção de preço'), true);
  assertEquals(compra.includes('prazo prometido'), true);
  assertEquals(venda.includes('prazo prometido'), false);
});

Deno.test('playbook: supervisao pede padrão do time, não resposta para o cliente', () => {
  const bloco = playbookPromptBlock(playbookFor('supervisao'));
  assertEquals(bloco.includes('supervisor'), true);
  assertEquals(bloco.includes('onde agir'), true);
});

Deno.test('playbook: capacidade prioritária é sempre uma capacidade real da porta única', async () => {
  const { ASSISTANT_CAPABILITIES } = await import('./assistant-gateway.ts');
  for (const atuacao of ASSISTANT_ATUACOES) {
    for (const cap of playbookFor(atuacao).prioritarias) {
      assertEquals(
        (ASSISTANT_CAPABILITIES as readonly string[]).includes(cap),
        true,
        `${atuacao} prioriza capacidade inexistente: ${cap}`,
      );
    }
  }
});

Deno.test('playbook: bloco de prompt é determinístico', () => {
  assertEquals(playbookPromptBlock(playbookFor('venda')), playbookPromptBlock(playbookFor('venda')));
});
Deno.test('playbook: catálogo de objeções do perfil usa só tipos do handler real', async () => {
  // `ai-objection-handler` classifica nestes tipos (system prompt da edge).
  const tiposReais = [
    'preco',
    'prazo',
    'quantidade_minima',
    'concorrente',
    'chefe',
    'qualidade',
    'frete',
    'generica',
  ];
  for (const atuacao of ASSISTANT_ATUACOES) {
    for (const o of playbookFor(atuacao).objecoes ?? []) {
      assertEquals(tiposReais.includes(o.tipo), true, `${atuacao}: tipo fora do handler: ${o.tipo}`);
      assertEquals(o.tratamento.trim().length > 10, true);
    }
  }
});

Deno.test('playbook: catálogo de objeções entra no bloco de prompt', () => {
  const bloco = playbookPromptBlock(playbookFor('venda'));
  assertEquals(bloco.includes('Objeções conhecidas'), true);
  assertEquals(bloco.includes('preco → '), true);
});