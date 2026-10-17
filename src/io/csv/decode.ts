export type TextEncodingName = 'utf-8' | 'windows-1252';

/** UTF-8 (BOM stripped) when valid, otherwise windows-1252 — the usual encoding of older Windows exports. */
export function decodeBytes(bytes: Uint8Array): { text: string; encoding: TextEncodingName } {
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8' };
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252' };
  }
}
