'use strict';

const HL = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const HEALTH_KEY = 'ht_v4';

let healthData = null;
let healthChatHistory = [];
let currentDate = new Date().toISOString().slice(0, 10);

function defaultHealthConfig() {
  return {
    goalWeight: 170,
    startWeight: 180,
    calGoal: 2000,
    proteinGoal: 150,
    habits: ['Exercise', 'Read', 'Meditate'],
    llmProvider: 'anthropic',
    llmKey: '',
  };
}

function newHealthData() {
  return { config: defaultHealthConfig(), entries: [], habits: {}, moods: {}, water: {}, workouts: [] };
}

function loadHealthData() {
  let d = HL.get(HEALTH_KEY);
  if (!d || !d.config) { healthData = newHealthData(); return false; }
  healthData = d;
  if (!healthData.workouts) healthData.workouts = [];
  return true;
}

function saveHealthData() {
  HL.set(HEALTH_KEY, healthData);
}

function getTodayEntry() {
  return healthData.entries.find(e => e.date === currentDate);
}

function ensureTodayEntry() {
  let e = getTodayEntry();
  if (!e) {
    e = { date: currentDate, weight: null, calories: null, protein: null, steps: null, notes: '' };
    healthData.entries.push(e);
  }
  return e;
}

window.healthEmergencyReset = function() {
  if (!confirm('Reset Health data? This will clear all entries and config.')) return;
  try { localStorage.removeItem(HEALTH_KEY); } catch {}
  healthData = newHealthData();
  renderHealthDashboard();
};

/* ── Onboarding ── */
let healthObStep = 0;
const healthObSteps = [
  { label: 'Welcome', render: () => {
    document.getElementById('health-ob-content').innerHTML = `
      <div class="q-label">Step 1 of 4</div>
      <div class="q-text">Set your wellness goals</div>
      <div class="q-desc">Fig Health will track your weight, habits, nutrition, and more. Let's set some baseline goals.</div>
      <button class="btn btn-primary" onclick="healthObNext()">Get started →</button>
    `;
  }},
  { label: 'Weight', render: () => {
    const c = healthData.config;
    document.getElementById('health-ob-content').innerHTML = `
      <div class="q-label">Step 2 of 4</div>
      <div class="q-text">Weight goals</div>
      <div class="q-desc">What's your current weight and target?</div>
      <div class="freetext-wrapper">
        <div class="freetext-label">Current weight (lbs)</div>
        <input class="freetext-input" id="ob-start-weight" type="number" value="${c.startWeight}" style="margin-bottom:12px">
        <div class="freetext-label">Goal weight (lbs)</div>
        <input class="freetext-input" id="ob-goal-weight" type="number" value="${c.goalWeight}" style="margin-bottom:12px">
        <div class="freetext-label">Daily calorie target</div>
        <input class="freetext-input" id="ob-cal-goal" type="number" value="${c.calGoal}" style="margin-bottom:12px">
        <div class="freetext-label">Daily protein goal (g)</div>
        <input class="freetext-input" id="ob-protein-goal" type="number" value="${c.proteinGoal}" style="margin-bottom:12px">
      </div>
      <div class="btn-row" style="justify-content:flex-end">
        <button class="btn btn-primary" onclick="healthObNext()">Next →</button>
      </div>
    `;
  }},
  { label: 'Habits', render: () => {
    const h = healthData.config.habits.join(', ');
    document.getElementById('health-ob-content').innerHTML = `
      <div class="q-label">Step 3 of 4</div>
      <div class="q-text">Track habits</div>
      <div class="q-desc">What daily habits do you want to track? Separate with commas.</div>
      <div class="freetext-wrapper">
        <textarea class="freetext-input" id="ob-habits" rows="2">${h}</textarea>
        <div class="freetext-hint">E.g. Exercise, Read, Meditate, Walk, No sugar</div>
      </div>
      <div class="btn-row" style="justify-content:space-between">
        <button class="btn btn-secondary" onclick="healthObPrev()">← Back</button>
        <button class="btn btn-primary" onclick="healthObNext()">Next →</button>
      </div>
    `;
  }},
  { label: 'Done', render: () => {
    document.getElementById('health-ob-content').innerHTML = `
      <div class="q-label">Step 4 of 4</div>
      <div class="q-text">You're all set</div>
      <div class="q-desc">Start tracking your health. Add entries daily and check your progress.</div>
      <button class="btn btn-primary" onclick="healthFinishOnboarding()">Start tracking →</button>
    `;
  }},
];

