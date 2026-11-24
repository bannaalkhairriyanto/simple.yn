/* Small safe Markdown renderer: no HTML support and no third-party library. */
(function () {
  'use strict';
  const U = window.SY;
  if (!U) return;


  function safeLink(label, destination) {
    try {
      const url = new URL(destination);
      if (!['https:', 'mailto:'].includes(url.protocol)) return null;
      const link = U.el('a');
      link.href = url.href;
      link.rel = 'noopener noreferrer';
      if (url.protocol === 'https:') link.target = '_blank';
      renderInline(link, label);
      return link;
    } catch (error) {
      return null;
    }
  }

  function renderInline(parent, text) {
    /* Fresh regex per call: nested emphasis must not share a global lastIndex. */
    const tokenPattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^\s)]+\))/g;
    let lastIndex = 0;
    let match;
    while ((match = tokenPattern.exec(text)) !== null) {
      if (match.index > lastIndex) parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
      const token = match[0];
      if (token.startsWith('**')) {
        const strong = U.el('strong');
        renderInline(strong, token.slice(2, -2));
        parent.append(strong);
      } else if (token.startsWith('*')) {
        const emphasis = U.el('em');
        renderInline(emphasis, token.slice(1, -1));
        parent.append(emphasis);
      } else if (token.startsWith('`')) {
        parent.append(U.el('code', '', token.slice(1, -1)));
      } else {
        const parts = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(token);
        const link = parts ? safeLink(parts[1], parts[2]) : null;
        parent.append(link || document.createTextNode(token));
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < text.length) parent.append(document.createTextNode(text.slice(lastIndex)));
  }

  function render(target, markdown) {
    const fragment = document.createDocumentFragment();
    const lines = String(markdown).split(/\r?\n/);
    let paragraph = [];
    let list = null;

    function flushParagraph() {
      if (paragraph.length) {
        const node = U.el('p');
        renderInline(node, paragraph.join(' '));
        fragment.append(node);
        paragraph = [];
      }
    }

    function flushList() {
      if (list) {
        const node = U.el(list.ordered ? 'ol' : 'ul');
        if (list.ordered && list.start !== 1) node.setAttribute('start', list.start);
        list.items.forEach(function (text) {
          const item = U.el('li');
          renderInline(item, text);
          node.append(item);
        });
        fragment.append(node);
        list = null;
      }
    }

    lines.forEach(function (line) {
      const trimmed = line.trim();
      const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
      const bullet = /^[-*+]\s+(.+)$/.exec(trimmed);
      const numbered = /^(\d{1,9})[.)]\s+(.+)$/.exec(trimmed);
      if (!trimmed || heading) {
        flushParagraph();
        flushList();
      }
      if (!trimmed) return;
      if (heading) {
        const node = U.el('h' + heading[1].length);
        renderInline(node, heading[2]);
        fragment.append(node);
        return;
      }
      if (bullet || numbered) {
        const ordered = Boolean(numbered);
        if (!list || list.ordered !== ordered) {
          flushParagraph();
          flushList();
          list = { ordered: ordered, start: ordered ? Number(numbered[1]) : 1, items: [] };
        }
        list.items.push(ordered ? numbered[2] : bullet[1]);
        return;
      }
      flushList();
      paragraph.push(trimmed);
    });
    flushParagraph();
    flushList();
    target.replaceChildren(fragment);
  }

  window.SYMarkdown = Object.freeze({ render: render });
}());
