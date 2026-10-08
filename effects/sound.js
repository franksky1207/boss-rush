// 原創音效及循環配樂由 Web Audio 合成，不依賴外部音檔或 JS 計時器。
const NOTES = Object.freeze({
  button: [460], attack: [180, 420], defend: [260, 520], dodge: [720, 360], counter: [340, 820],
  PERFECT: [1040], GREAT: [880], GOOD: [660], wrong: [150, 110], timeout: [130, 90],
  combo: [880, 1100], bossDefeated: [390, 520, 780], berserkTransition: [120, 170, 220],
  dead: [220, 160, 90], victory: [520, 660, 780, 1040],
});

export class Sound {
  #createContext;
  #createOutput;
  #output = null;
  #destination = null;
  #context = null;
  #master = null;
  #voices = new Set();
  #unlocking = null;
  #attempt = 0;
  #error = '';
  #event = '';
  #silenceEvent = '';
  #music = null;
  #musicBuffer = null;
  #musicWanted = false;
  #silenced = false;
  #resetOnGesture = false;
  #settings = { sound: true, volume: 70 };
  unavailable = false;

  constructor({ createContext = () => {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Context) throw new Error('瀏覽器不支援音效');
    // Safari 17+ 支援媒體播放 audio session；舊版本使用下方媒體輸出橋接。
    try { if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'playback'; } catch { /* 舊 Safari 繼續使用媒體輸出。 */ }
    return new Context();
  }, createOutput = () => {
    const nav = globalThis.navigator;
    const ios = /iPhone|iPad|iPod/.test(nav?.userAgent ?? '') || (nav?.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    if (!ios || !globalThis.Audio) return null;
    const output = new Audio();
    output.setAttribute('playsinline', '');
    output.preload = 'auto';
    return output;
  } } = {}) { this.#createContext = createContext; this.#createOutput = createOutput; }

  get status() {
    if (!this.#settings.sound || !this.#settings.volume) return '音效與配樂目前關閉或音量為 0。';
    if (this.unavailable) return `音訊啟動失敗${this.#error ? `（${this.#error}）` : ''}，請再次按「試聽音效」。`;
    if (!this.#context) return '按「試聽音效」啟動聲音。';
    if (this.#unlocking) return `正在啟動音訊（${this.#context.state}${this.#output ? `／媒體${this.#output.paused ? '暫停' : '播放'}` : ''}）；若未出聲，可再按一次「試聽音效」。`;
    return this.#context.state === 'running' && (!this.#output || !this.#output.paused)
      ? `音訊已啟動（${this.#output ? '手機媒體輸出' : 'Web Audio'}）。`
      : '音訊尚未啟動，請按「試聽音效」。';
  }

  configure(settings) {
    this.#settings = { sound: settings.sound, music: settings.music ?? true, volume: settings.volume };
    if (!this.#settings.music) this.#stopMusic();
    if (!settings.sound || settings.volume === 0) this.stop();
    if (this.#master) this.#master.gain.value = settings.sound ? settings.volume / 100 * 0.22 : 0;
  }

  // 僅由使用者事件呼叫；不排隊重播失敗音效，避免切局後遲到的聲音。
  unlock() {
    if (!this.#settings.sound || this.#settings.volume === 0) return Promise.resolve(false);
    try {
      this.#silenced = false;
      if (this.#resetOnGesture) {
        this.#disposeOutput();
        this.#resetOnGesture = false;
      }
      if (!this.#context || this.#context.state === 'closed') {
        this.#context = this.#createContext();
        this.#musicBuffer = null;
        this.#master = this.#context.createGain();
        this.#output = this.#createOutput();
        if (this.#output) {
          this.#destination = this.#context.createMediaStreamDestination();
          this.#master.connect(this.#destination);
          this.#output.srcObject = this.#destination.stream;
        } else this.#master.connect(this.#context.destination);
        this.configure(this.#settings);
        // iOS 的首次使用者手勢同時啟動極短音源，協助解鎖輸出。
        if (this.#context.createBufferSource) {
          const source = this.#context.createBufferSource();
          source.buffer = this.#context.createBuffer(1, 1, this.#context.sampleRate);
          source.connect(this.#master);
          source.onended = () => source.disconnect();
          source.start();
        }
      }
      if (this.#context.state === 'running' && (!this.#output || !this.#output.paused)) {
        if (this.#output) this.#output.muted = false;
        ++this.#attempt;
        this.#unlocking = null;
        this.#error = '';
        this.unavailable = false;
        return Promise.resolve(true);
      }
      {
        // Safari 的 pointerdown resume 可能一直等待有效手勢；click/touchend 必須重新呼叫，
        // 不能沿用那個尚未完成的 Promise，否則後續所有試聽都會被卡住。
        const attempt = ++this.#attempt;
        const context = this.#context;
        this.unavailable = false;
        this.#error = '';
        // resume 與媒體 play 都必須直接在使用者手勢內呼叫，不能等另一個 Promise 完成。
        const resumed = this.#context.resume();
        if (this.#output) this.#output.muted = false;
        const playing = this.#output?.play();
        this.#unlocking = Promise.all([resumed, playing])
          .then(() => {
            if (context !== this.#context || attempt !== this.#attempt) return false;
            if (this.#silenced) {
              if (this.#output) { this.#output.muted = true; this.#output.pause?.(); }
              return false;
            }
            const ready = this.#context.state === 'running' && !this.#output?.paused;
            if (attempt === this.#attempt) this.unavailable = !ready;
            return ready;
          })
          .catch(error => {
            if (attempt === this.#attempt) { this.unavailable = true; this.#error = error?.name ?? '播放失敗'; }
            return false;
          })
          .finally(() => { if (attempt === this.#attempt) this.#unlocking = null; });
      }
      return this.#unlocking;
    } catch (error) { this.unavailable = true; this.#error = error?.name ?? '初始化失敗'; return Promise.resolve(false); }
  }

  play(...names) {
    if (!this.#settings.sound || this.#settings.volume === 0 || this.#context?.state !== 'running' || this.#output?.paused) return false;
    this.#stopEffects();
    try {
      const notes = names.flatMap(name => NOTES[name] ?? []).slice(0, 6);
      if (notes.length && this.#context.createBufferSource && this.#context.createBuffer) {
        // 有限 PCM 片段到尾端自然結束，即使 Safari 的 oscillator.stop 回呼異常也不會持續鳴叫。
        const rate = this.#context.sampleRate;
        const duration = (notes.length - 1) * .065 + .13;
        const buffer = this.#context.createBuffer(1, Math.ceil(rate * duration), rate);
        const samples = buffer.getChannelData(0);
        for (const [index, frequency] of notes.entries()) {
          const offset = Math.round(index * .065 * rate);
          for (let i = 0; i < Math.floor(.13 * rate) && offset + i < samples.length; i++) {
            const t = i / rate;
            const envelope = Math.min(1, t / .008) * Math.exp(-t * 48) * Math.max(0, Math.min(1, (.13 - t) / .01));
            samples[offset + i] += .55 * envelope * Math.sin(2 * Math.PI * frequency * t);
          }
        }
        const source = this.#context.createBufferSource(), gain = this.#context.createGain();
        const voice = { oscillator: source, gain };
        this.#voices.add(voice);
        source.buffer = buffer;
        source.loop = false;
        source.connect(gain); gain.connect(this.#master);
        source.onended = () => { source.disconnect(); gain.disconnect(); this.#voices.delete(voice); };
        source.start();
        return true;
      }
      for (const [index, frequency] of notes.entries()) {
        const oscillator = this.#context.createOscillator();
        const gain = this.#context.createGain();
        const voice = { oscillator, gain };
        this.#voices.add(voice);
        oscillator.type = names.includes('wrong') || names.includes('dead') ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        oscillator.connect(gain);
        gain.connect(this.#master);
        const start = this.#context.currentTime + index * 0.065;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.55, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
        gain.gain.setValueAtTime(0, start + .13);
        oscillator.onended = () => {
          oscillator.disconnect(); gain.disconnect(); this.#voices.delete(voice);
        };
        oscillator.start(start);
        oscillator.stop(start + 0.13);
      }
      return notes.length > 0;
    } catch { this.stop(); this.unavailable = true; return false; }
  }

  update(state) {
    this.#musicWanted = !state.paused && !['home', 'dead', 'victory'].includes(state.phase);
    if (this.#musicWanted) this.#startMusic();
    else this.#stopMusic();
    const event = `${state.session}:${state.turn}:${state.phase}`;
    // 首頁／暫停只在進入時停止；不要每一影格切斷試聽音源或反覆操作媒體播放器。
    const silence = Boolean(state.paused || state.phase === 'home');
    const eventKey = `${event}:${silence}`;
    if (silence && eventKey !== this.#silenceEvent) this.stop();
    this.#silenceEvent = eventKey;
    if (event === this.#event) return;
    this.#event = event;
    if (state.paused) return;
    if (['bossDefeated', 'berserkTransition', 'dead', 'victory'].includes(state.phase)) this.play(state.phase);
    else if (state.phase === 'resolving' && state.result) {
      const { grade, action } = state.result;
      const comboUp = [5, 10, 15, 20].includes(state.combo);
      this.play(grade === 'wrong' || grade === 'timeout' ? grade : action,
        grade === 'wrong' || grade === 'timeout' ? '' : grade, comboUp ? 'combo' : '');
    }
  }

  stop() {
    this.#silenced = true;
    if (this.#output) { this.#output.muted = true; this.#output.pause?.(); }
    this.#stopMusic();
    this.#stopEffects();
  }

  interrupt() {
    this.stop();
    // iOS 切分頁可能留下 running 但已無聲的 context／MediaStream。
    // 回來後等下一次使用者操作重建，不要求重新整理，也不自動恢復戰鬥。
    this.#resetOnGesture = true;
    ++this.#attempt;
    this.#unlocking = null;
  }

  #disposeOutput() {
    this.#stopMusic();
    this.#stopEffects();
    if (this.#output) {
      this.#output.muted = true;
      this.#output.pause?.();
      this.#output.srcObject = null;
    }
    for (const track of this.#destination?.stream?.getTracks?.() ?? []) track.stop();
    try { this.#master?.disconnect(); } catch { /* 清理不得中斷遊戲。 */ }
    try { const closed = this.#context?.close?.(); if (closed?.catch) void closed.catch(() => {}); } catch { /* 舊 context 仍須釋放引用。 */ }
    this.#context = null;
    this.#output = null;
    this.#destination = null;
    this.#master = null;
    this.#musicBuffer = null;
    this.#unlocking = null;
    ++this.#attempt;
  }

  #startMusic() {
    if (this.#music || this.#settings.music === false || !this.#settings.sound || !this.#settings.volume || this.#context?.state !== 'running' || !this.#context.createBufferSource) return;
    try {
      if (!this.#musicBuffer) {
        const rate = this.#context.sampleRate;
        const beat = 0.3, seconds = beat * 32;
        const buffer = this.#context.createBuffer(1, Math.ceil(rate * seconds), rate);
        const samples = buffer.getChannelData(0);
        const melody = [220, 261.63, 329.63, 293.66, 220, 261.63, 392, 329.63, 174.61, 220, 261.63, 329.63, 196, 246.94, 293.66, 246.94];
        for (let i = 0; i < samples.length; i++) {
          const t = i / rate, step = Math.floor(t / beat), local = t % beat;
          const envelope = Math.min(1, local / .012) * Math.exp(-local * 10);
          const note = melody[step % melody.length];
          const bass = step < 8 || step >= 16 && step < 24 ? 110 : 87.31;
          samples[i] = envelope * (.14 * Math.sin(2 * Math.PI * note * t) + .04 * Math.sin(4 * Math.PI * note * t)) + .08 * Math.sin(2 * Math.PI * bass * t) * Math.sin(Math.PI * local / beat);
        }
        this.#musicBuffer = buffer;
      }
      const source = this.#context.createBufferSource();
      source.buffer = this.#musicBuffer;
      source.loop = true;
      source.connect(this.#master);
      source.start();
      this.#music = source;
    } catch { this.#stopMusic(); }
  }

  #stopMusic() {
    if (!this.#music) return;
    this.#music.loop = false;
    try { this.#music.stop(); } catch { /* 已停止仍須切斷輸出。 */ }
    try { this.#music.disconnect(); } catch { /* 音訊不可影響判定。 */ }
    this.#music = null;
  }

  #stopEffects() {
    for (const { oscillator, gain } of this.#voices) {
      try { oscillator.stop(); } catch { /* 已結束的短音可直接釋放。 */ }
      try { oscillator.disconnect(); gain.disconnect(); } catch { /* 播放失敗不影響遊戲。 */ }
    }
    this.#voices.clear();
  }
}
