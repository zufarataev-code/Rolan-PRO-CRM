/** Compose the service-production module into the legacy script before boot.
 * Existing functions are replaced in place so there is one implementation per name.
 */
export function composeProductionHtml(html: string, module: string): string {
  const functions = [...module.matchAll(/^(?:async )?function (\w+)\([^\n]*\) \{/gm)];
  const additions: string[] = [];
  for (const match of functions) {
    const start = match.index!;
    const end = module.indexOf('\n}', start);
    if (end < 0) throw new Error(`Unclosed production function: ${match[1]}`);
    const source = module.slice(start, end + 2);
    const pattern = new RegExp(`^(?:async )?function ${match[1]}\\(`, 'm');
    const existing = pattern.exec(html);
    if (!existing) additions.push(source);
    else {
      const last = html.indexOf('\n}', existing.index);
      if (last < 0) throw new Error(`Unclosed legacy function: ${match[1]}`);
      html = html.slice(0, existing.index) + source + html.slice(last + 2);
    }
  }
  const boot = '// ---------- BOOT ----------';
  if (!html.includes(boot)) throw new Error('Legacy boot anchor missing');
  return html.replace(boot, () => additions.join('\n\n') + '\n\n' + boot);
}
