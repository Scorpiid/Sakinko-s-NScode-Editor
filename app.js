/* ================================================================
   Sakinko's BBCode Editor – app.js
   ================================================================ */

'use strict';

/* ── Utility helpers ─────────────────────────────────────────── */
const $ = id => document.getElementById(id);

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
   0. MODE STATE
   ================================================================ */

let currentMode = 'dispatch'; // 'dispatch' | 'forum'

function setMode(mode) {
  currentMode = mode;
  document.body.classList.toggle('mode-forum',    mode === 'forum');
  document.body.classList.toggle('mode-dispatch', mode === 'dispatch');

  document.querySelectorAll('.mode-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.mode === mode)
  );

  const hint  = $('mode-hint');
  const badge = $('editor-mode-badge');
  if (mode === 'forum') {
    hint.textContent  = 'Forum mode — phpBB tags only';
    badge.textContent = 'Forum';
  } else {
    hint.textContent  = 'Dispatch mode — all NS tags available';
    badge.textContent = 'Dispatch';
  }

  localStorage.setItem('ns-bbcode-mode', mode);
  triggerUpdate();
  setStatus(`Switched to ${mode} mode`);
}

document.querySelectorAll('.mode-tab').forEach(tab => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

/* ================================================================
   1. BBCode → HTML PARSERS
   ================================================================ */

/** Route to the correct parser based on current mode. */
function bbcodeToHtml(raw) {
  return currentMode === 'forum' ? bbcodeForumToHtml(raw) : bbcodeDispatchToHtml(raw);
}

function escapeInput(raw) {
  return raw.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── Tags present in BOTH modes ─────────────────────────────── */
function applySharedTags(s) {
  s = s.replace(/\[hr\]/gi, '<hr>');
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi,           '<strong>$1</strong>');
  s = s.replace(/\[i\]([\s\S]*?)\[\/i\]/gi,           '<em>$1</em>');
  s = s.replace(/\[u\]([\s\S]*?)\[\/u\]/gi,           '<u>$1</u>');
  s = s.replace(/\[strike\]([\s\S]*?)\[\/strike\]/gi, '<s>$1</s>');
  s = s.replace(/\[sup\]([\s\S]*?)\[\/sup\]/gi,       '<sup>$1</sup>');
  s = s.replace(/\[sub\]([\s\S]*?)\[\/sub\]/gi,       '<sub>$1</sub>');
  s = s.replace(/\[color=([^\]]+)\]([\s\S]*?)\[\/color\]/gi, (_, c, inner) =>
    `<span style="color:${sanitizeAttr(c)}">${inner}</span>`);
  s = s.replace(/\[background=([^\]]+)\]([\s\S]*?)\[\/background\]/gi, (_, c, inner) =>
    `<span style="background-color:${sanitizeAttr(c)}">${inner}</span>`);
  s = s.replace(/\[align=(left|right|center|justify)\]([\s\S]*?)\[\/align\]/gi, (_, d, inner) =>
    `<div class="ns-align-${d}">${inner}</div>`);
  s = s.replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_, href, label) =>
    `<a href="${sanitizeUrl(href)}" target="_blank" rel="noopener">${label}</a>`);
  s = s.replace(/\[url\]([\s\S]*?)\[\/url\]/gi, (_, href) =>
    `<a href="${sanitizeUrl(href)}" target="_blank" rel="noopener">${href}</a>`);
  s = s.replace(/\[img\]([\s\S]*?)\[\/img\]/gi, (_, src) =>
    `<img src="${sanitizeUrl(src)}" alt="image" loading="lazy">`);
  // Lists
  s = s.replace(/\[list=(\w+)\]([\s\S]*?)\[\/list\]/gi, (_, type, inner) =>
    `<ol type="${{1:'1',A:'A',a:'a',I:'I',i:'i'}[type]||'1'}">${inner.replace(/\[\*\]/g,'<li>')}</ol>`);
  s = s.replace(/\[list\]([\s\S]*?)\[\/list\]/gi, (_, inner) =>
    `<ul>${inner.replace(/\[\*\]/g,'<li>')}</ul>`);
  // Tables
  s = s.replace(/\[table\]([\s\S]*?)\[\/table\]/gi, '<table>$1</table>');
  s = s.replace(/\[tr\]([\s\S]*?)\[\/tr\]/gi,       '<tr>$1</tr>');
  s = s.replace(/\[th\]([\s\S]*?)\[\/th\]/gi,       '<th>$1</th>');
  s = s.replace(/\[td\]([\s\S]*?)\[\/td\]/gi,       '<td>$1</td>');
  // Quotes (shared structure; syntax differs per mode, handled before this call)
  return s;
}

