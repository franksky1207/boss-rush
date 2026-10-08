import { ARENA_VISUALS, BERSERK_VISUAL, BOSS_VISUALS, HERO_VISUAL } from '../data/visuals.js?v=0.9.1';

const clamp = value => Math.max(0, Math.min(1, value));
const envelope = (time, start, peak, end) => time < start || time > end ? 0
  : time <= peak ? (time - start) / (peak - start) : (end - time) / (end - peak);
const actor = () => ({ forward: 0, side: 0, angle: 0, opacity: 1, pose: 'idle' });

// 純呈現函式：輸入只讀快照，輸出姿態與特效；無 HP 寫入或排程。
function fullFrame(state) {
  const hero = actor();
  const enemy = actor();
  const frame = { hero, enemy, effect: null, strength: 0, trail: 0, damage: 0, cue: null, enemyTrail: 0, ambient: 0 };
  const progress = state.phaseDurationMs ? clamp(state.phaseElapsedMs / state.phaseDurationMs) : 0;
  if (state.phase === 'telegraph' || state.phase === 'awaitingInput') {
    frame.cue = state.move?.action ?? null;
    enemy.pose = 'attack';
    enemy.angle = frame.cue === 'dodge' ? -15 : frame.cue === 'counter' ? 9 : -5;
    frame.ambient = state.phase === 'telegraph' ? 0.3 + progress * 0.5 : 0.8;
    if (state.bossIndex === 1) { enemy.angle *= 0.7; frame.enemyTrail = 0.25; }
    if (state.bossIndex === 3) enemy.angle *= 0.4;
    return frame;
  }
  if (state.phase === 'berserkTransition') {
    frame.ambient = envelope(progress, 0, 0.45, 1);
    enemy.pose = 'attack';
    enemy.angle = -5 * Math.sin(progress * Math.PI);
    return frame;
  }
  if (state.phase === 'bossDefeated') {
    enemy.pose = 'hurt';
    enemy.opacity = 1 - progress;
    enemy.angle = 18 * progress;
    return frame;
  }
  if (state.phase !== 'resolving') return frame;
  if (progress === 1) return frame;
  const result = state.result;
  if (!result) return frame;
  if (result.grade === 'wrong' || result.grade === 'timeout') {
    hero.pose = 'hurt';
    hero.forward = -envelope(progress, 0, 0.35, 1) * 0.2;
    hero.angle = -10 * Math.sin(progress * Math.PI);
    frame.effect = 'hurt';
    frame.strength = envelope(progress, 0, 0.2, 0.9);
    return frame;
  }
  frame.damage = result.damage;
  const hit = envelope(progress, 0.2, 0.42, 0.8);
  enemy.pose = progress > 0.3 && progress < 0.85 ? 'hurt' : 'idle';
  enemy.forward = -hit * 0.15;
  enemy.angle = hit * 8;
  switch (result.action) {
    case 'attack':
      hero.pose = 'attack';
      hero.forward = envelope(progress, 0, 0.38, 1);
      hero.angle = -12 * hit;
      frame.effect = 'slash';
      frame.strength = hit;
      break;
    case 'defend':
      hero.pose = 'defend';
      enemy.forward = envelope(progress, 0, 0.3, 0.85) * 0.4;
      frame.effect = progress < 0.5 ? 'shield' : 'shockwave';
      frame.strength = progress < 0.5 ? envelope(progress, 0, 0.25, 0.55) : envelope(progress, 0.45, 0.65, 1);
      break;
    case 'dodge':
      hero.pose = progress < 0.5 ? 'idle' : 'attack';
      hero.side = envelope(progress, 0, 0.25, 0.7);
      hero.forward = envelope(progress, 0.45, 0.65, 1) * 0.7;
      enemy.forward = envelope(progress, 0, 0.35, 0.8) * 0.35;
      frame.trail = envelope(progress, 0, 0.2, 0.65) * 0.45;
      frame.effect = progress < 0.5 ? 'heavy-strike' : 'slash';
      frame.strength = envelope(progress, 0.05, 0.35, 0.9);
      break;
    case 'counter':
      hero.pose = progress < 0.45 ? 'defend' : 'attack';
      enemy.forward = envelope(progress, 0, 0.25, 0.65) * 0.5;
      hero.forward = envelope(progress, 0.35, 0.58, 1) * 0.9;
      frame.effect = progress < 0.45 ? 'spark' : 'counter-slash';
      frame.strength = progress < 0.45 ? envelope(progress, 0.05, 0.25, 0.45) : envelope(progress, 0.4, 0.6, 1);
      break;
  }
  // 專屬演出參數只改呈現，不改行動解答、傷害或時計。
  if (state.bossIndex === 0) { enemy.side = hit * 0.12; frame.ambient = hit * 0.4; }
  if (state.bossIndex === 1) { enemy.forward *= 1.35; frame.enemyTrail = hit * 0.4; }
  if (state.bossIndex === 2 || state.bossIndex === 3 || state.bossIndex === 4) frame.ambient = hit * 0.6;
  return frame;
}

