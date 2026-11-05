(function(){
'use strict';

/* ---------- 設定 ---------- */
var STATUS = [
  {v:'出勤',     s:'出', c:'s1'},
  {v:'勤務可能', s:'可', c:'s2'},
  {v:'希望○',   s:'○', c:'s3'},
  {v:'希望×',   s:'×', c:'s4'},
  {v:'休み',     s:'休', c:'s5'}
];
var DEFAULT_STAFF = ['白井さん','葉山さん','ゆいちゃん','かじさん','山田さん','ふうかちゃん','大羽さん'];
var WD = ['日','月','火','水','木','金','土'];

/* ---------- 状態 ---------- */
var pw = '';
try { pw = localStorage.getItem('shift_pw') || ''; } catch(e) {}
var now = new Date();
var ym = {y: now.getFullYear(), m: now.getMonth() + 1};
var staff = [];
var month = {shifts:{}, closed:{}};
var tab = 'grid';
var target = null;
var pending = new Map();
var saveTimer = null;

/* ---------- 便利関数 ---------- */
function $(s){ return document.querySelector(s); }
function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
  });
}
function newId(){ return 's' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3); }
function pad(n){ return n < 10 ? '0' + n : '' + n; }
function mkey(){ return 'month:' + ym.y + '-' + pad(ym.m); }
function daysIn(){ return new Date(ym.y, ym.m, 0).getDate(); }
function statusOf(v){ for (var i = 0; i < STATUS.length; i++) if (STATUS[i].v === v) return STATUS[i]; return null; }
function isToday(d){ return now.getFullYear() === ym.y && now.getMonth() + 1 === ym.m && now.getDate() === d; }

/* ---------- API ---------- */
async function api(method, key, value){
  var opt = {method: method, headers: {'x-app-password': encodeURIComponent(pw)}};
  if (value !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify({value: value});
  }
  var r = await fetch('/api/data?key=' + encodeURIComponent(key), opt);
  if (r.status === 401) { var e = new Error('auth'); e.auth = true; throw e; }
  if (!r.ok) {
    var msg = 'http ' + r.status;
    try { var j = await r.json(); if (j && j.error) msg = j.error; } catch(x) {}
    throw new Error(msg);
  }
  return r.json();
}

/* ---------- 保存 ---------- */
function setStatus(text, kind){
  var el = $('#status');
  el.textContent = text;
  el.className = 'status' + (kind === 'err' ? ' err-state' : '');
}
function queue(key, value){
  pending.set(key, value);
  setStatus('保存中…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 500);
}
async function flush(){
  clearTimeout(saveTimer);
  if (pending.size === 0) return;
  var items = Array.from(pending.entries());
  pending.clear();
  try {
    for (var i = 0; i < items.length; i++) await api('PUT', items[i][0], items[i][1]);
    if (pending.size === 0) setStatus('保存しました');
  } catch (e) {
    items.forEach(function(it){ if (!pending.has(it[0])) pending.set(it[0], it[1]); });
    if (e.auth) { showLogin('パスワードが違います'); return; }
    setStatus('保存できません(タップでやり直し)', 'err');
  }
}
$('#status').addEventListener('click', function(){ if (pending.size) flush(); });
window.addEventListener('beforeunload', function(e){
  if (pending.size) { e.preventDefault(); e.returnValue = ''; }
});

/* ---------- 読み込み ---------- */
async function loadMonth(){
  var r = await api('GET', mkey());
  month = (r.value && typeof r.value === 'object') ? r.value : {};
  month.shifts = month.shifts || {};
  month.closed = month.closed || {};
}
async function loadAll(){
  var s = await api('GET', 'staff');
  if (s.value && Array.isArray(s.value)) {
    staff = s.value;
  } else {
    staff = DEFAULT_STAFF.map(function(n){ return {id:newId(), name:n, memo:''}; });
    queue('staff', staff);
  }
  await loadMonth();
}

/* ---------- 画面切り替え ---------- */
function showLogin(msg){
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#loginErr').textContent = msg || '';
  $('#pwInput').value = '';
}
function showApp(){
  $('#login').hidden = true;
  $('#app').hidden = false;
}
async function start(){
  if (!pw) { showLogin(''); return; }
  try {
    await loadAll();
    showApp();
    renderAll();
    if (pending.size === 0) setStatus('');
  } catch (e) {
    if (e.auth) showLogin('パスワードが違います');
    else if (e.message === 'env') showLogin('サーバーの設定が足りません(Vercelの環境変数を確認してください)');
    else showLogin('読み込めませんでした。通信を確認して、もう一度開いてください。');
  }
}
$('#loginBtn').addEventListener('click', function(){
  var v = $('#pwInput').value.trim();
  if (!v) return;
  pw = v;
  try { localStorage.setItem('shift_pw', pw); } catch(e) {}
  start();
});
$('#pwInput').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('#loginBtn').click(); });
$('#logout').addEventListener('click', async function(){
  await flush();
  try { localStorage.removeItem('shift_pw'); } catch(e) {}
  pw = '';
  showLogin('');
});

