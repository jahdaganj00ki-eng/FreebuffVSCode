// `markdown.ts` — dependency-free Markdown subset renderer.
//
// Security: the input is fully HTML-escaped BEFORE any formatting is
// applied, so the output can be safely assigned to innerHTML. The
// supported subset covers what a chat needs in Phase 4: fenced code
// blocks, inline code, headings, bold/italic, and lists. No raw HTML
// ever passes through. Full CommonMark is out of scope and marked as
// such in the inventory.

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineFormatting(input: string): string {
  let out = input;
  out = out.replace(/`([^`\n]+)`/g, (_match, code: string) => `<code>${code}</code>`);
  out = out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  return out;
}

export function renderMarkdown(input: string): string {
  const escaped = escapeHtml(input);
  const lines = escaped.split('\n');
  const out: string[] = [];
  let inCode = false;
  let inList = false;

  const closeList = (): void => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';

    const fence = line.match(/^```([\w-]*)\s*$/);
    if (fence) {
      closeList();
      if (inCode) {
        out.push('</code></pre>');
        inCode = false;
      } else {
        const lang = fence[1] ?? '';
        out.push(`<pre class="codeblock"><code${lang ? ` data-lang="${lang}"` : ''}>`);
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      out.push(line);
      continue;
    }

    if (line.trim() === '') {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level}>${inlineFormatting(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    const listItem = line.match(/^\s*[-*+]\s+(.*)$/);
    if (listItem) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineFormatting(listItem[1] ?? '')}</li>`);
      continue;
    }

    const orderedItem = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedItem) {
      closeList();
      out.push(`<ol><li>${inlineFormatting(orderedItem[1] ?? '')}</li></ol>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineFormatting(line)}</p>`);
  }

  closeList();
  if (inCode) {
    out.push('</code></pre>');
  }
  return out.join('\n');
}