function healthObNext() {
  if (healthObStep === 1) {
    const c = healthData.config;
    c.startWeight = parseFloat(document.getElementById('ob-start-weight').value) || c.startWeight;
    c.goalWeight = parseFloat(document.getElementById('ob-goal-weight').value) || c.goalWeight;
    c.calGoal = parseInt(document.getElementById('ob-cal-goal').value) || c.calGoal;
    c.proteinGoal = parseInt(document.getElementById('ob-protein-goal').value) || c.proteinGoal;
  }
  if (healthObStep === 2) {
    const val = document.getElementById('ob-habits').value.trim();
    healthData.config.habits = val ? val.split(',').map(s => s.trim()).filter(Boolean) : defaultHealthConfig().habits;
  }
  healthObStep++;
  document.getElementById('health-ob-progress').style.width = ((healthObStep / healthObSteps.length) * 100) + '%';
  healthObSteps[healthObStep].render();
}

function healthObPrev() {
  healthObStep--;
  document.getElementById('health-ob-progress').style.width = ((healthObStep / healthObSteps.length) * 100) + '%';
  healthObSteps[healthObStep].render();
}

function healthFinishOnboarding() {
  saveHealthData();
  showHealthDashboard();
}

/* ── Dashboard ── */
function showHealthDashboard() {
  document.getElementById('health-loading').style.display = 'none';
  document.getElementById('health-onboarding').style.display = 'none';
  document.getElementById('health-dashboard').style.display = 'block';
  renderHealthDashboard();
}

function computeHealthStats() {
  const e = healthData.entries;
  const c = healthData.config;
  const today = e.find(x => x.date === currentDate);
  const sorted = [...e].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.length > 0 ? sorted[sorted.length - 1] : null;
  const withWeight = sorted.filter(x => x.weight);
  const latestWeight = withWeight.length > 0 ? withWeight[withWeight.length - 1].weight : null;
  const streak = (function() {
    let s = 0, d = new Date();
    while (true) {
      const ds = d.toISOString().slice(0, 10);
      if (e.some(x => x.date === ds)) s++;
      else break;
      d.setDate(d.getDate() - 1);
    }
    return s;
  })();
  const totalEntries = e.length;
  const avgCal = e.filter(x => x.calories).reduce((a, x) => a + x.calories, 0) / Math.max(e.filter(x => x.calories).length, 1);
  const avgProtein = e.filter(x => x.protein).reduce((a, x) => a + x.protein, 0) / Math.max(e.filter(x => x.protein).length, 1);
  return { today, last, latestWeight, streak, totalEntries, avgCal, avgProtein, sorted, withWeight };
}

function renderHealthDashboard() {
  const s = computeHealthStats();
  const c = healthData.config;
  const diff = s.latestWeight ? (c.startWeight - s.latestWeight) : 0;
  const isLosing = c.goalWeight < c.startWeight ? diff > 0 : diff < 0;

  document.getElementById('health-goal-pill').textContent =
    `${c.goalWeight} lbs goal · ${s.latestWeight || '—'} current · ${Math.abs(diff).toFixed(1)} lbs ${isLosing ? 'lost' : 'gained'}`;

  const today = s.today;
  document.getElementById('health-stats-grid').innerHTML = `
    <div class="card">
      <div class="card-label">Weight</div>
      <div class="card-value ${s.latestWeight && s.latestWeight <= c.goalWeight ? 'c-green' : 'c-gold'}">${today && today.weight ? today.weight + '' : s.latestWeight ? s.latestWeight : '—'}</div>
      <div class="card-sub">${s.latestWeight ? (s.latestWeight <= c.goalWeight ? '✓ At or below goal' : `${(s.latestWeight - c.goalWeight).toFixed(1)} lbs above goal`) : 'No entries yet'}</div>
    </div>
    <div class="card">
      <div class="card-label">Calories</div>
      <div class="card-value ${today && today.calories && today.calories <= c.calGoal ? 'c-green' : 'c-gold'}">${today && today.calories ? today.calories : '—'}</div>
      <div class="card-sub">Goal: ${c.calGoal} cal/day</div>
    </div>
    <div class="card">
      <div class="card-label">Protein</div>
      <div class="card-value ${today && today.protein && today.protein >= c.proteinGoal ? 'c-green' : 'c-gold'}">${today && today.protein ? today.protein + 'g' : '—'}</div>
      <div class="card-sub">Goal: ${c.proteinGoal}g/day</div>
    </div>
    <div class="card">
      <div class="card-label">Streak</div>
      <div class="card-value c-gold">${s.streak}</div>
      <div class="card-sub">${s.totalEntries} total entries</div>
    </div>
  `;

  renderHealthWeightChart(s);
  renderHealthEntryForm(s);
  renderHealthHabitsMood();
  renderHealthEntriesTable(s);
  renderHealthWorkouts();
  renderHealthCSVSection();
}

