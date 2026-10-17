/** RFC 4180-ish CSV parser: quoted fields, doubled quotes, CRLF/LF. Stops after `maxRows` rows. */
export function parseCsv(
  text: string,
  maxRows = 5001,
  delimiter = ",",
): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const pushRow = () => {
    row.push(field);
    field = "";
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text.charAt(i);
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
      } else field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field === "") quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushRow();
      if (rows.length >= maxRows)
        return { rows, truncated: i + 1 < text.length };
    } else field += ch;
    i++;
  }
  if (field !== "" || row.length) pushRow();
  return { rows, truncated: false };
}

const NUM = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;
export const isNumeric = (v: string) => NUM.test(v.trim());
