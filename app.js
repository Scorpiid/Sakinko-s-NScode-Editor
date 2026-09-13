/* ================================================================
   NationStates BBCode Editor – app.js
   ================================================================ */

'use strict';

/* ── Utility helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

/* ── DOM refs ─────────────────────────────────────────────────── */
const editor       = $('editor');
const preview      = $('preview');
const charCount    = $('char-count');
const wordCount    = $('word-count');
const lineCount    = $('line-count');
const statusMsg    = $('status-msg');
const toast        = $('toast');
const modalOverlay = $('modal-overlay');
const modalTitle   = $('modal-title');
const modalBody    = $('modal-body');
const modalOk      = $('modal-ok');
const modalCancel  = $('modal-cancel');
const modalClose   = $('modal-close');
const themeToggle  = $('theme-toggle');
const syncScroll   = $('sync-scroll');
const fileInput    = $('file-input');

/* ================================================================
   1. BBCode → HTML PARSER
   ================================================================ */

/**
 * Convert a BBCode string to safe HTML for the preview panel.
 * Handles all NationStates-specific tags from the dispatch guide.
 */
function bbcodeToHtml(raw) {
  // Escape raw HTML entities first so user input can't inject markup
  let s = raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  /* ── self-closing / simple replacement ─────────────────────── */
  s = s.replace(/\[hr\]/gi, '<hr>');

  /* ── preformatted ───────────────────────────────────────────── */
  // Protect [pre] content from further parsing
  const preBlocks = [];
  s = s.replace(/\[pre\]([\s\S]*?)\[\/pre\]/gi, (_, inner) => {
    const idx = preBlocks.length;
    preBlocks.push(`<pre>${inner}</pre>`);
    return `\x00PRE${idx}\x00`;
  });

  /* ── inline formatting ──────────────────────────────────────── */
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi,           '<strong>$1</strong>');
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi,           '<em>$1</em>');
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi,           '<u>$1</u>');
  s = s.replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, '<s>$1</s>');
  s = s.replace(/\[sup\]([\s\S]*?)\[\/sup\]/gi,       '<sup>$1</sup>');
  s = s.replace(/\[sub\]([\s\S]*?)\[\/sub\]/gi,       '<sub>$1</sub>');

  /* ── size ───────────────────────────────────────────────────── */
  s = s.replace(/\[size=(\d+)\]([\s\S]*?)\[\/size\]/gi, (_, pct, inner) => {
    const em = (parseInt(pct, 10) / 100).toFixed(2);
    return `<span style="font-size:${em}em">${inner}</span>`;
  });

  /* ── font ───────────────────────────────────────────────────── */
  s = s.replace(/\[font=([^\]]+)\]([\s\S]*?)\[\/font\]/gi, (_, font, inner) =>
    `<span style="font-family:${sanitizeAttr(font)}">${inner}</span>`
  );

  /* ── colour ─────────────────────────────────────────────────── */
  s = s.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, (_, col, inner) =>
    `<span style="color:${sanitizeAttr(col)}">${inner}</span>`
  );

  /* ── background (inline highlight) ─────────────────────────── */
  s = s.replace(/\[background=([^\]]+)\]([\s\S]*?)\[\/background\]/gi, (_, col, inner) =>
    `<span style="background-color:${sanitizeAttr(col)}">${inner}</span>`
  );

  /* ── background-block ───────────────────────────────────────── */
  s = s.replace(/\[background-block=([^\]]+)\]([\s\S]*?)\[\/background-block\]/gi, (_, col, inner) =>
    `<span class="ns-bg-block" style="background-color:${sanitizeAttr(col)}">${inner}</span>`
  );

  /* ── alignment ──────────────────────────────────────────────── */
  s = s.replace(/\[align=(left|right|center|justify)\]([\s\S]*?)\[\/align\]/gi, (_, dir, inner) =>
    `<div class="ns-align-${dir}">${inner}</div>`
  );

  /* ── float ──────────────────────────────────────────────────── */
  s = s.replace(/\[floatleft\]([\s\S]*?)\[\/floatleft\]/gi,
    '<div class="ns-floatleft">$1</div><div class="ns-clearfix"></div>');
  s = s.replace(/\[floatright\]([\s\S]*?)\[\/floatright\]/gi,
    '<div class="ns-floatright">$1</div><div class="ns-clearfix"></div>');

  /* ── tab / indent ───────────────────────────────────────────── */
  s = s.replace(/\[tab=(\d+)\]([\s\S]*?)\[\/tab\]/gi, (_, px, inner) =>
    `<span class="ns-tab" style="padding-left:${parseInt(px,10)}px">${inner}</span>`
  );
  // [tab] with no argument = 30px default
  s = s.replace(/\[tab\]([\s\S]*?)\[\/tab\]/gi,
    '<span class="ns-tab" style="padding-left:30px">$1</span>');

  /* ── anchor ─────────────────────────────────────────────────── */
  s = s.replace(/\[anchor=([^\]]+)\]([\s\S]*?)\[\/anchor\]/gi, (_, name, inner) =>
    `<span id="${sanitizeAttr(name)}" class="ns-anchor">${inner}</span>`
  );
  // self-closing anchor
  s = s.replace(/\[anchor=([^\]]+)\]/gi, (_, name) =>
    `<span id="${sanitizeAttr(name)}" class="ns-anchor"></span>`
  );

  /* ── URL ────────────────────────────────────────────────────── */
  // [url=href]label[/url]
  s = s.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) =>
    `<a href="${sanitizeUrl(href)}" target="_blank" rel="noopener">${label}</a>`
  );
  // [url]bare[/url]
  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) =>
    `<a href="${sanitizeUrl(href)}" target="_blank" rel="noopener">${href}</a>`
  );

  /* ── image ──────────────────────────────────────────────────── */
  s = s.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_, src) =>
    `<img src="${sanitizeUrl(src)}" alt="image" loading="lazy">`
  );

  /* ── NS-specific links ──────────────────────────────────────── */
  // [nation=short]Name[/nation] or [nation]Name[/nation]
  s = s.replace(/\[nation(?:=[^\]]+)?\]([\s\S]*?)\[\/nation\]/gi, (_, name) => {
    const slug = encodeURIComponent(name.trim().toLowerCase().replace(/ /g, '_'));
    return `<a class="ns-nation" href="https://www.nationstates.net/nation=${slug}" target="_blank" rel="noopener">${name}</a>`;
  });
  s = s.replace(/\[region(?:=[^\]]+)?\]([\s\S]*?)\[\/region\]/gi, (_, name) => {
    const slug = encodeURIComponent(name.trim().toLowerCase().replace(/ /g, '_'));
    return `<a class="ns-region" href="https://www.nationstates.net/region=${slug}" target="_blank" rel="noopener">${name}</a>`;
  });
  s = s.replace(/\[proposal(?:=[^\]]+)?\]([\s\S]*?)\[\/proposal\]/gi, (_, id) =>
    `<span class="ns-proposal">📜 WA Proposal: ${id}</span>`
  );
  s = s.replace(/\[resolution(?:=[^\]]+)?\]([\s\S]*?)\[\/resolution\]/gi, (_, id) =>
    `<span class="ns-resolution">⚖️ WA Resolution: ${id}</span>`
  );

  /* ── box (nested boxes are flattened to their inner content) ── */
  s = s.replace(/\[box\]([\s\S]*?)\[\/box\]/gi, (_, inner) => {
    // Strip any [box]…[/box] tags that survived inside this one
    const flat = inner.replace(/\[box\]([\s\S]*?)\[\/box\]/gi, '$1');
    return `<div class="ns-box">${flat}</div>`;
  });

  /* ── sidebar (floated box, right-aligned) ───────────────────── */
  s = s.replace(/\[sidebar\]([\s\S]*?)\[\/sidebar\]/gi,
    '<div class="ns-sidebar">$1</div><div class="ns-clearfix"></div>');

  /* ── quote ──────────────────────────────────────────────────── */
  // [quote=nation;postId] or [quote=name] or [quote]
  s = s.replace(/\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi, (_, attr, inner) => {
    const author = attr.split(';')[0];
    return `<div class="ns-quote"><div class="ns-quote-author">${escHtml(author)} wrote:</div>${inner}</div>`;
  });
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,
    '<div class="ns-quote">$1</div>');

  /* ── spoiler ────────────────────────────────────────────────── */
  s = s.replace(/\[spoiler=([^\]]+)\]([\s\S]*?)\[\/spoiler\]/gi, (_, label, inner) =>
    spoilerHtml(label, inner)
  );
  s = s.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, inner) =>
    spoilerHtml('Spoiler', inner)
  );

  /* ── lists ──────────────────────────────────────────────────── */
  // Ordered with type
  s = s.replace(/\[list=(\w+)\]([\s\S]*?)\[\/list\]/gi, (_, type, inner) => {
    const typeMap = { '1':'1', 'A':'A', 'a':'a', 'I':'I', 'i':'i' };
    const t = typeMap[type] || '1';
    const items = inner.replace(/\[\*\]/g, '<li>');
    return `<ol type="${t}">${items}</ol>`;
  });
  // Unordered
  s = s.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, inner) => {
    const items = inner.replace(/\[\*\]/g, '<li>');
    return `<ul>${items}</ul>`;
  });

  /* ── tables ─────────────────────────────────────────────────── */
  s = s.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, '<table>$1</table>');
  s = s.replace(/\[tr\]([\s\S]*?)\[\/tr\]/gi,       '<tr>$1</tr>');
  s = s.replace(/\[th\]([\s\S]*?)\[\/th\]/gi,       '<th>$1</th>');
  s = s.replace(/\[td\]([\s\S]*?)\[\/td\]/gi,       '<td>$1</td>');

  /* ── Restore pre blocks ─────────────────────────────────────── */
  s = s.replace(/\x00PRE(\d+)\x00/g, (_, i) => preBlocks[parseInt(i, 10)]);

  /* ── newlines → <br> (outside block elements) ───────────────── */
  // Only convert \n that aren't already inside HTML block tags
  s = s.replace(/\n/g, '<br>');

  return s;
}

