/*
 * autofill.js — the "Autofill" bookmarklet.
 * It runs on the job site's application form, reads the application pack you
 * copied from CV Tailor, fills the fields it recognises, highlights them, and
 * shows a panel of what it did. It NEVER submits the form and never touches
 * file uploads: you review everything and press Submit yourself.
 */
(function () {
  function autofill() {
    var ID = 'cvt-autofill-panel';
    var old = document.getElementById(ID); if (old) old.remove();

    function panel(html) {
      var p = document.createElement('div');
      p.id = ID;
      p.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:340px;max-height:80vh;overflow:auto;background:#fff;color:#141922;border:1px solid #D6DBE4;border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.2);font:14px/1.45 system-ui,Segoe UI,sans-serif;padding:14px';
      p.innerHTML = html;
      document.body.appendChild(p);
      var x = p.querySelector('[data-x]'); if (x) x.onclick = function () { p.remove(); };
      return p;
    }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function run(raw) {
      var pack;
      try { pack = JSON.parse(raw); } catch (e) { pack = null; }
      if (!pack || pack.kind !== 'cv-tailor-pack') {
        ask('That clipboard text is not a CV Tailor pack. In CV Tailor, open the job, go to Apply and press "Copy autofill pack", then try again.');
        return;
      }
      var f = pack.fields || {};
      var rules = [
        [/first.?name|given.?name|forename/, f.firstName],
        [/last.?name|surname|family.?name/, f.lastName],
        [/^(full.?)?name$|full.?name|your.?name|legal.?name/, f.fullName],
        [/e-?mail/, f.email],
        [/phone|mobile|telephone|contact.?number/, f.phone],
        [/linked.?in/, f.linkedin],
        [/website|portfolio|personal.?url/, f.website],
        [/post.?code|zip/, f.postcode],
        [/\bcity\b|town|current.?location|^location$|where.*(based|live)/, f.city],
        [/country/, f.country],
        [/current.*(job.?title|position|role)|job.?title|headline/, f.currentTitle],
        [/current.*(company|employer)|employer|company.?name/, f.currentCompany],
        [/notice|availability|available.*start|start.?date|when.*start/, f.notice],
        [/day.?rate|daily.?rate/, f.dayRate],
        [/salary|compensation|pay.?expect|remuneration|expected.?(pay|package)/, f.salary],
        [/right.?to.?work|authori[sz]ed|eligib|visa|sponsor/, f.eligibility],
        [/cover.?letter|motivation.?letter|covering/, f.coverLetter],
        [/why.*(role|position|job|company|us|interested|apply|join)|reason.*apply|motivation/, f.why]
      ];
      var qa = (pack.qa || []).filter(function (x) { return x && x.q && x.a; });

      function labelOf(el) {
        var parts = [];
        if (el.id) { var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) parts.push(l.innerText); }
        var wrap = el.closest('label'); if (wrap) parts.push(wrap.innerText);
        var lb = el.getAttribute('aria-labelledby');
        if (lb) lb.split(/\s+/).forEach(function (i) { var n = document.getElementById(i); if (n) parts.push(n.innerText); });
        ['aria-label', 'placeholder', 'name', 'id', 'autocomplete', 'data-automation-id', 'title'].forEach(function (a) { var v = el.getAttribute(a); if (v) parts.push(v); });
        if (parts.join('').trim().length < 3) {
          var box = el.closest('div,li,fieldset,section');
          for (var i = 0; i < 3 && box; i++) { var t = (box.innerText || '').trim(); if (t && t.length < 300) { parts.push(t); break; } box = box.parentElement; }
        }
        return parts.join(' ').replace(/[\s_\-]+/g, ' ').toLowerCase();
      }
      function tokens(s) { return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(function (w) { return w.length > 3; }); }
      function qaFor(label) {
        var lt = tokens(label), best = null, bestScore = 0;
        qa.forEach(function (x) {
          var qt = tokens(x.q); if (!qt.length) return;
          var hit = qt.filter(function (w) { return lt.indexOf(w) >= 0; }).length / qt.length;
          if (hit > bestScore) { bestScore = hit; best = x; }
        });
        return bestScore >= 0.6 ? best.a : null;
      }
      function setValue(el, v) {
        var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
        el.focus();
        setter.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      }
      function visible(el) { var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; }

      var filled = [], skipped = [];
      var els = Array.prototype.slice.call(document.querySelectorAll('input, textarea, select'));
      els.forEach(function (el) {
        var type = (el.getAttribute('type') || 'text').toLowerCase();
        if (el.tagName === 'INPUT' && ['text', 'email', 'tel', 'url', 'search', 'number', ''].indexOf(type) < 0) {
          if (type === 'file' && visible(el)) skipped.push('File upload: attach your tailored CV yourself');
          return;
        }
        if (!visible(el) || el.disabled || el.readOnly) return;
        var label = labelOf(el);
        if (!label) return;
        var value = null;
        if (el.tagName === 'TEXTAREA') value = qaFor(label);
        if (value == null) for (var i = 0; i < rules.length; i++) { if (rules[i][1] && rules[i][0].test(label)) { value = rules[i][1]; break; } }
        if (value == null && el.tagName !== 'SELECT') value = qaFor(label);
        var short = label.slice(0, 60);
        if (value == null) { if (el.required || /\*/.test(label)) skipped.push(short); return; }
        if (el.tagName === 'SELECT') {
          var want = String(value).toLowerCase();
          var opt = Array.prototype.slice.call(el.options).find(function (o) { var t = o.text.toLowerCase(); return t && (t === want || want.indexOf(t) === 0 || t.indexOf(want) === 0); });
          if (!opt) { skipped.push(short + ' (choose manually)'); return; }
          setValue(el, opt.value);
        } else {
          if (el.value && el.value.trim()) return; // never overwrite what is already there
          var ml = parseInt(el.getAttribute('maxlength'), 10);
          setValue(el, ml > 0 ? String(value).slice(0, ml) : String(value));
        }
        el.style.outline = '3px solid #F5B400';
        el.style.backgroundColor = '#FFF7D6';
        filled.push(short);
      });

      panel('<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong>CV Tailor autofill</strong><button data-x style="border:0;background:none;font-size:18px;cursor:pointer" aria-label="Close">×</button></div>' +
        '<p style="margin:6px 0 10px;color:#5A6373">' + esc(pack.role || '') + (pack.company ? ' · ' + esc(pack.company) : '') + '</p>' +
        '<p style="margin:0 0 6px"><strong>' + filled.length + '</strong> field(s) filled and highlighted.</p>' +
        (skipped.length ? '<p style="margin:8px 0 4px"><strong>Check these yourself:</strong></p><ul style="margin:0 0 8px;padding-left:18px">' + skipped.slice(0, 15).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul>' : '') +
        '<p style="margin:8px 0 0;padding:8px;background:#F2F4F7;border-radius:6px">Nothing has been submitted. Review every field, attach your CV, answer anything left, then press Submit yourself. Multi-page forms: run the bookmarklet again on each page.</p>');
    }

    function ask(msg) {
      var p = panel('<div style="display:flex;justify-content:space-between;align-items:center"><strong>CV Tailor autofill</strong><button data-x style="border:0;background:none;font-size:18px;cursor:pointer" aria-label="Close">×</button></div>' +
        '<p style="margin:8px 0">' + esc(msg || 'Paste your application pack (copied from CV Tailor) below.') + '</p>' +
        '<textarea style="width:100%;height:110px;box-sizing:border-box;font:12px monospace"></textarea>' +
        '<button style="margin-top:8px;padding:8px 12px;border:0;border-radius:6px;background:#2447D6;color:#fff;cursor:pointer">Fill this form</button>');
      p.querySelector('button:not([data-x])').onclick = function () { var v = p.querySelector('textarea').value; p.remove(); run(v); };
      p.querySelector('textarea').focus();
    }

    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function (t) { if (t && t.indexOf('cv-tailor-pack') >= 0) run(t); else ask(); }, function () { ask(); });
    } else ask();
  }

  window.CVT = window.CVT || {};
  window.CVT.bookmarklet = function () {
    return 'javascript:' + encodeURIComponent('(' + autofill.toString() + ')();void 0');
  };
})();
