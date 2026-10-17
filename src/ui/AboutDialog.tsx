import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { REPO_URL } from '@/config';

export function AboutDialog({
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
          <DialogTitle>DataLogViewer</DialogTitle>
          <DialogDescription>Free, fast datalog viewer for CSV logs.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Version</dt>
          <dd className="num">{__APP_VERSION__}</dd>
          <dt className="text-muted-foreground">Privacy</dt>
          <dd>Your logs never leave your browser. No accounts, no tracking.</dd>
          <dt className="text-muted-foreground">Source &amp; feedback</dt>
          <dd>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-primary underline">
              GitHub
            </a>
          </dd>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
