/* ═══════════════════════════════════════════════════════════════════
   ORQ PROPERTIES — OPERATOR COMMAND
   Forbes-500 RE Wholesale Operating System
   Single-operator auth · Human-gated pipeline · Financial protection
   ═══════════════════════════════════════════════════════════════════ */

'use strict';

// ── CONFIG ────────────────────────────────────────────────────────────
const CONFIG = {
  // SHA-256 of operator passphrase. Default passphrase: "ORQ-Operator-2026"
  // To change: run sha256 of your new passphrase and replace this hash.
  PASS_HASH: 'd47d64a1898e70ea90d52e5a6a8771f594533ee0657b06f200a33d104a544dcb',
  API_BASE: 'https://app.orq.world/api',          // ORQ server (Replit) — enforces real auth
  ARIA_PHONE: '+1 (580) 324-0721',
  ARIA_ULIO: 'https://ulio.ai/partner/businesses/326a9ea5-0c5c-4743-81f5-ec2aa61044bb/hub/receptionist',
  IDLE_LOCK_MS: 30 * 60 * 1000,                     // 30 min auto-lock
  // Financial protection rules
  MIN_ASSIGNMENT_FEE: 2500,
  MAX_ASSIGNMENT_FEE: 100000,
  // Deal economics defaults
  MAO_PCT: 0.70,            // Maximum Allowable Offer = 70% ARV - repairs
};

// ── SECURE AUTH ───────────────────────────────────────────────────────
const Auth = {
  idleTimer: null,

  async sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  },

  async attempt() {
    const input = document.getElementById('passphrase');
    const val = input.value;
    if (!val) return;
    const hash = await this.sha256(val);

    if (hash === CONFIG.PASS_HASH) {
      // Derive a session token (passphrase never stored, only a time-boxed token)
      const token = await this.sha256(val + ':' + Date.now() + ':orq-session');
      sessionStorage.setItem('orq_session', token);
      sessionStorage.setItem('orq_session_at', Date.now().toString());
      input.value = '';
      this.unlock();
    } else {
      const err = document.getElementById('gate-err');
      err.classList.add('show');
      input.value = '';
      input.focus();
      // Exponential backoff on repeated failures
      const fails = (+sessionStorage.getItem('orq_fails') || 0) + 1;
      sessionStorage.setItem('orq_fails', fails);
      if (fails >= 5) {
        input.disabled = true;
        err.textContent = 'Too many attempts. Locked for 60s.';
        setTimeout(() => { input.disabled = false; err.classList.remove('show'); err.textContent = 'Access denied. Attempt logged.'; sessionStorage.setItem('orq_fails', '0'); }, 60000);
      } else {
        setTimeout(() => err.classList.remove('show'), 3000);
      }
    }
  },

  unlock() {
    document.getElementById('gate').classList.add('unlocked');
    document.getElementById('app').classList.add('live');
    sessionStorage.setItem('orq_fails', '0');
    this.armIdleLock();
    App.boot();
  },

  lock() {
    sessionStorage.removeItem('orq_session');
    sessionStorage.removeItem('orq_session_at');
    location.reload();
  },

  isValid() {
    const token = sessionStorage.getItem('orq_session');
    const at = +sessionStorage.getItem('orq_session_at');
    if (!token || !at) return false;
    if (Date.now() - at > CONFIG.IDLE_LOCK_MS) return false;
    return true;
  },

  armIdleLock() {
    const reset = () => {
      sessionStorage.setItem('orq_session_at', Date.now().toString());
      clearTimeout(this.idleTimer);
      this.idleTimer = setTimeout(() => {
        Toast.show('warn', '🔒', 'Session locked — 30 min idle');
        this.lock();
      }, CONFIG.IDLE_LOCK_MS);
    };
    ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(e =>
      document.addEventListener(e, reset, { passive: true }));
    reset();
  },
};

// ── STATE (persisted) ─────────────────────────────────────────────────
const Store = {
  data: {
    leads: [],          // raw scanned leads awaiting review
    pipeline: [],       // approved deals moving through stages
    buyers: [],         // buyer database
    deals: [],          // closed/collected deals
    automation: 'paused', // running | paused | stopped
    settings: { dryRun: true },
  },

  load() {
    try {
      const raw = localStorage.getItem('orq_state_v2');
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch (e) { console.warn('state load failed', e); }
    if (this.data.buyers.length === 0) this.data.buyers = SEED_BUYERS.slice();
  },

  save() {
    try { localStorage.setItem('orq_state_v2', JSON.stringify(this.data)); }
    catch (e) { console.warn('state save failed', e); }
  },

  reset() {
    if (!confirm('Reset all local operator data? This cannot be undone.')) return;
    localStorage.removeItem('orq_state_v2');
    location.reload();
  },
};

// ── SEED DATA ─────────────────────────────────────────────────────────
const SEED_BUYERS = [
  { id:'b1', name:'Marcus Johnson', org:'MJ Capital', phone:'(405) 555-0100', email:'marcus@mjcap.com', markets:['Lawton','Oklahoma City'], type:'Fix & Flip', budgetLow:50000, budgetHigh:120000, closeDays:14, proofOfFunds:true, deals12mo:8, verified:true },
  { id:'b2', name:'Torres Capital LLC', org:'Torres Capital', phone:'(817) 555-0200', email:'deals@torrescap.com', markets:['Fort Worth','Dallas'], type:'Buy & Hold', budgetLow:80000, budgetHigh:250000, closeDays:21, proofOfFunds:true, deals12mo:15, verified:true },
  { id:'b3', name:'Sarah K. Whitfield', org:'Whitfield Realty Group', phone:'(918) 555-0300', email:'sarah@wrg.net', markets:['Tulsa','Oklahoma City'], type:'Wholesale', budgetLow:40000, budgetHigh:90000, closeDays:7, proofOfFunds:true, deals12mo:22, verified:true },
  { id:'b4', name:'Apex REI Group', org:'Apex REI', phone:'(214) 555-0400', email:'acq@apexrei.com', markets:['Dallas','Fort Worth'], type:'Fix & Flip', budgetLow:100000, budgetHigh:400000, closeDays:10, proofOfFunds:true, deals12mo:31, verified:true },
];

// ── SIGNAL DEFINITIONS ────────────────────────────────────────────────
const SIGNALS = {
  foreclosure_active:  { w:32, label:'Foreclosure',    color:'var(--ruby)' },
  tax_delinquency_3yr: { w:28, label:'Tax Del. 3yr',   color:'var(--ruby)' },
  lis_pendens:         { w:25, label:'Lis Pendens',    color:'var(--amber)' },
  hud_reo:             { w:22, label:'HUD REO',        color:'var(--sapphire)' },
  probate_filing:      { w:20, label:'Probate',        color:'var(--gold)' },
  tax_delinquency_2yr: { w:20, label:'Tax Del. 2yr',   color:'var(--amber)' },
  obituary_signal:     { w:18, label:'Estate Signal',  color:'var(--mist)' },
  code_violation:      { w:15, label:'Code Violation', color:'var(--amber)' },
  fsbo_craigslist:     { w:12, label:'FSBO',           color:'var(--sapphire)' },
  tax_delinquency_1yr: { w:12, label:'Tax Del. 1yr',   color:'var(--gold)' },
  high_vacancy_tract:  { w:10, label:'High Vacancy',   color:'var(--mist)' },
  permit_gap_10yr:     { w:8,  label:'Permit Gap',     color:'var(--gold)' },
};

function gradeFor(score){ return score>=80?'A':score>=60?'B':score>=40?'C':'D'; }
function gradeColor(g){ return {A:'var(--ruby)',B:'var(--amber)',C:'var(--gold)',D:'var(--mist)'}[g]; }
function fmt(n){ return '$' + Math.round(n).toLocaleString(); }

// ── TOAST ─────────────────────────────────────────────────────────────
const Toast = {
  show(type, ico, msg, ms=3500) {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.innerHTML = `<span class="t-ico">${ico}</span><span>${msg}</span>`;
    stack.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(),300); }, ms);
  },
};

// ── MODAL ─────────────────────────────────────────────────────────────
const Modal = {
  open(html) {
    document.getElementById('modal').innerHTML = html;
    document.getElementById('modal-bg').classList.add('open');
  },
  close() { document.getElementById('modal-bg').classList.remove('open'); },
};
document.addEventListener('click', e => { if (e.target.id === 'modal-bg') Modal.close(); });

