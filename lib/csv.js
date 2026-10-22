// CSV for Google Sheets and Excel. UTF-8 with a byte order mark, so Romanian letters open correctly.
const BOM = '\uFEFF';

function cell(v) {
  if (v == null) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  // Text that starts with = + - @ would be run as a formula by a spreadsheet (customers type the names and messages).
  // A leading apostrophe makes it plain text. Phone numbers such as +40 700 000 000 are fine as they are.
  if (/^[=+\-@\t\r]/.test(s) && !/^\+[\d\s().-]+$/.test(s)) s = `'${s}`;
  return /[",;\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// rows: array of arrays. sep: ',' (Google Sheets) or ';' (Excel with European settings).
const toCsv = (rows, sep = ',') => BOM + rows.map(r => r.map(cell).join(sep)).join('\r\n') + '\r\n';

module.exports = { toCsv, cell, BOM };
