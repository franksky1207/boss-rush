import test from 'node:test';
import assert from 'node:assert/strict';
import { Sound } from '../effects/sound.js';

function audio({ failResume = false } = {}) {
  const oscillators = [], gains = [];
  const context = { state: 'suspended', currentTime: 0, destination: {},
    resume() { if (failResume) return Promise.reject(new Error('not allowed')); this.state='running'; return Promise.resolve(); },
    createGain() {
      const node = { gain:{value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}}, connect(){}, disconnect(){} };
      gains.push(node); return node;
    },
    createOscillator() {
      const node = { frequency:{value:0}, start(){this.started=true;}, stop(){this.stopped=true;},connect(){},disconnect(){} };
      oscillators.push(node); return node;
    },
  };
  return {context,oscillators,gains};
}
test('音訊僅互動後初始化，未解鎖不排隊；四動作與成功判定具獨立短音', async () => {
  const fake=audio(); let created=0;
  const sound=new Sound({createContext:()=>{created++;return fake.context;}});
  assert.equal(created,0);
  assert.equal(sound.play('attack'),false);
  assert.equal(created,0);
  assert.equal(await sound.unlock(),true);
  const signatures=[];
  for (const action of ['attack','defend','dodge','counter']) {
    const before=fake.oscillators.length;
    sound.play(action,'PERFECT');
    signatures.push(fake.oscillators.slice(before).map(node=>node.frequency.value).join(','));
  }
  assert.equal(new Set(signatures).size,4);
  assert.equal(created,1);
});
test('音效開關及 0／37／100% 音量實際控制增益，靜音立即停止', async () => {
  const fake=audio(),sound=new Sound({createContext:()=>fake.context});
  await sound.unlock();
  sound.configure({sound:true,volume:37});
  assert.equal(fake.gains[0].gain.value,.37*.22);
  sound.play('attack');
  sound.configure({sound:false,volume:100});
  assert.equal(fake.gains[0].gain.value,0);
  assert.equal(fake.oscillators.every(node=>node.stopped),true);
  assert.equal(sound.play('attack'),false);
  sound.configure({sound:true,volume:0});
  assert.equal(sound.play('attack'),false);
  sound.configure({sound:true,volume:100});
  assert.equal(fake.gains[0].gain.value,.22);
});
test('音訊不支援、初始化／resume／播放失敗均不拋錯或排隊', async () => {
  const unsupported=new Sound({createContext:()=>{throw new Error('no context');}});
  assert.equal(await unsupported.unlock(),false);
  assert.equal(unsupported.unavailable,true);
  assert.equal(unsupported.play('victory'),false);
  const fake=audio({failResume:true}), rejected=new Sound({createContext:()=>fake.context});
  assert.equal(await rejected.unlock(),false);
  assert.equal(rejected.play('attack'),false);
  assert.equal(fake.oscillators.length,0);
  const broken=audio();broken.context.createOscillator=()=>{throw new Error('audio failure');};
  const sound=new Sound({createContext:()=>broken.context});
  await sound.unlock();
  assert.equal(sound.play('attack'),false);
  assert.equal(sound.unavailable,true);
});
test('同回合影格、暫停恢復不重播；暫停／退出終止音效，跨局可重新觸發', async () => {
  const fake=audio(),sound=new Sound({createContext:()=>fake.context});
  await sound.unlock();
  const state={session:1,turn:1,phase:'resolving',combo:5,result:{grade:'GREAT',action:'attack'}};
  sound.update(state);
  const length=fake.oscillators.length;
  assert.ok(length>0&&length<=6);
  for (let i=0;i<100;i++)sound.update(state);
  assert.equal(fake.oscillators.length,length);
  sound.update({...state,paused:true});
  assert.equal(fake.oscillators.every(node=>node.stopped),true);
  sound.update(state);
  assert.equal(fake.oscillators.length,length);
  sound.update({...state,session:2});
  assert.equal(fake.oscillators.length,length*2);
  sound.update({...state,phase:'home'});
  assert.equal(fake.oscillators.every(node=>node.stopped),true);
});

test('配樂單一循環、音效不中斷；暫停／靜音／返家停止，恢復可重啟', async () => {
  const fake=audio(), sources=[];
  fake.context.sampleRate=8000;
  fake.context.createBuffer=(_channels,length)=>({getChannelData:()=>new Float32Array(length)});
  fake.context.createBufferSource=()=>{
    const source={start(){this.started=true;},stop(){this.stopped=true;},connect(){},disconnect(){}};
    sources.push(source);return source;
  };
  const sound=new Sound({createContext:()=>fake.context});
  const state={session:1,turn:1,phase:'awaiting',paused:false};
  sound.update(state);
  assert.equal(sources.length,0);
  await sound.unlock();
  sound.update(state);
  const track=sources.at(-1);
  assert.equal(track.loop,true);
  assert.ok(track.buffer.getChannelData(0).length>0);
  for(let i=0;i<100;i++) sound.update(state);
  assert.equal(sources.filter(s=>s.loop).length,1);
  sound.play('attack');
  assert.equal(track.stopped,undefined);
  sound.update({...state,paused:true});
  assert.equal(track.stopped,true);
  sound.update(state);
  assert.equal(sources.filter(s=>s.loop).length,2);
  sound.configure({sound:false,volume:70});
  assert.equal(sources.at(-1).stopped,true);
  sound.update(state);
  assert.equal(sources.filter(s=>s.loop).length,2);
  sound.configure({sound:true,volume:70});
  sound.update(state);
  sound.update({...state,phase:'home'});
  assert.equal(sources.at(-1).stopped,true);
});

test('手機媒體輸出在手勢內同時啟動，拒絕播放可重試，不繞回無聲的直連路徑', async () => {
  const fake=audio(), stream={}, connections=[];
  fake.context.createMediaStreamDestination=()=>({stream});
  const createGain=fake.context.createGain;
  fake.context.createGain=()=>{const gain=createGain();gain.connect=target=>connections.push(target);return gain;};
  let denied=true, plays=0;
  const output={paused:true,play(){plays++;if(denied)return Promise.reject(new Error('NotAllowedError'));this.paused=false;return Promise.resolve();}};
  const sound=new Sound({createContext:()=>fake.context,createOutput:()=>output});
  const first=sound.unlock();
  assert.equal(plays,1);
  assert.equal(fake.context.state,'running');
  assert.equal(output.srcObject,stream);
  assert.equal(connections.includes(fake.context.destination),false);
  assert.equal(await first,false);
  assert.equal(sound.play('attack'),false);
  denied=false;
  assert.equal(await sound.unlock(),true);
  assert.equal(plays,2);
  assert.match(sound.status,/手機媒體輸出/);
  assert.equal(sound.play('attack'),true);
  output.paused=true;
  assert.equal(await sound.unlock(),true);
  assert.equal(plays,3);
});

test('首次 resume 一直等待手勢時，後續點擊重新呼叫並成功，不被舊 Promise 卡住', async () => {
  const fake=audio();let calls=0,release;
  fake.context.resume=()=>{
    calls++;
    if(calls===1)return new Promise(resolve=>{release=resolve;});
    fake.context.state='running';return Promise.resolve();
  };
  const sound=new Sound({createContext:()=>fake.context});
  const pending=sound.unlock();
  assert.match(sound.status,/正在啟動/);
  assert.equal(await sound.unlock(),true);
  assert.equal(calls,2);
  assert.match(sound.status,/音訊已啟動/);
  release();await pending;
  assert.match(sound.status,/音訊已啟動/);
});
