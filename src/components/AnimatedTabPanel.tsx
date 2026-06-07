import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Box from '@mui/material/Box';

interface AnimatedTabPanelProps {
  /** Stable key identifying the current panel (e.g. the tool id). */
  panelKey: string;
  children: ReactNode;
}

export function AnimatedTabPanel({ panelKey, children }: AnimatedTabPanelProps) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={panelKey}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
      >
        <Box sx={{ pb: 4 }}>{children}</Box>
      </motion.div>
    </AnimatePresence>
  );
}