function renderHealthWeightChart(s) {
  const el = document.getElementById('health-weight-chart');
  const pts = s.withWeight;
  if (!pts || pts.length < 2) {
    el.innerHTML = `<div class="empty-state"><div class="es-icon">📈</div>Add 2+ weight entries to see the chart</div>`;
    return;
  }
  const c = healthData.config;
  const w = 600, h = 200;
  const pad = { t: 16, r: 16, b: 28, l: 40 };
  const pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
  const values = pts.map(x => x.weight);
  const min = Math.min(...values, c.goalWeight) - 3;
  const max = Math.max(...values, c.goalWeight) + 3;
  const xf = i => pad.l + (i / (pts.length - 1)) * pw;
  const yf = v => pad.t + ph - ((v - min) / (max - min)) * ph;
  const line = pts.map((p, i) => `${xf(i)},${yf(p.weight)}`).join(' ');
  const goalY = yf(c.goalWeight);
  const labels = pts.length <= 6 ? pts : pts.filter((_, i) => i === 0 || i === pts.length - 1 || i === Math.floor(pts.length / 2));

  el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" style="width:100%;display:block;overflow:visible">
    <line x1="${pad.l}" y1="${goalY}" x2="${w - pad.r}" y2="${goalY}" stroke="var(--border)" stroke-width="1" stroke-dasharray="4 3"/>
    <text x="${w - pad.r + 2}" y="${goalY + 4}" fill="var(--muted)" font-size="9">goal ${c.goalWeight}</text>
    ${[min, Math.round((min + max) / 2), max].map(v => `<text x="${pad.l - 4}" y="${yf(v) + 4}" fill="var(--muted)" font-size="9" text-anchor="end">${Math.round(v)}</text>`).join('')}
    ${labels.map(p => `<text x="${xf(pts.indexOf(p))}" y="${h - 4}" fill="var(--muted)" font-size="9" text-anchor="middle">${p.date.slice(5)}</text>`).join('')}
    <polyline points="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>
    ${pts.map((p, i) => `<circle cx="${xf(i)}" cy="${yf(p.weight)}" r="3" fill="var(--accent)" stroke="var(--bg)" stroke-width="1.5"/>`).join('')}
  </svg>`;
}

/* ── Entry Form ── */
function renderHealthEntryForm(s) {
  const today = s.today || { date: currentDate, weight: null, calories: null, protein: null, steps: null, notes: '' };
  document.getElementById('health-entry-form').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Date</label>
        <input type="date" id="he-date" value="${currentDate}" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Weight (lbs)</label>
        <input type="number" id="he-weight" value="${today.weight || ''}" step="0.1" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Calories</label>
        <input type="number" id="he-cal" value="${today.calories || ''}" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Protein (g)</label>
        <input type="number" id="he-protein" value="${today.protein || ''}" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Steps</label>
        <input type="number" id="he-steps" value="${today.steps || ''}" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Auto-fill from text</label>
        <button class="s-btn" onclick="healthOpenAutoFill()" style="width:100%;text-align:center">📝 Describe your day</button>
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Notes</label>
      <textarea id="he-notes" rows="2" style="background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:8px 10px;color:var(--text);font-size:0.78rem;width:100%;outline:none;resize:vertical;font-family:inherit">${today.notes || ''}</textarea>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick="healthSaveEntry()" style="padding:8px 18px;font-size:0.7rem">Save entry</button>
      <span id="he-toast" style="font-size:0.65rem;color:var(--green);min-height:1em"></span>
    </div>
  `;
}