/* ── helpers used by parser ─────────────────────────────────── */
function sanitizeAttr(val) {
  // Strip quotes and angle brackets to prevent attribute injection
  return val.replace(/["'<>]/g, '');
}

function sanitizeUrl(val) {
  const trimmed = val.trim();
  // Allow http, https, ftp, and relative URLs; block javascript:
  if (/^javascript:/i.test(trimmed)) return '#';
  return trimmed;
}

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function spoilerHtml(label, inner) {
  return `<div class="ns-spoiler"><div class="ns-spoiler-label">${escHtml(label)}</div><div class="ns-spoiler-body">${inner}</div></div>`;
}

/* ================================================================
   2. EDITOR STATE & UNDO/REDO
   ================================================================ */

const history = {
  stack: [''],
  pos: 0,
  maxLen: 200,

  push(val) {
    // Drop any redo states ahead
    if (this.pos < this.stack.length - 1)
      this.stack.splice(this.pos + 1);
    // Deduplicate consecutive identical states
    if (this.stack[this.pos] === val) return;
    this.stack.push(val);
    if (this.stack.length > this.maxLen)
      this.stack.shift();
    this.pos = this.stack.length - 1;
  },
  undo() {
    if (this.pos > 0) { this.pos--; return this.stack[this.pos]; }
    return null;
  },
  redo() {
    if (this.pos < this.stack.length - 1) { this.pos++; return this.stack[this.pos]; }
    return null;
  }
};

let historyTimer = null;
function scheduleHistoryPush() {
  clearTimeout(historyTimer);
  historyTimer = setTimeout(() => history.push(editor.value), 600);
}

function restoreEditorValue(val) {
  const { selectionStart, selectionEnd } = editor;
  editor.value = val;
  editor.setSelectionRange(selectionStart, selectionEnd);
  triggerUpdate();
}

/* ================================================================
   3. REAL-TIME PREVIEW
   ================================================================ */

let renderTimer = null;
function triggerUpdate() {
  updateCounts();
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderPreview, 80);
}

function renderPreview() {
  const html = bbcodeToHtml(editor.value);
  preview.innerHTML = html;
  // Re-attach spoiler click handlers
  preview.querySelectorAll('.ns-spoiler-label').forEach(lbl => {
    lbl.addEventListener('click', () => lbl.closest('.ns-spoiler').classList.toggle('open'));
  });
}

function updateCounts() {
  const raw  = editor.value;
  const chars = raw.length;
  const words = raw.trim() === '' ? 0 : raw.trim().split(/\s+/).length;
  const lines = raw === '' ? 1 : raw.split('\n').length;
  charCount.textContent = `${chars.toLocaleString()} char${chars !== 1 ? 's' : ''}`;
  wordCount.textContent = `${words.toLocaleString()} word${words !== 1 ? 's' : ''}`;
  lineCount.textContent = `${lines.toLocaleString()} line${lines !== 1 ? 's' : ''}`;
}

/* ── Scroll sync ─────────────────────────────────────────────── */
editor.addEventListener('scroll', () => {
  if (!syncScroll.checked) return;
  const ratio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
  preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
});

/* ================================================================
   4. WRAPPING HELPERS
   ================================================================ */

/**
 * Insert open/close tags around the current selection,
 * or place cursor between them if nothing is selected.
 */
function wrapSelection(open, close = '') {
  editor.focus();
  const start = editor.selectionStart;
  const end   = editor.selectionEnd;
  const sel   = editor.value.slice(start, end);
  const before = editor.value.slice(0, start);
  const after  = editor.value.slice(end);

  let newVal, cursorStart, cursorEnd;

  if (sel) {
    newVal = before + open + sel + close + after;
    cursorStart = start + open.length;
    cursorEnd   = cursorStart + sel.length;
  } else {
    newVal = before + open + close + after;
    cursorStart = cursorEnd = start + open.length;
  }

  editor.value = newVal;
  editor.setSelectionRange(cursorStart, cursorEnd);
  history.push(newVal);
  triggerUpdate();
  setStatus('Tag inserted');
}

/** Insert text at cursor without wrapping */
function insertAtCursor(text) {
  editor.focus();
  const start = editor.selectionStart;
  const before = editor.value.slice(0, start);
  const after  = editor.value.slice(editor.selectionEnd);
  editor.value = before + text + after;
  const pos = start + text.length;
  editor.setSelectionRange(pos, pos);
  history.push(editor.value);
  triggerUpdate();
}

/* ================================================================
   5. TOOLBAR WIRE-UP
   ================================================================ */

document.querySelectorAll('.tb-btn[data-tag]').forEach(btn => {
  const tag = btn.dataset.tag;

  if (btn.dataset.selfclose) {
    // Self-closing tag like [hr]
    btn.addEventListener('click', () => insertAtCursor(`[${tag}]`));
    return;
  }

  if (btn.classList.contains('tb-prompt')) {
    // Parameterised tag – open modal to get value
    btn.addEventListener('click', () => {
      openPromptModal(
        btn.dataset.prompt || `Enter ${tag} value`,
        btn.dataset.default || '',
        tag
      );
    });
    return;
  }

  // Simple wrap tag: [tag]...[/tag]
  btn.addEventListener('click', () => wrapSelection(`[${tag}]`, `[/${tag}]`));
});

/* data-wrap / data-wrapclose buttons */
document.querySelectorAll('.tb-btn[data-wrap]').forEach(btn => {
  btn.addEventListener('click', () =>
    wrapSelection(btn.dataset.wrap, btn.dataset.wrapclose || '')
  );
});

/* ── Colour pickers ─────────────────────────────────────────── */
$('pick-color').addEventListener('change', e => {
  wrapSelection(`[color=${e.target.value}]`, '[/color]');
});
$('pick-bg').addEventListener('change', e => {
  wrapSelection(`[background=${e.target.value}]`, '[/background]');
});
$('pick-block').addEventListener('change', e => {
  wrapSelection(`[background-block=${e.target.value}]`, '[/background-block]');
});

/* ── Font dropdown ──────────────────────────────────────────── */
$('font-select').addEventListener('change', function() {
  const font = this.value;
  if (!font) return;
  wrapSelection(`[font=${font}]`, '[/font]');
  // Reset to placeholder so it can be used again immediately
  this.value = '';
});

/* ── Nation / Region smart-wrap ─────────────────────────────── */
// If text is selected → wrap it directly.
// If nothing is selected → ask for a name via modal.
function nsLinkButton(tag, label) {
  return () => {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    if (sel) {
      wrapSelection(`[${tag}]`, `[/${tag}]`);
      setStatus(`Wrapped as [${tag}]`);
    } else {
      openModal(`Insert ${label} link`, `
        <div class="modal-field">
          <label class="modal-label">${label} name</label>
          <input class="modal-input" id="mf-single" type="text" placeholder="e.g. Testlandia">
        </div>`, ({ single }) => {
        if (single && single.trim()) insertAtCursor(`[${tag}]${single.trim()}[/${tag}]`);
      });
    }
  };
}

$('btn-nation').addEventListener('click', nsLinkButton('nation', 'Nation'));
$('btn-region').addEventListener('click', nsLinkButton('region', 'Region'));
$('btn-url').addEventListener('click', () => {
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
  openModal('Insert Link', buildUrlForm(sel), ({ url, label }) => {
    if (!url) return;
    wrapSelection(`[url=${url}]`, '[/url]');
    // If label differs from raw selection, replace the inner text too
    if (label && label !== sel) {
      // Selection cursor is now around the old sel; replace it
      const s = editor.selectionStart;
      const e2 = editor.selectionEnd;
      const v = editor.value;
      editor.value = v.slice(0, s) + label + v.slice(e2);
      editor.setSelectionRange(s, s + label.length);
      history.push(editor.value);
      triggerUpdate();
    }
  });
});

function buildUrlForm(defaultLabel) {
  return `
    <div class="modal-field">
      <label class="modal-label">URL</label>
      <input class="modal-input" id="mf-url" type="url" placeholder="https://www.nationstates.net/…" autocomplete="off">
    </div>
    <div class="modal-field">
      <label class="modal-label">Label (optional)</label>
      <input class="modal-input" id="mf-label" type="text" value="${escHtml(defaultLabel)}" placeholder="Link text…">
    </div>`;
}

/* ── Image button ───────────────────────────────────────────── */
$('btn-img').addEventListener('click', () => {
  openModal('Insert Image', `
    <div class="modal-field">
      <label class="modal-label">Image URL</label>
      <input class="modal-input" id="mf-img-url" type="url" placeholder="https://…/image.png" autocomplete="off">
    </div>`, ({ imgUrl }) => {
    if (imgUrl) wrapSelection('[img]' + imgUrl + '[/img]', '');
  });
});

/* ── Quote button ───────────────────────────────────────────── */
$('btn-quote').addEventListener('click', () => {
  openModal('Insert Quote', `
    <div class="modal-field">
      <label class="modal-label">Author (nation name, optional)</label>
      <input class="modal-input" id="mf-quote-author" type="text" placeholder="Leave blank for anonymous quote">
    </div>`, ({ quoteAuthor }) => {
    const tag = quoteAuthor ? `[quote=${quoteAuthor}]` : '[quote]';
    wrapSelection(tag, '[/quote]');
  });
});

/* ── Spoiler button ─────────────────────────────────────────── */
$('btn-spoiler').addEventListener('click', () => {
  openModal('Insert Spoiler', `
    <div class="modal-field">
      <label class="modal-label">Spoiler label</label>
      <input class="modal-input" id="mf-spoiler-label" type="text" value="Spoiler" placeholder="Spoiler">
    </div>`, ({ spoilerLabel }) => {
    const label = spoilerLabel || 'Spoiler';
    wrapSelection(`[spoiler=${label}]`, '[/spoiler]');
  });
});

/* ── Bullet list ────────────────────────────────────────────── */
$('btn-ul').addEventListener('click', () => {
  const items = getSelectedLines();
  const inner = items.map(l => `[*]${l}`).join('\n');
  insertAtCursor(`[list]\n${inner}\n[/list]`);
});

/* ── Ordered list ───────────────────────────────────────────── */
$('btn-ol').addEventListener('click', () => {
  openModal('Ordered List', `
    <div class="modal-field">
      <label class="modal-label">List type</label>
      <select class="modal-select" id="mf-list-type">
        <option value="1">1, 2, 3…  (numeric)</option>
        <option value="A">A, B, C…  (upper alpha)</option>
        <option value="a">a, b, c…  (lower alpha)</option>
        <option value="I">I, II, III… (upper roman)</option>
        <option value="i">i, ii, iii… (lower roman)</option>
      </select>
    </div>`, ({ listType }) => {
    const items = getSelectedLines();
    const inner = items.map(l => `[*]${l}`).join('\n');
    insertAtCursor(`[list=${listType || '1'}]\n${inner}\n[/list]`);
  });
});

/* ── Table scaffold ─────────────────────────────────────────── */
$('btn-table').addEventListener('click', () => {
  openModal('Insert Table', `
    <div class="modal-field">
      <label class="modal-label">Rows</label>
      <input class="modal-input" id="mf-rows" type="number" value="3" min="1" max="20">
    </div>
    <div class="modal-field">
      <label class="modal-label">Columns</label>
      <input class="modal-input" id="mf-cols" type="number" value="3" min="1" max="20">
    </div>
    <div class="modal-field">
      <label class="modal-label">
        <input type="checkbox" id="mf-header" checked style="margin-right:6px">
        Include header row
      </label>
    </div>`, ({ rows, cols, header }) => {
    let tbl = '[table]\n';
    const r = Math.max(1, Math.min(20, parseInt(rows, 10) || 3));
    const c = Math.max(1, Math.min(20, parseInt(cols, 10) || 3));
    if (header) {
      tbl += '[tr]' + Array.from({length: c}, (_, i) => `[th]Header ${i+1}[/th]`).join('') + '[/tr]\n';
    }
    for (let row = 1; row <= r; row++) {
      tbl += '[tr]' + Array.from({length: c}, (_, i) => `[td]Cell ${row}-${i+1}[/td]`).join('') + '[/tr]\n';
    }
    tbl += '[/table]';
    insertAtCursor(tbl);
  });
});

/** Return selected text split into lines, or [''] if nothing selected */
function getSelectedLines() {
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  if (!sel.trim()) return [''];
  return sel.split('\n');
}

/* ── Undo / Redo / Clear ────────────────────────────────────── */
$('btn-undo').addEventListener('click', () => {
  const val = history.undo();
  if (val !== null) restoreEditorValue(val);
});
$('btn-redo').addEventListener('click', () => {
  const val = history.redo();
  if (val !== null) restoreEditorValue(val);
});
$('btn-clear').addEventListener('click', () => {
  if (editor.value === '') return;
  if (confirm('Clear all content?')) {
    history.push(editor.value);
    editor.value = '';
    triggerUpdate();
    setStatus('Cleared');
  }
});

/* Keyboard undo/redo */
editor.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    const val = history.undo();
    if (val !== null) restoreEditorValue(val);
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    const val = history.redo();
    if (val !== null) restoreEditorValue(val);
  }
  /* Tab key → insert [tab] indent rather than lose focus */
  if (e.key === 'Tab') {
    e.preventDefault();
    wrapSelection('[tab=30]', '[/tab]');
  }
});

