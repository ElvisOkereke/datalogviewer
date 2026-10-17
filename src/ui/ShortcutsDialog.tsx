import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const SHORTCUTS: [string, string][] = [
  ['Mouse wheel', 'Zoom around the pointer'],
  ['Drag', 'Pan'],
  ['Shift + drag', 'Zoom to the selected range'],
  ['Double-click / F', 'Show the whole log'],
  ['Click', 'Pin the cursor'],
  ['Esc', 'Release a pinned cursor'],
  ['← / →', 'Step the cursor one sample (hold Shift for 10)'],
  ['Home / End', 'Cursor to the start / end'],
  ['+ / −', 'Zoom in / out'],
  ['Pinch / two-finger drag', 'Zoom / pan on touch screens'],
  ['?', 'Show this list'],
];

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <table className="w-full text-sm">
          <tbody>
            {SHORTCUTS.map(([keys, action]) => (
              <tr key={keys} className="border-b border-border/60 last:border-0">
                <td className="num py-1.5 pr-4 whitespace-nowrap text-muted-foreground">{keys}</td>
                <td className="py-1.5">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DialogContent>
    </Dialog>
  );
}
