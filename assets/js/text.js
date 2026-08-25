/* Shared text helpers. The JSON is content, not a template language: `**bold**`
   is the only markup either view interprets. */

/** @returns {DocumentFragment} the text with `**bold**` turned into <strong>. */
export function inline(text) {
  const frag = document.createDocumentFragment();
  for (const part of String(text).split(/(\*\*[^*]+\*\*)/g)) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = part.slice(2, -2);
      frag.appendChild(strong);
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  }
  return frag;
}