/* ================================================================
   6. GENERIC MODAL SYSTEM
   ================================================================ */

let modalCallback = null;

/**
 * Open a modal with arbitrary HTML body content.
 * collector: function that reads #mf-* inputs and returns a data object.
 * onOk(data): called on confirmation.
 */
function openModal(title, bodyHtml, onOk) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalCallback = onOk;
  modalOverlay.classList.remove('hidden');
  // Focus first input
  const first = modalBody.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
}

/** Convenience for single-value prompt modals (used by tb-prompt buttons) */
function openPromptModal(label, defaultVal, tag) {
  openModal(
    `Insert [${tag}]`,
    `<div class="modal-field">
       <label class="modal-label">${escHtml(label)}</label>
       <input class="modal-input" id="mf-single" type="text" value="${escHtml(defaultVal)}" placeholder="${escHtml(defaultVal)}">
     </div>`,
    ({ single }) => {
      if (tag === 'anchor') {
        // anchor wraps content or inserts self-closing
        if (editor.selectionStart === editor.selectionEnd) {
          insertAtCursor(`[anchor=${single}]`);
        } else {
          wrapSelection(`[anchor=${single}]`, '[/anchor]');
        }
      } else {
        wrapSelection(`[${tag}=${single}]`, `[/${tag}]`);
      }
    }
  );
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modalCallback = null;
  editor.focus();
}

