/**
 * CV-072: Shows detected objection + treatment script steps.
 */
import React from 'react';
import { X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { ObjectionClassification, ObjectionType } from '@/hooks/copilot/useObjectionDetector';

const OBJECTION_LABELS: Record<ObjectionType, string> = {
  price: 'Preço',
  time: 'Prazo',
  minimum_qty: 'Qtd. Mínima',
  competitor: 'Concorrente',
  delay: 'Indecisão',
  quality: 'Qualidade',
  need: 'Necessidade',
};

const OBJECTION_COLORS: Record<ObjectionType, string> = {
  price: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  time: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  minimum_qty: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  competitor: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  delay: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  quality: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  need: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
};

export interface ObjectionCardProps {
  objection: ObjectionClassification | null;
  onDismiss: () => void;
  className?: string;
}

export function ObjectionCard({ objection, onDismiss, className }: ObjectionCardProps) {
  if (!objection) return null;

  return (
    <Card className={`border-l-4 border-l-amber-500 ${className ?? ''}`}>
      <CardHeader className="flex flex-row items-center justify-between py-2 px-3 pb-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Objeção detectada
          </span>
          <Badge className={`text-xs ${OBJECTION_COLORS[objection.type]}`} variant="secondary">
            {OBJECTION_LABELS[objection.type]}
          </Badge>
          {objection.isReal && (
            <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
              {Math.round(objection.confidence * 100)}% confiança
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDismiss}>
          <X className="h-3 w-3" />
          <span className="sr-only">Dispensar</span>
        </Button>
      </CardHeader>
      <CardContent className="px-3 py-2">
        <p className="text-xs font-medium text-muted-foreground mb-2">Script de tratamento:</p>
        <ol className="space-y-1">
          {objection.script.map((step, i) => (
            <li key={i} className="text-xs text-foreground leading-relaxed">
              {step}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
