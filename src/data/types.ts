export type TimeSource =
  { kind: 'column'; channelId: string; originalUnit: 's' | 'ms' | 'datetime' } | { kind: 'index' };

export interface ParseWarning {
  code: string;
  message: string;
  count?: number;
  firstRow?: number;
}

export interface Channel {
  /** Stable within a log. */
  id: string;
  /** Exact header text (de-duplicated), e.g. "Calculated MAP (psi)". Layouts bind by this. */
  header: string;
  name: string;
  unit?: string;
  kind: 'numeric' | 'text';
  /** Numeric channels: one value per row, NaN for blank/invalid cells. */
  values: Float64Array | null;
  /** Text channels only. */
  text: string[] | null;
  /** Over finite values; NaN when there are none. */
  min: number;
  max: number;
}

export interface Log {
  id: string;
  fileName: string;
  rowCount: number;
  /** Seconds from the first sample, or the row index when timeSource is 'index'. */
  time: Float64Array;
  timeSource: TimeSource;
  channels: Channel[];
  meta: {
    delimiter: string;
    decimal: '.' | ',';
    encoding: 'utf-8' | 'windows-1252';
    preamble: string[];
    warnings: ParseWarning[];
  };
}
