import { evaluateResult, eligibleForLeaderboard, createRecord, validNickname } from '../core/results.js?v=0.9.5';
import { LocalStore } from '../storage/local.js?v=0.9.5';
import { Sound } from '../effects/sound.js?v=0.9.5';
import { ACTIONS, DIFFICULTIES } from '../data/rules.js?v=0.9.5';
import { Battle } from '../core/battle.js?v=0.9.5';
import { Scene } from '../effects/scene.js?v=0.9.5';

const $ = id => document.getElementById(id);
const battle = new Battle();
const scene = new Scene($('arena'));
const buttons = [...document.querySelectorAll('[data-action]')];
let token = { session: 0, turn: 0 };
let previousView = '';
let auxiliary = null;
let returnFocus = null;
let resultSession = null;
let completedResult = null;
let completionId = null;
let completedAt = null;
let scoreSubmitted = false;
let clearFailed = false;
const store = new LocalStore({ defaults: { sound: true, volume: 70,
  reducedEffects: matchMedia('(prefers-reduced-motion: reduce)').matches } });
let preferences = store.loadPreferences();
const sound = new Sound();
sound.configure(preferences);

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function render() {
  const state = battle.snapshot();
  const musicButton = $('toggle-music');
  musicButton.textContent = preferences.music ? '♫' : '♫×';
  musicButton.setAttribute('aria-pressed', String(preferences.music));
  musicButton.setAttribute('aria-label', preferences.music ? '關閉背景音樂' : '開啟背景音樂');
  const home = state.phase === 'home';
  const finished = state.phase === 'dead' || state.phase === 'victory';
  $('home').hidden = !home;
  $('battle').hidden = home || finished;
  $('result').hidden = !finished;
  const teaching = state.phase === 'tutorial' && !state.paused;
  const covered = state.paused || teaching || Boolean(auxiliary);
  for (const id of ['settings', 'leaderboard', 'clear-confirmation']) {
    $(id).hidden = auxiliary !== id;
  }
  for (const id of ['home', 'result']) {
    $(id).inert = Boolean(auxiliary);
    $(id).style.visibility = auxiliary ? 'hidden' : '';
    $(id).setAttribute('aria-hidden', String(Boolean(auxiliary)));
  }
  $('pause').hidden = !state.paused || state.exitConfirmation || Boolean(auxiliary);
  $('tutorial').hidden = !teaching || Boolean(auxiliary);
  $('exit-confirmation').hidden = !state.exitConfirmation;
  $('battle').inert = covered;
  $('battle').style.visibility = covered ? 'hidden' : '';
  $('battle').setAttribute('aria-hidden', String(covered));
  if (teaching) {
    $('tutorial-title').textContent = state.move.name;
    $('tutorial-cue').textContent = state.move.cue;
    $('tutorial-answer').textContent = ACTIONS.find(action => action.id === state.move.action).label;
  }
  token = { session: state.session, turn: state.turn };
  for (const button of buttons) button.disabled = state.phase !== 'awaitingInput' || state.paused;
  $('boss-name').textContent = state.boss.name + ' · ' + DIFFICULTIES[state.difficulty].name + (state.mode === 'tutorial' ? ' · 教學' : '');
  $('enemy-name').textContent = state.boss.name;
  $('boss-hp').textContent = `${state.bossHP} / ${state.boss.hp}`;
  $('boss-meter').max = state.boss.hp;
  $('boss-meter').value = state.bossHP;
  $('stage').textContent = `${state.bossIndex + 1} / 5`;
  $('combo').textContent = state.combo;
  $('time').textContent = formatTime(state.battleMs);
  $('player-hp').textContent = `${state.playerHP} / 100`;
  $('player-meter').value = state.playerHP;
  $('arena').dataset.phase = state.phase;
  $('arena').dataset.cue = state.move?.action ?? '';
  const judging = state.phase === 'awaitingInput';
  const telegraph = state.phase === 'telegraph';
  const berserk = state.phase === 'berserkTransition';
  $('phase-label').textContent = berserk ? '狂暴覺醒' : judging ? '選擇你的行動' : telegraph ? '魔王正在蓄勢' : state.phase === 'bossDefeated' ? '魔王已擊敗' : state.phase === 'bossIntro' ? '準備迎戰' : '回合結算';
  $('move').textContent = berserk ? '終焉魔王 · 狂暴' : state.phase === 'bossIntro' || state.phase === 'bossDefeated' ? state.boss.name : state.move?.name ?? '';
  $('cue').textContent = berserk ? '短暫過場後繼續，反應時限維持 2 秒' : state.phase === 'bossDefeated' ? state.bossIndex < 4 ? '回復 20 HP，接著自動挑戰下一王' : '五王挑戰完成' : state.phase === 'bossIntro' ? `每招反應時限 ${state.boss.limit / 1000} 秒` : state.move?.cue ?? '';
  $('gesture').textContent = judging || telegraph ? state.move?.gesture ?? '' : '';
  $('countdown').textContent = judging ? `${(state.remainingMs / 1000).toFixed(2)} 秒` : telegraph ? '即將開始' : '—';
  $('timer-meter').max = state.boss.limit;
  $('timer-meter').value = judging ? state.remainingMs : telegraph ? state.boss.limit : 0;
  $('timer-meter').hidden = !judging && !telegraph;
  scene.update(state, preferences);
  sound.update(state);
  if (auxiliary === 'settings') {
    const status = store.preferenceError ? '設定已套用，但無法儲存於本機；重新整理後可能恢復預設。' : `${sound.status} 設定自動儲存於這台裝置。`;
    if ($('settings-status').textContent !== status) $('settings-status').textContent = status;
  }

  const view = `${state.session}:${state.turn}:${state.phase}:${state.paused}:${state.exitConfirmation}:${auxiliary}`;
  if (view !== previousView) {
    previousView = view;
    const result = state.result;
    $('feedback').textContent = result && !telegraph && !judging && !berserk ? result.grade === 'wrong' ? `選錯 · 勇者 −${DIFFICULTIES[state.difficulty].wrong} HP` : result.grade === 'timeout' ? `超時 · 勇者 −${DIFFICULTIES[state.difficulty].timeout} HP` : `${result.grade} · 魔王 −${result.damage} HP` : '';
    if (auxiliary) { /* 輔助面板自行管理焦點，不跳回底層介面。 */ }
    else if (state.exitConfirmation) $('cancel-exit').focus();
    else if (state.paused) $('resume').focus();
    else if (teaching) $('confirm-tutorial').focus();
    if (finished && resultSession !== state.session) {
      resultSession = state.session;
      completedResult = state;
      completionId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${state.session}-${Math.random()}`;
      completedAt = Date.now();
      scoreSubmitted = false;
      const evaluation = evaluateResult(state);
      $('result-grade').textContent = `評價 ${evaluation.grade}`;
      $('save-score').hidden = !eligibleForLeaderboard(state);
      $('nickname').value = '';
      $('nickname').removeAttribute('aria-invalid');
      $('nickname').disabled = false;
      $('submit-score').disabled = false;
      $('save-status').textContent = state.mode === 'tutorial' ? '教學模式照常計算評價，不列入排行榜。'
        : state.phase === 'dead' ? '死亡結算不列入排行榜。' : '輸入暱稱後記錄本次成績；每次通關只可提交一次。';
      $('result-mode').textContent = `${DIFFICULTIES[state.difficulty].name} · ${state.mode === 'tutorial' ? '教學模式 · 不列入排行榜' : '挑戰模式'}`;
      $('restart').textContent = state.mode === 'tutorial' ? '從第一王重新教學' : '從第一王重新挑戰';
      $('result-title').textContent = state.phase === 'victory' ? '五王擊破！' : '挑戰結束';
      $('result-description').textContent = state.phase === 'victory' ? '你完成了五王連戰。' : `止步於第 ${state.bossIndex + 1} 王：${state.boss.name}。再試一次！`;
      $('summary').replaceChildren();
      for (const [label, value] of [
        ['正確／選錯／超時', `${state.stats.correct} / ${state.stats.wrong} / ${state.stats.timeout}`],
        ['PERFECT／GREAT／GOOD', `${state.stats.PERFECT} / ${state.stats.GREAT} / ${state.stats.GOOD}`],
        ['正確率', `${(evaluation.accuracy * 100).toFixed(2)}%`],
        ['PERFECT 比例', `${(evaluation.perfectRate * 100).toFixed(2)}%`],
        ['最高連擊', state.highestCombo], ['剩餘 HP', state.playerHP], ['有效戰鬥時間', formatTime(state.battleMs)],
      ]) {
        const dt = document.createElement('dt');
        const dd = document.createElement('dd');
        dt.textContent = label;
        dd.textContent = value;
        $('summary').append(dt, dd);
      }
      $('restart').focus();
    }
  }
}

function start(mode, difficulty = $('difficulty').value) {
  auxiliary = null; completedResult = null;
  $('board-difficulty').value = difficulty;
  battle.start(mode, difficulty); render();
}
function describeDifficulty() {
  const rule = DIFFICULTIES[$('difficulty').value];
  $('difficulty-description').innerHTML = `<span>選錯扣 ${rule.wrong} HP · 超時扣 ${rule.timeout} HP</span><span>前四王過關回 ${rule.recovery} HP（上限 100）</span>`;
}
$('difficulty').addEventListener('change', describeDifficulty);
describeDifficulty();
$('board-difficulty').addEventListener('change', refreshBoard);
$('start').addEventListener('click', () => start('challenge'));
$('start-tutorial').addEventListener('click', () => start('tutorial'));
$('restart').addEventListener('click', () => start(battle.snapshot().mode, battle.snapshot().difficulty));
$('back-home').addEventListener('click', () => { battle.home(); render(); $('start').focus(); });
$('resume').addEventListener('click', () => { battle.resume(); render(); });

$('confirm-tutorial').addEventListener('click', () => { battle.confirmTutorial(token); render(); });
for (const id of ['manual-pause', 'tutorial-pause']) $(id).addEventListener('click', () => { battle.pause(); render(); });
for (const id of ['exit', 'paused-exit', 'tutorial-exit']) $(id).addEventListener('click', () => { battle.requestExit(); render(); });
$('cancel-exit').addEventListener('click', () => { battle.cancelExit(); render(); });
$('confirm-exit').addEventListener('click', () => { battle.confirmExit(); render(); $('start').focus(); });
document.addEventListener('keydown', event => {
  const dialog = ['clear-confirmation', 'settings', 'leaderboard', 'exit-confirmation', 'pause', 'tutorial'].map($).find(element => !element.hidden);
  if (!dialog || event.key !== 'Tab') return;
  const items = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
  const first = items[0], last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function refreshSettings() {
  $('sound-enabled').checked = preferences.sound;
  $('volume').value = preferences.volume;
  $('volume-value').textContent = `${preferences.volume}%`;
  $('reduced-effects').checked = preferences.reducedEffects;
  $('settings-status').textContent = store.preferenceError
    ? '設定已套用，但無法儲存於本機；重新整理後可能恢復預設。'
    : `${sound.status} 設定自動儲存於這台裝置。`;
}

function refreshBoard() {
  const records = store.records.filter(record => record.difficulty === $('board-difficulty').value);
  $('leaderboard-list').replaceChildren();
  for (const [index, record] of records.entries()) {
    const row = document.createElement('li');
    const title = document.createElement('div');
    title.className = 'rank-title';
    const name = document.createElement('span');
    const grade = document.createElement('strong');
    name.textContent = `${index + 1}. ${record.name}`;
    grade.textContent = record.grade;
    title.append(name, grade);
    const details = document.createElement('p');
    const accuracy = evaluateResult(record).accuracy;
    details.textContent = `正確率 ${(accuracy * 100).toFixed(2)}% · ${formatTime(record.battleMs)}`;
    const date = document.createElement('small');
    date.textContent = new Date(record.completedAt).toLocaleString('zh-TW');
    row.append(title, details, date);
    $('leaderboard-list').append(row);
  }
  $('clear-board').disabled = store.records.length === 0;
  $('leaderboard-status').textContent = clearFailed
    ? '本次畫面已清除，但無法清除本機儲存；重新整理可能再次出現舊紀錄。'
    : store.leaderboardError ? '部分本機成績無法讀取或儲存；以下紀錄可能僅保留於本次頁面。'
      : records.length ? '排序：評價 → 正確率 → 有效戰鬥時間 → 較早完成。' : '目前尚無紀錄。';
}

function openPanel(id, focusId) {
  returnFocus = document.activeElement;
  auxiliary = id;
  if (id === 'settings') refreshSettings();
  if (id === 'leaderboard') refreshBoard();
  render();
  $(focusId).focus();
}
function closePanel() {
  auxiliary = null;
  render();
  if (returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus();
  returnFocus = null;
}
for (const button of document.querySelectorAll('[data-open-settings]')) {
  button.addEventListener('click', () => openPanel('settings', 'sound-enabled'));
}
for (const button of document.querySelectorAll('[data-open-board]')) {
  button.addEventListener('click', () => openPanel('leaderboard', 'close-board'));
}
$('close-settings').addEventListener('click', closePanel);
$('close-board').addEventListener('click', closePanel);
function changePreferences() {
  preferences = store.savePreferences({ ...preferences, sound: $('sound-enabled').checked,
    volume: Number($('volume').value), reducedEffects: $('reduced-effects').checked });
  sound.configure(preferences);
  // 啟用開關／調整音量本身也是使用者互動。
  void sound.unlock().then(refreshSettings);
  refreshSettings();
  render();
}
$('sound-enabled').addEventListener('change', changePreferences);
$('reduced-effects').addEventListener('change', changePreferences);
$('volume').addEventListener('input', changePreferences);
$('toggle-music').addEventListener('click', () => {
  preferences = store.savePreferences({ ...preferences, music: !preferences.music });
  sound.configure(preferences);
  if (preferences.music) void sound.unlock();
  render();
});
$('test-sound').addEventListener('click', () => {
  void sound.unlock().then(enabled => {
    if (enabled && auxiliary === 'settings' && !document.hidden) sound.play('attack', 'PERFECT');
    refreshSettings();
  });
});
$('save-score').addEventListener('submit', event => {
  event.preventDefault();
  const state = battle.snapshot();
  if (scoreSubmitted || !completedResult || state.session !== resultSession || !eligibleForLeaderboard(state)) return;
  const name = $('nickname').value;
  if (!validNickname(name)) {
    $('save-status').textContent = '請輸入 1–12 字暱稱（空白前後不計）。';
    $('nickname').setAttribute('aria-invalid', 'true');
    $('nickname').focus();
    return;
  }
  $('nickname').removeAttribute('aria-invalid');
  const record = createRecord(completedResult, name, { id: completionId, completedAt });
  const saved = store.add(record);
  if (!saved.accepted) return;
  scoreSubmitted = true;
  $('nickname').disabled = true;
  $('submit-score').disabled = true;
  clearFailed = false;
  $('save-status').textContent = !saved.persistent ? '無法儲存於本機；成績與暫存排行榜保留於本次頁面，重新整理後可能遺失。'
    : saved.rank ? `成績已儲存，目前第 ${saved.rank} 名。` : '成績已提交，未進入本機前 20 名。';
});
$('clear-board').addEventListener('click', () => {
  auxiliary = 'clear-confirmation'; render(); $('cancel-clear').focus();
});
$('cancel-clear').addEventListener('click', () => {
  auxiliary = 'leaderboard'; render(); $('clear-board').focus();
});
$('confirm-clear').addEventListener('click', () => {
  clearFailed = !store.clear();
  auxiliary = 'leaderboard'; refreshBoard(); render(); $('close-board').focus();
});

// 初始化與恢復音訊僅發生於使用者操作；沒有背景排隊音效。
document.addEventListener('pointerdown', () => { void sound.unlock(); }, { capture: true });
document.addEventListener('touchend', () => { void sound.unlock(); }, { capture: true, passive: true });
document.addEventListener('click', event => {
  void sound.unlock();
  const button = event.target.closest?.('button');
  if (button && !button.disabled && !button.hasAttribute('data-action')) sound.play('button');
}, { capture: true });

for (const button of buttons) {
  // pointerdown 避免觸控抬手延遲；click 僅用於輔助技術觸發。
  const submit = event => {
    if (button.disabled || (event.type === 'pointerdown' && (!event.isPrimary || event.button !== 0))) return;
    const timestamp = event.timeStamp > performance.timeOrigin ? event.timeStamp - performance.timeOrigin : event.timeStamp;
    battle.submit(button.dataset.action, token, timestamp);
    render();
  };
  button.addEventListener('pointerdown', submit);
  button.addEventListener('click', event => { if (event.detail === 0) submit(event); });
}

function protectBackground() { sound.stop(); battle.pause(); render(); }
document.addEventListener('visibilitychange', () => { if (document.hidden) protectBackground(); });
window.addEventListener('pagehide', protectBackground);
window.addEventListener('blur', protectBackground);
window.addEventListener('resize', protectBackground);

// 單一更新迴圈；新局不新增 timeout / interval 或第二個迴圈。
function frame(now) { battle.tick(now); render(); requestAnimationFrame(frame); }
render();
requestAnimationFrame(frame);