// 降低特效保留姿態、文字與固定線索，縮小位移並移除晃動／殘影／能量閃動。
export function sceneFrame(state, { reducedEffects = false } = {}) {
  const frame = fullFrame(state);
  if (!reducedEffects) return frame;
  for (const actor of [frame.hero, frame.enemy]) {
    actor.forward *= 0.15;
    actor.side *= 0.15;
    actor.angle = 0;
  }
  frame.trail = 0;
  frame.enemyTrail = 0;
  frame.ambient = 0;
  frame.strength *= 0.35;
  return frame;
}

class ActorArt {
  constructor(element) {
    this.element = element;
    this.image = element.querySelector('.actor-image');
    this.path = null;
    this.failedPaths = new Set();
    this.image.addEventListener('load', () => { this.element.dataset.asset = 'ready'; });
    this.image.addEventListener('error', () => { this.failedPaths.add(this.path); this.element.dataset.asset = 'fallback'; });
  }

  show(metadata, pose) {
    metadata = { ...metadata, ...metadata.poseMetadata?.[pose] };
    this.element.dataset.prototype = String(metadata.prototype);
    this.element.style.setProperty('--facing-scale', metadata.mirror ? -1 : 1);
    this.element.dataset.actor = metadata.id;
    this.element.dataset.pose = pose;
    this.element.dataset.facing = metadata.facing;
    this.element.dataset.weapon = metadata.weapon ?? 'sword';
    this.element.style.setProperty('--height-ratio', metadata.heightRatio);
    this.element.style.setProperty('--body-ratio', metadata.visibleBounds.width / metadata.visibleBounds.height);
    this.element.style.setProperty('--canvas-scale', metadata.canvas.height / metadata.visibleBounds.height);
    this.element.style.setProperty('--anchor-x', metadata.anchor.x);
    this.element.style.setProperty('--bottom-offset', (metadata.anchor.y - 1) * metadata.canvas.height / metadata.visibleBounds.height);
    const path = metadata.poses[pose] ?? metadata.poses.idle;
    if (path !== this.path) {
      this.path = path;
      if (this.failedPaths.has(path)) { this.element.dataset.asset = 'fallback'; return; }
      this.element.dataset.asset = 'loading';
      this.image.src = path;
    }
  }
}

export class Scene {
  constructor(arena) {
    this.arena = arena;
    this.hero = new ActorArt(arena.querySelector('.hero'));
    this.enemy = new ActorArt(arena.querySelector('.enemy'));
    this.effect = arena.querySelector('#combat-effect');
    this.trail = arena.querySelector('#dodge-trail');
    this.enemyTrail = arena.querySelector('#enemy-trail');
    this.ambient = arena.querySelector('#boss-aura');
    this.damage = arena.querySelector('#damage-text');
    this.rating = arena.querySelector('#rating-text');
    this.combo = arena.querySelector('#combo-burst');
    this.background = arena.querySelector('#scene-image');
    this.background.addEventListener('error', () => { this.background.hidden = true; });
    this.background.addEventListener('load', () => { this.background.hidden = false; });
    this.backgroundPath = null;
    this.bossIndex = -1;
    this.geometry = null;
    this.dirty = true;
    this.observer = new ResizeObserver(() => { this.dirty = true; });
    this.observer.observe(arena);
    // 同一 frame 內旋轉立即重測，不等 observer；其餘時間不反覆觸發 layout。
    window.addEventListener('resize', () => { this.dirty = true; });
  }