function healthSaveEntry() {
  const date = document.getElementById('he-date').value || currentDate;
  if (!date) return;
  let e = healthData.entries.find(x => x.date === date);
  if (!e) {
    e = { date, weight: null, calories: null, protein: null, steps: null, notes: '' };
    healthData.entries.push(e);
  }
  e.weight = parseFloat(document.getElementById('he-weight').value) || null;
  e.calories = parseInt(document.getElementById('he-cal').value) || null;
  e.protein = parseInt(document.getElementById('he-protein').value) || null;
  e.steps = parseInt(document.getElementById('he-steps').value) || null;
  e.notes = document.getElementById('he-notes').value || '';
  saveHealthData();
  const toast = document.getElementById('he-toast');
  if (toast) { toast.textContent = '✓ Saved'; setTimeout(() => { if (toast) toast.textContent = ''; }, 2000); }
  renderHealthDashboard();
}

/* ── Habits & Mood ── */
function renderHealthHabitsMood() {
  const h = healthData.config.habits;
  const todayHabits = healthData.habits[currentDate] || {};
  const todayMood = healthData.moods[currentDate] || '';
  const todayWater = healthData.water[currentDate] || 0;

  let html = '<div style="margin-bottom:12px">';
  html += '<div style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">Daily habits</div>';
  if (h.length === 0) {
    html += '<div style="font-size:0.65rem;color:var(--muted);font-style:italic">No habits configured. Add them in Settings.</div>';
  } else {
    h.forEach(habit => {
      const checked = todayHabits[habit] ? 'checked' : '';
      html += `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:0.78rem;color:var(--text);cursor:pointer">
        <input type="checkbox" ${checked} onchange="healthToggleHabit('${habit.replace(/'/g, "\\'")}')" style="accent-color:var(--accent);width:15px;height:15px;cursor:pointer">
        ${habit}
      </label>`;
    });
  }
  html += '</div>';

  html += '<div style="margin-bottom:12px">';
  html += '<div style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Mood</div>';
  html += `<div style="display:flex;gap:8px">
    ${['good', 'ok', 'rough'].map(m => `<button class="s-btn ${todayMood === m ? 'primary' : ''}" onclick="healthSetMood('${m}')" style="font-size:0.75rem;padding:6px 14px">${m === 'good' ? '😊' : m === 'ok' ? '😐' : '😔'} ${m}</button>`).join('')}
  </div>`;
  html += '</div>';

  html += '<div>';
  html += '<div style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);margin-bottom:6px">Water</div>';
  html += `<div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
    ${[0,1,2,3,4,5,6,7,8].map(n => `<button class="s-btn ${todayWater === n ? 'primary' : ''}" onclick="healthSetWater(${n})" style="font-size:0.7rem;padding:4px 8px;min-width:30px">${n}</button>`).join('')}
    <span style="font-size:0.65rem;color:var(--muted);margin-left:4px">glasses</span>
  </div>`;
  html += '</div>';

  document.getElementById('health-habits-mood').innerHTML = html;
}

function healthToggleHabit(habit) {
  if (!healthData.habits[currentDate]) healthData.habits[currentDate] = {};
  healthData.habits[currentDate][habit] = !healthData.habits[currentDate][habit];
  saveHealthData();
}

function healthSetMood(mood) {
  healthData.moods[currentDate] = mood === healthData.moods[currentDate] ? '' : mood;
  saveHealthData();
  renderHealthHabitsMood();
}

function healthSetWater(n) {
  healthData.water[currentDate] = healthData.water[currentDate] === n ? 0 : n;
  saveHealthData();
  renderHealthHabitsMood();
}

