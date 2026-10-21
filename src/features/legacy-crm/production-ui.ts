/** Compose the service-production module into the legacy script before boot.
 * Existing functions are replaced in place so there is one implementation per name.
 */
function functionEnd(source: string, start: number, label: string): number {
  const firstLineEnd = source.indexOf("\n", start);
  const firstLine = source.slice(start, firstLineEnd < 0 ? source.length : firstLineEnd);

  // A few legacy helpers are deliberately kept on one line. Looking only for
  // a later `\n}` would consume the next function together with that helper.
  if (firstLine.trimEnd().endsWith("}")) return firstLineEnd < 0 ? source.length : firstLineEnd;

  const end = source.indexOf("\n}", start);
  if (end < 0) throw new Error(`Unclosed ${label}`);
  return end + 2;
}

export function composeProductionHtml(html: string, module: string): string {
  const functions = [...module.matchAll(/^(?:async )?function (\w+)\([^\n]*\) \{/gm)];
  const additions: string[] = [];
  for (const match of functions) {
    const start = match.index!;
    const end = functionEnd(module, start, `production function: ${match[1]}`);
    const source = module.slice(start, end);
    const pattern = new RegExp(`^(?:async )?function ${match[1]}\\(`, 'm');
    const existing = pattern.exec(html);
    if (!existing) additions.push(source);
    else {
      const last = functionEnd(html, existing.index, `legacy function: ${match[1]}`);
      html = html.slice(0, existing.index) + source + html.slice(last);
    }
  }
  const boot = '// ---------- BOOT ----------';
  if (!html.includes(boot)) throw new Error('Legacy boot anchor missing');
  return html.replace(boot, () => additions.join('\n\n') + '\n\n' + boot);
}
