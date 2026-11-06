// Formatierter Text (Tonszenen): gespeichert als HTML, angezeigt nur mit einer festen Auswahl harmloser
// Elemente und Stile (fett, kursiv, unterstrichen, durchgestrichen, Überschrift, Listen, Absätze, Textfarbe).
// Alles andere fällt weg – Skripte, Links, Bilder, Ereignis-Attribute usw. kommen nie in die Seite.

const ALLOWED_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'H3', 'H4', 'SPAN', 'FONT', 'BIG', 'SMALL']);
const ALLOWED_STYLES = new Set(['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size']);
const SAFE_VALUE = /^[#(),.%\w\s-]*$/;

function cleanStyle(style: string): string {
  return style
    .split(';')
    .map((part) => part.trim())
    .filter((part) => {
      const [name, ...rest] = part.split(':');
      const value = rest.join(':').trim();
      return name && ALLOWED_STYLES.has(name.trim().toLowerCase()) && SAFE_VALUE.test(value) && !/url|expression/i.test(value);
    })
    .join('; ');
}

function cleanNode(node: Node, doc: Document): Node[] {
  if (node.nodeType === Node.TEXT_NODE) return [doc.createTextNode(node.textContent ?? '')];
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const children = Array.from(el.childNodes).flatMap((child) => cleanNode(child, doc));
  if (!ALLOWED_TAGS.has(el.tagName)) {
    // unbekannte Elemente: Inhalt behalten (außer bei Skripten und Stilen)
    return el.tagName === 'SCRIPT' || el.tagName === 'STYLE' ? [] : children;
  }
  const out = doc.createElement(el.tagName.toLowerCase());
  const style = el.getAttribute('style');
  if (style) {
    const cleaned = cleanStyle(style);
    if (cleaned) out.setAttribute('style', cleaned);
  }
  const color = el.tagName === 'FONT' ? el.getAttribute('color') : null;
  if (color && SAFE_VALUE.test(color)) out.setAttribute('color', color);
  for (const child of children) out.appendChild(child);
  return [out];
}

/** HTML auf die erlaubten Elemente und Stile reduzieren */
export function sanitizeRichText(html: string | undefined): string {
  if (!html) return '';
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const target = document.implementation.createHTMLDocument('');
  const container = target.createElement('div');
  for (const child of Array.from(parsed.body.childNodes)) for (const node of cleanNode(child, target)) container.appendChild(node);
  return container.innerHTML;
}

/** Hat der formatierte Text sichtbaren Inhalt? */
export function hasRichText(html: string | undefined): boolean {
  return !!html && new DOMParser().parseFromString(html, 'text/html').body.textContent?.trim() !== '';
}