function confirmModal() {
  if (!modalCallback) { closeModal(); return; }
  // Harvest all #mf-* fields
  const data = {};
  modalBody.querySelectorAll('[id^="mf-"]').forEach(el => {
    const key = el.id.replace('mf-', '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    data[key] = el.type === 'checkbox' ? el.checked : el.value;
  });
  modalCallback(data);
  closeModal();
}

modalOk.addEventListener('click',     confirmModal);
modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click',  closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

/* Submit modal on Enter key in inputs */
modalBody.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
    e.preventDefault();
    confirmModal();
  }
});

/* ================================================================
   7. TOP-BAR ACTIONS
   ================================================================ */

/* ── New ────────────────────────────────────────────────────── */
$('btn-new').addEventListener('click', () => {
  if (editor.value.trim() && !confirm('Discard current content and start a new document?')) return;
  history.push(editor.value);
  editor.value = '';
  triggerUpdate();
  setStatus('New document');
});

/* ── Copy BBCode ─────────────────────────────────────────────── */
$('btn-copy').addEventListener('click', async () => {
  if (!editor.value) { showToast('Nothing to copy'); return; }
  try {
    await navigator.clipboard.writeText(editor.value);
    showToast('BBCode copied to clipboard!');
    setStatus('Copied');
  } catch {
    showToast('Copy failed – try Ctrl+A then Ctrl+C');
  }
});

