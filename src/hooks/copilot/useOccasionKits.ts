/**
 * CV-089 — Sugestão de kits por ocasião.
 *
 * Detecta o tipo de evento e sugere kit temático. Sem ocasião reconhecida, cai
 * para o kit do produto citado na conversa — une a implementação paralela
 * (antigo useKitSuggestion, CV-088), que montava kits por produto.
 */
import { useMemo } from 'react';

export interface OccasionKit {
  occasion: string;
  kitName: string;
  items: string[];
  targetAudience: string;
  script: string;
}

const OCCASION_TRIGGERS: Record<string, string[]> = {
  corporativo: ['evento corporativo', 'reunião', 'conferência', 'congresso', 'treinamento', 'onboarding'],
  aniversario: ['aniversário', 'aniversario', 'festa', 'comemoração', 'comemorar'],
  esportivo: ['corrida', 'maratona', 'esporte', 'academia', 'treino', 'atleta'],
  escolar: ['escola', 'faculdade', 'formatura', 'aluno', 'estudante', 'professor'],
  natal: ['natal', 'fim de ano', 'final de ano', 'cesta de natal'],
};

const OCCASION_KITS: Record<string, OccasionKit> = {
  corporativo: {
    occasion: 'Evento Corporativo',
    kitName: 'Kit Executivo',
    items: ['Caneta premium', 'Caderno capa dura', 'Porta-crachá'],
    targetAudience: 'Executivos e colaboradores',
    script: 'Para eventos corporativos, o Kit Executivo é o mais pedido: caneta + caderno + porta-crachá personalizados. Passam uma imagem muito profissional.',
  },
  aniversario: {
    occasion: 'Aniversário / Festa',
    kitName: 'Kit Festa',
    items: ['Squeeze personalizado', 'Toalha personalizada', 'Camiseta'],
    targetAudience: 'Convidados da festa',
    script: 'Para aniversários, o Kit Festa com squeeze + toalha é muito lembrado pelos convidados. Fica na casa deles por anos.',
  },
  esportivo: {
    occasion: 'Evento Esportivo',
    kitName: 'Kit Atleta',
    items: ['Squeeze', 'Camiseta dry-fit', 'Mochila esportiva'],
    targetAudience: 'Atletas e participantes',
    script: 'Para eventos esportivos, o Kit Atleta é perfeito: squeeze + camiseta dry-fit são usados nos treinos e o participante lembra da sua marca a cada corrida.',
  },
  escolar: {
    occasion: 'Evento Escolar',
    kitName: 'Kit Estudante',
    items: ['Mochila', 'Caneta', 'Caderno'],
    targetAudience: 'Alunos e professores',
    script: 'Para eventos escolares, o Kit Estudante é um clássico: mochila + caneta + caderno personalizados são usados todos os dias.',
  },
  natal: {
    occasion: 'Natal / Fim de Ano',
    kitName: 'Kit Natal Corporativo',
    items: ['Caneca térmica', 'Caixa kraft personalizada', 'Sachê de chocolate'],
    targetAudience: 'Clientes e parceiros',
    script: 'Para fim de ano, o Kit Natal com caneca + caixa personalizada + chocolate é o presente mais bem recebido. Está em falta todo dezembro — melhor fechar cedo.',
  },
};

// Fallback por produto: quando a conversa não diz a ocasião, mas diz o produto.
const PRODUCT_KITS: Array<{ triggers: string[]; kit: OccasionKit }> = [
  { triggers: ['caneta', 'bloco', 'caderno'], kit: { occasion: 'Produtividade / Corporativo', kitName: 'Kit Escritório', items: ['Caneta metálica', 'Bloco de anotações', 'Porta-cartão'], targetAudience: 'Participantes de eventos corporativos e treinamentos', script: 'Posso montar um Kit Escritório com caneta + bloco + porta-cartão — perfeito para eventos corporativos e treinamentos. Interesse?' } },
  { triggers: ['squeeze', 'garrafa', 'copo'], kit: { occasion: 'Bem-estar / Academia', kitName: 'Kit Fitness', items: ['Squeeze', 'Toalha personalizada', 'Porta-suplemento'], targetAudience: 'Público de ações de bem-estar', script: 'Para ação de bem-estar, um Kit Fitness (squeeze + toalha + porta-suplemento) é muito mais impactante que o squeeze sozinho. Posso cotar?' } },
  { triggers: ['ecobag', 'sacola', 'bag'], kit: { occasion: 'ESG / Sustentabilidade', kitName: 'Kit Sustentabilidade', items: ['Ecobag', 'Copo reutilizável', 'Canudo de bambu'], targetAudience: 'Público de ações de ESG', script: 'Para uma ação de ESG, um Kit Sustentabilidade (ecobag + copo reutilizável + canudo de bambu) transmite o conceito completo. Interesse em cotar?' } },
  { triggers: ['camiseta', 'camisa', 'uniforme'], kit: { occasion: 'Uniformização / Eventos', kitName: 'Kit Uniforme', items: ['Camiseta', 'Boné', 'Mochila'], targetAudience: 'Equipes e participantes uniformizados', script: 'Para uniformização completa, posso incluir boné e mochila no pedido — kit muito mais impactante. Quer que eu calcule?' } },
];

export function useOccasionKits({ conversationText }: { conversationText: string }): OccasionKit | null {
  return useMemo(() => {
    if (!conversationText) return null;
    const lower = conversationText.toLowerCase();
    for (const [occasion, triggers] of Object.entries(OCCASION_TRIGGERS)) {
      if (triggers.some((t) => lower.includes(t))) return OCCASION_KITS[occasion] ?? null;
    }
    for (const { triggers, kit } of PRODUCT_KITS) {
      if (triggers.some((t) => lower.includes(t))) return kit;
    }
    return null;
  }, [conversationText]);
}
