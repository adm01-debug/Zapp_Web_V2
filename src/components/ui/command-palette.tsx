import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Command, ArrowRight, Clock, Star, X, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import { Badge } from './badge';
import { ScrollArea } from './scroll-area';
import { useDebounce } from '@/hooks/system/useDebounce';
import { log } from '@/lib/logger';
