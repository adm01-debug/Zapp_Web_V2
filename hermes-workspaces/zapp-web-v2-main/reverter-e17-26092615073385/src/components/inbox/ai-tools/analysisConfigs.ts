import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  ThumbsUp,
  ThumbsDown,
  Minus,
  AlertTriangle,
  ShieldAlert,
  Heart,
  Eye,
  Zap,
  BookOpen,
} from 'lucide-react';

export interface AgentPerformance {
  empathy: number;
  clarity: number;
  efficiency: number;
  knowledge: number;
}

export interface AnalysisData {
  analysisId?: string | null;
  department?: string;
  relationshipType?: string;
  summary: string;
  status: string;
  keyPoints: string[];
  nextSteps?: string[];
  sentiment: string;
  sentimentScore?: number;
  topics?: string[];
  urgency?: string;
  customerSatisfaction?: number;
  agentPerformance?: AgentPerformance | null;
  churnRisk?: string;
  salesOpportunity?: string | null;
}

export interface AnalysisMessage {
  id: string;
  sender: 'agent' | 'contact';
  content: string;
  type?: string;
  mediaUrl?: string;
  created_at: string;
}

export const statusConfig: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  resolvido: { label: 'Resolvido', icon: CheckCircle2, className: 'bg-success/20 text-success border-success/30' },
  pendente: { label: 'Pendente', icon: Clock, className: 'bg-warning/20 text-warning border-warning/30' },
  aguardando_cliente: { label: 'Aguardando Cliente', icon: AlertCircle, className: 'bg-warning/20 text-warning border-warning/30' },
  aguardando_atendente: { label: 'Aguardando Atendente', icon: AlertCircle, className: 'bg-info/20 text-info border-info/30' },
  escalado: { label: 'Escalado', icon: AlertTriangle, className: 'bg-destructive/20 text-destructive border-destructive/30' },
};

export const sentimentConfig: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  positivo: { label: 'Positivo', icon: ThumbsUp, color: 'text-success', bg: 'bg-success' },
  neutro: { label: 'Neutro', icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted' },
  negativo: { label: 'Negativo', icon: ThumbsDown, color: 'text-destructive', bg: 'bg-destructive' },
  critico: { label: 'Crítico', icon: AlertTriangle, color: 'text-destructive', bg: 'bg-destructive' },
};

export const urgencyConfig: Record<string, { label: string; className: string }> = {
  baixa: { label: 'Baixa', className: 'bg-success/20 text-success' },
  media: { label: 'Média', className: 'bg-warning/20 text-warning' },
  alta: { label: 'Alta', className: 'bg-destructive/20 text-destructive' },
  critica: { label: 'Crítica', className: 'bg-destructive/30 text-destructive animate-pulse' },
};

export const departmentConfig: Record<string, { label: string; emoji: string; color: string }> = {
  vendas: { label: 'Vendas', emoji: '🛒', color: 'bg-primary/20 text-primary border-primary/30' },
  compras: { label: 'Compras', emoji: '📦', color: 'bg-warning/20 text-warning border-warning/30' },
  logistica: { label: 'Logística', emoji: '🚛', color: 'bg-success/20 text-success border-success/30' },
  rh: { label: 'RH', emoji: '👥', color: 'bg-accent/40 text-accent-foreground border-accent/30' },
  financeiro: { label: 'Financeiro', emoji: '💰', color: 'bg-warning/20 text-warning border-warning/30' },
  sac: { label: 'SAC', emoji: '🎧', color: 'bg-destructive/20 text-destructive border-destructive/30' },
  outros: { label: 'Outros', emoji: '📋', color: 'bg-muted/40 text-muted-foreground border-border' },
};

export const churnConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  low: { label: 'Baixo', color: 'text-success', icon: CheckCircle2 },
  medium: { label: 'Médio', color: 'text-warning', icon: AlertCircle },
  high: { label: 'Alto', color: 'text-destructive', icon: ShieldAlert },
};

export const performanceLabels: Record<string, { label: string; icon: React.ElementType }> = {
  empathy: { label: 'Empatia', icon: Heart },
  clarity: { label: 'Clareza', icon: Eye },
  efficiency: { label: 'Eficiência', icon: Zap },
  knowledge: { label: 'Conhecimento', icon: BookOpen },
};
