export interface DiffLine {
  type: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * Compute a simple line-level diff between two strings.
 */
export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let oi = 0;
  let ni = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (oi >= oldLines.length) {
      result.push({ type: 'added', text: newLines[ni]! });
      ni++;
    } else if (ni >= newLines.length) {
      result.push({ type: 'removed', text: oldLines[oi]! });
      oi++;
    } else if (oldLines[oi] === newLines[ni]) {
      result.push({ type: 'same', text: oldLines[oi]! });
      oi++;
      ni++;
    } else {
      const newIdx = newLines.indexOf(oldLines[oi]!, ni + 1);
      const oldIdx = oldLines.indexOf(newLines[ni]!, oi + 1);

      if (newIdx !== -1 && (oldIdx === -1 || newIdx - ni <= oldIdx - oi)) {
        while (ni < newIdx) {
          result.push({ type: 'added', text: newLines[ni]! });
          ni++;
        }
      } else if (oldIdx !== -1) {
        while (oi < oldIdx) {
          result.push({ type: 'removed', text: oldLines[oi]! });
          oi++;
        }
      } else {
        result.push({ type: 'removed', text: oldLines[oi]! });
        result.push({ type: 'added', text: newLines[ni]! });
        oi++;
        ni++;
      }
    }

    if (result.length > maxLen * 3) break;
  }

  return result;
}