/* ── Entries Table ── */
function renderHealthEntriesTable(s) {
  const sorted = [...healthData.entries].sort((a, b) => b.date.localeCompare(a.date));
  if (sorted.length === 0) {
    document.getElementById('health-entries-table').innerHTML = `<div class="empty-state"><div class="es-icon">📋</div>No entries yet. Add your first one above.</div>`;
    return;
  }
  let html = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:0.75rem">
    <thead><tr style="border-bottom:1px solid var(--border);color:var(--muted);font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase">
      <th style="padding:8px 10px;text-align:left">Date</th>
      <th style="padding:8px 10px;text-align:right">Weight</th>
      <th style="padding:8px 10px;text-align:right">Calories</th>
      <th style="padding:8px 10px;text-align:right">Protein</th>
      <th style="padding:8px 10px;text-align:right">Steps</th>
      <th style="padding:8px 10px;text-align:left">Notes</th>
      <th style="padding:8px 10px"></th>
    </tr></thead>
    <tbody>`;
  sorted.slice(0, 50).forEach(e => {
    html += `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 10px;color:var(--accent2)">${e.date}</td>
      <td style="padding:8px 10px;text-align:right">${e.weight || '—'}</td>
      <td style="padding:8px 10px;text-align:right">${e.calories || '—'}</td>
      <td style="padding:8px 10px;text-align:right">${e.protein || '—'}</td>
      <td style="padding:8px 10px;text-align:right">${e.steps || '—'}</td>
      <td style="padding:8px 10px;color:var(--muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.notes || ''}</td>
      <td style="padding:8px 10px"><button class="s-btn" onclick="healthDeleteEntry('${e.date}')" style="font-size:0.55rem;color:var(--red)">✕</button></td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  if (sorted.length > 50) html += `<div style="font-size:0.65rem;color:var(--muted);padding:8px 10px">Showing 50 of ${sorted.length} entries</div>`;
  document.getElementById('health-entries-table').innerHTML = html;
}

function healthDeleteEntry(date) {
  if (!confirm(`Delete entry for ${date}?`)) return;
  healthData.entries = healthData.entries.filter(e => e.date !== date);
  delete healthData.habits[date];
  delete healthData.moods[date];
  delete healthData.water[date];
  saveHealthData();
  renderHealthDashboard();
}

/* ── Workouts ── */
function renderHealthWorkouts() {
  const ws = healthData.workouts || [];
  const el = document.getElementById('health-workouts');
  let html = '<div style="margin-bottom:14px;display:flex;gap:8px;flex-wrap:wrap">';
  html += `<button class="s-btn" onclick="healthShowWorkoutForm()" style="font-size:0.7rem">＋ Add workout</button>`;
  html += '</div>';
  if (ws.length === 0) {
    html += `<div class="empty-state" style="padding:20px"><div class="es-icon">🏋️</div>No workouts logged yet</div>`;
  } else {
    const sorted = [...ws].sort((a, b) => b.date.localeCompare(a.date));
    html += '<div style="display:flex;flex-direction:column;gap:6px">';
    sorted.slice(0, 10).forEach((w, i) => {
      html += `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;font-size:0.75rem">
        <div><span style="color:var(--accent2)">${w.date}</span> · ${w.type} · ${w.duration}min</div>
        <div><button class="s-btn" onclick="healthDeleteWorkout(${i})" style="font-size:0.55rem;color:var(--red)">✕</button></div>
      </div>`;
    });
    html += '</div>';
  }
  el.innerHTML = html;
}