document.querySelectorAll('.tabs button').forEach(function(b){
  b.addEventListener('click', function(){
    tab = b.dataset.tab;
    renderAll();
  });
});

async function goMonth(delta){
  await flush();
  if (pending.size) return;
  if (delta === 0) { now = new Date(); ym = {y: now.getFullYear(), m: now.getMonth() + 1}; }
  else {
    var d = new Date(ym.y, ym.m - 1 + delta, 1);
    ym = {y: d.getFullYear(), m: d.getMonth() + 1};
  }
  try { await loadMonth(); renderAll(); }
  catch (e) { setStatus('読み込めません', 'err'); }
}
$('#prev').addEventListener('click', function(){ goMonth(-1); });
$('#next').addEventListener('click', function(){ goMonth(1); });
$('#today').addEventListener('click', function(){ goMonth(0); });

document.addEventListener('visibilitychange', async function(){
  if (document.hidden || $('#app').hidden || pending.size || !$('#sheetBg').hidden) return;
  try { await loadAll(); renderAll(); } catch(e) {}
});

/* ---------- 描画 ---------- */
function renderAll(){
  $('#monthLabel').textContent = ym.y + '年' + ym.m + '月';
  document.querySelectorAll('.tabs button').forEach(function(b){
    b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false');
  });
  $('#view-grid').hidden = tab !== 'grid';
  $('#view-cal').hidden = tab !== 'cal';
  $('#view-staff').hidden = tab !== 'staff';
  $('.monthnav').hidden = tab === 'staff';
  if (tab === 'grid') renderGrid();
  if (tab === 'cal') renderCal();
  if (tab === 'staff') renderStaff();
}

function renderLegend(){
  $('#legend').innerHTML = STATUS.map(function(s){
    return '<span class="cell ' + s.c + '" style="width:auto;height:auto;font-size:12px;padding:2px 8px;border-radius:6px">' + s.s + ' ' + esc(s.v) + '</span>';
  }).join('');
}

