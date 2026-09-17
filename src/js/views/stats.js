/* Career stats across every match stored on this device. */

import { esc, fixed, sheet, initials, sortBy } from '../util.js';
import * as store from '../store.js';
import { empty, badge, nameOf, tabs, ICON } from '../ui.js';
import { aggregate, leaderboards } from '../stats.js';

let tab = 'batting';
let q = '';

const COLS = {
  batting: [
    { k: 'mat', l: 'M' }, { k: 'inns', l: 'I' }, { k: 'runs', l: 'R', bold: true },
    { k: 'hs', l: 'HS', fmt: a => `${a.hs}${a.hsNo ? '*' : ''}` },
    { k: 'avg', l: 'Avg', fmt: a => a.avg == null ? '—' : fixed(a.avg, 1) },
    { k: 'sr', l: 'SR', fmt: a => fixed(a.sr, 1) }
  ],
  bowling: [
    { k: 'mat', l: 'M' }, { k: 'overs', l: 'O', fmt: a => a.overs },
    { k: 'bRuns', l: 'R' }, { k: 'wkts', l: 'W', bold: true },
    { k: 'bb', l: 'BBI', fmt: a => a.bb },
    { k: 'econ', l: 'Econ', fmt: a => a.econ == null ? '—' : fixed(a.econ) }
  ],
  fielding: [
    { k: 'mat', l: 'M' }, { k: 'catches', l: 'Ct', bold: true },
    { k: 'stumpings', l: 'St' }, { k: 'runouts', l: 'RO' },
    { k: 'dismissals', l: 'Total' }
  ]
};

export default {
  nav: 'stats',
  title: 'Player stats',
  sub: () => {
    const n = store.matches().filter(m => m.status !== 'setup').length;
    return `across ${n} match${n === 1 ? '' : 'es'}`;
  },

  render() {
    const all = store.matches();
    if (!all.length) return empty(ICON.chart, 'No stats yet', 'Score a match and every batting, bowling and fielding number is tracked automatically.',
      `<a href="#/match/new" class="btn-primary">Start a match</a>`);

    const agg = [...aggregate(all).values()];
    const lb = leaderboards(all);
    const sortKey = tab === 'batting' ? 'runs' : tab === 'bowling' ? 'wkts' : 'dismissals';
    // Include everyone who took part in that discipline, not only those with a
    // number on the board — a bowler with 4-0-30-0 still bowled.
    const took = tab === 'batting' ? a => a.inns > 0
               : tab === 'bowling' ? a => a.bBalls > 0
               : a => a.mat > 0;
    let rows = agg.filter(took);
    if (q) rows = rows.filter(a => nameOf(a.id).toLowerCase().includes(q.toLowerCase()));
    // Secondary sort keeps wicketless bowlers in a sensible order (cheapest first).
    rows = tab === 'bowling'
      ? [...rows].sort((a, b) => b.wkts - a.wkts || (a.econ ?? 99) - (b.econ ?? 99) || b.bBalls - a.bBalls)
      : sortBy(rows, '-' + sortKey);

    return `
      ${topCards(lb)}
      ${tabs([{ key: 'batting', label: 'Batting' }, { key: 'bowling', label: 'Bowling' }, { key: 'fielding', label: 'Fielding' }], tab)}
      <input id="q" class="field mt-3" placeholder="Search a player…" value="${esc(q)}" autocomplete="off">
      <p class="mt-2 text-[10px] text-faint">Tap a row for the full record — boundaries, hauls, fielding and more.</p>
      <div class="card mt-2 p-3 overflow-x-auto no-scrollbar">
        <table class="tbl w-full min-w-[300px]">
          <thead><tr><th>Player</th>${COLS[tab].map(c => `<th>${c.l}</th>`).join('')}</tr></thead>
          <tbody>${rows.length ? rows.map(a => `<tr data-p="${a.id}" class="cursor-pointer hover:bg-plate transition">
            <td><span class="inline-flex items-center gap-2">
              <span class="h-6 w-6 grid place-items-center rounded-full bg-fill border border-rule text-[9px] font-semibold text-muted">${esc(initials(nameOf(a.id)))}</span>
              <span><span class="block font-semibold text-fg leading-tight truncate max-w-[6.5rem]">${esc(nameOf(a.id))}</span>
              <span class="block text-[9px] text-faint">${esc(store.team(store.player(a.id)?.teamId)?.name || '')}</span></span></span></td>
            ${COLS[tab].map(c => `<td class="${c.bold ? 'font-extrabold text-fg' : 'text-fg'}">${c.fmt ? c.fmt(a) : a[c.k]}</td>`).join('')}
          </tr>`).join('') : `<tr><td colspan="9" class="text-center text-faint py-6">No players match that search</td></tr>`}
          </tbody></table>
      </div>`;
  },

  mount(root, ctx) {
    root.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; ctx.render(); }));
    const inp = root.querySelector('#q');
    if (inp) {
      inp.addEventListener('input', e => {
        q = e.target.value;
        clearTimeout(inp._t);
        inp._t = setTimeout(() => { ctx.render(); document.querySelector('#q')?.focus(); }, 260);
      });
    }
    root.querySelectorAll('[data-p]').forEach(r => r.addEventListener('click', () => playerSheet(r.dataset.p)));
  }
};

