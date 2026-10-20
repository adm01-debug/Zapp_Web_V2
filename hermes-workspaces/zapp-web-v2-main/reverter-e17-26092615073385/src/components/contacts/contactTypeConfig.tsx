import React from 'react';
import {
  Users, Truck, UserCheck, Wrench, Star, Handshake, MoreHorizontal, Gift, Package,
} from 'lucide-react';

interface TypeConfig {
  label: string;
  icon: string;
  iconNode: React.ReactNode;
  gradient: string;
  dotBg: string;
  badgeClass: string;
}

// Tailwind aqui não compila o modificador de opacidade (`/NN`) sobre valores
// arbitrários, nem `hsl(..._/_0.NN)` embutido — `bg-[hsl(...)]/15` e
// `bg-[hsl(..._/_.15)]` nunca viram CSS (confirmado no bundle gerado, zero
// ocorrências). `rgba(r,g,b,a)` literal com vírgulas funciona (o JIT converte
// para hex+alfa), por isso border/bg usam rgba() e só o texto (sem alfa) usa hsl().
export const CONTACT_TYPE_CONFIG: Record<string, TypeConfig> = {
  cliente: {
    label: 'Cliente',
    icon: '👤',
    iconNode: <Users className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(217_100%_54%)] to-[hsl(217_100%_40%)]',
    dotBg: 'bg-[hsl(217_100%_54%)]',
    badgeClass: 'border-[rgba(20,110,255,0.6)] text-[hsl(217_100%_80%)] bg-[rgba(5,35,87,0.9)]',
  },
  fornecedor: {
    label: 'Fornecedor',
    icon: '🚛',
    iconNode: <Truck className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(270_60%_60%)] to-[hsl(270_60%_45%)]',
    dotBg: 'bg-[hsl(270_60%_60%)]',
    badgeClass: 'border-[rgba(153,92,214,0.6)] text-[hsl(270_60%_80%)] bg-[rgba(153,92,214,0.15)]',
  },
  colaborador: {
    label: 'Colaborador',
    icon: '✓',
    iconNode: <UserCheck className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(142_71%_45%)] to-[hsl(142_71%_35%)]',
    dotBg: 'bg-[hsl(142_71%_45%)]',
    badgeClass: 'border-[rgba(33,196,93,0.6)] text-[hsl(142_71%_80%)] bg-[rgba(33,196,93,0.15)]',
  },
  prestador_servico: {
    label: 'Prestador',
    icon: '🔧',
    iconNode: <Wrench className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(38_92%_50%)] to-[hsl(38_92%_40%)]',
    dotBg: 'bg-[hsl(38_92%_50%)]',
    badgeClass: 'border-[rgba(245,159,10,0.6)] text-[hsl(38_92%_80%)] bg-[rgba(245,159,10,0.15)]',
  },
  lead: {
    label: 'Lead',
    icon: '⭐',
    iconNode: <Star className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(48_96%_53%)] to-[hsl(48_96%_40%)]',
    dotBg: 'bg-[hsl(48_96%_53%)]',
    badgeClass: 'border-[rgba(250,204,20,0.6)] text-[hsl(48_96%_80%)] bg-[rgba(250,204,20,0.15)]',
  },
  parceiro: {
    label: 'Parceiro',
    icon: '🤝',
    iconNode: <Handshake className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(0_72%_51%)] to-[hsl(0_72%_40%)]',
    dotBg: 'bg-[hsl(0_72%_51%)]',
    badgeClass: 'border-[rgba(220,40,40,0.6)] text-[hsl(0_72%_80%)] bg-[rgba(220,40,40,0.15)]',
  },
  sicoob_gifts: {
    label: 'Sicoob Gifts',
    icon: '🎁',
    iconNode: <Gift className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(199_89%_48%)] to-[hsl(199_89%_38%)]',
    dotBg: 'bg-[hsl(199_89%_48%)]',
    badgeClass: 'border-[rgba(13,162,232,0.6)] text-[hsl(199_89%_80%)] bg-[rgba(13,162,232,0.15)]',
  },
  transportadora: {
    label: 'Transportadora',
    icon: '📦',
    iconNode: <Package className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(199_89%_48%)] to-[hsl(199_89%_38%)]',
    dotBg: 'bg-[hsl(199_89%_48%)]',
    badgeClass: 'border-[rgba(13,162,232,0.6)] text-[hsl(199_89%_80%)] bg-[rgba(13,162,232,0.15)]',
  },
  outros: {
    label: 'Outros',
    icon: '…',
    iconNode: <MoreHorizontal className="w-3 h-3" />,
    gradient: 'bg-gradient-to-r from-[hsl(0_0%_45%)] to-[hsl(0_0%_35%)]',
    dotBg: 'bg-[hsl(0_0%_45%)]',
    badgeClass: 'border-[rgba(115,115,115,0.6)] text-[hsl(0_0%_80%)] bg-[rgba(115,115,115,0.15)]',
  },
};