function renderGrid(){
  renderLegend();
  var n = daysIn();
  var h = '<table class="grid"><thead><tr class="r1"><th class="name" rowspan="2">名前</th>';
  var d, wd, closed;
  for (d = 1; d <= n; d++) {
    wd = new Date(ym.y, ym.m - 1, d).getDay();
    closed = !!month.closed[d];
    h += '<th colspan="2" class="day wd' + wd + (closed ? ' closed' : '') + (isToday(d) ? ' today' : '') + '">' +
         '<button class="daybtn" data-act="closed" data-d="' + d + '" aria-label="' + ym.m + '月' + d + '日 休業日の切り替え">' +
         d + '<small>' + WD[wd] + '</small></button></th>';
  }
  h += '</tr><tr class="r2">';
  for (d = 1; d <= n; d++) h += '<th>AM</th><th>PM</th>';
  h += '</tr></thead><tbody>';
  staff.forEach(function(p){
    h += '<tr><th class="name">' + esc(p.name) + (p.memo ? '<small>' + esc(p.memo) + '</small>' : '') + '</th>';
    for (d = 1; d <= n; d++) {
      closed = !!month.closed[d];
      ['AM','PM'].forEach(function(ap){
        var v = month.shifts[d + '|' + p.id + '|' + ap];
        var st = statusOf(v);
        h += '<td class="' + (ap === 'AM' ? 'am' : '') + (closed ? ' closed' : '') + '">' +
             '<button class="cell ' + (st ? st.c : '') + '" data-act="cell" data-d="' + d + '" data-id="' + p.id + '" data-ap="' + ap + '"' +
             ' aria-label="' + esc(p.name) + ' ' + ym.m + '月' + d + '日 ' + ap + '">' + (st ? st.s : '') + '</button></td>';
      });
    }
    h += '</tr>';
  });
  h += '</tbody></table>';
  var wrap = $('#gridWrap');
  var sl = wrap.scrollLeft, stp = wrap.scrollTop;
  wrap.innerHTML = h;
  wrap.scrollLeft = sl; wrap.scrollTop = stp;
}

$('#gridWrap').addEventListener('click', function(e){
  var b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.act === 'closed') {
    var d = b.dataset.d;
    if (month.closed[d]) delete month.closed[d]; else month.closed[d] = true;
    queue(mkey(), month);
    renderGrid();
  } else if (b.dataset.act === 'cell') {
    openSheet(b);
  }
});

/* ---------- 選択シート ---------- */
function openSheet(btn){
  var p = staff.filter(function(x){ return x.id === btn.dataset.id; })[0];
  if (!p) return;
  target = {d: btn.dataset.d, id: p.id, ap: btn.dataset.ap, btn: btn};
  var wd = new Date(ym.y, ym.m - 1, +target.d).getDay();
  $('#sheetTitle').textContent = p.name;
  $('#sheetSub').textContent = ym.m + '月' + target.d + '日(' + WD[wd] + ') ' + target.ap;
  var cur = month.shifts[target.d + '|' + target.id + '|' + target.ap] || '';
  var h = STATUS.map(function(s){
    return '<button class="opt ' + s.c + (cur === s.v ? ' now' : '') + '" data-v="' + esc(s.v) + '">' + esc(s.v) + '</button>';
  }).join('');
  h += '<button class="opt clear' + (cur === '' ? ' now' : '') + '" data-v="">空にする</button>';
  $('#opts').innerHTML = h;
  $('#sheetBg').hidden = false;
}
function closeSheet(){ $('#sheetBg').hidden = true; target = null; }
$('#sheetClose').addEventListener('click', closeSheet);
$('#sheetBg').addEventListener('click', function(e){ if (e.target === this) closeSheet(); });
document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !$('#sheetBg').hidden) closeSheet(); });
$('#opts').addEventListener('click', function(e){
  var b = e.target.closest('button');
  if (!b || !target) return;
  var v = b.dataset.v;
  var key = target.d + '|' + target.id + '|' + target.ap;
  if (v) month.shifts[key] = v; else delete month.shifts[key];
  var st = statusOf(v);
  target.btn.className = 'cell ' + (st ? st.c : '');
  target.btn.textContent = st ? st.s : '';
  queue(mkey(), month);
  closeSheet();
});

