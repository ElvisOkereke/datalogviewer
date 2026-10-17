import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AppShell } from '@/ui/AppShell';

export function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <AppShell />
      <Toaster position="bottom-right" />
    </TooltipProvider>
  );
}