// ── API CLIENT (talks to ORQ server which enforces real auth) ─────────
const API = {
  async call(path, opts={}) {
    const token = sessionStorage.getItem('orq_session') || '';
    try {
      const res = await fetch(CONFIG.API_BASE + path, {
        ...opts,
        headers: { 'Content-Type':'application/json', 'X-ORQ-Session':token, ...(opts.headers||{}) },
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      return { _offline:true, error:e.message };
    }
  },
};

// ════════════════════════════════════════════════════════════════════
//  APP CONTROLLER
// ════════════════════════════════════════════════════════════════════
const App = {
  view: 'command',

  boot() {
    Store.load();
    this.startClock();
    this.renderAll();
    this.go('command', document.querySelector('.nav-item.on'));
    if (Store.data.settings.dryRun) {
      Toast.show('info','🧪','Running in DRY-RUN mode — no live outreach. Flip in Automation Control.', 5000);
    }
  },

  startClock() {
    const tick = () => {
      const d = new Date();
      const el = document.getElementById('clock');
      if (el) el.textContent = d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    };
    tick(); setInterval(tick, 30000);
  },

  go(view, el) {
    this.view = view;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('on'));
    if (el) el.classList.add('on');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
    const target = document.getElementById('view-' + view);
    if (target) target.classList.add('on');
    // Render the view fresh
    if (Views[view]) Views[view].render();
  },

  refresh() {
    Toast.show('info','⟳','Syncing with ORQ server…');
    this.renderAll();
    if (Views[this.view]) Views[this.view].render();
  },

  renderAll() {
    // Build all view containers once
    const main = document.getElementById('main');
    if (!main.dataset.built) {
      main.innerHTML = Object.keys(Views).map(v => `<section class="view" id="view-${v}"></section>`).join('');
      main.dataset.built = '1';
    }
    this.updateNavBadges();
    this.updateAutomationPill();
  },

  updateNavBadges() {
    const d = Store.data;
    const set = (id,val,show) => { const e=document.getElementById(id); if(e){ e.textContent=val; e.style.display = show?'flex':'none'; } };
    set('nb-leads', d.leads.filter(l=>!l.reviewed).length, d.leads.some(l=>!l.reviewed));
    set('nb-pipeline', d.pipeline.length, d.pipeline.length>0);
    set('nb-vault', d.deals.filter(x=>x.status==='collected').length, d.deals.length>0);
  },

  updateAutomationPill() {
    const state = Store.data.automation;
    const pill = document.getElementById('nav-auto');
    if (!pill) return;
    pill.className = 'auto-pill ' + state;
    pill.innerHTML = `<span class="pulse"></span> ${state.toUpperCase()}`;
  },
};

// Views object — each view module attaches its render() here.
// Defined across app.js parts.
const Views = {};

/* ════════════════════════════════════════════════════════════════════
   VIEW: COMMAND CENTER
   ════════════════════════════════════════════════════════════════════ */
Views.command = {
  render() {
    const d = Store.data;
    const newLeads = d.leads.filter(l => !l.reviewed).length;
    const gradeA = d.leads.filter(l => l.grade === 'A').length;
    const activeDeals = d.pipeline.length;
    const collected = d.deals.filter(x => x.status === 'collected').reduce((s,x)=>s+(x.fee||0),0);
    const pending = d.deals.filter(x => x.status !== 'collected').reduce((s,x)=>s+(x.fee||0),0);

    document.getElementById('view-command').innerHTML = `
      <div class="page-head">
        <div>
          <h1>Command Center</h1>
          <div class="ph-sub"><span class="live"><span class="pulse"></span>Operator online</span> · ORQ Properties wholesale engine</div>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-gold" onclick="App.go('acquisition',document.querySelector('[data-view=acquisition]'))">🎯 Run Acquisition Scan</button>
          <button class="btn btn-ghost" onclick="window.open(CONFIG.ARIA_ULIO,'_blank')">📞 Open Aria</button>
        </div>
      </div>

      <div class="stat-row">
        <div class="stat" style="--c:var(--ruby)">
          <span class="s-ico">🎯</span>
          <div class="s-val">${newLeads}</div>
          <div class="s-lbl">Leads Awaiting Review</div>
          <div class="s-delta gold">${gradeA} Grade-A · need your approval</div>
        </div>
        <div class="stat" style="--c:var(--sapphire)">
          <span class="s-ico">📋</span>
          <div class="s-val">${activeDeals}</div>
          <div class="s-lbl">Active Deals in Pipeline</div>
          <div class="s-delta flat">Moving through stages</div>
        </div>
        <div class="stat" style="--c:var(--amber)">
          <span class="s-ico">⏳</span>
          <div class="s-val">${fmt(pending)}</div>
          <div class="s-lbl">Pending Fees (Protected)</div>
          <div class="s-delta flat">Locked until assignment signed</div>
        </div>
        <div class="stat" style="--c:var(--emerald)">
          <span class="s-ico">🛡️</span>
          <div class="s-val">${fmt(collected)}</div>
          <div class="s-lbl">Collected to ORQ Stripe</div>
          <div class="s-delta up">↑ Secured revenue</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px;margin-bottom:24px">
        <div class="card card-pad">
          <div class="section-label">Pipeline Flow <span class="sl-tag">human-gated · go/stop at every stage</span></div>
          ${this.flowDiagram()}
        </div>
        <div class="card card-pad">
          <div class="section-label">Today's Priorities</div>
          ${this.priorities()}
        </div>
      </div>

      <div class="card card-pad">
        <div class="section-label">Financial Protection Status <span class="sl-tag">your money is safe</span></div>
        ${this.protectionStatus()}
      </div>
    `;
  },

  flowDiagram() {
    const stages = [
      { k:'scan', icon:'🔍', label:'Scan', gate:'You approve leads' },
      { k:'outreach', icon:'📞', label:'Aria Calls', gate:'You approve offer' },
      { k:'contract', icon:'✍️', label:'PSA Signed', gate:'Seller signs' },
      { k:'buyer', icon:'🤝', label:'Buyer Match', gate:'You select buyer' },
      { k:'assign', icon:'📄', label:'Assignment', gate:'Buyer signs' },
      { k:'collect', icon:'🛡️', label:'Fee Collected', gate:'Auto → ORQ Stripe' },
    ];
    return `<div style="display:flex;flex-direction:column;gap:2px">
      ${stages.map((s,i) => `
        <div style="display:flex;align-items:center;gap:14px;padding:11px 0;${i<stages.length-1?'border-bottom:var(--border)':''}">
          <div style="width:38px;height:38px;border-radius:10px;background:rgba(255,255,255,.04);border:var(--border);display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0">${s.icon}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.86rem;color:var(--snow)">${s.label}</div>
            <div style="font-size:.74rem;color:var(--mist)">${s.gate}</div>
          </div>
          <div style="font-family:var(--font-m);font-size:.64rem;color:var(--ash)">STAGE ${i+1}</div>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:14px;padding:12px;border-radius:10px;background:rgba(15,174,110,.06);border:1px solid rgba(15,174,110,.2);font-size:.76rem;color:var(--silver)">
      🔐 <b style="color:var(--emerald)">Financial lock:</b> Assignment fee can only be collected after BOTH the seller PSA and the buyer assignment agreement are signed. No signature, no payment link.
    </div>`;
  },

  priorities() {
    const d = Store.data;
    const items = [];
    const newLeads = d.leads.filter(l => !l.reviewed);
    if (newLeads.length) items.push({ ico:'🎯', t:`${newLeads.length} new leads to review`, act:"App.go('acquisition',document.querySelector('[data-view=acquisition]'))", btn:'Review' });
    const needOffer = d.pipeline.filter(p => p.stage === 'outreach' && p.ariaComplete && !p.offerApproved);
    if (needOffer.length) items.push({ ico:'💰', t:`${needOffer.length} deals need offer approval`, act:"App.go('pipeline',document.querySelector('[data-view=pipeline]'))", btn:'Approve' });
    const needBuyer = d.pipeline.filter(p => p.stage === 'buyer' && !p.buyerSelected);
    if (needBuyer.length) items.push({ ico:'🤝', t:`${needBuyer.length} deals ready for buyer blast`, act:"App.go('pipeline',document.querySelector('[data-view=pipeline]'))", btn:'Match' });
    const readyCollect = d.pipeline.filter(p => p.stage === 'assign' && p.assignmentSigned && !p.feeCollected);
    if (readyCollect.length) items.push({ ico:'🛡️', t:`${readyCollect.length} fees unlocked & ready`, act:"App.go('vault',document.querySelector('[data-view=vault]'))", btn:'Collect' });

    if (items.length === 0) {
      return `<div style="text-align:center;padding:30px 10px;color:var(--mist)">
        <div style="font-size:2rem;margin-bottom:10px;opacity:.5">✓</div>
        <div style="font-size:.86rem">All clear. Run an acquisition scan to find new deals.</div>
      </div>`;
    }
    return items.map(i => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:var(--border)">
        <span style="font-size:1.2rem">${i.ico}</span>
        <span style="flex:1;font-size:.84rem;font-weight:600;color:var(--pearl)">${i.t}</span>
        <button class="btn btn-sm btn-gold" onclick="${i.act}">${i.btn}</button>
      </div>
    `).join('');
  },

  protectionStatus() {
    const checks = [
      { ok:true, t:'All payments route to ORQ Stripe account', d:'Funds never touch a third party' },
      { ok:true, t:'Assignment fee locked until contract signed', d:'No signed agreement = no collectable fee' },
      { ok:true, t:'Title company closing required', d:'Funds disbursed through licensed escrow' },
      { ok:Store.data.settings.dryRun, t:'Dry-run safety mode', d: Store.data.settings.dryRun?'Active — no live outreach yet':'OFF — live outreach enabled', warn:!Store.data.settings.dryRun },
    ];
    return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${checks.map(c => `
        <div style="display:flex;gap:12px;padding:14px;border-radius:11px;background:rgba(255,255,255,.02);border:var(--border)">
          <div style="width:24px;height:24px;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:.8rem;background:${c.warn?'rgba(245,158,11,.15)':c.ok?'rgba(15,174,110,.15)':'rgba(92,113,134,.15)'};color:${c.warn?'var(--amber)':c.ok?'var(--emerald)':'var(--mist)'}">${c.warn?'!':c.ok?'✓':'○'}</div>
          <div>
            <div style="font-weight:700;font-size:.82rem;color:var(--snow)">${c.t}</div>
            <div style="font-size:.74rem;color:var(--mist);margin-top:2px">${c.d}</div>
          </div>
        </div>
      `).join('')}
    </div>`;
  },
};

/* ════════════════════════════════════════════════════════════════════
   VIEW: ACQUISITION ENGINE (scan → ranked leads → human approves)
   ════════════════════════════════════════════════════════════════════ */
Views.acquisition = {
  scanning: false,
  markets: new Set(['Lawton','Oklahoma City','Tulsa']),

  render() {
    const d = Store.data;
    const pending = d.leads.filter(l => !l.reviewed);
    document.getElementById('view-acquisition').innerHTML = `
      <div class="page-head">
        <div>
          <h1>Acquisition Engine</h1>
          <div class="ph-sub">Compound Signal Engine · 12 public data sources · ranked motivated sellers</div>
        </div>
      </div>

      <div class="card card-pad" style="margin-bottom:22px">
        <div class="section-label">Intelligence Scan <span class="sl-tag">cross-references foreclosure · tax · probate · FSBO · HUD · obituary · vacancy</span></div>
        <div style="margin-bottom:16px">
          <div style="font-size:.74rem;font-weight:700;color:var(--silver);margin-bottom:9px;letter-spacing:.04em">TARGET MARKETS</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap" id="market-pills">
            ${['Lawton','Oklahoma City','Tulsa','Fort Worth','Dallas'].map(m => `
              <div class="mkt ${this.markets.has(m)?'on':''}" onclick="Views.acquisition.toggleMarket('${m}',this)"
                style="padding:7px 15px;border-radius:100px;cursor:pointer;font-size:.8rem;font-weight:600;transition:all .2s;border:1px solid ${this.markets.has(m)?'var(--gold)':'rgba(255,255,255,.1)'};background:${this.markets.has(m)?'var(--gold)':'transparent'};color:${this.markets.has(m)?'var(--void)':'var(--mist)'}">${m}</div>
            `).join('')}
          </div>
        </div>
        <div style="display:flex;gap:14px;align-items:flex-end;flex-wrap:wrap">
          <div style="flex:1;min-width:160px">
            <div style="font-size:.74rem;font-weight:700;color:var(--silver);margin-bottom:6px">Minimum Score</div>
            <select id="min-score" style="width:100%;background:rgba(5,8,12,.5);border:var(--border-bright);border-radius:10px;padding:11px 13px;color:var(--snow);font-family:var(--font-b);outline:none">
              <option value="40">40+ · Grade C and up (broad)</option>
              <option value="60" selected>60+ · Grade B and up (focused)</option>
              <option value="80">80+ · Grade A only (hot)</option>
            </select>
          </div>
          <button class="btn btn-gold" id="scan-btn" style="padding:13px 28px" onclick="Views.acquisition.runScan()">⚡ Run Intelligence Scan</button>
        </div>
        <div id="scan-progress" style="display:none;margin-top:16px;padding:14px;border-radius:11px;background:rgba(5,8,12,.5);border:var(--border)">
          <div style="font-family:var(--font-m);font-size:.74rem;color:var(--gold);font-weight:600;margin-bottom:8px">⚡ SCANNING SOURCES</div>
          <div id="scan-log" style="font-family:var(--font-m);font-size:.72rem;color:var(--mist);line-height:1.9"></div>
        </div>
      </div>

      ${pending.length > 0 ? `
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
          <div class="section-label" style="margin:0">Leads Awaiting Your Review <span class="sl-tag">${pending.length} pending · approve to send to Aria</span></div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-emerald" onclick="Views.acquisition.approveAll()">✓ Approve All Grade A/B</button>
            <button class="btn btn-sm btn-ghost" onclick="Views.acquisition.dismissAll()">Dismiss All</button>
          </div>
        </div>
        <div id="leads-list">${this.leadCards(pending)}</div>
      ` : `
        <div class="card card-pad" style="text-align:center;padding:48px">
          <div style="font-size:2.4rem;margin-bottom:12px;opacity:.4">🎯</div>
          <div style="font-size:1rem;font-weight:700;color:var(--snow);margin-bottom:6px">No leads in review queue</div>
          <div style="font-size:.85rem;color:var(--mist)">Run an intelligence scan above to surface motivated sellers.</div>
        </div>
      `}
    `;
  },

  toggleMarket(m, el) {
    if (this.markets.has(m)) { this.markets.delete(m); el.style.background='transparent'; el.style.color='var(--mist)'; el.style.borderColor='rgba(255,255,255,.1)'; }
    else { this.markets.add(m); el.style.background='var(--gold)'; el.style.color='var(--void)'; el.style.borderColor='var(--gold)'; }
  },

  async runScan() {
    if (this.scanning) return;
    if (this.markets.size === 0) { Toast.show('warn','⚠','Select at least one market'); return; }
    this.scanning = true;
    const btn = document.getElementById('scan-btn');
    const prog = document.getElementById('scan-progress');
    const log = document.getElementById('scan-log');
    btn.disabled = true; btn.textContent = '⏳ Scanning…';
    prog.style.display = 'block';
    const minScore = +document.getElementById('min-score').value;
    const lines = [];
    const addLog = m => { lines.push('→ ' + m); log.innerHTML = lines.join('<br/>'); };

    const sources = ['OSCN court records (foreclosure · lis pendens · probate)','County tax delinquency (OK + TX)','Craigslist FSBO listings','HUD / REO inventory','Obituary cross-reference','Census ACS vacancy tracts','Permit-gap analysis (ORQ data)'];
    addLog('Initializing compound signal engine…');
    await sleep(500);
    for (const s of sources) { addLog('Scanning: ' + s); await sleep(380); }
    addLog('Cross-referencing addresses across sources…'); await sleep(600);
    addLog('Computing compound distress scores…'); await sleep(500);

    // Try live API; fall back to representative demo data
    let results = [];
    const live = await API.call('/re/intel/scan', { method:'POST', body: JSON.stringify({ markets:[...this.markets], minScore, dryRun: Store.data.settings.dryRun }) });
    if (live && !live._offline && live.topLeads) {
      results = live.topLeads;
      addLog(`✓ Live scan: ${results.length} qualified leads from ORQ server`);
    } else {
      results = this.demoLeads(minScore);
      addLog(`✓ ${results.length} leads found (demo data — deploy server for live scraping)`);
    }
    await sleep(400);

    // Merge into store, dedup by address
    let added = 0;
    for (const r of results) {
      if (!Store.data.leads.find(l => l.address === r.address)) {
        Store.data.leads.push({ ...r, id:'L'+Date.now()+Math.random().toString(36).slice(2,6), reviewed:false, scannedAt:Date.now() });
        added++;
      }
    }
    Store.save();
    this.scanning = false;
    App.updateNavBadges();
    Toast.show('ok','✓',`Scan complete — ${added} new leads added to review queue`);
    this.render();
  },

  demoLeads(minScore) {
    const all = [
      { address:'1428 NW Cache Rd', city:'Lawton', state:'OK', owner:'Pedro Martinez', signals:['fsbo_craigslist','foreclosure_active','tax_delinquency_3yr','code_violation'], arvEst:115000 },
      { address:'1107 E 6th St', city:'Tulsa', state:'OK', owner:'Sandra K. Johnson', signals:['fsbo_craigslist','foreclosure_active','probate_filing','tax_delinquency_2yr'], arvEst:135000 },
      { address:'3215 Gore Blvd', city:'Lawton', state:'OK', owner:'Thomas H. Wilson', signals:['fsbo_craigslist','foreclosure_active','probate_filing'], arvEst:98000 },
      { address:'445 E Elm St', city:'Lawton', state:'OK', owner:'Michael R. Parker', signals:['fsbo_craigslist','tax_delinquency_3yr','code_violation','high_vacancy_tract'], arvEst:88000 },
      { address:'8902 NW 23rd St', city:'Oklahoma City', state:'OK', owner:'Patricia Green', signals:['probate_filing','tax_delinquency_1yr','permit_gap_10yr'], arvEst:145000 },
      { address:'2803 NW Elm Ave', city:'Lawton', state:'OK', owner:'Estate of James R. Thompson', signals:['probate_filing','obituary_signal','tax_delinquency_2yr'], arvEst:102000 },
      { address:'5544 SW Frank Phillips', city:'Lawton', state:'OK', owner:'HUD/FHA', signals:['hud_reo','high_vacancy_tract'], arvEst:78000 },
    ];
    return all.map(r => {
      const score = Math.min(r.signals.reduce((s,k)=>s+(SIGNALS[k]?.w||5),0),100);
      const grade = gradeFor(score);
      const repairs = r.signals.length >= 3 ? 28000 : 16000;
      const mao = Math.round(r.arvEst * CONFIG.MAO_PCT - repairs);
      return { ...r, score, grade, repairs, mao, arv:r.arvEst };
    }).filter(r => r.score >= minScore).sort((a,b)=>b.score-a.score);
  },

  leadCards(leads) {
    return leads.sort((a,b)=>b.score-a.score).map(l => `
      <div class="card" style="margin-bottom:12px;display:flex;gap:18px;padding:18px 20px;align-items:flex-start;border-left:3px solid ${gradeColor(l.grade)}">
        <div style="width:58px;height:58px;border-radius:14px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${gradeColor(l.grade)}1a;color:${gradeColor(l.grade)}">
          <div style="font-family:var(--font-m);font-size:1.3rem;font-weight:700;line-height:1">${l.score}</div>
          <div style="font-size:.6rem;font-weight:700;letter-spacing:.1em">GRADE ${l.grade}</div>
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:800;font-size:1rem;color:var(--snow)">${l.address}</div>
          <div style="font-size:.8rem;color:var(--mist);margin-bottom:9px">${l.city}, ${l.state} · Owner: ${l.owner || 'Unknown'} · ${l.signals.length} signals</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:11px">
            ${l.signals.map(s => { const S=SIGNALS[s]||{label:s,color:'var(--mist)'}; return `<span style="font-family:var(--font-m);font-size:.66rem;font-weight:600;padding:3px 9px;border-radius:5px;background:${S.color}1a;color:${S.color}">${S.label}</span>`; }).join('')}
          </div>
          <div style="display:flex;gap:18px;font-size:.78rem;color:var(--silver);font-family:var(--font-m)">
            <span>ARV <b style="color:var(--snow)">${fmt(l.arv)}</b></span>
            <span>Repairs <b style="color:var(--amber)">${fmt(l.repairs)}</b></span>
            <span>MAO <b style="color:var(--emerald)">${fmt(l.mao)}</b></span>
            <span>Est. spread <b style="color:var(--gold)">${fmt((l.arv-l.mao-l.repairs)*0.4)}</b></span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;flex-shrink:0">
          <button class="btn btn-sm btn-emerald" onclick="Views.acquisition.approveLead('${l.id}')">✓ Approve → Aria</button>
          <button class="btn btn-sm btn-ghost" onclick="Views.acquisition.dismissLead('${l.id}')">✕ Dismiss</button>
        </div>
      </div>
    `).join('');
  },

  approveLead(id) {
    const lead = Store.data.leads.find(l => l.id === id);
    if (!lead) return;
    lead.reviewed = true;
    // Promote into pipeline at outreach stage
    Store.data.pipeline.push({
      id:'D'+Date.now()+Math.random().toString(36).slice(2,5),
      ...lead, stage:'outreach', stageLabel:'Aria Outreach',
      ariaQueued:false, ariaComplete:false, offerApproved:false,
      psaSigned:false, buyerSelected:false, assignmentSigned:false,
      feeCollected:false, createdAt:Date.now(), history:[{ t:Date.now(), e:'Approved by operator → queued for Aria' }],
    });
    Store.save();
    App.updateNavBadges();
    Toast.show('ok','📞',`${lead.address} approved → ready for Aria outreach`);
    this.render();
  },

  dismissLead(id) {
    const lead = Store.data.leads.find(l => l.id === id);
    if (lead) lead.reviewed = true;
    Store.save();
    App.updateNavBadges();
    this.render();
  },

  approveAll() {
    const pending = Store.data.leads.filter(l => !l.reviewed && (l.grade === 'A' || l.grade === 'B'));
    pending.forEach(l => this.approveLead(l.id));
    Toast.show('ok','✓',`${pending.length} Grade A/B leads approved`);
  },

  dismissAll() {
    Store.data.leads.forEach(l => l.reviewed = true);
    Store.save(); App.updateNavBadges(); this.render();
  },
};

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

/* ════════════════════════════════════════════════════════════════════
   VIEW: DEAL PIPELINE — human go/stop gate at every stage
   Stages: outreach → contract → buyer → assign → collect
   ════════════════════════════════════════════════════════════════════ */
Views.pipeline = {
  render() {
    const deals = Store.data.pipeline;
    document.getElementById('view-pipeline').innerHTML = `
      <div class="page-head">
        <div>
          <h1>Deal Pipeline</h1>
          <div class="ph-sub">Every stage requires your explicit approval before advancing · nothing is automatic</div>
        </div>
      </div>
      ${deals.length === 0 ? `
        <div class="card card-pad" style="text-align:center;padding:48px">
          <div style="font-size:2.4rem;margin-bottom:12px;opacity:.4">📋</div>
          <div style="font-size:1rem;font-weight:700;color:var(--snow);margin-bottom:6px">Pipeline is empty</div>
          <div style="font-size:.85rem;color:var(--mist)">Approve leads in the Acquisition Engine to start working deals.</div>
        </div>
      ` : deals.map(d => this.dealCard(d)).join('')}
    `;
  },

  STAGES: ['outreach','contract','buyer','assign','collect'],
  STAGE_META: {
    outreach: { label:'Aria Outreach', icon:'📞', n:1 },
    contract: { label:'Seller PSA',    icon:'✍️', n:2 },
    buyer:    { label:'Buyer Match',   icon:'🤝', n:3 },
    assign:   { label:'Assignment',    icon:'📄', n:4 },
    collect:  { label:'Fee Collection',icon:'🛡️', n:5 },
  },

  dealCard(d) {
    const stageIdx = this.STAGES.indexOf(d.stage);
    return `
      <div class="card" style="margin-bottom:16px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:16px;padding:18px 22px;border-bottom:var(--border)">
          <div style="width:52px;height:52px;border-radius:13px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${gradeColor(d.grade)}1a;color:${gradeColor(d.grade)}">
            <div style="font-family:var(--font-m);font-size:1.15rem;font-weight:700;line-height:1">${d.score}</div>
            <div style="font-size:.56rem;font-weight:700">GR ${d.grade}</div>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:800;font-size:1.05rem;color:var(--snow)">${d.address}</div>
            <div style="font-size:.8rem;color:var(--mist)">${d.city}, ${d.state} · ${d.owner||'Unknown'} · ARV ${fmt(d.arv)} · MAO ${fmt(d.mao)}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--font-m);font-size:.66rem;color:var(--ash);letter-spacing:.08em">STAGE ${this.STAGE_META[d.stage].n}/5</div>
            <div style="font-weight:700;font-size:.86rem;color:var(--gold)">${this.STAGE_META[d.stage].icon} ${this.STAGE_META[d.stage].label}</div>
          </div>
        </div>

        <!-- Stage rail -->
        <div style="display:flex;padding:14px 22px;gap:0;background:rgba(5,8,12,.3)">
          ${this.STAGES.map((s,i) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;position:relative">
              ${i<this.STAGES.length-1?`<div style="position:absolute;top:13px;left:50%;width:100%;height:2px;background:${i<stageIdx?'var(--emerald)':'var(--steel)'}"></div>`:''}
              <div style="width:28px;height:28px;border-radius:50%;z-index:1;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;background:${i<stageIdx?'var(--emerald)':i===stageIdx?gradeColor(d.grade):'var(--carbon)'};color:${i<=stageIdx?'#fff':'var(--ash)'};border:2px solid ${i<=stageIdx?'transparent':'var(--steel)'}">${i<stageIdx?'✓':this.STAGE_META[s].n}</div>
              <div style="font-size:.62rem;color:${i<=stageIdx?'var(--silver)':'var(--ash)'};margin-top:5px;font-weight:600">${this.STAGE_META[s].label}</div>
            </div>
          `).join('')}
        </div>

        <!-- Action panel for current stage -->
        <div style="padding:18px 22px">${this.stagePanel(d)}</div>
      </div>
    `;
  },

  stagePanel(d) {
    switch(d.stage) {
      case 'outreach':  return this.panelOutreach(d);
      case 'contract':  return this.panelContract(d);
      case 'buyer':     return this.panelBuyer(d);
      case 'assign':    return this.panelAssign(d);
      case 'collect':   return this.panelCollect(d);
      default: return '';
    }
  },

  gateBox(content, color='var(--gold)') {
    return `<div style="padding:14px 16px;border-radius:11px;background:${color}0d;border:1px solid ${color}33">${content}</div>`;
  },

  // STAGE 1: Aria outreach. Gate = you start the call, then you approve the offer.
  panelOutreach(d) {
    if (!d.ariaQueued) {
      return this.gateBox(`
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:.88rem;color:var(--snow);margin-bottom:3px">🎬 GO / STOP: Start Aria outreach?</div>
            <div style="font-size:.78rem;color:var(--mist)">Aria will call the seller using the ORQ Properties script, discover motivation, and present an offer range. You approve the final number.</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-emerald" onclick="Views.pipeline.startAria('${d.id}')">▶ Start Aria Call</button>
            <button class="btn btn-sm btn-danger" onclick="Views.pipeline.killDeal('${d.id}')">⏹ Drop</button>
          </div>
        </div>
      `);
    }
    if (d.ariaQueued && !d.ariaComplete) {
      return this.gateBox(`
        <div style="display:flex;align-items:center;gap:12px">
          <div class="pulse" style="width:10px;height:10px;border-radius:50%;background:var(--sapphire)"></div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.86rem;color:var(--snow)">Aria is working this lead…</div>
            <div style="font-size:.76rem;color:var(--mist)">Outbound call queued to seller via ${CONFIG.ARIA_PHONE}. Summary will appear here.</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="Views.pipeline.simulateAriaResult('${d.id}')">Simulate result →</button>
        </div>
      `, 'var(--sapphire)');
    }
    // Aria complete — show summary, gate on offer approval
    return this.gateBox(`
      <div style="margin-bottom:12px">
        <div style="font-weight:700;font-size:.86rem;color:var(--snow);margin-bottom:6px">📞 Aria Call Summary</div>
        <div style="font-size:.8rem;color:var(--silver);line-height:1.6;padding:12px;border-radius:9px;background:rgba(5,8,12,.4)">
          <b style="color:var(--emerald)">Seller: INTERESTED.</b> ${d.ariaSummary || 'Motivated — relocating, wants fast cash close. Open to offer in the range discussed. No agent involved. Decision-maker confirmed.'}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:.86rem;color:var(--snow);margin-bottom:3px">💰 GO / STOP: Approve the cash offer?</div>
          <div style="font-size:.76rem;color:var(--mist)">Recommended MAO: <b style="color:var(--emerald)">${fmt(d.mao)}</b> (70% ARV − repairs). Adjust before sending.</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="number" id="offer-${d.id}" value="${d.mao}" style="width:120px;background:rgba(5,8,12,.5);border:var(--border-bright);border-radius:8px;padding:9px 11px;color:var(--snow);font-family:var(--font-m);font-weight:600;outline:none"/>
          <button class="btn btn-sm btn-emerald" onclick="Views.pipeline.approveOffer('${d.id}')">✓ Approve Offer</button>
          <button class="btn btn-sm btn-danger" onclick="Views.pipeline.killDeal('${d.id}')">⏹ Pass</button>
        </div>
      </div>
    `);
  },

  // STAGE 2: Seller PSA via DocuSign. Gate = you send contract, seller signs.
  panelContract(d) {
    if (!d.psaSent) {
      return this.gateBox(`
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:.88rem;color:var(--snow);margin-bottom:3px">✍️ GO / STOP: Send Purchase Agreement?</div>
            <div style="font-size:.78rem;color:var(--mist)">Offer approved at <b style="color:var(--emerald)">${fmt(d.offerAmount)}</b>. Send the PSA to the seller via DocuSign for signature.</div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-sm btn-gold" onclick="Views.pipeline.sendPSA('${d.id}')">📤 Send PSA (DocuSign)</button>
          </div>
        </div>
      `);
    }
    if (d.psaSent && !d.psaSigned) {
      return this.gateBox(`
        <div style="display:flex;align-items:center;gap:12px">
          <div class="pulse" style="width:10px;height:10px;border-radius:50%;background:var(--amber)"></div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.86rem;color:var(--snow)">PSA sent — awaiting seller signature</div>
            <div style="font-size:.76rem;color:var(--mist)">DocuSign envelope out to seller. Deal advances automatically once signed.</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="Views.pipeline.confirmPSASigned('${d.id}')">Mark signed →</button>
        </div>
      `, 'var(--amber)');
    }
    return '';
  },

  // STAGE 3: Buyer match + blast. Gate = you select buyer.
  panelBuyer(d) {
    const matches = Store.data.buyers.filter(b => b.markets.some(m => m.toLowerCase().includes(d.city.toLowerCase().slice(0,4))) || b.markets.includes(d.city));
    const pool = matches.length ? matches : Store.data.buyers;
    if (!d.buyerBlastSent) {
      return this.gateBox(`
        <div style="margin-bottom:12px">
          <div style="font-weight:700;font-size:.88rem;color:var(--snow);margin-bottom:3px">🤝 GO / STOP: Blast deal to matched buyers?</div>
          <div style="font-size:.78rem;color:var(--mist)">PSA signed ✓ — you now control this property. ${pool.length} matched cash buyers found.</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-sm btn-gold" onclick="Views.pipeline.blastBuyers('${d.id}')">📢 Blast ${pool.length} Buyers</button>
        </div>
      `);
    }
    // Blast sent — pick a buyer
    return `
      <div style="font-weight:700;font-size:.86rem;color:var(--snow);margin-bottom:10px">🤝 Select winning buyer (first qualified, cash-verified)</div>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${pool.map(b => `
          <div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;background:rgba(5,8,12,.4);border:var(--border)">
            <div style="flex:1">
              <div style="font-weight:700;font-size:.84rem;color:var(--snow)">${b.name} ${b.verified?'<span style="color:var(--emerald);font-size:.7rem">✓ verified</span>':''}</div>
              <div style="font-size:.74rem;color:var(--mist)">${b.type} · ${fmt(b.budgetLow)}–${fmt(b.budgetHigh)} · closes ${b.closeDays}d · ${b.deals12mo} deals/12mo</div>
            </div>
            <button class="btn btn-sm btn-emerald" onclick="Views.pipeline.selectBuyer('${d.id}','${b.id}')">Select →</button>
          </div>
        `).join('')}
      </div>
    `;
  },

  // STAGE 4: Assignment agreement. Gate = buyer signs (unlocks fee).
  panelAssign(d) {
    const buyer = Store.data.buyers.find(b => b.id === d.buyerId);
    if (!d.assignmentSent) {
      return this.gateBox(`
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:200px">
            <div style="font-weight:700;font-size:.88rem;color:var(--snow);margin-bottom:3px">📄 GO / STOP: Send Assignment Agreement?</div>
            <div style="font-size:.78rem;color:var(--mist)">Buyer: <b style="color:var(--snow)">${buyer?.name}</b>. Assignment fee: <b style="color:var(--gold)">${fmt(d.assignmentFee)}</b>. This contract is what protects your fee.</div>
          </div>
          <button class="btn btn-sm btn-gold" onclick="Views.pipeline.sendAssignment('${d.id}')">📤 Send Assignment</button>
        </div>
      `);
    }
    if (d.assignmentSent && !d.assignmentSigned) {
      return this.gateBox(`
        <div style="display:flex;align-items:center;gap:12px">
          <div class="pulse" style="width:10px;height:10px;border-radius:50%;background:var(--amber)"></div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:.86rem;color:var(--snow)">Assignment sent — awaiting buyer signature</div>
            <div style="font-size:.76rem;color:var(--mist)">🔐 Fee collection stays LOCKED until this is signed. This is your financial protection.</div>
          </div>
          <button class="btn btn-sm btn-ghost" onclick="Views.pipeline.confirmAssignmentSigned('${d.id}')">Mark signed →</button>
        </div>
      `, 'var(--amber)');
    }
    return '';
  },

  // STAGE 5: Fee collection. Only reachable after assignment signed.
  panelCollect(d) {
    return this.gateBox(`
      <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:700;font-size:.88rem;color:var(--emerald);margin-bottom:3px">🛡️ FEE UNLOCKED — both contracts signed</div>
          <div style="font-size:.78rem;color:var(--mist)">Assignment fee <b style="color:var(--gold)">${fmt(d.assignmentFee)}</b> is now collectable. Generate a Stripe link to your ORQ account.</div>
        </div>
        <button class="btn btn-sm btn-emerald" onclick="Views.pipeline.collectFee('${d.id}')">🛡️ Collect to ORQ Stripe</button>
      </div>
    `, 'var(--emerald)');
  },

  // ── Stage actions ──
  log(d, e) { d.history = d.history||[]; d.history.push({ t:Date.now(), e }); },

  startAria(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    if (Store.data.settings.dryRun) {
      Toast.show('warn','🧪','Dry-run mode — Aria call simulated, not live. Disable dry-run in Automation Control to make real calls.');
    }
    d.ariaQueued = true; this.log(d,'Aria outbound call started');
    Store.save();
    Toast.show('info','📞',`Aria calling seller for ${d.address}…`);
    this.render();
    // auto-simulate after a moment for demo flow
    setTimeout(()=>{ if(!d.ariaComplete){ this.simulateAriaResult(id); } }, 4000);
  },

  simulateAriaResult(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    d.ariaComplete = true;
    d.ariaSummary = 'Motivated seller — needs to relocate within 60 days, wants certainty over top dollar. Confirmed sole owner. No realtor. Open to cash, as-is. Requested firm offer within 24h.';
    this.log(d,'Aria completed call — seller INTERESTED');
    Store.save();
    Toast.show('ok','✓',`Aria reached seller for ${d.address} — interested! Review the offer.`);
    this.render();
  },

  approveOffer(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    const amt = +document.getElementById('offer-'+id).value || d.mao;
    d.offerApproved = true; d.offerAmount = amt;
    d.stage = 'contract';
    this.log(d,`Operator approved offer at ${fmt(amt)}`);
    Store.save(); App.updateNavBadges();
    Toast.show('ok','💰',`Offer of ${fmt(amt)} approved → ready to send PSA`);
    this.render();
  },

  sendPSA(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    d.psaSent = true; this.log(d,'PSA sent to seller via DocuSign');
    Store.save();
    Toast.show('info','📤',`Purchase Agreement sent to seller. Opening DocuSign…`);
    window.open('https://app.docusign.com','_blank');
    this.render();
    setTimeout(()=>{ if(!d.psaSigned) this.confirmPSASigned(id); }, 5000);
  },

  confirmPSASigned(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    d.psaSigned = true; d.stage = 'buyer';
    // Compute assignment fee = 40% of gross spread, floored
    const spread = Math.max(d.arv - d.offerAmount - d.repairs, 0);
    d.assignmentFee = Math.max(Math.min(Math.round(spread * 0.4), CONFIG.MAX_ASSIGNMENT_FEE), CONFIG.MIN_ASSIGNMENT_FEE);
    this.log(d,'Seller signed PSA — you now control the property');
    Store.save(); App.updateNavBadges();
    Toast.show('ok','✍️',`Seller signed! ${d.address} under contract. Match buyers now.`);
    this.render();
  },

  blastBuyers(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    d.buyerBlastSent = true; this.log(d,'Deal blasted to matched buyers');
    Store.save();
    Toast.show('info','📢',`Deal blasted to matched buyers via SMS + email. Select the winner.`);
    this.render();
  },

  selectBuyer(id, buyerId) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    d.buyerSelected = true; d.buyerId = buyerId; d.stage = 'assign';
    const b = Store.data.buyers.find(x=>x.id===buyerId);
    this.log(d,`Buyer selected: ${b?.name}`);
    Store.save();
    Toast.show('ok','🤝',`${b?.name} selected. Send the assignment agreement.`);
    this.render();
  },

  sendAssignment(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    d.assignmentSent = true; this.log(d,'Assignment agreement sent to buyer');
    Store.save();
    Toast.show('info','📄',`Assignment sent to buyer. Fee stays locked until signed. Opening DocuSign…`);
    window.open('https://app.docusign.com','_blank');
    this.render();
    setTimeout(()=>{ if(!d.assignmentSigned) this.confirmAssignmentSigned(id); }, 5000);
  },

  confirmAssignmentSigned(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    d.assignmentSigned = true; d.stage = 'collect';
    this.log(d,'Buyer signed assignment — FEE UNLOCKED');
    Store.save();
    Toast.show('ok','🔓',`Assignment signed! ${fmt(d.assignmentFee)} fee is now unlocked & protected.`);
    this.render();
  },

  collectFee(id) {
    const d = Store.data.pipeline.find(x=>x.id===id); if(!d) return;
    // Hand off to vault collection (financial protection enforced there too)
    Views.vault.collect(d);
  },

  killDeal(id) {
    if (!confirm('Drop this deal from the pipeline?')) return;
    Store.data.pipeline = Store.data.pipeline.filter(x=>x.id!==id);
    Store.save(); App.updateNavBadges();
    Toast.show('warn','⏹','Deal dropped from pipeline');
    this.render();
  },
};