/* ---------- カレンダー ---------- */
function renderCal(){
  var n = daysIn();
  var first = new Date(ym.y, ym.m - 1, 1).getDay();
  var off = (first + 6) % 7;
  var heads = ['月','火','水','木','金','土','日'];
  var h = heads.map(function(w, i){ return '<div class="wh' + (i === 6 ? ' sun' : i === 5 ? ' sat' : '') + '">' + w + '</div>'; }).join('');
  var i, d;
  for (i = 0; i < off; i++) h += '<div class="d blank"></div>';
  for (d = 1; d <= n; d++) {
    var wd = new Date(ym.y, ym.m - 1, d).getDay();
    var closed = !!month.closed[d];
    h += '<div class="d' + (wd === 0 ? ' sun' : wd === 6 ? ' sat' : '') + (closed ? ' closed' : '') + (isToday(d) ? ' today' : '') + '">' +
         '<div class="n">' + d + '</div>';
    if (closed) {
      h += '<div class="off">休み</div>';
    } else {
      ['AM','PM'].forEach(function(ap){
        var names = staff.filter(function(p){ return month.shifts[d + '|' + p.id + '|' + ap] === '出勤'; })
                         .map(function(p){ return esc(p.name.replace(/(さん|ちゃん|くん)$/, '')); });
        h += '<div class="row ' + ap.toLowerCase() + '"><b>' + ap + '</b>' + names.join('・') + '</div>';
      });
    }
    h += '</div>';
  }
  $('#cal').innerHTML = h;
}

/* ---------- スタッフ ---------- */
function renderStaff(){
  var h = staff.map(function(p, i){
    return '<div class="staff-row" data-id="' + p.id + '">' +
      '<input data-f="name" value="' + esc(p.name) + '" aria-label="名前">' +
      '<div class="btns">' +
        '<button data-act="up" aria-label="上へ"' + (i === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button data-act="down" aria-label="下へ"' + (i === staff.length - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button class="del" data-act="del">削除</button>' +
      '</div>' +
      '<input class="memo" data-f="memo" value="' + esc(p.memo || '') + '" placeholder="メモ(任意)" aria-label="メモ">' +
    '</div>';
  }).join('');
  $('#staffList').innerHTML = h || '<p class="hint">従業員がいません。上の欄から追加してください。</p>';
}
$('#staffList').addEventListener('change', function(e){
  var row = e.target.closest('.staff-row');
  if (!row || !e.target.dataset.f) return;
  var p = staff.filter(function(x){ return x.id === row.dataset.id; })[0];
  if (!p) return;
  var v = e.target.value.trim();
  if (e.target.dataset.f === 'name' && !v) { e.target.value = p.name; return; }
  p[e.target.dataset.f] = v;
  queue('staff', staff);
});
$('#staffList').addEventListener('click', function(e){
  var b = e.target.closest('button');
  var row = e.target.closest('.staff-row');
  if (!b || !row) return;
  var idx = -1;
  staff.forEach(function(x, i){ if (x.id === row.dataset.id) idx = i; });
  if (idx < 0) return;
  if (b.dataset.act === 'up' && idx > 0) {
    var t = staff[idx - 1]; staff[idx - 1] = staff[idx]; staff[idx] = t;
  } else if (b.dataset.act === 'down' && idx < staff.length - 1) {
    var t2 = staff[idx + 1]; staff[idx + 1] = staff[idx]; staff[idx] = t2;
  } else if (b.dataset.act === 'del') {
    if (!confirm(staff[idx].name + 'を削除しますか?\nこの人のシフトも表示されなくなります。')) return;
    staff.splice(idx, 1);
  } else { return; }
  queue('staff', staff);
  renderStaff();
});
$('#addBtn').addEventListener('click', function(){
  var inp = $('#newName');
  var v = inp.value.trim();
  if (!v) return;
  staff.push({id:newId(), name:v, memo:''});
  inp.value = '';
  queue('staff', staff);
  renderStaff();
});
$('#gotoStaff').addEventListener('click', function(){ tab = 'staff'; renderAll(); window.scrollTo(0, 0); });
$('#newName').addEventListener('keydown', function(e){ if (e.key === 'Enter') $('#addBtn').click(); });

start();
})();
