import { describe, expect, it } from 'vitest';
import { rhythmChart } from '../src/game/chart';
import { RhythmSimulation } from '../src/game/simulation';
import { judgmentFromDelta } from '../src/game/config';
import type { ChartNote, SongChart } from '../src/game/types';
const calibration={active:false,samples:0,previewOffsetMs:null};
const chart=(notes:ChartNote[]):SongChart=>({id:'test-only',title:'test',artist:'test',bpm:120,leadInMs:0,totalLengthMs:5000,notes});
const note=(kind:ChartNote['kind']='tap',timeMs=1000):ChartNote=>({id:'one',lane:0,kind,timeMs,...(kind==='hold'?{durationMs:500}:{})});
const snapshot=(s:RhythmSimulation)=>s.getSnapshot(.5,0,calibration);
describe('judgement boundaries',()=>{
 it.each([[45,'perfect'],[46,'great'],[90,'great'],[91,'good'],[140,'good'],[141,'miss'],[NaN,'miss']] as const)('%s ms → %s',(delta,expected)=>expect(judgmentFromDelta(delta)).toBe(expected));
 it('accepts last good millisecond once',()=>{const s=new RhythmSimulation(chart([note()]));s.beginRun();expect(s.pressLane(0,1140).type).toBe('hit');const before=snapshot(s).score;s.pressLane(0,1140);expect(snapshot(s).score).toBe(before);});
 it('misses outside window',()=>{const s=new RhythmSimulation(chart([note()]));s.beginRun();expect(s.pressLane(0,1141).type).toBe('empty');expect(snapshot(s).judgments.miss).toBe(1);});
});
describe('holds, bombs and clock integrity',()=>{
 it('counts an early released hold as a miss',()=>{const s=new RhythmSimulation(chart([note('hold')]));s.beginRun();s.pressLane(0,1000);s.releaseLane(0,1100);expect(snapshot(s).judgments.miss).toBe(1);expect(snapshot(s).accuracy).toBeLessThan(100);});
 it('counts all elapsed hold ticks on release at tail, exactly once',()=>{const s=new RhythmSimulation(chart([note('hold')]));s.beginRun();s.pressLane(0,1000);s.releaseLane(0,1500);expect(snapshot(s).chart[0].holdTicks).toBe(5);const before=snapshot(s).score;s.releaseLane(0,1600);s.update(1700);expect(snapshot(s).score).toBe(before);});
 it('bomb damages once and lowers accuracy',()=>{const s=new RhythmSimulation(chart([note('bomb')]));s.beginRun();s.pressLane(0,1000);s.pressLane(0,1000);expect(snapshot(s).hp).toBe(88);expect(snapshot(s).judgments.miss).toBe(1);});
 it('dodging a bomb does not cost HP',()=>{const s=new RhythmSimulation(chart([note('bomb')]));s.beginRun();s.update(1300);expect(snapshot(s).chart[0].status).toBe('dodged');expect(snapshot(s).hp).toBe(100);});
 it('ignores invalid and backward clocks without poisoning scores',()=>{const s=new RhythmSimulation(chart([note()]));s.beginRun();s.update(900);s.update(NaN);s.update(Infinity);s.update(100);expect(snapshot(s).songTimeMs).toBe(900);expect(Number.isFinite(snapshot(s).score)).toBe(true);});
 it('fever decay depends on elapsed time rather than frame count',()=>{const a=new RhythmSimulation(chart([note()]));const b=new RhythmSimulation(chart([note()]));for(const s of [a,b]){s.beginRun();s.pressLane(0,1000);}a.update(1200);for(let t=1010;t<=1200;t+=10)b.update(t);expect(snapshot(a).feverMeter).toBeCloseTo(snapshot(b).feverMeter,8);});
 it('stops judging after lethal damage and resets on restart',()=>{const notes=Array.from({length:20},(_,i)=>({...note('tap',100+i*200),id:String(i)}));const s=new RhythmSimulation(chart(notes));s.beginRun();s.update(4000);const before=snapshot(s).judgments.miss;s.update(5000);expect(snapshot(s).judgments.miss).toBe(before);s.update(7000);expect(snapshot(s).mode).toBe('ended');s.beginRun();expect(snapshot(s).songTimeMs).toBe(0);expect(snapshot(s).hp).toBe(100);expect(snapshot(s).score).toBe(0);});
});

it('plays the complete authored chart through tap/hold/bomb/fever/results in isolated simulation',()=>{
 const s=new RhythmSimulation(rhythmChart);s.beginRun();
 const events=rhythmChart.notes.filter(n=>n.kind!=='bomb').flatMap(n=>[{time:n.timeMs,lane:n.lane,down:true},{time:n.timeMs+(n.durationMs??20),lane:n.lane,down:false}]).sort((a,b)=>a.time-b.time);
 let feverSeen=false;
 for(const e of events){s.update(e.time);if(e.down)s.pressLane(e.lane,e.time);else s.releaseLane(e.lane,e.time);feverSeen ||= snapshot(s).feverActive;}
 s.update(rhythmChart.totalLengthMs+5000);s.update(rhythmChart.totalLengthMs+7000);
 const result=snapshot(s);expect(result.mode).toBe('ended');expect(result.summary?.cleared).toBe(true);expect(result.judgments.miss).toBe(0);expect(result.chart.filter(n=>n.kind==='bomb').every(n=>n.status==='dodged')).toBe(true);expect(result.chart.filter(n=>n.kind==='hold').every(n=>n.status==='completed')).toBe(true);expect(feverSeen).toBe(true);expect(Number.isFinite(result.score)).toBe(true);expect(result.score).toBeGreaterThan(0);
});
