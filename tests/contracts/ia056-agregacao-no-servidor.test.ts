import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * IA-056 — invariantes que o teste de comportamento NÃO consegue ver.
 *
 * O teste do hook roda com o Supabase dublado, então um `.limit(1000)` de volta
 * passaria despercebido lá: a busca na fonte é o que pega o defeito original.
 * Aceite: "períodos com mais de 1.000 registros mantêm totais corretos, sem
 * depender da página visualizada".
 */

const raiz = resolve(__dirname, '..', '..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

/**
 * Asserção de invariante tem de olhar CÓDIGO, não prosa: o comentário do hook
 * cita `.limit(1000)` para explicar o defeito, e o cabeçalho da migration cita
 * `create or replace function`/`security definer` para justificar a escolha.
 * Sem isto, o texto que documenta o problema seria lido como o problema.
 */
const semComentarios = (fonte: string) =>
  fonte
    .split('\n')
    .filter(l => {
      const t = l.trimStart();
      return !t.startsWith('--') && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('*/');
    })
    .join('\n');

const HOOK = 'src/hooks/analytics/useAIUsageDashboard.ts';
const ABA = 'src/components/admin/AIUsageLogsTab.tsx';
const PAINEL = 'src/components/admin/AIUsageDashboard.tsx';

describe('IA-056 — o cliente não calcula mais os totais', () => {
  it('não existe corte de 1000 registros na listagem', () => {
    const fonte = semComentarios(ler(HOOK));
    expect(fonte).not.toMatch(/limit\(\s*1000\s*\)/);
    // A listagem crua usa range + contagem exata, não limit.
    expect(fonte).toMatch(/\.range\(/);
    expect(fonte).toMatch(/count:\s*'exact'/);
  });

  it('os totais vêm da agregação autorizada, chamada com a janela', () => {
    const fonte = ler(HOOK);
    expect(fonte).toMatch(/rpc[^\n]*ai_usage_summary|ai_usage_summary/);
    expect(fonte).toMatch(/p_since:/);
    expect(fonte).toMatch(/p_bucket_seconds:/);
  });

  it('o cliente não soma as linhas para produzir os indicadores', () => {
    const fonte = semComentarios(ler(HOOK));
    // Nada de reduce/contagem sobre `logs` alimentando os cards.
    expect(fonte).not.toMatch(/logs\.reduce\(/);
    expect(fonte).not.toMatch(/totalCalls:\s*logs\.length/);
    expect(fonte).not.toMatch(/logs\.filter\(/);
    // E os indicadores são declarados a partir do resumo do servidor.
    expect(fonte).toMatch(/totalCalls:\s*resumo\?\.totais\.chamadas/);
    expect(fonte).toMatch(/totalTokens:\s*resumo\?\.totais\.tokens/);
    expect(fonte).toMatch(/errorCount:\s*resumo\?\.totais\.erros/);
  });

  it('a resposta do servidor é repassada com filtros, cobertura e escopo', () => {
    const fonte = ler(HOOK);
    expect(fonte).toMatch(/cobertura:\s*resumo\?\.cobertura/);
    expect(fonte).toMatch(/filtros:\s*resumo\?\.filtros/);
    expect(fonte).toMatch(/escopo:\s*resumo\?\.escopo/);
  });

  it('a tela mostra sobre o que o número foi calculado', () => {
    expect(ler(PAINEL)).toMatch(/cobertura\.chamadas/);
    expect(ler(PAINEL)).toMatch(/sem medição de tokens/);
  });
});

describe('IA-056 — paginação é do servidor', () => {
  it('a aba de logs não fatia o array no cliente', () => {
    const fonte = ler(ABA);
    expect(fonte).not.toMatch(/logs\.slice\(/);
  });

  it('a aba usa o total do servidor, não o tamanho da página', () => {
    const fonte = ler(ABA);
    expect(fonte).toMatch(/logsTotal/);
    expect(fonte).not.toMatch(/total.*logs\.length/);
  });

  it('o painel entrega o total exato para a aba', () => {
    expect(ler(PAINEL)).toMatch(/logsTotal=\{logsTotal\}/);
  });
});

describe('IA-056 — a migration da agregação é segura e reversível', () => {
  const migracao = () => {
    const caminho = 'supabase/migrations/20261003072707_ia056_agregacao_no_servidor.sql';
    return ler(caminho);
  };

  it('declara o caminho de volta no cabeçalho', () => {
    const fonte = migracao();
    const declaracao = fonte.match(/^create (or replace )?function/m);
    expect(declaracao, 'a migration precisa declarar a função').not.toBeNull();
    const primeira = fonte.slice(0, declaracao!.index);
    expect(primeira).toMatch(/^-- rollback: .*;/m);
  });

  it('NÃO usa security definer: o escopo é o da RLS de quem chama', () => {
    // Um definer aqui mostraria a um agente o consumo da empresa inteira,
    // porque a RLS de ai_usage_logs seria ignorada dentro da função.
    expect(semComentarios(migracao())).not.toMatch(/security\s+definer/i);
  });

  it('fecha o execute para anon e exige autenticação', () => {
    const fonte = semComentarios(migracao());
    expect(fonte).toMatch(/revoke all on function[\s\S]*from public, anon/i);
    expect(fonte).toMatch(/grant execute on function[\s\S]*to authenticated/i);
  });

  it('os totais vêm da janela inteira, com fim exclusivo', () => {
    const fonte = semComentarios(migracao());
    expect(fonte).toMatch(/created_at >= p\.inicio/);
    expect(fonte).toMatch(/created_at < p\.fim/);
    // Nada de limit/offset dentro da agregação: seria o mesmo defeito no servidor.
    expect(fonte).not.toMatch(/limit\s+\d+\s*;?\s*$/im);
  });

  it('separa tokens medidos de chamadas sem medição', () => {
    const fonte = semComentarios(migracao());
    expect(fonte).toMatch(/chamadas_sem_tokens/);
    // Ancora no bloco de TOTAIS (o que alimenta a cobertura): o padrão sozinho
    // aparece também na lista por função, então mutar um não derruba o outro —
    // é a adjacência entre total medido e contagem de não medidos que importa.
    expect(fonte).toMatch(
      /count\(\*\) filter \(where j\.total_tokens is null\) as sem_tokens,\s*\n\s*coalesce\(sum\(j\.total_tokens\), 0\) as tokens,/,
    );
  });
});
