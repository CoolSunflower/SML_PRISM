/**
 * Decode HTML entities (e.g. &#39; → ', &amp; → &) using a textarea element.
 * Safe in browser context — textarea does not execute scripts.
 */
function decodeHTMLEntities(str) {
  const txt = document.createElement('textarea');
  txt.innerHTML = str;
  return txt.value;
}

/**
 * Escape a single CSV cell value.
 * - Decodes HTML entities so &#39; doesn't leave a bare semicolon in the cell.
 * - Normalises all newline variants to a single space so embedded line breaks
 *   never break the row structure in Excel or other CSV readers.
 * - Wraps in double-quotes if the value contains commas, semicolons, or double-quotes.
 */
function escapeCSV(value) {
  if (value == null || value === '') return '';
  // Decode HTML entities first, then flatten newlines
  const str = decodeHTMLEntities(String(value)).replace(/\r\n|\r|\n/g, ' ').trim();
  if (str.includes(',') || str.includes(';') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const KWATCH_COLUMNS = [
  { header: 'Date', key: 'receivedAt' },
  { header: 'Platform', key: 'platform' },
  { header: 'Author', key: 'author' },
  { header: 'Title', key: 'title' },
  { header: 'Content', key: 'content' },
  { header: 'Sentiment', key: 'sentiment' },
  { header: 'Topic', key: 'topic' },
  { header: 'Brand', key: 'subTopic' },
  { header: 'Link', key: 'link' },
  { header: 'Relevant by Model', key: 'relevantByModel' },
  { header: 'Is Duplicate', key: 'isDuplicate' },
];

const GOOGLE_ALERTS_COLUMNS = [
  { header: 'Date', key: 'classifiedAt' },
  { header: 'Platform', key: 'platform' }, // should be 'google-alerts' always
  { header: 'Author', key: 'author' }, // Google Alerts doesn't have author field, but we include it as blank for consistency
  { header: 'Title', key: 'title' },
  { header: 'Content', key: 'content' },
  { header: 'Sentiment', key: 'sentiment' },
  { header: 'Topic', key: 'topic' },
  { header: 'Brand', key: 'subTopic' },
  { header: 'Link', key: 'extractedUrl' },
  { header: 'Relevant by Model', key: 'relevantByModel' },
  { header: 'Is Duplicate', key: 'isDuplicate' }, // We need to set this to false for Google alerts dont have duplicates
];

/**
 * Convert an array of items to a CSV string.
 * @param {object[]} items
 * @param {'kwatch'|'google-alerts'} dataType
 * @returns {string}
 */
export function buildCSV(items, dataType) {
  const columns = dataType === 'kwatch' ? KWATCH_COLUMNS : GOOGLE_ALERTS_COLUMNS;
  const headerRow = columns.map((c) => c.header).join(',');
  const dataRows = items.map((item) =>{
    // set google alerts isDuplicate to false as they dont have duplicates
    if (dataType === 'google-alerts') {
      item.isDuplicate = false;
    }
    return columns.map((c) => escapeCSV(item[c.key])).join(',')
  });
  return [headerRow, ...dataRows].join('\r\n');
}

/**
 * Trigger a browser file download for a CSV string.
 * Prefixes with UTF-8 BOM so Excel recognises the encoding correctly.
 * @param {string} csvString
 * @param {string} filename
 */
export function downloadCSV(csvString, filename) {
  const blob = new Blob(['\uFEFF' + csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