function healthShowWorkoutForm() {
  const el = document.getElementById('health-workouts');
  const form = document.createElement('div');
  form.id = 'health-workout-form';
  form.style.cssText = 'background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:12px';
  form.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:12px">
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Date</label>
        <input type="date" id="hw-date" value="${currentDate}" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Type</label>
        <input id="hw-type" placeholder="Run, Lift, Yoga..." style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
      <div>
        <label style="font-size:0.6rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--muted);display:block;margin-bottom:4px">Duration (min)</label>
        <input type="number" id="hw-duration" min="1" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;color:var(--text);font-size:0.78rem;width:100%;outline:none">
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="s-btn primary" onclick="healthSaveWorkout()">Save</button>
      <button class="s-btn" onclick="healthCancelWorkoutForm()">Cancel</button>
    </div>
  `;
  el.insertBefore(form, el.firstChild);
}

function healthSaveWorkout() {
  const date = document.getElementById('hw-date').value;
  const type = document.getElementById('hw-type').value.trim();
  const duration = parseInt(document.getElementById('hw-duration').value);
  if (!date || !type || !duration) return;
  if (!healthData.workouts) healthData.workouts = [];
  healthData.workouts.push({ date, type, duration, notes: '' });
  saveHealthData();
  renderHealthDashboard();
}

function healthCancelWorkoutForm() {
  const f = document.getElementById('health-workout-form');
  if (f) f.remove();
}

function healthDeleteWorkout(idx) {
  const actualIdx = healthData.workouts.length - 1 - idx;
  healthData.workouts.splice(actualIdx, 1);
  saveHealthData();
  renderHealthDashboard();
}

/* ── CSV Import/Export ── */
function renderHealthCSVSection() {
  document.getElementById('health-csv-section').innerHTML = `
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <button class="s-btn" onclick="healthExportCSV()">⬇ Export CSV</button>
      <label class="s-btn" style="cursor:pointer">⬆ Import CSV<input type="file" accept=".csv" onchange="healthImportCSV(event)" style="display:none"></label>
    </div>
    <div id="health-csv-toast" style="font-size:0.65rem;color:var(--muted);min-height:1.2em"></div>
  `;
}

function healthExportCSV() {
  const entries = healthData.entries;
  if (entries.length === 0) { document.getElementById('health-csv-toast').textContent = 'No entries to export'; return; }
  const habits = healthData.config.habits;
  const headers = ['Date', 'Weight', 'Calories', 'Protein', 'Steps', 'Notes', 'Mood', 'Water', ...habits.map(h => `"${h}"`)];
  const rows = entries.map(e => {
    const date = e.date;
    const mood = healthData.moods[date] || '';
    const water = healthData.water[date] || 0;
    const hVals = habits.map(h => (healthData.habits[date] && healthData.habits[date][h]) ? 'Yes' : 'No');
    return [date, e.weight || '', e.calories || '', e.protein || '', e.steps || '', `"${(e.notes || '').replace(/"/g, '""')}"`, mood, water, ...hVals].join(',');
  }).join('\n');
  const csv = headers.join(',') + '\n' + rows;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'health.csv';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const t = document.getElementById('health-csv-toast');
  if (t) t.textContent = 'Exported!';
}

function healthImportCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const lines = e.target.result.split('\n').filter(l => l.trim());
      if (lines.length < 2) throw new Error('Empty file');
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      const dateIdx = headers.indexOf('Date');
      const weightIdx = headers.indexOf('Weight');
      const calIdx = headers.indexOf('Calories');
      const proteinIdx = headers.indexOf('Protein');
      const stepsIdx = headers.indexOf('Steps');
      const notesIdx = headers.indexOf('Notes');
      const moodIdx = headers.indexOf('Mood');
      const waterIdx = headers.indexOf('Water');
      let imported = 0;
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
        const date = vals[dateIdx];
        if (!date) continue;
        let entry = healthData.entries.find(e => e.date === date);
        if (!entry) { entry = { date, weight: null, calories: null, protein: null, steps: null, notes: '' }; healthData.entries.push(entry); }
        if (weightIdx >= 0 && vals[weightIdx]) entry.weight = parseFloat(vals[weightIdx]) || null;
        if (calIdx >= 0 && vals[calIdx]) entry.calories = parseInt(vals[calIdx]) || null;
        if (proteinIdx >= 0 && vals[proteinIdx]) entry.protein = parseInt(vals[proteinIdx]) || null;
        if (stepsIdx >= 0 && vals[stepsIdx]) entry.steps = parseInt(vals[stepsIdx]) || null;
        if (notesIdx >= 0 && vals[notesIdx]) entry.notes = vals[notesIdx];
        if (moodIdx >= 0 && vals[moodIdx]) healthData.moods[date] = vals[moodIdx];
        if (waterIdx >= 0 && vals[waterIdx]) healthData.water[date] = parseInt(vals[waterIdx]) || 0;
        imported++;
      }
      saveHealthData();
      const t = document.getElementById('health-csv-toast');
      if (t) t.textContent = `Imported ${imported} entries`;
      renderHealthDashboard();
    } catch (err) {
      const t = document.getElementById('health-csv-toast');
      if (t) t.textContent = 'Import failed: ' + err.message;
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

/* ── Chat (uses global fig-chat-panel) ── */

/* ── Settings ── */
window.healthOpenSettings = function() {
  const c = healthData.config;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'health-settings-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) healthCloseSettings(); };
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Health Settings</div>
        <button class="modal-close" onclick="healthCloseSettings()">✕</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="settings-section">
          <h4>🎯 Goals</h4>
          <div class="field-row">
            <label>Start weight (lbs)</label>
            <input id="hs-start-weight" type="number" value="${c.startWeight}" step="0.1">
          </div>
          <div class="field-row">
            <label>Goal weight (lbs)</label>
            <input id="hs-goal-weight" type="number" value="${c.goalWeight}" step="0.1">
          </div>
          <div class="field-row">
            <label>Daily calories</label>
            <input id="hs-cal-goal" type="number" value="${c.calGoal}">
          </div>
          <div class="field-row">
            <label>Daily protein (g)</label>
            <input id="hs-protein-goal" type="number" value="${c.proteinGoal}">
          </div>
        </div>
        <div class="settings-section">
          <h4>📋 Habits</h4>
          <div class="field-help">One per line</div>
          <textarea id="hs-habits" rows="4" style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:9px 12px;color:var(--text);font-family:inherit;font-size:0.78rem;width:100%;outline:none;resize:vertical">${c.habits.join('\n')}</textarea>
        </div>
        <div class="settings-section">
          <h4>🔑 AI Coach</h4>
          <div class="field-row">
            <label>Provider</label>
            <select id="hs-llm-provider">
              <option value="anthropic" ${c.llmProvider === 'anthropic' ? 'selected' : ''}>Claude (Anthropic)</option>
              <option value="openai" ${c.llmProvider === 'openai' ? 'selected' : ''}>ChatGPT (OpenAI)</option>
              <option value="gemini" ${c.llmProvider === 'gemini' ? 'selected' : ''}>Gemini (Google)</option>
              <option value="deepseek" ${c.llmProvider === 'deepseek' ? 'selected' : ''}>DeepSeek</option>
            </select>
          </div>
          <div class="field-row">
            <label>API Key</label>
            <input id="hs-llm-key" type="password" value="${c.llmKey || ''}" placeholder="sk-...">
          </div>
          <div class="field-help">Used by the AI Coach chat. Your key stays on this device.</div>
        </div>
        <div class="settings-section">
          <h4>⚠️ Danger Zone</h4>
          <button class="s-btn danger" onclick="if(confirm('Delete ALL health data?')){localStorage.removeItem('${HEALTH_KEY}');healthData=newHealthData();healthCloseSettings();renderHealthDashboard();}" style="font-size:0.7rem">Delete all data</button>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-secondary" onclick="healthCloseSettings()" style="padding:8px 18px;font-size:0.7rem">Cancel</button>
          <button class="btn btn-primary" onclick="healthSaveSettings()" style="padding:8px 18px;font-size:0.7rem">Save</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
};

function healthCloseSettings() {
  const o = document.getElementById('health-settings-overlay');
  if (o) o.remove();
}

function healthSaveSettings() {
  const c = healthData.config;
  c.startWeight = parseFloat(document.getElementById('hs-start-weight').value) || c.startWeight;
  c.goalWeight = parseFloat(document.getElementById('hs-goal-weight').value) || c.goalWeight;
  c.calGoal = parseInt(document.getElementById('hs-cal-goal').value) || c.calGoal;
  c.proteinGoal = parseInt(document.getElementById('hs-protein-goal').value) || c.proteinGoal;
  const habitsRaw = document.getElementById('hs-habits').value.trim();
  c.habits = habitsRaw ? habitsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
  c.llmProvider = document.getElementById('hs-llm-provider').value;
  c.llmKey = document.getElementById('hs-llm-key').value;
  saveHealthData();
  healthCloseSettings();
  renderHealthDashboard();
}

/* ── Auto-fill ── */
window.healthOpenAutoFill = function() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'health-autofill-overlay';
  overlay.onclick = function(e) { if (e.target === overlay) healthCloseAutoFill(); };
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Auto-fill from text</div>
        <button class="modal-close" onclick="healthCloseAutoFill()">✕</button>
      </div>
      <div class="q-desc" style="margin-bottom:16px">Describe your day in natural language. Fig will extract the numbers.</div>
      <textarea id="haf-input" rows="5" style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;color:var(--text);font-family:inherit;font-size:0.82rem;width:100%;outline:none;resize:vertical;margin-bottom:12px" placeholder="e.g. Ate well today, had about 1800 calories and 120g protein. Walked 8000 steps. Feeling good."></textarea>
      <div class="llm-thinking" id="haf-thinking"><div class="spinner"></div> Analyzing…</div>
      <div id="haf-result" style="font-size:0.72rem;color:var(--muted);line-height:1.7;margin-bottom:12px;display:none"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="healthCloseAutoFill()" style="padding:8px 18px;font-size:0.7rem">Cancel</button>
        <button class="btn btn-primary" onclick="healthRunAutoFill()" style="padding:8px 18px;font-size:0.7rem">Analyze →</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
};

