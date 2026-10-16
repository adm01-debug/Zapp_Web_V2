import React from 'react';
import {
  Users, Truck, UserCheck, Wrench, Handshake, Package, type LucideIcon,
} from 'lucide-react';
import type { ContactType } from '@/utils/whatsappFileTypes';

export interface TypeConfig {
  label: string;
  pluralLabel: string;
  icon: string;
  Icon: LucideIcon;
  iconNode: React.ReactNode;
  /** Cor sólida do tipo (CSS), para `style` e `color-mix`. */
  color: string;
  gradient: string;
  dotBg: string;
  badgeClass: string;
}

// Tailwind aqui não compila o modificador de opacidade (`/NN`) sobre valores
// arbitrários, nem `hsl(..._/_0.NN)` embutido — `bg-[hsl(...)]/15` e
// `bg-[hsl(..._/_.15)]` nunca viram CSS (confirmado no bundle gerado, zero
// ocorrências). `rgba(r,g,b,a)` literal com vírgulas funciona (o JIT converte
// para hex+alfa), por isso border/bg usam rgba() e só o texto (sem alfa) usa hsl().
// O texto do badge é escuro no tema claro e claro no escuro (`dark:`).
const CONFIG = {
  cliente: {
    label: 'Cliente',
    pluralLabel: 'Clientes',
    icon: '👤',
    Icon: Users,
    iconNode: <Users className="w-3 h-3" />,
    color: 'hsl(217 100% 54%)',
    gradient: 'bg-gradient-to-r from-[hsl(217_100%_54%)] to-[hsl(217_100%_40%)]',
    dotBg: 'bg-[hsl(217_100%_54%)]',
    badgeClass: 'border-[rgba(20,110,255,0.6)] text-[hsl(217_100%_35%)] dark:text-[hsl(217_100%_80%)] bg-[rgba(20,110,255,0.15)]',
  },
  fornecedor: {
    label: 'Fornecedor',
    pluralLabel: 'Fornecedores',
    icon: '🚛',
    Icon: Truck,
    iconNode: <Truck className="w-3 h-3" />,
    color: 'hsl(270 60% 60%)',
    gradient: 'bg-gradient-to-r from-[hsl(270_60%_60%)] to-[hsl(270_60%_45%)]',
    dotBg: 'bg-[hsl(270_60%_60%)]',
    badgeClass: 'border-[rgba(153,92,214,0.6)] text-[hsl(270_60%_38%)] dark:text-[hsl(270_60%_80%)] bg-[rgba(153,92,214,0.15)]',
  },
  transportadora: {
    label: 'Transportadora',
    pluralLabel: 'Transportadoras',
    icon: '📦',
    Icon: Package,
    iconNode: <Package className="w-3 h-3" />,
    color: 'hsl(25 90% 50%)',
    gradient: 'bg-gradient-to-r from-[hsl(25_90%_50%)] to-[hsl(25_90%_38%)]',
    dotBg: 'bg-[hsl(25_90%_50%)]',
    badgeClass: 'border-[rgba(230,120,20,0.6)] text-[hsl(25_90%_28%)] dark:text-[hsl(25_90%_80%)] bg-[rgba(230,120,20,0.15)]',
  },
  colaborador: {
    label: 'Colaborador',
    pluralLabel: 'Colaboradores',
    icon: '✓',
    Icon: UserCheck,
    iconNode: <UserCheck className="w-3 h-3" />,
    color: 'hsl(142 71% 45%)',
    gradient: 'bg-gradient-to-r from-[hsl(142_71%_45%)] to-[hsl(142_71%_35%)]',
    dotBg: 'bg-[hsl(142_71%_45%)]',
    badgeClass: 'border-[rgba(33,196,93,0.6)] text-[hsl(142_71%_24%)] dark:text-[hsl(142_71%_80%)] bg-[rgba(33,196,93,0.15)]',
  },
  prestador_servico: {
    label: 'Prestador',
    pluralLabel: 'Prestadores',
    icon: '🔧',
    Icon: Wrench,
    iconNode: <Wrench className="w-3 h-3" />,
    color: 'hsl(38 92% 50%)',
    gradient: 'bg-gradient-to-r from-[hsl(38_92%_50%)] to-[hsl(38_92%_40%)]',
    dotBg: 'bg-[hsl(38_92%_50%)]',
    badgeClass: 'border-[rgba(245,159,10,0.6)] text-[hsl(38_92%_25%)] dark:text-[hsl(38_92%_80%)] bg-[rgba(245,159,10,0.15)]',
  },
  parceiro: {
    label: 'Parceiro',
    pluralLabel: 'Parceiros',
    icon: '🤝',
    Icon: Handshake,
    iconNode: <Handshake className="w-3 h-3" />,
    color: 'hsl(0 72% 51%)',
    gradient: 'bg-gradient-to-r from-[hsl(0_72%_51%)] to-[hsl(0_72%_40%)]',
    dotBg: 'bg-[hsl(0_72%_51%)]',
    badgeClass: 'border-[rgba(220,40,40,0.6)] text-[hsl(0_72%_36%)] dark:text-[hsl(0_72%_80%)] bg-[rgba(220,40,40,0.15)]',
  },
} satisfies Record<ContactType, TypeConfig>;

export const CONTACT_TYPE_CONFIG: Record<string, TypeConfig> = CONFIG;