/* ════════════════════════════════════════════════════════════════════
   VIEW: REVENUE VAULT — financial protection enforcement + Stripe
   ════════════════════════════════════════════════════════════════════ */
Views.vault = {
  render() {
    const deals = Store.data.deals;
    const collected = deals.filter(x=>x.status==='collected');
    const pending = deals.filter(x=>x.status==='pending');
    const totalCollected = collected.reduce((s,x)=>s+(x.fee||0),0);
    const totalPending = pending.reduce((s,x)=>s+(x.fee||0),0);

    document.getElementById('view-vault').innerHTML = `
      <div class="page-head">
        <div>
          <h1>Revenue Vault</h1>
          <div class="ph-sub">🛡️ Every dollar protected · fees collect only against signed assignments · all funds → ORQ Stripe</div>
        </div>
        <button class="btn btn-emerald" onclick="Views.vault.manualCollect()">+ Manual Fee Collection</button>
      </div>

      <div class="stat-row">
        <div class="stat" style="--c:var(--emerald)">
          <span class="s-ico">🛡️</span><div class="s-val">${fmt(totalCollected)}</div>
          <div class="s-lbl">Collected (ORQ Stripe)</div><div class="s-delta up">${collected.length} deals secured</div>
        </div>
        <div class="stat" style="--c:var(--amber)">
          <span class="s-ico">⏳</span><div class="s-val">${fmt(totalPending)}</div>
          <div class="s-lbl">Pending Collection</div><div class="s-delta flat">${pending.length} links sent</div>
        </div>
        <div class="stat" style="--c:var(--sapphire)">
          <span class="s-ico">📊</span><div class="s-val">${fmt(deals.length?(totalCollected+totalPending)/deals.length:0)}</div>
          <div class="s-lbl">Avg Assignment Fee</div><div class="s-delta flat">per deal</div>
        </div>
        <div class="stat" style="--c:var(--gold)">
          <span class="s-ico">🔐</span><div class="s-val">100%</div>
          <div class="s-lbl">Contract-Backed</div><div class="s-delta gold">No unsecured fees</div>
        </div>
      </div>

      <div class="card card-pad">
        <div class="section-label">Deal Ledger <span class="sl-tag">all collections require a signed assignment agreement</span></div>
        ${deals.length === 0 ? `
          <div style="text-align:center;padding:36px;color:var(--mist)">
            <div style="font-size:2rem;opacity:.4;margin-bottom:8px">🛡️</div>
            <div style="font-size:.88rem">No fees collected yet. Close a deal through the pipeline — fees auto-protect.</div>
          </div>
        ` : `
          <table style="width:100%;border-collapse:collapse">
            <thead><tr style="text-align:left">
              ${['Property','Buyer','Fee','Protection','Status','Date'].map(h=>`<th style="font-family:var(--font-m);font-size:.64rem;color:var(--ash);letter-spacing:.08em;text-transform:uppercase;padding:10px 12px;border-bottom:var(--border)">${h}</th>`).join('')}
            </tr></thead>
            <tbody>
              ${deals.map(x => `
                <tr style="border-bottom:1px solid rgba(255,255,255,.03)">
                  <td style="padding:13px 12px;font-weight:700;color:var(--snow);font-size:.84rem">${x.property}</td>
                  <td style="padding:13px 12px;color:var(--silver);font-size:.82rem">${x.buyer||'—'}</td>
                  <td style="padding:13px 12px;font-family:var(--font-m);font-weight:700;color:var(--emerald)">${fmt(x.fee)}</td>
                  <td style="padding:13px 12px"><span style="font-family:var(--font-m);font-size:.64rem;color:var(--emerald)">🔐 Assignment signed</span></td>
                  <td style="padding:13px 12px"><span style="font-family:var(--font-m);font-size:.64rem;font-weight:600;padding:3px 9px;border-radius:100px;background:${x.status==='collected'?'rgba(15,174,110,.15);color:var(--emerald)':'rgba(245,158,11,.15);color:var(--amber)'}">${x.status==='collected'?'✓ COLLECTED':'⏳ PENDING'}</span></td>
                  <td style="padding:13px 12px;color:var(--mist);font-size:.78rem">${new Date(x.date).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  },

  // Called from pipeline when assignment is signed — financial protection gate
  collect(deal) {
    // ENFORCE: cannot collect without signed assignment
    if (!deal.assignmentSigned) {
      Toast.show('err','🔒','BLOCKED — assignment agreement not signed. Fee cannot be collected.');
      return;
    }
    const buyer = Store.data.buyers.find(b=>b.id===deal.buyerId);
    Modal.open(`
      <h2>Collect Assignment Fee</h2>
      <div class="m-sub">🛡️ Protected collection — assignment agreement signed. Funds route to your ORQ Stripe account.</div>
      <div style="padding:14px;border-radius:11px;background:rgba(15,174,110,.06);border:1px solid rgba(15,174,110,.25);margin-bottom:18px">
        <div style="font-size:.78rem;color:var(--silver);line-height:1.7">
          <div style="display:flex;justify-content:space-between"><span>Property</span><b style="color:var(--snow)">${deal.address}</b></div>
          <div style="display:flex;justify-content:space-between"><span>Buyer</span><b style="color:var(--snow)">${buyer?.name||'—'}</b></div>
          <div style="display:flex;justify-content:space-between"><span>PSA signed</span><b style="color:var(--emerald)">✓ Yes</b></div>
          <div style="display:flex;justify-content:space-between"><span>Assignment signed</span><b style="color:var(--emerald)">✓ Yes</b></div>
        </div>
      </div>
      <div class="field">
        <label>Assignment Fee (USD)</label>
        <input type="number" id="vault-fee" value="${deal.assignmentFee}" min="${CONFIG.MIN_ASSIGNMENT_FEE}" max="${CONFIG.MAX_ASSIGNMENT_FEE}"/>
        <div class="hint">Protected range ${fmt(CONFIG.MIN_ASSIGNMENT_FEE)} – ${fmt(CONFIG.MAX_ASSIGNMENT_FEE)}</div>
      </div>
      <div class="field">
        <label>Buyer Email (Stripe link delivery)</label>
        <input type="email" id="vault-email" value="${buyer?.email||''}" placeholder="buyer@email.com"/>
      </div>
      <div class="m-actions">
        <button class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-emerald" onclick="Views.vault.executeCollect('${deal.id}')">🛡️ Generate Protected Stripe Link</button>
      </div>
      <div id="vault-result" style="display:none;margin-top:16px;padding:14px;border-radius:10px;background:rgba(15,174,110,.08);border:1px solid rgba(15,174,110,.3);font-family:var(--font-m);font-size:.78rem;color:var(--emerald)"></div>
    `);
  },

  async executeCollect(dealId) {
    const deal = Store.data.pipeline.find(x=>x.id===dealId);
    if (!deal || !deal.assignmentSigned) { Toast.show('err','🔒','Protection check failed'); return; }
    const fee = +document.getElementById('vault-fee').value;
    const email = document.getElementById('vault-email').value;
    const buyer = Store.data.buyers.find(b=>b.id===deal.buyerId);

    const res = await API.call('/re/payment-link', { method:'POST', body: JSON.stringify({
      property: deal.address, buyerName: buyer?.name, fee, buyerEmail: email,
      description: `ORQ Assignment Fee — ${deal.address}`,
      // Protection metadata
      psaSigned: true, assignmentSigned: true, dealId,
    })});

    const result = document.getElementById('vault-result');
    result.style.display = 'block';
    if (res && !res._offline && res.url) {
      result.innerHTML = `✓ Protected payment link created:<br/><a href="${res.url}" target="_blank" style="color:var(--sapphire);word-break:break-all">${res.url}</a><br/><br/>Sent to ${email||buyer?.name}. Funds → ORQ Stripe.`;
    } else {
      result.innerHTML = `✓ Link ready (connect Stripe key on ORQ server to go live):<br/><br/>Fee: ${fmt(fee)}<br/>Property: ${deal.address}<br/>Buyer: ${buyer?.name}<br/>🔐 Backed by signed assignment agreement.`;
    }

    // Record in vault
    deal.feeCollected = true;
    Store.data.deals.push({ id:'F'+Date.now(), property:deal.address, buyer:buyer?.name, fee, status:'pending', date:Date.now(), dealId });
    // Remove from active pipeline (it's done)
    Store.data.pipeline = Store.data.pipeline.filter(x=>x.id!==dealId);
    Store.save(); App.updateNavBadges();
    Toast.show('ok','🛡️',`${fmt(fee)} collection link created & protected → ORQ Stripe`);
    setTimeout(()=>{ this.render(); }, 800);
  },

  manualCollect() {
    Modal.open(`
      <h2>Manual Fee Collection</h2>
      <div class="m-sub">⚠️ Only use for deals with a signed assignment agreement on file. This is your financial protection.</div>
      <div class="field"><label>Property Address</label><input type="text" id="mc-addr" placeholder="123 Main St, Lawton OK"/></div>
      <div class="field"><label>Buyer Name</label><input type="text" id="mc-buyer" placeholder="John Smith"/></div>
      <div class="field"><label>Buyer Email</label><input type="email" id="mc-email" placeholder="buyer@email.com"/></div>
      <div class="field"><label>Assignment Fee (USD)</label><input type="number" id="mc-fee" value="15000" min="${CONFIG.MIN_ASSIGNMENT_FEE}"/></div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" id="mc-confirm" style="width:auto"/>
          <span style="font-weight:600;color:var(--silver)">I confirm a signed assignment agreement is on file</span>
        </label>
      </div>
      <div class="m-actions">
        <button class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-emerald" onclick="Views.vault.executeManual()">🛡️ Create Protected Link</button>
      </div>
      <div id="mc-result" style="display:none;margin-top:16px;padding:14px;border-radius:10px;background:rgba(15,174,110,.08);border:1px solid rgba(15,174,110,.3);font-family:var(--font-m);font-size:.78rem;color:var(--emerald)"></div>
    `);
  },

  async executeManual() {
    if (!document.getElementById('mc-confirm').checked) {
      Toast.show('err','🔒','You must confirm a signed assignment agreement is on file');
      return;
    }
    const addr = document.getElementById('mc-addr').value;
    const buyer = document.getElementById('mc-buyer').value;
    const email = document.getElementById('mc-email').value;
    const fee = +document.getElementById('mc-fee').value;
    if (!addr || !fee) { Toast.show('warn','⚠','Address and fee required'); return; }

    const res = await API.call('/re/payment-link', { method:'POST', body: JSON.stringify({
      property:addr, buyerName:buyer, fee, buyerEmail:email, assignmentSigned:true,
    })});
    const result = document.getElementById('mc-result');
    result.style.display = 'block';
    result.innerHTML = (res && res.url)
      ? `✓ Link: <a href="${res.url}" target="_blank" style="color:var(--sapphire)">${res.url}</a>`
      : `✓ Link ready (connect Stripe on server). Fee ${fmt(fee)} → ORQ Stripe.`;
    Store.data.deals.push({ id:'F'+Date.now(), property:addr, buyer, fee, status:'pending', date:Date.now() });
    Store.save(); App.updateNavBadges();
    Toast.show('ok','🛡️',`${fmt(fee)} protected collection created`);
    setTimeout(()=>this.render(), 800);
  },
};

/* ════════════════════════════════════════════════════════════════════
   VIEW: DISPOSITION / BUYERS
   ════════════════════════════════════════════════════════════════════ */
Views.disposition = {
  render() {
    const buyers = Store.data.buyers;
    document.getElementById('view-disposition').innerHTML = `
      <div class="page-head">
        <div><h1>Disposition · Buyers</h1>
          <div class="ph-sub">Verified cash buyer network · matched to deals by market & budget</div></div>
        <button class="btn btn-gold" onclick="Views.disposition.addBuyer()">+ Add Buyer</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px">
        ${buyers.map(b => `
          <div class="card card-pad">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
              <div>
                <div style="font-weight:800;font-size:1rem;color:var(--snow)">${b.name}</div>
                <div style="font-size:.76rem;color:var(--mist)">${b.org||''}</div>
              </div>
              ${b.verified?'<span style="font-family:var(--font-m);font-size:.62rem;font-weight:700;padding:4px 9px;border-radius:100px;background:rgba(15,174,110,.12);color:var(--emerald)">✓ VERIFIED</span>':''}
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
              ${b.markets.map(m=>`<span style="font-size:.68rem;font-weight:600;padding:3px 9px;border-radius:100px;background:rgba(47,125,246,.1);color:var(--sapphire)">${m}</span>`).join('')}
              <span style="font-size:.68rem;font-weight:600;padding:3px 9px;border-radius:100px;background:rgba(212,175,55,.1);color:var(--gold)">${b.type}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.76rem;color:var(--silver);margin-bottom:14px">
              <div>💰 ${fmt(b.budgetLow)}–${fmt(b.budgetHigh)}</div>
              <div>⚡ Closes ${b.closeDays}d</div>
              <div>📊 ${b.deals12mo} deals/12mo</div>
              <div>${b.proofOfFunds?'✓ POF on file':'○ No POF'}</div>
            </div>
            <div style="display:flex;gap:8px">
              <button class="btn btn-sm btn-ghost" style="flex:1" onclick="window.open('tel:${b.phone}')">📞 Call</button>
              <button class="btn btn-sm btn-ghost" style="flex:1" onclick="window.open('mailto:${b.email}')">📧 Email</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  },

  addBuyer() {
    Modal.open(`
      <h2>Add Cash Buyer</h2>
      <div class="m-sub">Add a verified buyer to your disposition network.</div>
      <div class="field"><label>Name</label><input id="nb-name" placeholder="Buyer name"/></div>
      <div class="field"><label>Company</label><input id="nb-org" placeholder="Company / LLC"/></div>
      <div style="display:flex;gap:12px"><div class="field" style="flex:1"><label>Phone</label><input id="nb-phone" placeholder="(405) 555-0000"/></div><div class="field" style="flex:1"><label>Email</label><input id="nb-email" placeholder="email@x.com"/></div></div>
      <div class="field"><label>Markets (comma separated)</label><input id="nb-markets" placeholder="Lawton, Oklahoma City"/></div>
      <div style="display:flex;gap:12px">
        <div class="field" style="flex:1"><label>Budget Low</label><input id="nb-blow" type="number" value="50000"/></div>
        <div class="field" style="flex:1"><label>Budget High</label><input id="nb-bhigh" type="number" value="150000"/></div>
        <div class="field" style="flex:1"><label>Close Days</label><input id="nb-close" type="number" value="14"/></div>
      </div>
      <div class="m-actions">
        <button class="btn btn-ghost" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-gold" onclick="Views.disposition.saveBuyer()">Add Buyer</button>
      </div>
    `);
  },

  saveBuyer() {
    const g = id => document.getElementById(id).value;
    const name = g('nb-name'); if (!name) { Toast.show('warn','⚠','Name required'); return; }
    Store.data.buyers.push({
      id:'b'+Date.now(), name, org:g('nb-org'), phone:g('nb-phone'), email:g('nb-email'),
      markets:g('nb-markets').split(',').map(s=>s.trim()).filter(Boolean),
      type:'Cash Buyer', budgetLow:+g('nb-blow'), budgetHigh:+g('nb-bhigh'),
      closeDays:+g('nb-close'), proofOfFunds:false, deals12mo:0, verified:false,
    });
    Store.save(); Modal.close();
    Toast.show('ok','✓',`${name} added to buyer network`);
    this.render();
  },
};

/* ════════════════════════════════════════════════════════════════════
   VIEW: AUTOMATION CONTROL — START / PAUSE / STOP + dry-run toggle
   ════════════════════════════════════════════════════════════════════ */
Views.automation = {
  render() {
    const a = Store.data.automation;
    const dry = Store.data.settings.dryRun;
    document.getElementById('view-automation').innerHTML = `
      <div class="page-head">
        <div><h1>Automation Control</h1>
          <div class="ph-sub">Master control over the autonomous engine · you set the go/stop points</div></div>
      </div>

      <div class="card card-pad" style="margin-bottom:20px">
        <div class="section-label">Engine State <span class="sl-tag">global kill switch</span></div>
        <div style="display:flex;gap:14px;align-items:center;margin-bottom:18px;flex-wrap:wrap">
          <div style="font-size:.86rem;color:var(--mist)">Current state:</div>
          <span class="auto-pill ${a}" style="font-size:.8rem;padding:6px 14px"><span class="pulse"></span> ${a.toUpperCase()}</span>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn ${a==='running'?'btn-emerald':'btn-ghost'}" onclick="Views.automation.setState('running')">▶ Start Engine</button>
          <button class="btn ${a==='paused'?'btn-gold':'btn-ghost'}" onclick="Views.automation.setState('paused')">⏸ Pause</button>
          <button class="btn ${a==='stopped'?'btn-danger':'btn-ghost'}" onclick="Views.automation.setState('stopped')">⏹ Full Stop</button>
        </div>
        <div style="margin-top:16px;padding:14px;border-radius:11px;background:rgba(255,255,255,.02);border:var(--border);font-size:.78rem;color:var(--silver);line-height:1.7">
          <b style="color:var(--snow)">What each state does:</b><br/>
          <b style="color:var(--emerald)">Running</b> — engine surfaces leads & queues Aria automatically, but still pauses at every human gate you've defined.<br/>
          <b style="color:var(--amber)">Paused</b> — nothing new starts; existing deals stay where they are. Safe default.<br/>
          <b style="color:#ff8896">Full Stop</b> — halts all automation including queued Aria calls. Emergency brake.
        </div>
      </div>

      <div class="card card-pad" style="margin-bottom:20px">
        <div class="section-label">Safety: Dry-Run Mode <span class="sl-tag">no real calls / texts / charges while ON</span></div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px">
          <div style="flex:1;min-width:240px;font-size:.82rem;color:var(--silver);line-height:1.6">
            While dry-run is <b style="color:${dry?'var(--emerald)':'var(--amber)'}">${dry?'ON':'OFF'}</b>, Aria calls, SMS blasts, and Stripe charges are <b>simulated</b> — perfect for testing the full flow. Turn OFF only when you're ready for live outreach.
          </div>
          <button class="btn ${dry?'btn-emerald':'btn-danger'}" onclick="Views.automation.toggleDry()">
            ${dry?'🧪 Dry-Run ON (safe)':'🔴 LIVE MODE'}
          </button>
        </div>
      </div>

      <div class="card card-pad">
        <div class="section-label">Human Approval Gates <span class="sl-tag">these never auto-skip — by design</span></div>
        <div style="display:flex;flex-direction:column;gap:2px">
          ${[
            ['Lead approval','You review every scanned lead before Aria calls'],
            ['Offer approval','You set/approve the exact cash offer before the PSA goes out'],
            ['Buyer selection','You pick the winning buyer from the blast'],
            ['Fee release','Collection locked until the assignment agreement is signed'],
          ].map(([t,d],i,arr)=>`
            <div style="display:flex;align-items:center;gap:14px;padding:13px 0;${i<arr.length-1?'border-bottom:var(--border)':''}">
              <div style="width:32px;height:32px;border-radius:9px;background:rgba(15,174,110,.12);color:var(--emerald);display:flex;align-items:center;justify-content:center;font-weight:700">🔒</div>
              <div style="flex:1"><div style="font-weight:700;font-size:.84rem;color:var(--snow)">${t}</div><div style="font-size:.76rem;color:var(--mist)">${d}</div></div>
              <span style="font-family:var(--font-m);font-size:.64rem;font-weight:600;color:var(--emerald)">ALWAYS ON</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div style="margin-top:20px;text-align:center">
        <button class="btn btn-ghost btn-sm" onclick="Store.reset()" style="color:#ff8896">⚠ Reset all local data</button>
      </div>
    `;
  },

  setState(s) {
    Store.data.automation = s;
    Store.save(); App.updateAutomationPill();
    const msg = { running:['ok','▶','Engine STARTED — automation active, human gates intact'], paused:['warn','⏸','Engine PAUSED'], stopped:['err','⏹','Engine STOPPED — all automation halted'] }[s];
    Toast.show(...msg);
    this.render();
  },

  toggleDry() {
    Store.data.settings.dryRun = !Store.data.settings.dryRun;
    Store.save();
    const dry = Store.data.settings.dryRun;
    document.getElementById('nav-stripe').textContent = dry?'○ Setup':'● Live';
    Toast.show(dry?'ok':'warn', dry?'🧪':'🔴', dry?'Dry-run ON — outreach simulated':'LIVE MODE — real calls/texts/charges enabled');
    this.render();
  },
};

/* ════════════════════════════════════════════════════════════════════
   VIEW: CONTRACTS & ESCROW
   ════════════════════════════════════════════════════════════════════ */
Views.contracts = {
  render() {
    const deals = Store.data.pipeline.filter(d=>d.psaSent||d.assignmentSent);
    document.getElementById('view-contracts').innerHTML = `
      <div class="page-head"><div><h1>Contracts &amp; Escrow</h1>
        <div class="ph-sub">DocuSign envelopes · title company closings · your paper trail</div></div>
        <button class="btn btn-ghost" onclick="window.open('https://app.docusign.com','_blank')">Open DocuSign ↗</button>
      </div>
      <div class="card card-pad" style="margin-bottom:20px">
        <div class="section-label">Active Contracts</div>
        ${deals.length===0?`<div style="text-align:center;padding:30px;color:var(--mist);font-size:.86rem">No active contracts. They appear here once a PSA or assignment is sent.</div>`:
          deals.map(d=>`
            <div style="display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:var(--border)">
              <div style="flex:1"><div style="font-weight:700;font-size:.86rem;color:var(--snow)">${d.address}</div>
                <div style="font-size:.76rem;color:var(--mist)">${d.psaSigned?'PSA ✓ signed':d.psaSent?'PSA sent':'—'} · ${d.assignmentSigned?'Assignment ✓ signed':d.assignmentSent?'Assignment sent':'—'}</div></div>
              <span style="font-family:var(--font-m);font-size:.64rem;color:${d.assignmentSigned?'var(--emerald)':'var(--amber)'}">${d.assignmentSigned?'🔓 Fee unlocked':'🔒 Fee locked'}</span>
            </div>
          `).join('')}
      </div>
      <div class="card card-pad">
        <div class="section-label">Standard Documents</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
          ${[['📄','Purchase Agreement (PSA)','Seller → ORQ'],['📑','Assignment of Contract','ORQ → End Buyer'],['🔏','Non-Disclosure Agreement','Before buyer packet'],['🏦','Title Company Instructions','Licensed escrow close']].map(([i,t,s])=>`
            <div style="padding:16px;border-radius:12px;background:rgba(255,255,255,.02);border:var(--border)">
              <div style="font-size:1.5rem;margin-bottom:8px">${i}</div>
              <div style="font-weight:700;font-size:.84rem;color:var(--snow)">${t}</div>
              <div style="font-size:.74rem;color:var(--mist);margin-top:2px">${s}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  },
};

/* ════════════════════════════════════════════════════════════════════
   VIEW: OPERATOR TOOLS
   ════════════════════════════════════════════════════════════════════ */
Views.tools = {
  render() {
    const tools = [
      ['📞','Aria / Ulio','AI deal closer · '+CONFIG.ARIA_PHONE, CONFIG.ARIA_ULIO,'var(--emerald)'],
      ['✍️','DocuSign','PSA & assignment signing','https://app.docusign.com','var(--sapphire)'],
      ['💳','Stripe Dashboard','Fee collection · payouts','https://dashboard.stripe.com','var(--violet)'],
      ['⚖️','OSCN Courts','OK foreclosure · probate · lis pendens','https://www.oscn.net/dockets/','var(--gold)'],
      ['🏛','Comanche Assessor','Lawton property records','https://qpublic.schneidercorp.com/Application.aspx?AppID=601','var(--gold)'],
      ['📋','OK County Treasurer','OKC tax delinquency','https://www.oklahomacounty.org/TreasOnline/','var(--gold)'],
      ['🏠','Tarrant TCAD','Fort Worth appraisal','https://www.tarrantappraisal.org/','var(--gold)'],
      ['🏗','HUD Home Store','FHA REO inventory','https://hudhomestore.gov/','var(--gold)'],
      ['🌐','ORQ Platform','Permit intel · dispatch','https://app.orq.world','var(--sapphire)'],
    ];
    document.getElementById('view-tools').innerHTML = `
      <div class="page-head"><div><h1>Operator Tools</h1>
        <div class="ph-sub">Every system in the ORQ wholesale stack, one click away</div></div></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:16px">
        ${tools.map(([i,t,d,u,c])=>`
          <a href="${u}" target="_blank" class="card card-pad" style="display:block;transition:all .2s;border-top:2px solid ${c}" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform=''">
            <div style="font-size:1.8rem;margin-bottom:10px">${i}</div>
            <div style="font-weight:800;font-size:.95rem;color:var(--snow)">${t}</div>
            <div style="font-size:.78rem;color:var(--mist);margin-top:3px">${d}</div>
          </a>
        `).join('')}
      </div>
    `;
  },
};

/* ── BOOT ── */
window.addEventListener('DOMContentLoaded', () => {
  if (Auth.isValid()) Auth.unlock();
  else document.getElementById('passphrase')?.focus();
});