function healthCloseAutoFill() {
  const o = document.getElementById('health-autofill-overlay');
  if (o) o.remove();
}

async function healthRunAutoFill() {
  const input = document.getElementById('haf-input').value.trim();
  if (!input) return;
  const c = healthData.config;
  if (!c.llmKey) {
    document.getElementById('haf-result').style.display = 'block';
    document.getElementById('haf-result').textContent = 'No API key connected. Go to Settings (⚙) to add one.';
    return;
  }
  const thinking = document.getElementById('haf-thinking');
  if (thinking) thinking.classList.add('show');

  const systemPrompt = `You are a health data extractor. Given a user's description of their day, extract structured data. Return ONLY valid JSON with these optional fields (omit any you can't determine):
{ "weight": number (lbs), "calories": number, "protein": number (grams), "steps": number, "water": number (glasses), "mood": "good"|"ok"|"rough", "notes": "string (brief summary)", "habits": { "habit name": true/false } }
The user's habits to check: ${JSON.stringify(c.habits)}
Calorie goal: ${c.calGoal}, Protein goal: ${c.proteinGoal}g.
Be generous — if they mention something relevant, include it. Don't make up data that isn't implied.`;

  try {
    const text = await window.figCallLLM(systemPrompt, `My day: ${input}`, c.llmProvider || 'anthropic', c.llmKey);
    const json = JSON.parse(text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    const resultDiv = document.getElementById('haf-result');
    resultDiv.style.display = 'block';
    const parts = [];
    if (json.weight) parts.push(`Weight: ${json.weight} lbs`);
    if (json.calories) parts.push(`Calories: ${json.calories}`);
    if (json.protein) parts.push(`Protein: ${json.protein}g`);
    if (json.steps) parts.push(`Steps: ${json.steps}`);
    if (json.water) parts.push(`Water: ${json.water} glasses`);
    if (json.mood) parts.push(`Mood: ${json.mood}`);
    resultDiv.innerHTML = parts.join(' · ') || 'No data extracted.';
    resultDiv.innerHTML += '<br><button class="s-btn" onclick="healthApplyAutoFill(\'' + encodeURIComponent(JSON.stringify(json)) + '\')" style="margin-top:8px">Apply</button>';
  } catch (e) {
    document.getElementById('haf-result').style.display = 'block';
    document.getElementById('haf-result').textContent = 'Error: ' + (e.message || e);
  }
  if (thinking) thinking.classList.remove('show');
}

window.healthApplyAutoFill = function(encoded) {
  const json = JSON.parse(decodeURIComponent(encoded));
  const today = ensureTodayEntry();
  if (json.weight) today.weight = json.weight;
  if (json.calories) today.calories = json.calories;
  if (json.protein) today.protein = json.protein;
  if (json.steps) today.steps = json.steps;
  if (json.water) healthData.water[currentDate] = json.water;
  if (json.mood) healthData.moods[currentDate] = json.mood;
  if (json.notes) today.notes = json.notes;
  if (json.habits) {
    if (!healthData.habits[currentDate]) healthData.habits[currentDate] = {};
    Object.keys(json.habits).forEach(h => { healthData.habits[currentDate][h] = json.habits[h]; });
  }
  saveHealthData();
  healthCloseAutoFill();
  renderHealthDashboard();
};

/* ── Init ── */
(function initHealth() {
  if (document.getElementById('health-loading') === null) return;
  const hasData = loadHealthData();
  if (!hasData) {
    document.getElementById('health-loading').style.display = 'none';
    document.getElementById('health-onboarding').style.display = 'block';
    document.getElementById('health-ob-progress').style.width = '0%';
    healthObStep = 0;
    healthObSteps[0].render();
  } else {
    showHealthDashboard();
  }
})();
