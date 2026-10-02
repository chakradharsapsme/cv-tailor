/*
 * docx-engine.js — edits a Word CV in place so the template never moves.
 *
 * The master .docx is opened with JSZip, word/document.xml is parsed, and
 * every body paragraph is split into "segments": runs of text that share the
 * same character formatting (e.g. a bold "Client:" label followed by normal
 * text). Edits replace the text inside existing runs only, so fonts, sizes,
 * colours, bullets, tables, margins, headers and footers are untouched.
 *
 * Paragraphs holding tabs, line breaks, fields, images or tracked changes are
 * locked (never edited) because rewriting them could shift the layout.
 */
(function () {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const XML_NS = 'http://www.w3.org/XML/1998/namespace';
  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

  // Run children that make a paragraph unsafe to rewrite.
  const LOCKING = new Set([
    'tab', 'br', 'cr', 'ptab', 'fldChar', 'instrText', 'drawing', 'pict', 'object',
    'sym', 'footnoteReference', 'endnoteReference', 'commentReference', 'delText',
    'fldSimple', 'ruby', 'separator', 'continuationSeparator'
  ]);
  // Run children that are harmless to keep.
  const HARMLESS = new Set(['rPr', 't', 'lastRenderedPageBreak', 'softHyphen', 'noBreakHyphen']);

  const qAll = (el, local) => Array.from(el.getElementsByTagNameNS(W, local));
  const child = (el, local) => Array.from(el.childNodes).find(n => n.namespaceURI === W && n.localName === local) || null;
  const wAttr = (el, name) => (el ? el.getAttributeNS(W, name) || el.getAttribute('w:' + name) : null);

  function nearest(node, local) {
    let n = node.parentNode;
    while (n && !(n.namespaceURI === W && n.localName === local)) n = n.parentNode;
    return n;
  }

  function ownRuns(p) {
    return qAll(p, 'r').filter(r => nearest(r, 'p') === p);
  }

  function runText(r) {
    let s = '';
    for (const c of Array.from(r.childNodes)) {
      if (c.namespaceURI !== W) continue;
      if (c.localName === 't') s += c.textContent;
      else if (c.localName === 'noBreakHyphen') s += '-';
      else if (c.localName === 'tab') s += '\t';
      else if (c.localName === 'br' || c.localName === 'cr') s += '\n';
    }
    return s;
  }

  function runSignature(r) {
    const rPr = child(r, 'rPr');
    let sig = rPr ? new XMLSerializer().serializeToString(rPr) : '';
    sig = sig.replace(/<w:lang\b[^>]*\/>/g, '').replace(/\s+w:rsid\w*="[^"]*"/g, '');
    const link = nearest(r, 'hyperlink');
    if (link && nearest(link, 'p')) sig += '|link:' + (wAttr(link, 'id') || link.getAttribute('r:id') || 'x');
    return sig;
  }

  function lockReason(p, runs) {
    if (qAll(p, 'fldSimple').some(f => nearest(f, 'p') === p)) return 'field';
    if (qAll(p, 'del').some(d => nearest(d, 'p') === p)) return 'tracked change';
    if (qAll(p, 'ins').some(d => nearest(d, 'p') === p)) return 'tracked change';
    for (const r of runs) {
      for (const c of Array.from(r.childNodes)) {
        if (c.nodeType !== 1) continue;
        if (c.namespaceURI !== W && c.localName !== 'AlternateContent') continue;
        if (c.localName === 'AlternateContent') return 'drawing';
        if (LOCKING.has(c.localName)) return c.localName;
        if (!HARMLESS.has(c.localName)) return c.localName;
      }
    }
    return null;
  }

  function paragraphInfo(p, id, body) {
    const pPr = child(p, 'pPr');
    const style = pPr ? wAttr(child(pPr, 'pStyle'), 'val') || '' : '';
    const isList = !!(pPr && child(pPr, 'numPr')) || /list|bullet/i.test(style);
    const inTable = !!nearest(p, 'tbl');
    const inTextBox = !!nearest(p, 'txbxContent');
    const runs = ownRuns(p);
    const segments = [];
    let last = null;
    for (const r of runs) {
      const sig = runSignature(r);
      if (last && last.sig === sig) { last.runs.push(r); last.text += runText(r); }
      else { last = { sig, runs: [r], text: runText(r) }; segments.push(last); }
    }
    // Drop empty segments (formatting-only runs) from the model's view but keep them in the doc.
    const visible = segments.filter(s => s.text.length > 0);
    const text = visible.map(s => s.text).join('');
    let locked = lockReason(p, runs);
    if (!locked && inTextBox) locked = 'text box';
    return {
      id, el: p, style, isList, inTable, text,
      segments: visible, locked,
      topLevel: p.parentNode === body
    };
  }

  async function load(arrayBuffer) {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const file = zip.file('word/document.xml');
    if (!file) throw new Error('This file is not a Word .docx (word/document.xml is missing).');
    const xml = await file.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Could not read the Word XML.');
    const body = qAll(doc, 'body')[0];
    const paras = qAll(body, 'p').map((p, i) => paragraphInfo(p, i + 1, body));
    return { zip, doc, body, paras, xmlDecl: (xml.match(/^<\?xml[^>]*\?>/) || [''])[0] };
  }

  /** Paragraphs in the compact shape sent to the model. */
  function forModel(model) {
    return model.paras
      .filter(p => p.text.trim().length)
      .map(p => {
        const o = { id: p.id, text: p.text, chars: p.text.length };
        if (p.style) o.style = p.style;
        if (p.isList) o.bullet = true;
        if (p.inTable) o.table = true;
        if (p.locked) o.locked = true;
        if (!p.locked && p.segments.length > 1) o.segments = p.segments.map(s => s.text);
        return o;
      });
  }

  function setRunText(r, txt) {
    const ts = Array.from(r.childNodes).filter(c => c.namespaceURI === W && c.localName === 't');
    ts.forEach((t, i) => { if (i > 0) r.removeChild(t); });
    // Also drop noBreakHyphen/softHyphen so old characters don't linger.
    Array.from(r.childNodes)
      .filter(c => c.namespaceURI === W && (c.localName === 'noBreakHyphen' || c.localName === 'softHyphen'))
      .forEach(c => r.removeChild(c));
    let t = ts[0];
    if (!t) {
      if (txt === '') return;
      t = r.ownerDocument.createElementNS(W, 'w:t');
      r.appendChild(t);
    }
    t.textContent = txt;
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }

  function setSegmentText(seg, txt) {
    seg.runs.forEach((r, i) => setRunText(r, i === 0 ? txt : ''));
  }

  /** Split plain text across segments when the model returned one string for a multi-segment paragraph. */
  function distribute(p, text) {
    const segs = p.segments;
    const out = segs.map(() => '');
    // Keep leading label segments ("Client:", "Role -") if the new text still starts with them.
    let rest = text, i = 0;
    while (i < segs.length - 1 && rest.startsWith(segs[i].text)) {
      out[i] = segs[i].text; rest = rest.slice(segs[i].text.length); i++;
    }
    // Put the remainder into the longest remaining segment (the body text).
    let target = i;
    for (let j = i; j < segs.length; j++) if (segs[j].text.length > segs[target].text.length) target = j;
    out[target] = rest;
    return out;
  }

  function applyEdit(p, edit) {
    if (p.locked) throw new Error('Paragraph ' + p.id + ' is locked (' + p.locked + ').');
    let parts;
    if (Array.isArray(edit.segments) && edit.segments.length === p.segments.length) parts = edit.segments.map(String);
    else if (typeof edit.text === 'string') parts = p.segments.length === 1 ? [edit.text] : distribute(p, edit.text);
    else throw new Error('Edit for paragraph ' + p.id + ' has no usable text.');
    p.segments.forEach((s, i) => setSegmentText(s, parts[i]));
  }

  /**
   * Add a new bullet right after an existing one, as a copy of it (same list style, indent, fonts),
   * holding the new text. Labels in multi-format bullets (e.g. a bold "Client:") are left empty.
   */
  function insertAfter(model, anchor, text, after) {
    if (!anchor || anchor.locked) throw new Error('Paragraph ' + (anchor && anchor.id) + ' cannot take a new bullet.');
    if (!anchor.isList) throw new Error('Paragraph ' + anchor.id + ' is not a bullet.');
    const el = anchor.el.cloneNode(true);
    // Drop bookmarks and comment anchors so ids stay unique.
    ['bookmarkStart', 'bookmarkEnd', 'commentRangeStart', 'commentRangeEnd', 'proofErr'].forEach(t => qAll(el, t).forEach(n => n.parentNode.removeChild(n)));
    const info = paragraphInfo(el, -1, model.body);
    if (!info.segments.length) throw new Error('Paragraph ' + anchor.id + ' has no text to copy.');
    let target = 0;
    info.segments.forEach((sg, i) => { if (sg.text.length > info.segments[target].text.length) target = i; });
    info.segments.forEach((sg, i) => setSegmentText(sg, i === target ? text : ''));
    const ref = after || anchor.el;
    ref.parentNode.insertBefore(el, ref.nextSibling);
    return el;
  }

  function canRemove(p) {
    if (p.locked || !p.isList) return false;
    const cell = nearest(p.el, 'tc');
    if (cell) return qAll(cell, 'p').filter(x => nearest(x, 'tc') === cell).length > 1;
    return true;
  }

  function applyReorder(model, ids) {
    const ps = ids.map(id => model.paras.find(p => p.id === id));
    if (ps.some(p => !p)) throw new Error('Unknown paragraph in reorder.');
    const parent = ps[0].el.parentNode;
    const sorted = ps.slice().sort((a, b) => a.id - b.id);
    // Must be consecutive siblings in the same container.
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].el.parentNode !== parent) throw new Error('Reorder spans different sections.');
      if (i > 0) {
        let n = sorted[i - 1].el.nextSibling;
        while (n && n.nodeType !== 1) n = n.nextSibling;
        if (n !== sorted[i].el) throw new Error('Reorder paragraphs are not adjacent.');
      }
    }
    let anchor = sorted[sorted.length - 1].el.nextSibling;
    const els = ps.map(p => p.el);
    els.forEach(e => parent.removeChild(e));
    els.forEach(e => parent.insertBefore(e, anchor));
  }

  /**
   * Build the tailored CV.
   * plan = { edits:[{id,text|segments}], adds:[{after,text}], remove:[id], reorder:[[ids]] }
   * Returns { blob, applied, skipped:[{id,why}] }
   */
  async function buildTailored(arrayBuffer, plan) {
    const model = await load(arrayBuffer);
    const byId = new Map(model.paras.map(p => [p.id, p]));
    const skipped = [];
    let applied = 0;
    for (const e of plan.edits || []) {
      const p = byId.get(e.id);
      try { if (!p) throw new Error('not found'); applyEdit(p, e); applied++; }
      catch (err) { skipped.push({ id: e.id, why: err.message }); }
    }
    // New bullets: several after the same bullet keep their order.
    const lastAfter = new Map();
    for (const x of plan.adds || []) {
      const p = byId.get(x.after);
      try { if (!p) throw new Error('not found'); lastAfter.set(x.after, insertAfter(model, p, String(x.text || '').trim(), lastAfter.get(x.after))); applied++; }
      catch (err) { skipped.push({ id: 'n' + x.after, why: err.message }); }
    }
    for (const group of plan.reorder || []) {
      try { applyReorder(model, group); applied++; }
      catch (err) { skipped.push({ id: group.join(','), why: err.message }); }
    }
    for (const id of plan.remove || []) {
      const p = byId.get(id);
      if (p && canRemove(p)) { p.el.parentNode.removeChild(p.el); applied++; }
      else skipped.push({ id, why: 'cannot remove safely' });
    }
    const blob = await save(model);
    return { blob, applied, skipped };
  }

  async function save(model) {
    let xml = new XMLSerializer().serializeToString(model.doc);
    if (!xml.startsWith('<?xml')) xml = (model.xmlDecl || '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>') + '\n' + xml;
    model.zip.file('word/document.xml', xml);
    return model.zip.generateAsync({ type: 'blob', mimeType: DOCX_MIME, compression: 'DEFLATE' });
  }

  /** Pick the paragraph whose formatting best represents normal body text. */
  function bodyTemplate(model) {
    const cands = model.paras.filter(p => !p.locked && !p.isList && !p.inTable && p.topLevel && p.text.length > 60);
    const pool = cands.length ? cands : model.paras.filter(p => p.text.length > 20 && p.topLevel);
    if (!pool.length) return null;
    const counts = new Map();
    for (const p of pool) {
      const k = (p.style || '') + '#' + (p.segments[0] ? p.segments[0].sig : '');
      counts.set(k, (counts.get(k) || 0) + p.text.length);
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return pool.find(p => (p.style || '') + '#' + (p.segments[0] ? p.segments[0].sig : '') === best);
  }

  /**
   * Build a cover letter that reuses the CV's own styles, page setup, headers
   * and footers. letter = { letterheadIds:[], blocks:[{text, bold?}] }
   */
  async function buildLetter(arrayBuffer, letter) {
    const model = await load(arrayBuffer);
    const doc = model.doc, body = model.body;
    const tpl = bodyTemplate(model);
    const sectPr = child(body, 'sectPr');
    const heads = (letter.letterheadIds || [])
      .map(id => model.paras.find(p => p.id === id))
      .filter(p => p && p.topLevel)
      .map(p => p.el.cloneNode(true));

    // Empty the body, keeping section properties.
    Array.from(body.childNodes).forEach(n => { if (n !== sectPr) body.removeChild(n); });

    const makePara = (text, opts = {}) => {
      const p = doc.createElementNS(W, 'w:p');
      if (tpl) {
        const pPr = child(tpl.el, 'pPr');
        if (pPr) {
          const c = pPr.cloneNode(true);
          ['numPr', 'rPr', 'sectPr', 'pageBreakBefore', 'keepNext'].forEach(n => { const x = child(c, n); if (x) c.removeChild(x); });
          p.appendChild(c);
        }
      }
      const r = doc.createElementNS(W, 'w:r');
      const tplRun = tpl && tpl.segments[0] ? tpl.segments[0].runs[0] : null;
      const rPrSrc = tplRun ? child(tplRun, 'rPr') : null;
      let rPr = rPrSrc ? rPrSrc.cloneNode(true) : null;
      if (rPr) { const b = child(rPr, 'b'); if (b) rPr.removeChild(b); }
      if (opts.bold) {
        if (!rPr) rPr = doc.createElementNS(W, 'w:rPr');
        rPr.insertBefore(doc.createElementNS(W, 'w:b'), rPr.firstChild);
      }
      if (rPr) r.appendChild(rPr);
      const t = doc.createElementNS(W, 'w:t');
      t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
      t.textContent = text;
      r.appendChild(t);
      p.appendChild(r);
      return p;
    };

    const insert = n => body.insertBefore(n, sectPr);
    heads.forEach(insert);
    if (heads.length) insert(makePara(''));
    for (const b of letter.blocks) insert(makePara(b.text, b));
    return save(model);
  }

  /**
   * ATS readiness checks on a loaded model. Returns [{status:'ok'|'warn'|'info', title, detail}].
   * These are the things applicant tracking systems most often trip over.
   */
  async function atsReport(model) {
    const out = [];
    const bodyText = model.paras.map(p => p.text).join('\n');
    const words = (bodyText.match(/\S+/g) || []).length;
    const email = /[\w.+-]+@[\w-]+\.[\w.]+/;
    const phone = /(\+?\d[\d\s()-]{8,}\d)/;

    // Contact details only in header/footer are often dropped by parsers.
    let headerText = '';
    for (const name of Object.keys(model.zip.files).filter(n => /^word\/(header|footer)\d*\.xml$/.test(n))) {
      const x = await model.zip.file(name).async('string');
      headerText += ' ' + x.replace(/<[^>]+>/g, ' ');
    }
    const inBody = email.test(bodyText), inHead = email.test(headerText);
    if (inBody) out.push({ status: 'ok', title: 'Contact details in the main body', detail: 'Parsers can read your email and phone.' });
    else if (inHead) out.push({ status: 'warn', title: 'Contact details only in the header/footer', detail: 'Some ATS (older Taleo, iCIMS) skip headers. Keep a copy of your email and phone in the body.' });
    else out.push({ status: 'warn', title: 'No email address found', detail: 'Add your email and mobile near the top of the CV.' });
    if (!phone.test(bodyText + headerText)) out.push({ status: 'warn', title: 'No phone number found', detail: 'Recruiters for contract roles usually call first.' });

    const xml = new XMLSerializer().serializeToString(model.doc);
    const tables = (xml.match(/<w:tbl>/g) || []).length;
    if (tables) out.push({ status: 'info', title: `${tables} table${tables > 1 ? 's' : ''} in the layout`, detail: 'Modern ATS read simple tables, but keep job titles, employers and dates outside tables.' });
    if (/<w:txbxContent/.test(xml)) out.push({ status: 'warn', title: 'Text boxes found', detail: 'Text inside text boxes is often lost by ATS. Move key content into normal paragraphs.' });
    if (/<w:drawing|<w:pict/.test(xml)) out.push({ status: 'info', title: 'Images or shapes present', detail: 'Fine for people, invisible to ATS. Make sure no information exists only in an image.' });

    const heads = ['experience|employment|career history', 'education|qualifications', 'skills|competenc', 'certif'];
    const lower = bodyText.toLowerCase();
    const missing = heads.filter(h => !new RegExp(h).test(lower));
    if (!missing.length) out.push({ status: 'ok', title: 'Standard section headings', detail: 'Experience, education, skills and certifications are easy to find.' });
    else out.push({ status: 'info', title: 'Some standard headings not found', detail: 'Consider standard names such as "Experience", "Education", "Skills", "Certifications".' });

    if (words < 450) out.push({ status: 'warn', title: `Short CV (${words} words)`, detail: 'Experienced candidates usually need about 2 pages of evidence.' });
    else if (words > 1500) out.push({ status: 'warn', title: `Long CV (${words} words)`, detail: 'Aim for 2–3 pages. Trim older roles to one line each.' });
    else out.push({ status: 'ok', title: `Length looks right (${words} words)`, detail: 'Roughly 2–3 pages for a senior profile.' });
    return out;
  }

  /** Share of keywords present in text (case-insensitive, whole-phrase). */
  function keywordCoverage(text, keywords) {
    const t = ' ' + text.toLowerCase().replace(/\s+/g, ' ') + ' ';
    const hit = [], miss = [];
    for (const k of keywords || []) {
      const kk = String(k).toLowerCase().trim();
      if (!kk) continue;
      (t.includes(kk) ? hit : miss).push(k);
    }
    const total = hit.length + miss.length;
    return { hit, miss, pct: total ? Math.round(100 * hit.length / total) : 0 };
  }

  const plainText = model => model.paras.map(p => p.text).filter(t => t.trim()).join('\n');

  window.CVT = window.CVT || {};
  window.CVT.docx = { load, forModel, buildTailored, buildLetter, canRemove, atsReport, keywordCoverage, plainText, DOCX_MIME };
})();