/* ================================================================
   1a. DISPATCH PARSER  — all tags
   ================================================================ */
function bbcodeDispatchToHtml(raw) {
  let s = escapeInput(raw);

  // Protect [pre] blocks
  const preBlocks = [];
  s = s.replace(/\[pre\]([\s\S]*?)\[\/pre\]/gi, (_, inner) => {
    const idx = preBlocks.length; preBlocks.push(`<pre>${inner}</pre>`);
    return `\x00PRE${idx}\x00`;
  });

  // Dispatch-only tags before shared (size, font, background-block, float, tab, NS links)
  s = s.replace(/\[size=(\d+)\]([\s\S]*?)\[\/size\]/gi, (_, pct, inner) =>
    `<span style="font-size:${(parseInt(pct,10)/100).toFixed(2)}em">${inner}</span>`);
  s = s.replace(/\[font=([^\]]+)\]([\s\S]*?)\[\/font\]/gi, (_, f, inner) =>
    `<span style="font-family:${sanitizeAttr(f)}">${inner}</span>`);
  s = s.replace(/\[background-block=([^\]]+)\]([\s\S]*?)\[\/background-block\]/gi, (_, c, inner) =>
    `<span class="ns-bg-block" style="background-color:${sanitizeAttr(c)}">${inner}</span>`);
  s = s.replace(/\[floatleft\]([\s\S]*?)\[\/floatleft\]/gi,
    '<div class="ns-floatleft">$1</div><div class="ns-clearfix"></div>');
  s = s.replace(/\[floatright\]([\s\S]*?)\[\/floatright\]/gi,
    '<div class="ns-floatright">$1</div><div class="ns-clearfix"></div>');
  s = s.replace(/\[tab=(\d+)\]([\s\S]*?)\[\/tab\]/gi, (_, px, inner) =>
    `<span class="ns-tab" style="padding-left:${parseInt(px,10)}px">${inner}</span>`);
  s = s.replace(/\[tab\]([\s\S]*?)\[\/tab\]/gi,
    '<span class="ns-tab" style="padding-left:30px">$1</span>');

  // Nation / Region
  s = s.replace(/\[nation(?:=[^\]]+)?\]([\s\S]*?)\[\/nation\]/gi, (_, name) => {
    const slug = encodeURIComponent(name.trim().toLowerCase().replace(/ /g,'_'));
    return `<a class="ns-nation" href="https://www.nationstates.net/nation=${slug}" target="_blank" rel="noopener">${name}</a>`;
  });
  s = s.replace(/\[region=([^\]]+)\]([\s\S]*?)\[\/region\]/gi, (_, rname, inner) => {
    const slug = encodeURIComponent(rname.trim().toLowerCase().replace(/ /g,'_'));
    return `<a class="ns-region" href="https://www.nationstates.net/region=${slug}" target="_blank" rel="noopener">${inner}</a>`;
  });
  s = s.replace(/\[region\]([\s\S]*?)\[\/region\]/gi, (_, name) => {
    const slug = encodeURIComponent(name.trim().toLowerCase().replace(/ /g,'_'));
    return `<a class="ns-region" href="https://www.nationstates.net/region=${slug}" target="_blank" rel="noopener">${name}</a>`;
  });

  // Region-tag (renders as a styled region banner)
  s = s.replace(/\[region-tag=([^\]]+)\]([\s\S]*?)\[\/region-tag\]/gi, (_, rname, inner) =>
    `<span class="ns-region-tag" title="Region: ${escHtml(rname)}">${inner}</span>`);
  s = s.replace(/\[region-tag\]([\s\S]*?)\[\/region-tag\]/gi, (_, inner) =>
    `<span class="ns-region-tag">${inner}</span>`);

  // Proposal
  s = s.replace(/\[proposal=([^\]]+)\]([\s\S]*?)\[\/proposal\]/gi, (_, id, inner) =>
    `<span class="ns-proposal">📜 ${inner} <em>(Proposal #${escHtml(id)})</em></span>`);
  s = s.replace(/\[proposal\]([\s\S]*?)\[\/proposal\]/gi, (_, inner) =>
    `<span class="ns-proposal">📜 ${inner}</span>`);

  // Box (no nesting)
  s = s.replace(/\[box\]([\s\S]*?)\[\/box\]/gi, (_, inner) =>
    `<div class="ns-box">${inner.replace(/\[box\]([\s\S]*?)\[\/box\]/gi,'$1')}</div>`);

  // Sidebar (floated box)
  s = s.replace(/\[sidebar\]([\s\S]*?)\[\/sidebar\]/gi,
    '<div class="ns-sidebar">$1</div><div class="ns-clearfix"></div>');

  // Shared tags
  s = applySharedTags(s);

  // Quote
  s = s.replace(/\[quote=([^\]]+)\]([\s\S]*?)\[\/quote\]/gi, (_, attr, inner) =>
    `<div class="ns-quote"><div class="ns-quote-author">${escHtml(attr.split(';')[0])} wrote:</div>${inner}</div>`);
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi, '<div class="ns-quote">$1</div>');

  // Spoiler
  s = s.replace(/\[spoiler=([^\]]+)\]([\s\S]*?)\[\/spoiler\]/gi, (_, label, inner) =>
    spoilerHtml(label, inner));
  s = s.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, inner) =>
    spoilerHtml('Spoiler', inner));

  // Restore pre blocks
  s = s.replace(/\x00PRE(\d+)\x00/g, (_, i) => preBlocks[parseInt(i,10)]);
  s = s.replace(/\n/g, '<br>');
  return s;
}

