import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatTime } from '@/charts/buildOptions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Log } from '@/data/types';
import { addMarkerAtCursor, jumpToMarker } from '@/state/actions';
import { useMarkerStore, type Marker } from '@/state/markers';

export function MarkersTab({ log }: { log: Log }) {
  const markers = useMarkerStore((s) => s.markers);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-7 justify-start gap-1.5 text-xs"
        onClick={addMarkerAtCursor}
      >
        <Plus className="size-3.5" aria-hidden />
        Add marker
      </Button>
      {markers.length === 0 ? (
        <p className="px-1 text-muted-foreground">
          No markers yet. Press M to drop one at the cursor.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {markers.map((m) => (
            <MarkerRow key={m.id} marker={m} log={log} />
          ))}
        </div>
      )}
    </>
  );
}

function MarkerRow({ marker, log }: { marker: Marker; log: Log }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(marker.label);
  const { rename, remove } = useMarkerStore.getState();

  return (
    <div
      data-testid="marker-row"
      className="group flex items-center gap-1 border-b border-border/60 px-1 py-0.5"
    >
      <span className="num w-16 shrink-0 text-[11px] text-muted-foreground">
        {formatTime(marker.t, log.timeSource)}
      </span>
      {editing ? (
        <Input
          autoFocus
          aria-label="Marker name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              rename(marker.id, draft);
              setEditing(false);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              setDraft(marker.label);
              setEditing(false);
            }
          }}
          onBlur={() => {
            rename(marker.id, draft);
            setEditing(false);
          }}
          className="h-6 flex-1 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => jumpToMarker(marker)}
          className="min-w-0 flex-1 truncate rounded-sm px-1 py-1 text-left hover:bg-accent"
        >
          {marker.label}
        </button>
      )}
      <button
        type="button"
        aria-label={`Rename ${marker.label}`}
        onClick={() => {
          setDraft(marker.label);
          setEditing(true);
        }}
        className="rounded-sm p-1 text-muted-foreground opacity-60 group-hover:opacity-100 hover:bg-accent focus-visible:opacity-100"
      >
        <Pencil className="size-3" />
      </button>
      <button
        type="button"
        aria-label={`Delete ${marker.label}`}
        onClick={() => remove(marker.id)}
        className="rounded-sm p-1 text-muted-foreground opacity-60 group-hover:opacity-100 hover:bg-accent hover:text-destructive focus-visible:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}
