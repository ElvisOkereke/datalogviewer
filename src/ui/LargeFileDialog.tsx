import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export function LargeFileDialog({
  file,
  onCancel,
  onConfirm,
}: {
  file: File | null;
  onCancel(): void;
  onConfirm(file: File): void;
}) {
  const mb = file ? Math.round(file.size / (1024 * 1024)) : 0;
  return (
    <AlertDialog open={file !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Load a {mb} MB log?</AlertDialogTitle>
          <AlertDialogDescription>
            "{file?.name}" is large. It can take a while to read and use a lot of memory; if the
            browser runs out, you'll see an error rather than a crash.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => file && onConfirm(file)}>Load anyway</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