/* ── Copy preview HTML ──────────────────────────────────────── */
$('btn-copy-preview').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(preview.innerHTML);
    showToast('HTML copied!');
  } catch {
    showToast('Copy failed');
  }
});

/* ── Import ─────────────────────────────────────────────────── */
$('btn-import').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    history.push(editor.value);
    editor.value = ev.target.result;
    triggerUpdate();
    setStatus(`Imported: ${file.name}`);
    showToast(`Imported "${file.name}"`);
  };
  reader.readAsText(file);
  fileInput.value = '';
});

/* ── Export ─────────────────────────────────────────────────── */
$('btn-export').addEventListener('click', () => {
  const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'dispatch.txt';
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Exported');
  showToast('Exported as dispatch.txt');
});

/* ================================================================
   8. THEME TOGGLE
   ================================================================ */
themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('light', themeToggle.checked);
  const label = themeToggle.closest('.toggle-wrap').querySelector('.toggle-label');
  label.textContent = themeToggle.checked ? 'Light' : 'Dark';
  localStorage.setItem('ns-bbcode-theme', themeToggle.checked ? 'light' : 'dark');
});

/* ================================================================
   9. DRAG-TO-RESIZE PANES
   ================================================================ */
const resizer    = $('resizer');
const paneEditor = document.querySelector('.pane-editor');
const panePreview = document.querySelector('.pane-preview');
const workspace  = document.querySelector('.workspace');

