/**
 * IA-052 — a linha de consumo diz QUAL foi o caminho EFETIVO.
 *
 * Aceite da etapa: "Cada execução informa seu caminho efetivo, inclusive
 * fallback e modalidade de áudio." Proibição explícita: "não inferir provedor
 * apenas pela configuração padrão".
 *
 * O que este arquivo pina, e por quê: o registrador central
 * (`_shared/ai-usage.ts`) já anexa a rota a TODA linha — mas ele só tem o que
 * cada chamador lhe entrega. Se o roteador parar de mandar a modalidade, ou o
 * `ai-proxy` parar de mandar o destino do fallback, o log volta a registrar
 * meia rota SEM quebrar nada: nenhum teste falha, nenhum erro aparece, e a
 * auditoria passa a mentir por omissão. É exatamente o tipo de regressão que
 * precisa de guarda de origem.
 *
 * Prova de comportamento (que a rota chega ao insert) fica em
 * `supabase/functions/_shared/ai-usage.test.ts`, com o PostgREST espiado.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');

function ler(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

/** Trecho do fonte entre `inicio` e o primeiro `fim` posterior. */
function trecho(fonte: string, inicio: string, fim: string): string {
  const i = fonte.indexOf(inicio);
  if (i < 0) return '';
  const j = fonte.indexOf(fim, i + inicio.length);
  return j < 0 ? fonte.slice(i) : fonte.slice(i, j + fim.length);
}

/** TODOS os trechos entre `inicio` e o `fim` seguinte (arquivos com mais de uma chamada). */
function blocos(fonte: string, inicio: string, fim: string): string[] {
  const out: string[] = [];
  let i = fonte.indexOf(inicio);
  while (i >= 0) {
    const j = fonte.indexOf(fim, i + inicio.length);
    out.push(j < 0 ? fonte.slice(i) : fonte.slice(i, j + fim.length));
    i = fonte.indexOf(inicio, i + inicio.length);
  }
  return out;
}

describe('(IA-052) o log de consumo registra a rota efetiva, não a configurada', () => {
  it('o roteador manda provedor efetivo, tipo, finalidade, modalidade e modelo pedido', () => {
    const fonte = ler('supabase/functions/_shared/ai-generate.ts');
    const registro = trecho(fonte, 'logAiUsage({', '});');
    expect(registro).not.toBe('');
    for (const campo of [
      'providerId:',
      'providerType:',
      'providerName:',
      'purpose',
      'modality:',
      'modelRequested:',
    ]) {
      expect(registro, `o registro central do roteador não manda ${campo}`).toContain(campo);
    }
    // O tipo do provedor vem da LINHA do provedor escolhido (medido), não de
    // constante de configuração.
    expect(fonte, 'provider_type não é lido do provedor que atendeu').toContain(
      'provider.provider_type',
    );
  });

  it('o roteador grava a rota em TODAS as saídas, inclusive falha de roteamento', () => {
    const fonte = ler('supabase/functions/_shared/ai-generate.ts');
    // Toda chamada de logUsage usa o registrador único — não há insert paralelo.
    const chamadas = fonte.split('await logUsage({').length - 1;
    expect(chamadas, 'esperava mais de uma saída de log no roteador').toBeGreaterThan(1);
    // As variáveis de rota são declaradas ANTES do registrador (senão o log da
    // falha de roteamento estouraria TDZ e o registro se perderia em silêncio).
    const posDeclaracao = fonte.indexOf('let rotaProviderType');
    const posRegistrador = fonte.indexOf('const logUsage = (entry: {');
    expect(posDeclaracao).toBeGreaterThan(-1);
    expect(
      posDeclaracao < posRegistrador,
      'a rota é declarada depois do registrador: a falha de roteamento perderia o log',
    ).toBe(true);
  });

  it('a modalidade sai da declaração do chamador, sem valor fixo', () => {
    const fonte = ler('supabase/functions/_shared/ai-generate.ts');
    expect(fonte, 'modalidade do roteador não vem de `need.modality`').toContain(
      'params.need?.modality',
    );
  });

  it('o `ai-proxy` registra o destino do fallback como quem atendeu', () => {
    const fonte = ler('supabase/functions/ai-proxy/index.ts');
    const logs = blocos(fonte, 'await logAiUsageDetached({', '});');
    expect(logs, 'esperava os dois logs do ai-proxy (erro e sucesso)').toHaveLength(2);
    // POR BLOCO de propósito: procurar o trecho no arquivo inteiro deixaria a
    // mutação de UM dos dois logs passar batido (foi assim que a guarda falhou
    // na primeira versão, achada pelo sweep de mutação).
    for (const bloco of logs) {
      expect(
        bloco,
        'log do ai-proxy sem o provedor EFETIVO: numa troca, quem atendeu é o destino',
      ).toContain('usedFallback && fallbackTo !== null ? fallbackTo.id : provider.id');
      expect(bloco, 'o fallback não é declarado na linha').toContain('fallbackUsed: usedFallback');
    }
  });

  it('as funções de visão declaram finalidade e modalidade em toda degradação', () => {
    for (const arquivo of [
      'supabase/functions/classify-emoji/index.ts',
      'supabase/functions/classify-sticker/index.ts',
    ]) {
      const fonte = ler(arquivo);
      const blocosLog = blocos(fonte, 'await logAiUsage({', '});');
      expect(blocosLog, `${arquivo}: esperava 3 saídas de log`).toHaveLength(3);
      // Cada saída direta precisa declarar a modalidade: a chamada é de VISÃO e
      // isso tem de estar no log mesmo quando o provedor nem chegou a ser usado.
      for (const bloco of blocosLog) {
        expect(bloco, `${arquivo}: saída de log sem a modalidade de visão`).toContain(
          "modality: 'vision'",
        );
      }
    }
  });

  it('o insert do registrador usa o construtor de metadata com a rota anexada', () => {
    const fonte = ler('supabase/functions/_shared/ai-usage.ts');
    expect(fonte, 'o insert não passa pela rota efetiva').toContain('buildUsageMetadata(entry)');
    expect(fonte, 'modalidade não é validada contra a lista canônica').toContain(
      'MODALITIES as readonly string[]',
    );
  });

  it('a lista canônica de modalidades é a MESMA fonte usada pelo roteamento', () => {
    // Se alguém duplicar a lista, a normalização e o roteamento divergem em
    // silêncio: o log passa a recusar uma modalidade que o roteador aceita.
    const capacidades = ler('supabase/functions/_shared/ai-capabilities.ts');
    expect(capacidades, 'MODALITIES deixou de ser exportada').toContain('export const MODALITIES');
    const usage = ler('supabase/functions/_shared/ai-usage.ts');
    expect(usage, 'ai-usage.ts não importa a lista canônica').toContain(
      'from "./ai-capabilities.ts"',
    );
  });
});
