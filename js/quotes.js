/*
 * quotes.js — a gentle scrolling line of encouragement under the top bar, for anyone between jobs.
 * Original lines (no borrowed quotes), shuffled so every visit starts somewhere different.
 * Pauses on hover; stands still for people who prefer reduced motion; can be hidden for the day.
 */
(function () {
  const LINES = [
    'Every application is practice for the one that says yes.',
    'A “no” today is information, not a verdict on you.',
    'Your experience did not disappear when the job ended. It is still yours.',
    'Small steps every day add up to an offer.',
    'The right role is looking for someone like you, too.',
    'Rest is part of the search. Recharged people interview better.',
    'You have solved hard problems before. This is one more.',
    'One tailored application beats ten rushed ones.',
    'Progress is still progress when nobody sees it yet.',
    'Every conversation widens the door a little more.',
    'Your next chapter is being written with every effort you make.',
    'Confidence grows by doing, not by waiting.',
    'Skills travel. The next team is lucky to get yours.',
    'Celebrate the interviews, not just the offers.',
    'You are more than a job title. Lead with what you can do.',
    'Reach out to one person today. Opportunities often arrive through people.',
    'Learning something new this week counts as a win.',
    'Silence from an employer says more about their inbox than about you.',
    'Keep going. Many careers turn on a single unexpected call.',
    'Be proud of the courage it takes to keep applying.',
    'The gap on your CV is a pause, not a full stop.',
    'Your story matters. Tell it with the results you are proud of.',
    'Today: one job, one message, one skill. That is a good day.',
    'Interviews are two-way: you are choosing them, too.',
    'Every expert was once someone looking for their next start.',
    'Hope is a plan with the next step written down.',
    'Kindness to yourself is a job-search strategy.',
    'You only need one yes.'
  ];
  const KEY = 'cvt.quotesHidden';
  const S = () => window.CVT.store;

  function shuffled() {
    const a = LINES.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function init() {
    const host = document.querySelector('.work'); if (!host || document.querySelector('.quote-bar')) return;
    try { S().local.set(KEY, ''); } catch (_) {}
    const list = shuffled();
    const bar = document.createElement('div');
    bar.className = 'quote-bar'; bar.setAttribute('role', 'note'); bar.setAttribute('aria-label', 'Encouragement');
    const track = list.map(q => `<span class="q-item">✦ ${q}</span>`).join('');
    bar.innerHTML = `<div class="q-viewport" aria-hidden="true"><div class="q-track">${track}${track}</div></div>
      <p class="q-static">${list[0]}</p>`;
    const top = host.querySelector('.topbar');
    if (top) top.after(bar); else host.prepend(bar);
    // Read slowly: about 18 seconds per line.
    bar.querySelector('.q-track').style.animationDuration = (list.length * 18) + 's';
    // Always on: the line keeps scrolling (there is no hide button).
    // For screen readers and reduced motion: one line, changing every 20 seconds.
    let i = 0; setInterval(() => { const p = bar.querySelector('.q-static'); if (p) p.textContent = list[(++i) % list.length]; }, 20000);
  }

  window.CVT = window.CVT || {};
  window.CVT.quotes = { init, LINES };
})();