let isResizing = false;

resizer.addEventListener('mousedown', e => {
  isResizing = true;
  resizer.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});

document.addEventListener('mousemove', e => {
  if (!isResizing) return;
  const rect  = workspace.getBoundingClientRect();
  const total = rect.width - resizer.offsetWidth;
  let left = e.clientX - rect.left;
  left = Math.max(200, Math.min(total - 200, left));
  paneEditor.style.flex  = 'none';
  paneEditor.style.width = left + 'px';
  panePreview.style.flex  = '1';
  panePreview.style.width = '';
});

document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  resizer.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

/* ================================================================
   10. STATUS / TOAST HELPERS
   ================================================================ */
let statusTimer = null;
function setStatus(msg) {
  statusMsg.textContent = msg;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { statusMsg.textContent = 'Ready'; }, 3000);
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2500);
}

/* ================================================================
   11. EDITOR INPUT HANDLER
   ================================================================ */
editor.addEventListener('input', () => {
  triggerUpdate();
  scheduleHistoryPush();
});

/* ================================================================
   12. KEYBOARD SHORTCUTS (global)
   ================================================================ */
document.addEventListener('keydown', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  // Don't intercept when modal is open
  if (!modalOverlay.classList.contains('hidden')) return;

  const shortcuts = {
    's': () => { $('btn-export').click(); },
    'o': () => { $('btn-import').click(); },
    'd': () => { $('btn-copy').click(); },
    'k': () => { $('btn-url').click(); },
  };
  if (shortcuts[e.key]) {
    e.preventDefault();
    shortcuts[e.key]();
  }

  // Inline formatting shortcuts (only when editor has focus)
  if (document.activeElement !== editor) return;
  const fmtShortcuts = {
    'b': 'b',
    'i': 'i',
    'u': 'u',
  };
  if (fmtShortcuts[e.key]) {
    e.preventDefault();
    wrapSelection(`[${fmtShortcuts[e.key]}]`, `[/${fmtShortcuts[e.key]}]`);
  }
});