function topCards(lb) {
  // Gold names the award; the figure is just a figure.
  const c = (label, list, fmt) => {
    const a = list[0];
    if (!a) return '';
    return `<div class="rounded-lg border border-rule bg-plate p-3">
      <p class="text-[11px] font-semibold text-boundary">${esc(label)}</p>
      <p class="mt-0.5 text-[12px] font-semibold text-fg truncate">${esc(nameOf(a.id))}</p>
      <p class="display text-xl font-extrabold text-fg leading-tight">${fmt(a)}</p></div>`;
  };
  const cards = [
    c('Most runs', lb.runs, a => a.runs),
    c('Most wickets', lb.wickets, a => a.wkts),
    c('Most sixes', lb.sixes, a => a.f6),
    c('Most catches', lb.fielding, a => a.dismissals)
  ].filter(Boolean);
  if (!cards.length) return '';
  return `<div class="grid grid-cols-2 gap-2.5 mb-4">${cards.join('')}</div>`;
}

async function playerSheet(id) {
  const a = aggregate(store.matches()).get(id);
  const p = store.player(id);
  if (!a) return;
  const t = store.team(p?.teamId);
  const line = (l, v) => `<div class="flex justify-between py-1.5 border-b border-rule text-[13px]">
    <span class="text-muted">${esc(l)}</span><span class="num font-semibold text-fg">${v}</span></div>`;

  await sheet(`
    <div class="flex items-center gap-3">
      <span class="h-12 w-12 grid place-items-center rounded-full bg-plate border border-rule text-sm font-bold text-fg">${esc(initials(p?.name))}</span>
      <div class="min-w-0">
        <h3 class="text-lg font-bold text-fg truncate">${esc(p?.name || 'Player')}</h3>
        <p class="text-[11px] text-muted">${esc([t?.name, p?.role, p?.batStyle, p?.bowlStyle].filter(Boolean).join(', '))}</p>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-2 mt-4 text-center">
      <div class="rounded-lg bg-fill p-2.5"><p class="text-[11px] text-muted">Matches</p><p class="display text-xl font-extrabold text-fg">${a.mat}</p></div>
      <div class="rounded-lg bg-fill p-2.5"><p class="text-[11px] text-muted">Runs</p><p class="display text-xl font-extrabold text-fg">${a.runs}</p></div>
      <div class="rounded-lg bg-fill p-2.5"><p class="text-[11px] text-muted">Wickets</p><p class="display text-xl font-extrabold text-fg">${a.wkts}</p></div>
    </div>

    <p class="label mt-5">Batting</p>
    ${line('Innings', a.inns)}${line('Not out', a.no)}
    ${line('Highest score', `${a.hs}${a.hsNo ? '*' : ''}`)}
    ${line('Average', a.avg == null ? '—' : fixed(a.avg, 2))}
    ${line('Strike rate', fixed(a.sr, 1))}
    ${line('Fours / Sixes', `${a.f4} / ${a.f6}`)}
    ${line('Fifties / Hundreds', `${a.fifties} / ${a.hundreds}`)}
    ${line('Ducks', a.ducks)}

    <p class="label mt-5">Bowling</p>
    ${line('Overs', a.overs)}${line('Runs conceded', a.bRuns)}
    ${line('Wickets', a.wkts)}${line('Best figures', a.bb)}
    ${line('Economy', a.econ == null ? '—' : fixed(a.econ, 2))}
    ${line('Average', a.bowlAvg == null ? '—' : fixed(a.bowlAvg, 2))}
    ${line('Maidens', a.maidens)}${line('3+ / 5+ hauls', `${a.threeFers} / ${a.fiveFers}`)}

    <p class="label mt-5">Fielding</p>
    ${line('Catches', a.catches)}${line('Stumpings', a.stumpings)}${line('Run outs', a.runouts)}

    <p class="label mt-5">Results</p>
    ${line('Won / Lost', `${a.won} / ${a.lost}`)}

    <button class="btn-ghost w-full mt-5" data-close="__dismiss">Close</button>`);
}
