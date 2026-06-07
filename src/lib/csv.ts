export function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/** Render a CSV string to a styled table canvas. Throws if there are no data rows. */
export function renderCsvTable(text: string): HTMLCanvasElement {
  const lines = text.split('\n').filter((line) => line.trim() !== '');
  if (lines.length < 2) throw new Error('No data rows');
  const headers = parseCSVLine(lines[0]);
  const rows: string[][] = [];
  for (let r = 1; r < lines.length; r++) {
    const row = parseCSVLine(lines[r]);
    if (row.length === headers.length) rows.push(row);
  }
  if (!rows.length) throw new Error('No valid rows');

  const cellPadding = 16;
  const font = '16px "DM Sans", Arial, sans-serif';
  const headerFont = 'bold 18px "DM Sans", Arial, sans-serif';
  const rowHeight = 36;
  const headerHeight = 44;
  const borderColor = '#334155';
  const headerBg = '#6366f1';
  const headerColor = '#fff';
  const cellBg = '#1e293b';
  const cellColor = '#f8fafc';

  const measure = document.createElement('canvas').getContext('2d')!;
  measure.font = font;
  const colWidths = headers.map((h, colIdx) => {
    let max = measure.measureText(h).width;
    for (const row of rows) max = Math.max(max, measure.measureText(row[colIdx] || '').width);
    return Math.ceil(max + cellPadding * 2);
  });
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const tableHeight = headerHeight + rowHeight * rows.length;

  const canvas = document.createElement('canvas');
  canvas.width = tableWidth;
  canvas.height = tableHeight;
  const c = canvas.getContext('2d')!;

  let x = 0;
  c.font = headerFont;
  c.textBaseline = 'middle';
  for (let ci = 0; ci < headers.length; ci++) {
    c.fillStyle = headerBg;
    c.fillRect(x, 0, colWidths[ci], headerHeight);
    c.strokeStyle = borderColor;
    c.strokeRect(x, 0, colWidths[ci], headerHeight);
    c.fillStyle = headerColor;
    c.fillText(headers[ci], x + cellPadding, headerHeight / 2);
    x += colWidths[ci];
  }
  c.font = font;
  for (let r = 0; r < rows.length; r++) {
    x = 0;
    for (let ci = 0; ci < headers.length; ci++) {
      c.fillStyle = cellBg;
      c.fillRect(x, headerHeight + r * rowHeight, colWidths[ci], rowHeight);
      c.strokeStyle = borderColor;
      c.strokeRect(x, headerHeight + r * rowHeight, colWidths[ci], rowHeight);
      c.fillStyle = cellColor;
      c.fillText(rows[r][ci], x + cellPadding, headerHeight + r * rowHeight + rowHeight / 2);
      x += colWidths[ci];
    }
  }
  return canvas;
}

export function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}