/* ================================================================
   1b. FORUM PARSER — phpBB only; dispatch-only tags stripped
   ================================================================ */
function bbcodeForumToHtml(raw) {
  let s = escapeInput(raw);

  // Strip dispatch-only tags completely (leave inner text where it makes sense)
  // Tags with meaningful inner content — keep the text, drop the tag
  s = s.replace(/\[size=\d+\]([\s\S]*?)\[\/size\]/gi,                          '$1');
  s = s.replace(/\[font=[^\]]+\]([\s\S]*?)\[\/font\]/gi,                        '$1');
  s = s.replace(/\[background-block=[^\]]+\]([\s\S]*?)\[\/background-block\]/gi,'$1');
  s = s.replace(/\[floatleft\]([\s\S]*?)\[\/floatleft\]/gi,                     '$1');
  s = s.replace(/\[floatright\]([\s\S]*?)\[\/floatright\]/gi,                   '$1');
  s = s.replace(/\[tab(?:=\d+)?\]([\s\S]*?)\[\/tab\]/gi,                       '$1');
  s = s.replace(/\[box\]([\s\S]*?)\[\/box\]/gi,                                 '$1');
  s = s.replace(/\[sidebar\]([\s\S]*?)\[\/sidebar\]/gi,                         '$1');
  s = s.replace(/\[nation(?:=[^\]]+)?\]([\s\S]*?)\[\/nation\]/gi,               '$1');
  s = s.replace(/\[region(?:=[^\]]+)?\]([\s\S]*?)\[\/region\]/gi,               '$1');
  s = s.replace(/\[region-tag(?:=[^\]]+)?\]([\s\S]*?)\[\/region-tag\]/gi,       '$1');
  s = s.replace(/\[proposal(?:=[^\]]+)?\]([\s\S]*?)\[\/proposal\]/gi,           '$1');
  s = s.replace(/\[anchor(?:=[^\]]+)?\]([\s\S]*?)\[\/anchor\]/gi,               '$1');
  s = s.replace(/\[anchor=[^\]]+\]/gi,                                           '');

  // Protect [code] blocks
  const codeBlocks = [];
  s = s.replace(/\[code\]([\s\S]*?)\[\/code\]/gi, (_, inner) => {
    const idx = codeBlocks.length; codeBlocks.push(`<code>${inner}</code>`);
    return `\x00CODE${idx}\x00`;
  });

  // Protect [pre] blocks
  const preBlocks = [];
  s = s.replace(/\[pre\]([\s\S]*?)\[\/pre\]/gi, (_, inner) => {
    const idx = preBlocks.length; preBlocks.push(`<pre>${inner}</pre>`);
    return `\x00PRE${idx}\x00`;
  });

  s = applySharedTags(s);

  // [img=WxH] — phpBB size param
  s = s.replace(/\[img=(\d+)[xX×](\d+)\]([\s\S]*?)\[\/img\]/gi, (_, w, h, src) =>
    `<img src="${sanitizeUrl(src)}" width="${w}" height="${h}" alt="image" loading="lazy" style="max-width:100%">`);

  // Quote — phpBB uses [quote="Author"] or [quote=Author]
  s = s.replace(/\[quote="([^"]+)"\]([\s\S]*?)\[\/quote\]/gi, (_, author, inner) =>
    `<div class="ns-quote"><div class="ns-quote-author">${escHtml(author)} wrote:</div>${inner}</div>`);
  s = s.replace(/\[quote=([^\]"]+)\]([\s\S]*?)\[\/quote\]/gi, (_, author, inner) =>
    `<div class="ns-quote"><div class="ns-quote-author">${escHtml(author)} wrote:</div>${inner}</div>`);
  s = s.replace(/\[quote\]([\s\S]*?)\[\/quote\]/gi,
    '<div class="ns-quote">$1</div>');

  // Spoiler — no label in forum
  s = s.replace(/\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi, (_, inner) =>
    spoilerHtml('Spoiler', inner));

  s = s.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[parseInt(i,10)]);
  s = s.replace(/\x00PRE(\d+)\x00/g,  (_, i) => preBlocks[parseInt(i,10)]);
  s = s.replace(/\n/g, '<br>');
  return s;
}

