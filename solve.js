// A fast drop-in replacement for csv-reader 1.0.0 (make.fun's reference CSV reader).
//
// run(input) returns exactly csv-reader's answer for every input {text, header}: {columns, rows, errors},
// under csv-reader's broken-row policy: a U+FEFF at the very start is dropped; a record ends at LF or CRLF
// and a line left with no characters is no record; outside quotes a CR not followed by LF is dropped
// (stray_cr); a field that opens with a quote runs to the next quote that is not doubled ("" inside it is
// one quote, and each CRLF or lone CR inside it is read as LF); what follows its closing quote, up to the
// next comma or line break, is appended as it stands (quote_junk, when the field ends); a quote that never
// closes is a literal character and the text after it is read again as unquoted (unterminated_quote); a
// quote inside an unquoted field is a literal character; fields stay strings, never trimmed or converted;
// columns is the first record when header is true, else null; rows are padded with "" (short_row) or cut
// (long_row) to the first record's width; each error is {code, line, row} in the order met, line the
// 1-based line its record starts on and row its record's index in rows (null for the header).
//
// Where csv-reader walks one character at a time and builds each field a character at a time, this reader
// jumps between delimiters with indexOf and takes each field as one slice of the text; only the broken
// rows (a stray CR, a quoted field with escapes or CRs, junk after a closing quote) leave the fast path.
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

// How a field ended: 0 at a comma (the record goes on), 1 at a line break, 2 at the end of the text.
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just parsed: its value, how it ended, and whether it opened with a quote.
  let fValue = '';
  let fEnded = 2;
  let fQuoted = false;

  // The next comma, LF and CR at or after a position, cached: pos only moves forward through the
  // text, so each cached index stays the first of its character at or after any later position
  // (-2: not looked up yet; -1: none in the rest of the text). Without the cache, a text with no
  // CR at all would make every field's CR lookup scan to the end of the text.
  let commaPos = -2;
  let lfPos = -2;
  let crPos = -2;
  function nextComma(from) {
    if (commaPos === -2 || (commaPos !== -1 && commaPos < from)) commaPos = text.indexOf(',', from);
    return commaPos;
  }
  function nextLf(from) {
    if (lfPos === -2 || (lfPos !== -1 && lfPos < from)) lfPos = text.indexOf('\n', from);
    return lfPos;
  }
  function nextCr(from) {
    if (crPos === -2 || (crPos !== -1 && crPos < from)) crPos = text.indexOf('\r', from);
    return crPos;
  }

  // Reads unquoted characters from pos onto `prefix`, up to the next comma or line break: a CR not
  // followed by LF is dropped (stray_cr). Sets fValue and fEnded, advances pos and line, and returns
  // how many characters were kept from the text.
  function readTail(prefix) {
    let kept = 0;
    let parts = null; // the segments between stray CRs, once one splits the field
    let segStart = pos;
    for (;;) {
      const iComma = nextComma(pos);
      const iLf = nextLf(pos);
      const iCr = nextCr(pos);
      let idx = iComma;
      let kind = 0; // 0 comma, 1 LF, 2 CR
      if (iLf !== -1 && (idx === -1 || iLf < idx)) { idx = iLf; kind = 1; }
      if (iCr !== -1 && (idx === -1 || iCr < idx)) { idx = iCr; kind = 2; }
      if (idx === -1) {
        const s = text.slice(segStart, n);
        kept += s.length;
        fValue = parts === null ? prefix + s : prefix + parts.join('') + s;
        pos = n;
        fEnded = 2;
        return kept;
      }
      if (kind === 2 && text.charCodeAt(idx + 1) !== 10) {
        // A lone CR outside quotes: dropped, and the field goes on.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, idx));
        kept += idx - segStart;
        pos = idx + 1;
        segStart = pos;
        continue;
      }
      const s = text.slice(segStart, idx);
      kept += s.length;
      fValue = parts === null ? prefix + s : prefix + parts.join('') + s;
      if (kind === 0) {
        pos = idx + 1;
        fEnded = 0;
      } else if (kind === 1) {
        pos = idx + 1;
        line += 1;
        fEnded = 1;
      } else {
        pos = idx + 2; // CRLF
        line += 1;
        fEnded = 1;
      }
      return kept;
    }
  }

  // Parses the field that starts at pos into fValue, fEnded and fQuoted.
  function parseField() {
    if (text.charCodeAt(pos) !== 34) { // not a quote: an unquoted field
      fQuoted = false;
      readTail('');
      return;
    }
    fQuoted = true;
    const open = pos;
    const openLine = line;
    const contentStart = pos + 1;
    // Find the closing quote: the next quote that is not doubled.
    let p = contentStart;
    let hasEsc = false;
    let closeIdx = -1;
    for (;;) {
      const q = text.indexOf('"', p);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) { hasEsc = true; p = q + 2; continue; }
      closeIdx = q;
      break;
    }
    if (closeIdx === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      pos = open + 1;
      line = openLine;
      readTail('"');
      return;
    }
    const crIdx = nextCr(contentStart);
    const hasCr = crIdx !== -1 && crIdx < closeIdx;
    let value;
    if (!hasEsc && !hasCr) {
      value = text.slice(contentStart, closeIdx);
      let i = contentStart;
      while ((i = text.indexOf('\n', i)) !== -1 && i < closeIdx) { line += 1; i += 1; }
    } else {
      // "" is one quote and each CRLF or lone CR is one LF; count the lines as they pass.
      const parts = [];
      let seg = contentStart;
      let i = contentStart;
      while (i < closeIdx) {
        const c = text.charCodeAt(i);
        if (c === 34) {
          parts.push(text.slice(seg, i), '"');
          i += 2;
          seg = i;
        } else if (c === 13) {
          parts.push(text.slice(seg, i), '\n');
          line += 1;
          i += text.charCodeAt(i + 1) === 10 ? 2 : 1;
          seg = i;
        } else {
          if (c === 10) line += 1;
          i += 1;
        }
      }
      parts.push(text.slice(seg, closeIdx));
      value = parts.join('');
    }
    pos = closeIdx + 1;
    if (pos >= n) { fValue = value; fEnded = 2; return; }
    const c = text.charCodeAt(pos);
    if (c === 44) { pos += 1; fValue = value; fEnded = 0; return; }
    if (c === 10) { pos += 1; line += 1; fValue = value; fEnded = 1; return; }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; fValue = value; fEnded = 1; return; }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const kept = readTail(value);
    if (kept > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos += 1; line += 1; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line += 1; }
      else break;
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    do {
      parseField();
      fields.push(fValue);
    } while (fEnded === 0);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !fQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