  measure() {
    const arena = this.arena.getBoundingClientRect();
    const hero = this.hero.element.getBoundingClientRect();
    const enemy = this.enemy.element.getBoundingClientRect();
    const card = this.arena.querySelector('.move-card').getBoundingClientRect();
    const countdown = this.arena.querySelector('#countdown').getBoundingClientRect();
    const portrait = matchMedia('(orientation: portrait)').matches;
    const heroX = hero.left - arena.left + hero.width / 2;
    const heroY = hero.bottom - arena.top;
    const enemyX = enemy.left - arena.left + enemy.width / 2;
    const enemyY = enemy.bottom - arena.top;
    const textBounds = ['move', 'cue', 'countdown'].map(id => {
      const range = document.createRange(); range.selectNodeContents(this.arena.querySelector('#' + id));
      return range.getBoundingClientRect();
    });
    const textLeft = Math.min(...textBounds.map(rect => rect.left));
    const textRight = Math.max(...textBounds.map(rect => rect.right));
    const heroRoom = Math.max(0, textLeft - hero.right - hero.height * 0.2 - 10);
    const enemyRoom = Math.max(0, enemy.left - textRight - enemy.height * 0.2 - 10);
    const heroTravel = portrait ? Math.max(0, Math.min(arena.height * 0.12, hero.top - countdown.bottom - 8)) : Math.min(arena.width * 0.18, heroRoom);
    const enemyTravel = portrait ? Math.max(0, Math.min(arena.height * 0.12, card.top - enemy.bottom - 16)) : Math.min(arena.width * 0.18, enemyRoom);
    this.geometry = { portrait, heroTravel, enemyTravel, side: portrait ? Math.min(arena.width * 0.12, heroX - hero.width) : Math.min(arena.height * 0.06, arena.height - heroY - 24),
      heroX, heroY, enemyX, enemyY, heroHeight: hero.height, enemyHeight: enemy.height };
    this.dirty = false;
  }