/* ── Parser helpers ──────────────────────────────────────────── */
function sanitizeAttr(val) {
  return val.replace(/["'<>]/g, '');
}
function sanitizeUrl(val) {
  const t = val.trim();
  return /^javascript:/i.test(t) ? '#' : t;
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
    if (this.pos < this.stack.length - 1) this.stack.splice(this.pos + 1);
    if (this.stack[this.pos] === val) return;
    this.stack.push(val);
    if (this.stack.length > this.maxLen) this.stack.shift();
    this.pos = this.stack.length - 1;
  },
  undo() { if (this.pos > 0) { this.pos--; return this.stack[this.pos]; } return null; },
  redo() { if (this.pos < this.stack.length - 1) { this.pos++; return this.stack[this.pos]; } return null; }
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
  preview.innerHTML = bbcodeToHtml(editor.value);
  preview.querySelectorAll('.ns-spoiler-label').forEach(lbl => {
    lbl.addEventListener('click', () => lbl.closest('.ns-spoiler').classList.toggle('open'));
  });
}

function updateCounts() {
  const raw   = editor.value;
  const chars = raw.length;
  const words = raw.trim() === '' ? 0 : raw.trim().split(/\s+/).length;
  const lines = raw === '' ? 1 : raw.split('\n').length;
  charCount.textContent = `${chars.toLocaleString()} char${chars !== 1 ? 's' : ''}`;
  wordCount.textContent = `${words.toLocaleString()} word${words !== 1 ? 's' : ''}`;
  lineCount.textContent = `${lines.toLocaleString()} line${lines !== 1 ? 's' : ''}`;
}

editor.addEventListener('scroll', () => {
  if (!syncScroll.checked) return;
  const ratio = editor.scrollTop / (editor.scrollHeight - editor.clientHeight || 1);
  preview.scrollTop = ratio * (preview.scrollHeight - preview.clientHeight);
});

/* ================================================================
   4. WRAPPING HELPERS
   ================================================================ */

function wrapSelection(open, close = '') {
  editor.focus();
  const start  = editor.selectionStart;
  const end    = editor.selectionEnd;
  const sel    = editor.value.slice(start, end);
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

function insertAtCursor(text) {
  editor.focus();
  const start  = editor.selectionStart;
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
    btn.addEventListener('click', () => insertAtCursor(`[${tag}]`));
    return;
  }
  if (btn.classList.contains('tb-prompt')) {
    btn.addEventListener('click', () =>
      openPromptModal(btn.dataset.prompt || `Enter ${tag} value`, btn.dataset.default || '', tag)
    );
    return;
  }
  btn.addEventListener('click', () => wrapSelection(`[${tag}]`, `[/${tag}]`));
});

