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

// Cores dos tipos de contato: SEMPRE token do `tokens.css` (nunca HSL/hex solto).
// Cada `color` é um valor CSS (`hsl(var(--...))`) usado em `style`/`color-mix`;
// `dotBg`/`badgeClass` são classes nomeadas/anônimas — o Tailwind compila o
// modificador de opacidade (`/NN`) só em cor NOMEADA (`bg-primary/15`), nunca em
// `bg-[hsl(...)]/15` (zero ocorrências no bundle). Por isso border/bg usam a
// classe nomeada com `/NN` e só o texto usa valor arbitrário com o token
// `-text` (prefixo de cor de texto + `hsl(var(...))`, ex. `--primary-text`).
// O texto do badge sai de um token `-text` (ou do próprio tom de preenchimento,
// onde não há `-text`): o token já muda entre claro/escuro, então o `dark:` é a
// MESMA referência, mantido porque a tranca `contactTypeConfig.test.ts` exige
// cor de texto declarada para os dois temas. Os tons violeta (fornecedor) e
// âmbar (transportadora) reaproveitam o par `--dash-*` até o `t_f3f17002`
// publicar `--violet`/`--teal`/`--rosa`; trocar então.
const CONFIG = {
  cliente: {
    label: 'Cliente',
    pluralLabel: 'Clientes',
    icon: '👤',
    Icon: Users,
    iconNode: <Users className="w-3 h-3" />,
    color: 'hsl(var(--primary))',
    gradient: 'bg-gradient-to-r from-primary to-primary/80',
    dotBg: 'bg-primary',
    badgeClass: 'border-primary/60 bg-primary/15 text-[hsl(var(--primary-text))] dark:text-[hsl(var(--primary-text))]',
  },
  fornecedor: {
    label: 'Fornecedor',
    pluralLabel: 'Fornecedores',
    icon: '🚛',
    Icon: Truck,
    iconNode: <Truck className="w-3 h-3" />,
    color: 'hsl(var(--violeta))',
    gradient: 'bg-gradient-to-r from-violeta to-violeta/80',
    dotBg: 'bg-violeta',
    badgeClass: 'border-violeta/60 bg-violeta/15 dark:bg-violeta/10 text-[hsl(var(--violeta-text))] dark:text-[hsl(var(--violeta-text))]',
  },
  transportadora: {
    label: 'Transportadora',
    pluralLabel: 'Transportadoras',
    icon: '📦',
    Icon: Package,
    iconNode: <Package className="w-3 h-3" />,
    color: 'hsl(var(--dash-amber))',
    gradient: 'bg-gradient-to-r from-dash-amber to-dash-amber/80',
    dotBg: 'bg-dash-amber',
    badgeClass: 'border-dash-amber/60 bg-dash-amber/15 text-[hsl(var(--dash-tile-amber))] dark:text-[hsl(var(--dash-amber))]',
  },
  colaborador: {
    label: 'Colaborador',
    pluralLabel: 'Colaboradores',
    icon: '✓',
    Icon: UserCheck,
    iconNode: <UserCheck className="w-3 h-3" />,
    color: 'hsl(var(--success))',
    gradient: 'bg-gradient-to-r from-success to-success/80',
    dotBg: 'bg-success',
    badgeClass: 'border-success/60 bg-success/15 text-[hsl(var(--success))] dark:text-[hsl(var(--success))]',
  },
  prestador_servico: {
    label: 'Prestador',
    pluralLabel: 'Prestadores',
    icon: '🔧',
    Icon: Wrench,
    iconNode: <Wrench className="w-3 h-3" />,
    color: 'hsl(var(--warning))',
    gradient: 'bg-gradient-to-r from-warning to-warning/80',
    dotBg: 'bg-warning',
    badgeClass: 'border-warning/60 bg-warning/15 text-[hsl(var(--warning-text))] dark:text-[hsl(var(--warning-text))]',
  },
  parceiro: {
    label: 'Parceiro',
    pluralLabel: 'Parceiros',
    icon: '🤝',
    Icon: Handshake,
    iconNode: <Handshake className="w-3 h-3" />,
    color: 'hsl(var(--destructive))',
    gradient: 'bg-gradient-to-r from-destructive to-destructive/80',
    dotBg: 'bg-destructive',
    badgeClass: 'border-destructive/60 bg-destructive/15 text-[hsl(var(--destructive-text))] dark:text-[hsl(var(--destructive-text))]',
  },
} satisfies Record<ContactType, TypeConfig>;

export const CONTACT_TYPE_CONFIG: Record<string, TypeConfig> = CONFIG;
