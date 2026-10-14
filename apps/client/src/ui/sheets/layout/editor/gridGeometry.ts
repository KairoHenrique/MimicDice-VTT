export interface GridMetrics {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly columns: number;
  readonly rowHeight: number;
  readonly columnGap: number;
  readonly rowGap: number;
}

export interface GridCell {
  readonly col: number;
  readonly row: number;
}

/** Cell under a viewport point; points in a gap belong to the cell before it, points outside are clamped. */
export function cellAt(metrics: GridMetrics, clientX: number, clientY: number): GridCell {
  const columnWidth = (metrics.width - metrics.columnGap * (metrics.columns - 1)) / metrics.columns;
  const col = Math.floor((clientX - metrics.left) / (columnWidth + metrics.columnGap));
  const row = Math.floor((clientY - metrics.top) / (metrics.rowHeight + metrics.rowGap));
  return { col: Math.min(metrics.columns - 1, Math.max(0, col)), row: Math.max(0, row) };
}

function pixels(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readGridMetrics(grid: HTMLElement, columns: number): GridMetrics {
  const rect = grid.getBoundingClientRect();
  const style = getComputedStyle(grid);
  return {
    left: rect.left + pixels(style.paddingLeft, 0),
    top: rect.top + pixels(style.paddingTop, 0),
    width: rect.width - pixels(style.paddingLeft, 0) - pixels(style.paddingRight, 0),
    columns,
    rowHeight: pixels(style.gridAutoRows, 32),
    columnGap: pixels(style.columnGap, 8),
    rowGap: pixels(style.rowGap, 8),
  };
}
