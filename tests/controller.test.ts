import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
const audio=vi.hoisted(()=>({clock:0,pending:Promise.resolve(),start:vi.fn(),stop:vi.fn()}));
vi.mock('../src/game/audio',()=>({RhythmAudioManager:class {setMasterVolume(){}getSongTimeMs(){return audio.clock}getCurrentContextMs(){return audio.clock}startSong(){audio.start();audio.clock=0;return audio.pending}stopSong(){audio.stop()}playBomb(){}playShot(){}playMiss(){}playHoldTick(){}playFeverStart(){}startCalibrationTrack(){return Promise.resolve({startAtMs:0,beatMs:500,beats:8})}}}));
import { RhythmController } from '../src/game/controller';
beforeEach(()=>{audio.clock=0;audio.pending=Promise.resolve();audio.start.mockClear();audio.stop.mockClear();vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{}})});
afterEach(()=>vi.unstubAllGlobals());
describe('controller transitions and storage',()=>{
 it('shares one pending start across overlapping input',async()=>{let release!:()=>void;audio.pending=new Promise<void>(r=>{release=r});const c=new RhythmController();const a=c.startRun();const b=c.restartRun();expect(audio.start).toHaveBeenCalledTimes(1);release();await Promise.all([a,b]);expect(c.getSnapshot().mode).toBe('playing')});
 it('fresh restart does not reuse ended timestamp',async()=>{const c=new RhythmController();await c.startRun();audio.clock=50000;c.step();audio.clock=55000;c.step();expect(c.getSnapshot().mode).toBe('ended');await c.restartRun();expect(c.getSnapshot().mode).toBe('playing');expect(c.getSnapshot().songTimeMs).toBe(0);expect(c.getSnapshot().hp).toBe(100)});
 it('storage quota/security failure keeps the game usable',()=>{vi.stubGlobal('localStorage',{getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('quota')}});const c=new RhythmController();expect(()=>c.setMasterVolume(.2)).not.toThrow();expect(c.getSnapshot().masterVolume).toBe(.2)});
 it('rejects nonfinite and out of bounds persisted settings',()=>{vi.stubGlobal('localStorage',{getItem:()=>'{"latencyOffsetMs":1e999,"masterVolume":-99,"bestScore":-2}',setItem:()=>{}});const c=new RhythmController();expect(c.getSnapshot().latencyOffsetMs).toBe(0);expect(c.getSnapshot().masterVolume).toBe(.72);expect(c.getSnapshot().bestScore).toBe(0)});
 it('failed audio initialization stays at intro and allows retry',async()=>{audio.pending=Promise.reject(new Error('audio blocked'));const c=new RhythmController();await expect(c.startRun()).rejects.toThrow('audio blocked');expect(c.getSnapshot().mode).toBe('intro');audio.pending=Promise.resolve();await c.startRun();expect(c.getSnapshot().mode).toBe('playing')});
});

describe('preserve unreadable or corrupt settings',()=>{
 it.each(['{broken','null','','{}','[]','false','{"latencyOffsetMs":0,"masterVolume":0.5,"bestScore":-2}','{"latencyOffsetMs":0,"masterVolume":0.5,"bestScore":3,"version":2}'])('preserves raw %s while session can play',async(initial)=>{
  let raw=initial;const write=vi.fn((_:string,value:string)=>{raw=value});
  vi.stubGlobal('localStorage',{getItem:()=>raw,setItem:write});
  const c=new RhythmController();c.setMasterVolume(.25);await c.startRun();
  expect(write).not.toHaveBeenCalled();expect(raw).toBe(initial);expect(c.getSnapshot().masterVolume).toBe(.25);expect(c.getSnapshot().mode).toBe('playing');expect(c.getStatusMessage()).toMatch(/저장/);
 });
 it('blocks write-success after initial read denial and retains warning through initialization',()=>{
  const raw='{"latencyOffsetMs":18,"masterVolume":0.61,"bestScore":9876}';const write=vi.fn();
  vi.stubGlobal('localStorage',{getItem:()=>{throw Error('read denied')},setItem:write});
  const c=new RhythmController();expect(c.getStatusMessage()).toMatch(/저장/);c.setMasterVolume(.25);expect(write).not.toHaveBeenCalled();expect(raw).toContain('9876');
 });
 it('checks fresh raw before writing after later corruption',()=>{
  let raw='{"latencyOffsetMs":18,"masterVolume":0.61,"bestScore":9876}';const write=vi.fn((_:string,value:string)=>{raw=value});
  vi.stubGlobal('localStorage',{getItem:()=>raw,setItem:write});const c=new RhythmController();
  raw='{later-corruption';c.setMasterVolume(.25);expect(write).not.toHaveBeenCalled();expect(raw).toBe('{later-corruption');expect(c.getStatusMessage()).toMatch(/저장/);
 });
 it('blocks write when read permission fails after valid load',()=>{
  let denied=false;const write=vi.fn();vi.stubGlobal('localStorage',{getItem:()=>{if(denied)throw Error('read denied');return '{"latencyOffsetMs":18,"masterVolume":0.61,"bestScore":9876}'},setItem:write});
  const c=new RhythmController();denied=true;c.setMasterVolume(.25);expect(write).not.toHaveBeenCalled();expect(c.getStatusMessage()).toMatch(/저장/);
 });
 it.each([null,'{"latencyOffsetMs":18,"masterVolume":0.61,"bestScore":9876}'])('allows valid or missing storage %s',(initial)=>{
  let raw=initial;const write=vi.fn((_:string,value:string)=>{raw=value});vi.stubGlobal('localStorage',{getItem:()=>raw,setItem:write});const c=new RhythmController();c.setMasterVolume(.25);expect(write).toHaveBeenCalledTimes(1);expect(JSON.parse(raw!).masterVolume).toBe(.25);expect(c.getStatusMessage()).toBe('');
 });
});