  update(state, { reducedEffects = false } = {}) {
    this.arena.dataset.reduced = String(reducedEffects);
    this.arena.dataset.urgency = state.phase === 'awaitingInput' && state.remainingMs <= state.boss.limit * 0.25 ? 'critical' : '';

    const frame = sceneFrame(state, { reducedEffects });
    const metadata = state.berserk ? BERSERK_VISUAL : BOSS_VISUALS[state.bossIndex];
    this.hero.show(HERO_VISUAL, frame.hero.pose);
    this.enemy.show(metadata, frame.enemy.pose);
    const background = ARENA_VISUALS[state.bossIndex];
    if (this.backgroundPath !== background.src) {
      this.backgroundPath = background.src;
      this.background.hidden = true;
      this.background.src = background.src;
    }
    const visualKey = `${state.bossIndex}:${state.berserk}:${state.move?.id}:${state.phase}`;
    if (this.visualKey !== visualKey) {
      this.visualKey = visualKey;
      this.bossIndex = state.bossIndex;
      this.dirty = true;
    }
    this.arena.dataset.theme = metadata.theme;
    this.arena.dataset.berserk = String(state.berserk);
    this.arena.dataset.scene = background.id;
    this.arena.querySelector('.prototype').textContent = `${background.name}${background.prototype ? ' · 原型占位' : ''}`;
    if (this.arena.parentElement.hidden) {
      this.clear();
      return;
    }
    if (this.dirty) this.measure();
    const geometry = this.geometry;
    for (const [name, art] of [['hero', this.hero], ['enemy', this.enemy]]) {
      const actor = frame[name];
      const sign = name === 'hero' ? 1 : -1;
      const travel = name === 'hero' ? geometry.heroTravel : geometry.enemyTravel;
      const x = geometry.portrait ? actor.side * geometry.side : actor.forward * travel * sign;
      let y = geometry.portrait ? -actor.forward * travel * sign : actor.side * geometry.side;
      if (name === 'enemy') y -= (metadata.floating ?? 0) * geometry.enemyHeight;
      const motion = art.element.querySelector('.motion');
      motion.style.transform = `translate(${x}px, ${y}px) rotate(${actor.angle}deg)`;
      motion.style.opacity = actor.opacity;
      art.element.dataset.motion = actor.forward || actor.side || actor.angle ? 'moving' : 'anchored';
    }
    this.arena.dataset.presentation = state.phase === 'resolving' ? state.result?.action ?? 'hurt' : state.phase;
    const atHero = ['shield', 'spark', 'hurt', 'heavy-strike'].includes(frame.effect);
    this.effect.dataset.kind = frame.effect ?? '';
    this.effect.style.left = `${atHero ? geometry.heroX : geometry.enemyX}px`;
    this.effect.style.top = `${(atHero ? geometry.heroY - geometry.heroHeight * 0.5 : geometry.enemyY - geometry.enemyHeight * 0.5)}px`;
    this.effect.style.opacity = frame.strength;
    this.effect.style.setProperty('--effect-scale', 0.6 + frame.strength * 0.5);
    this.effect.style.setProperty('--effect-size', `${Math.max(24, Math.min(110, (atHero ? geometry.heroHeight : geometry.enemyHeight) * 0.85))}px`);
    this.trail.style.left = `${geometry.heroX}px`;
    this.trail.style.top = `${geometry.heroY - geometry.heroHeight * 0.5}px`;
    this.trail.style.width = `${geometry.heroHeight * 0.5}px`;
    this.trail.style.height = `${geometry.heroHeight}px`;
    this.trail.style.opacity = frame.trail;
    this.enemyTrail.style.left = `${geometry.enemyX}px`;
    this.enemyTrail.style.top = `${geometry.enemyY - geometry.enemyHeight * 0.5}px`;
    this.enemyTrail.style.width = `${geometry.enemyHeight * 0.5}px`;
    this.enemyTrail.style.height = `${geometry.enemyHeight}px`;
    this.enemyTrail.style.opacity = frame.enemyTrail;
    this.ambient.style.left = `${geometry.enemyX}px`;
    this.ambient.style.top = `${geometry.enemyY - geometry.enemyHeight * 0.55}px`;
    this.ambient.style.width = `${geometry.enemyHeight * 0.8}px`;
    this.ambient.style.height = `${geometry.enemyHeight * 0.8}px`;
    this.ambient.style.opacity = frame.ambient;
    this.ambient.dataset.cue = frame.cue ?? '';
    this.damage.textContent = frame.damage && frame.strength ? `−${frame.damage}` : '';
    this.damage.style.left = `${geometry.enemyX}px`;
    this.damage.style.top = `${geometry.enemyY - geometry.enemyHeight * 0.6}px`;
    this.damage.style.opacity = frame.strength;
    const progress = state.phaseDurationMs ? clamp(state.phaseElapsedMs / state.phaseDurationMs) : 0;
    const active = state.phase === 'resolving' && frame.strength > 0;
    const failed = ['wrong', 'timeout'].includes(state.result?.grade);
    const grade = active ? state.result.grade : '';
    this.arena.dataset.grade = grade;
    const rise = reducedEffects ? 0 : progress * 20;
    this.damage.style.transform = `translate(-50%, calc(-50% - ${rise}px)) scale(${reducedEffects ? 1 : 1 + frame.strength * 0.12})`;
    this.damage.dataset.grade = grade;
    this.rating.textContent = active ? ({ wrong: 'MISS', timeout: 'TIME OUT' }[grade] ?? grade) : '';
    this.rating.dataset.grade = grade;
    this.rating.style.opacity = frame.strength;
    this.rating.style.left = `${geometry.portrait ? geometry.heroX : this.arena.clientWidth * 0.5}px`;
    this.rating.style.top = `${geometry.portrait ? geometry.heroY - geometry.heroHeight * 1.25 : this.arena.clientHeight * 0.73}px`;
    this.rating.style.transform = `translate(-50%, -50%) scale(${reducedEffects ? 1 : 0.94 + frame.strength * 0.16})`;
    this.combo.textContent = active && !failed && state.combo >= 5 ? `${state.combo} 連擊` : '';
    this.combo.style.opacity = frame.strength;
    this.combo.style.left = `${geometry.heroX}px`;
    this.combo.style.top = `${geometry.heroY - geometry.heroHeight * 0.4}px`;
    this.combo.style.transform = `translate(-50%, calc(-50% - ${rise}px))`;
    this.effect.style.setProperty('--impact', frame.strength);
    this.effect.style.setProperty('--spark-turn', `${progress * 25}deg`);
    this.arena.dataset.signal = frame.cue ?? '';
  }

  clear() {
    for (const art of [this.hero, this.enemy]) {
      const motion = art.element.querySelector('.motion');
      motion.style.transform = 'translate(0px, 0px) rotate(0deg)';
      motion.style.opacity = 1;
      art.element.dataset.motion = 'anchored';
    }
    this.effect.style.opacity = 0;
    this.effect.dataset.kind = '';
    this.trail.style.opacity = 0;
    this.enemyTrail.style.opacity = 0;
    this.ambient.style.opacity = 0;
    this.damage.textContent = '';
    this.rating.textContent = '';
    this.combo.textContent = '';
    this.arena.dataset.grade = '';
    this.arena.dataset.signal = '';
  }
}
