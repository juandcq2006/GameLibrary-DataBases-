// Pure helpers for SQL files: no environment, no connection, so tests can import them safely.
import { createHash } from 'node:crypto';

/** sha256 of a migration file. Line endings are normalized so a Windows checkout matches a Mac one. */
export const checksum = (sql: string) => createHash('sha256').update(sql.replace(/\r\n/g, '\n')).digest('hex');

/**
 * Splits a SQL file into chunks the server can run, honouring `DELIMITER` lines the way the
 * mysql client and MySQL Workbench do. Trigger bodies (BEGIN … END) contain `;`, so files that
 * define triggers switch to `DELIMITER $$`. A file without DELIMITER lines is one chunk.
 */
export function splitSql(sql: string): string[] {
  const text = sql.replace(/\r\n/g, '\n');
  if (!/^\s*DELIMITER\s/im.test(text)) return [text];

  const chunks: string[] = [];
  let delimiter = ';';
  let buffer: string[] = [];
  const flush = () => {
    const chunk = buffer.join('\n').trim();
    if (chunk.length > 0 && !/^(--[^\n]*\s*)*$/.test(chunk)) chunks.push(chunk);
    buffer = [];
  };

  for (const line of text.split('\n')) {
    const directive = /^\s*DELIMITER\s+(\S+)\s*$/i.exec(line);
    if (directive) {
      flush();
      delimiter = directive[1];
      continue;
    }
    if (delimiter !== ';' && line.trimEnd().endsWith(delimiter)) {
      buffer.push(line.trimEnd().slice(0, -delimiter.length));
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();
  return chunks;
}