/* ================================================================
   13. PERSIST CONTENT IN localStorage
   ================================================================ */
const STORAGE_KEY = 'ns-bbcode-content-v4';

function saveToStorage() {
  try { localStorage.setItem(STORAGE_KEY, editor.value); } catch (_) {}
}

function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      editor.value = saved;
      history.push(saved);
    }
  } catch (_) {}
}

editor.addEventListener('input', saveToStorage);

/* ================================================================
   14. INITIALISATION
   ================================================================ */
(function init() {
  // Restore theme
  const savedTheme = localStorage.getItem('ns-bbcode-theme');
  if (savedTheme === 'light') {
    document.body.classList.add('light');
    themeToggle.checked = true;
    themeToggle.closest('.toggle-wrap').querySelector('.toggle-label').textContent = 'Light';
  }

  // Restore content
  loadFromStorage();

  // Seed with example dispatch if storage is empty
  if (!editor.value) {
    editor.value = [
      '[align=center][size=200][b]BBCode Editor[/b][/size][/align]',
      '[align=center][color=#9aa5c0]A quick look at what you can do[/color][/align]',
      '[hr]',
      '',
      '[size=150][b]Text formatting[/b][/size]',
      '',
      'Mix and match as needed: [b]bold[/b], [i]italic[/i], [u]underlined[/u], [strike]strikethrough[/strike].',
      'Go smaller with subscripts — H[sub]2[/sub]O — or higher with superscripts — x[sup]2[/sup].',
      '',
      '[size=150][b]Colour & font[/b][/size]',
      '',
      '[color=#e74c3c]This is red.[/color]  [color=#2ecc71]This is green.[/color]  [color=#3498db]This is blue.[/color]',
      '[background=#f39c12][color=#1a2035]Highlighted with a background colour.[/color][/background]',
      '',
      '[font=Georgia][i]This sentence is set in Georgia — a classic serif.[/i][/font]',
      '[font=Courier New]This one uses Courier New — good for code or transmissions.[/font]',
      '',
      '[size=150][b]Size & alignment[/b][/size]',
      '',
      '[size=175]Larger text.[/size]  [size=75]Smaller text.[/size]',
      '',
      '[align=left]Left-aligned paragraph.[/align]',
      '[align=center]Centred paragraph.[/align]',
      '[align=right]Right-aligned paragraph.[/align]',
      '',
      '[size=150][b]Boxes & callouts[/b][/size]',
      '',
      '[box]',
      'This is a [b]box[/b]. Good for notices, tips, or anything you want to set apart from the body text.',
      '[/box]',
      '',
      '[sidebar]',
      '[b]Sidebar[/b][br]Floats to the right, like a pull-quote or a quick-info panel. The main body text wraps around it naturally.',
      '[/sidebar]',
      'A sidebar sits to the right and lets body text flow around it.',
      'It behaves like a floating box — useful for asides, stats, or short notes',
      'that complement the main content without breaking its flow.',
      '',
      '[quote=Someone]',
      'A quote block attributes the text to its author and visually separates it from your writing.',
      '[/quote]',
      '',
      '[spoiler=Reveal this section]',
      'The content inside a spoiler is hidden until the reader clicks the label.',
      'Nest any other tags inside — [b]bold[/b], [color=#3498db]colour[/color], tables, lists, anything.',
      '[/spoiler]',
      '',
      '[size=150][b]Lists[/b][/size]',
      '',
      '[list]',
      '[*]First bullet item',
      '[*][b]Bold[/b] second item',
      '[*][i]Italic[/i] third item',
      '[/list]',
      '',
      '[list=1]',
      '[*]Step one',
      '[*]Step two',
      '[*]Step [color=#2ecc71]three — done[/color]',
      '[/list]',
      '',
      '[size=150][b]Tables[/b][/size]',
      '',
      '[table]',
      '[tr][th]Name[/th][th]Type[/th][th]Status[/th][/tr]',
      '[tr][td]Alpha[/td][td]Primary[/td][td][color=#2ecc71]Active[/color][/td][/tr]',
      '[tr][td]Beta[/td][td]Secondary[/td][td][color=#f39c12]Pending[/color][/td][/tr]',
      '[tr][td]Gamma[/td][td]Reserve[/td][td][color=#e74c3c]Offline[/color][/td][/tr]',
      '[/table]',
      '',
      '[size=150][b]Links & media[/b][/size]',
      '',
      'A plain link: [url=https://www.example.com]visit example.com[/url]',
      'An image: [img]https://via.placeholder.com/300x80/1a2035/c9a84c?text=Image+preview[/img]',
      '',
      '[hr]',
      '[align=center][color=#5a6a8a][size=85]Delete all of this and start writing your own content.[/size][/color][/align]',
    ].join('\n');
    history.push(editor.value);
  }

  // Initial render
  renderPreview();
  updateCounts();
  setStatus('Ready');
})();
