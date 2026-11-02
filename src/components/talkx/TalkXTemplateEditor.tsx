import React, { useEffect, useState, useMemo, useRef, useSyncExternalStore } from 'react';
import {
  X, Check, Copy, ChevronLeft, ChevronRight, FileText, BarChart3, Image, Video, Music, Send, CheckCircle, XCircle, History, RotateCcw,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { TalkXDialogShell } from './kit/dialogs';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PrimaryButton, GhostButton, Pill } from '@/components/dashboard/overview/DashboardCard';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useTalkXTemplates, type TalkXTemplate, type TemplateInput, type TemplateVariant } from '@/hooks/integrations/useTalkXTemplates';
import { TalkXQueryBoundary } from './kit/states';
import {
  useTalkXTemplateLibraryStats,
  useTalkXTemplateStats,
  pointsDelta,
  TALKX_TEMPLATE_STATS_PERIODS,
  TALKX_STATS_MIN_BASE,
} from '@/hooks/integrations/useTalkXTemplateStats';
import { TalkXMessageEditor, type TalkXMessageEditorHandle } from './TalkXMessageEditor';
import { TalkXMessagePreview } from './TalkXMessagePreview';
import { useTalkX } from '@/hooks/integrations/useTalkX';
import { KpiCard } from './kit/kpi';
import { PRESETS_DO_PRODUTO } from './kit/dialogPresets';
import { useTalkXConfirm } from './kit/useTalkXConfirm';
import {
  IconTile, RailCard, TalkXSkeletonRows, TEMPLATE_CATEGORIES, TEMPLATE_STATUS,
  VARIABLE_KEYS, personalizePreview, fmtInt,
} from './talkxShared';

/**
 * X193 — o corte de largura do painel do editor é o mesmo `xl` do Tailwind
 * (1280 px), lido pelo `matchMedia` (sem `setState` em efeito). Abaixo dele o
 * rail não cabe ao lado do editor e o painel vem pela gaveta.
 */
const CONSULTA_PAINEL_LARGO = '(min-width: 1280px)';

function assinarPainelLargo(aoMudar: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const media = window.matchMedia(CONSULTA_PAINEL_LARGO);
  media.addEventListener('change', aoMudar);
  return () => media.removeEventListener('change', aoMudar);
}

function painelLargo() {
  return typeof window.matchMedia !== 'function' || window.matchMedia(CONSULTA_PAINEL_LARGO).matches;
}