document.querySelectorAll('.tb-btn[data-wrap]').forEach(btn => {
  btn.addEventListener('click', () => wrapSelection(btn.dataset.wrap, btn.dataset.wrapclose || ''));
});

/* ── Colour pickers ─────────────────────────────────────────── */
$('pick-color').addEventListener('change', e =>
  wrapSelection(`[color=${e.target.value}]`, '[/color]'));
$('pick-bg').addEventListener('change', e =>
  wrapSelection(`[background=${e.target.value}]`, '[/background]'));
$('pick-block').addEventListener('change', e =>
  wrapSelection(`[background-block=${e.target.value}]`, '[/background-block]'));

/* ── Nation / Region smart-wrap ─────────────────────────────── */
function nsLinkButton(tag, label) {
  return () => {
    const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
    if (sel) {
      wrapSelection(`[${tag}]`, `[/${tag}]`);
    } else {
      openModal(`Insert ${label}`, `
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

/* ── URL ────────────────────────────────────────────────────── */
$('btn-url').addEventListener('click', () => {
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd).trim();
  openModal('Insert Link', `
    <div class="modal-field">
      <label class="modal-label">URL</label>
      <input class="modal-input" id="mf-url" type="url" placeholder="https://…" autocomplete="off">
    </div>
    <div class="modal-field">
      <label class="modal-label">Label (optional)</label>
      <input class="modal-input" id="mf-label" type="text" value="${escHtml(sel)}" placeholder="Link text…">
    </div>`, ({ url, label }) => {
    if (!url) return;
    wrapSelection(`[url=${url}]`, '[/url]');
    if (label && label !== sel) {
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

/* ── IMG ────────────────────────────────────────────────────── */
$('btn-img').addEventListener('click', () => {
  openModal('Insert Image', `
    <div class="modal-field">
      <label class="modal-label">Image URL</label>
      <input class="modal-input" id="mf-img-url" type="url" placeholder="https://…/image.png" autocomplete="off">
    </div>`, ({ imgUrl }) => {
    if (imgUrl) insertAtCursor(`[img]${imgUrl}[/img]`);
  });
});

/* ── Quote ──────────────────────────────────────────────────── */
$('btn-quote').addEventListener('click', () => {
  if (currentMode === 'forum') {
    openModal('Insert Quote', `
      <div class="modal-field">
        <label class="modal-label">Author (optional)</label>
        <input class="modal-input" id="mf-quote-author" type="text" placeholder="Leave blank for anonymous">
      </div>`, ({ quoteAuthor }) => {
      const tag = quoteAuthor ? `[quote="${quoteAuthor}"]` : '[quote]';
      wrapSelection(tag, '[/quote]');
    });
  } else {
    openModal('Insert Quote', `
      <div class="modal-field">
        <label class="modal-label">Author (optional)</label>
        <input class="modal-input" id="mf-quote-author" type="text" placeholder="Leave blank for anonymous">
      </div>`, ({ quoteAuthor }) => {
      const tag = quoteAuthor ? `[quote=${quoteAuthor}]` : '[quote]';
      wrapSelection(tag, '[/quote]');
    });
  }
});

/* ── Spoiler ────────────────────────────────────────────────── */
$('btn-spoiler').addEventListener('click', () => {
  if (currentMode === 'forum') {
    wrapSelection('[spoiler]', '[/spoiler]');
  } else {
    openModal('Insert Spoiler', `
      <div class="modal-field">
        <label class="modal-label">Spoiler label</label>
        <input class="modal-input" id="mf-spoiler-label" type="text" value="Spoiler" placeholder="Spoiler">
      </div>`, ({ spoilerLabel }) => {
      wrapSelection(`[spoiler=${spoilerLabel || 'Spoiler'}]`, '[/spoiler]');
    });
  }
});

/* ── Bullet list ────────────────────────────────────────────── */
$('btn-ul').addEventListener('click', () => {
  const items = getSelectedLines();
  insertAtCursor(`[list]\n${items.map(l => `[*]${l}`).join('\n')}\n[/list]`);
});

/* ── Ordered list ───────────────────────────────────────────── */
$('btn-ol').addEventListener('click', () => {
  openModal('Ordered List', `
    <div class="modal-field">
      <label class="modal-label">List type</label>
      <select class="modal-select" id="mf-list-type">
        <option value="1">1, 2, 3… (numeric)</option>
        <option value="A">A, B, C… (upper alpha)</option>
        <option value="a">a, b, c… (lower alpha)</option>
        <option value="I">I, II, III… (upper roman)</option>
        <option value="i">i, ii, iii… (lower roman)</option>
      </select>
    </div>`, ({ listType }) => {
    const items = getSelectedLines();
    insertAtCursor(`[list=${listType || '1'}]\n${items.map(l => `[*]${l}`).join('\n')}\n[/list]`);
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
    const r = Math.max(1, Math.min(20, parseInt(rows,10) || 3));
    const c = Math.max(1, Math.min(20, parseInt(cols,10) || 3));
    let tbl = '[table]\n';
    if (header) tbl += '[tr]' + Array.from({length:c},(_,i)=>`[th]Header ${i+1}[/th]`).join('') + '[/tr]\n';
    for (let row = 1; row <= r; row++)
      tbl += '[tr]' + Array.from({length:c},(_,i)=>`[td]Cell ${row}-${i+1}[/td]`).join('') + '[/tr]\n';
    tbl += '[/table]';
    insertAtCursor(tbl);
  });
});

function getSelectedLines() {
  const sel = editor.value.slice(editor.selectionStart, editor.selectionEnd);
  return sel.trim() ? sel.split('\n') : [''];
}

/* ── Undo / Redo / Clear ────────────────────────────────────── */
$('btn-undo').addEventListener('click', () => { const v = history.undo(); if (v !== null) restoreEditorValue(v); });
$('btn-redo').addEventListener('click', () => { const v = history.redo(); if (v !== null) restoreEditorValue(v); });
$('btn-clear').addEventListener('click', () => {
  if (!editor.value) return;
  if (confirm('Clear all content?')) {
    history.push(editor.value);
    editor.value = '';
    triggerUpdate();
    setStatus('Cleared');
  }
});

editor.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault(); const v = history.undo(); if (v !== null) restoreEditorValue(v);
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault(); const v = history.redo(); if (v !== null) restoreEditorValue(v);
  }
  if (e.key === 'Tab') { e.preventDefault(); wrapSelection('[tab=30]', '[/tab]'); }
});

/* ================================================================
   6. MODAL SYSTEM
   ================================================================ */

let modalCallback = null;

function openModal(title, bodyHtml, onOk) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalCallback = onOk;
  modalOverlay.classList.remove('hidden');
  const first = modalBody.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 50);
}

function openPromptModal(label, defaultVal, tag) {
  openModal(`Insert [${tag}]`, `
    <div class="modal-field">
      <label class="modal-label">${escHtml(label)}</label>
      <input class="modal-input" id="mf-single" type="text" value="${escHtml(defaultVal)}" placeholder="${escHtml(defaultVal)}">
    </div>`,
    ({ single }) => {
      if (!single) return;
      if (tag === 'anchor') {
        editor.selectionStart === editor.selectionEnd
          ? insertAtCursor(`[anchor=${single}]`)
          : wrapSelection(`[anchor=${single}]`, '[/anchor]');
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
  const data = {};
  modalBody.querySelectorAll('[id^="mf-"]').forEach(el => {
    const key = el.id.replace('mf-','').replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    data[key] = el.type === 'checkbox' ? el.checked : el.value;
  });
  modalCallback(data);
  closeModal();
}

modalOk.addEventListener('click', confirmModal);
modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
modalBody.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); confirmModal(); }
});

/* ================================================================
   7. TOP-BAR ACTIONS
   ================================================================ */

$('btn-new').addEventListener('click', () => {
  if (editor.value.trim() && !confirm('Discard current content?')) return;
  history.push(editor.value);
  editor.value = '';
  triggerUpdate();
  setStatus('New document');
});

$('btn-copy').addEventListener('click', async () => {
  if (!editor.value) { showToast('Nothing to copy'); return; }
  try { await navigator.clipboard.writeText(editor.value); showToast('BBCode copied!'); setStatus('Copied'); }
  catch { showToast('Copy failed – try Ctrl+A then Ctrl+C'); }
});

$('btn-copy-preview').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(preview.innerHTML); showToast('HTML copied!'); }
  catch { showToast('Copy failed'); }
});

$('btn-import').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => {
  const file = e.target.files[0]; if (!file) return;
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

$('btn-export').addEventListener('click', () => {
  const blob = new Blob([editor.value], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'bbcode.txt'; a.click();
  URL.revokeObjectURL(url);
  setStatus('Exported'); showToast('Exported as bbcode.txt');
});

/* ================================================================
   8. THEME TOGGLE
   ================================================================ */

themeToggle.addEventListener('change', () => {
  document.body.classList.toggle('light', themeToggle.checked);
  themeToggle.closest('.toggle-wrap').querySelector('.toggle-label').textContent =
    themeToggle.checked ? 'Light' : 'Dark';
  localStorage.setItem('ns-bbcode-theme', themeToggle.checked ? 'light' : 'dark');
});

/* ================================================================
   9. DRAG-TO-RESIZE PANES
   ================================================================ */

const resizer     = $('resizer');
const paneEditor  = document.querySelector('.pane-editor');
const panePreview = document.querySelector('.pane-preview');
const workspace   = document.querySelector('.workspace');
let isResizing = false;

resizer.addEventListener('mousedown', e => {
  isResizing = true;
  resizer.classList.add('dragging');
  document.body.style.cursor     = 'col-resize';
  document.body.style.userSelect = 'none';
  e.preventDefault();
});
document.addEventListener('mousemove', e => {
  if (!isResizing) return;
  const rect  = workspace.getBoundingClientRect();
  let left = e.clientX - rect.left;
  left = Math.max(200, Math.min(rect.width - resizer.offsetWidth - 200, left));
  paneEditor.style.flex  = 'none';
  paneEditor.style.width = left + 'px';
  panePreview.style.flex  = '1';
  panePreview.style.width = '';
});
document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  resizer.classList.remove('dragging');
  document.body.style.cursor = document.body.style.userSelect = '';
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

editor.addEventListener('input', () => { triggerUpdate(); scheduleHistoryPush(); });

/* ================================================================
   12. KEYBOARD SHORTCUTS (global)
   ================================================================ */

document.addEventListener('keydown', e => {
  if (!e.ctrlKey && !e.metaKey) return;
  if (!modalOverlay.classList.contains('hidden')) return;
  const global = { s: 'btn-export', o: 'btn-import', d: 'btn-copy', k: 'btn-url' };
  if (global[e.key]) { e.preventDefault(); $(global[e.key]).click(); return; }
  if (document.activeElement !== editor) return;
  if ('biu'.includes(e.key)) {
    e.preventDefault();
    wrapSelection(`[${e.key}]`, `[/${e.key}]`);
  }
});

/* ================================================================
   13. PERSIST CONTENT IN localStorage
   ================================================================ */

const STORAGE_KEY = 'ns-bbcode-content-v5';

function saveToStorage() {
  try { localStorage.setItem(STORAGE_KEY, editor.value); } catch (_) {}
}
function loadFromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) { editor.value = saved; history.push(saved); }
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

  // Restore mode
  const savedMode = localStorage.getItem('ns-bbcode-mode');
  if (savedMode === 'forum') setMode('forum');
  else setMode('dispatch');

  // Restore content
  loadFromStorage();

  // Seed example if empty
  if (!editor.value) {
    editor.value = [
      '[align=center][size=200][b]BBCode Editor[/b][/size][/align]',
      '[align=center][color=#9aa5c0]A quick look at what you can do[/color][/align]',
      '[hr]',
      '',
      '[size=150][b]Text formatting[/b][/size]',
      '',
      'Mix and match: [b]bold[/b], [i]italic[/i], [u]underlined[/u], [strike]strikethrough[/strike].',
      'Subscripts — H[sub]2[/sub]O — and superscripts — x[sup]2[/sup].',
      '',
      '[size=150][b]Colour[/b][/size]',
      '',
      '[color=#e74c3c]Red.[/color]  [color=#2ecc71]Green.[/color]  [color=#3498db]Blue.[/color]',
      '[background=#f39c12][color=#1a2035]Text with a background highlight.[/color][/background]',
      '',
      '[size=150][b]Size[/b][/size]',
      '',
      '[size=175]Larger text.[/size]  [size=75]Smaller text.[/size]',
      '',
      '[size=150][b]Alignment[/b][/size]',
      '',
      '[align=left]Left.[/align]',
      '[align=center]Centre.[/align]',
      '[align=right]Right.[/align]',
      '',
      '[size=150][b]Blocks[/b][/size]',
      '',
      '[box]',
      'A [b]box[/b] sets content apart. Good for notices or callouts.',
      '[/box]',
      '',
      '[quote=Someone]',
      'A quote block attributes text to its author.',
      '[/quote]',
      '',
      '[spoiler=Reveal]',
      'Hidden until clicked. Nest [b]bold[/b], [color=#3498db]colour[/color], anything inside.',
      '[/spoiler]',
      '',
      '[size=150][b]Lists[/b][/size]',
      '',
      '[list]',
      '[*]First item',
      '[*][b]Bold[/b] second item',
      '[*][i]Italic[/i] third item',
      '[/list]',
      '',
      '[list=1]',
      '[*]Step one',
      '[*]Step two',
      '[*][color=#2ecc71]Step three — done[/color]',
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
      '[size=150][b]Links[/b][/size]',
      '',
      '[url=https://www.example.com]Visit example.com[/url]',
      '',
      '[hr]',
      '[align=center][color=#5a6a8a][size=85]Delete this and start writing.[/size][/color][/align]',
    ].join('\n');
    history.push(editor.value);
  }

  renderPreview();
  updateCounts();
  setStatus('Ready');
})();
