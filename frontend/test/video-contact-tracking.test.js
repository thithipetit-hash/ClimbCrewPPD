import test from 'node:test';
import assert from 'node:assert/strict';
import {createContactCycle,createContactTracker,scoreContactEvents} from '../src/lib/video-contact-tracking.js';
const point=x=>({x,y:.5});
const block=(n,x,y)=>Array.from({length:n},()=>[x,y]);
function sequence(positions,foot=true){const c=createContactCycle({fps:8,imageHeight:1000,foot});const events=[];positions.forEach(([x,y],i)=>{const r=c.update(x===null?null:point(x),y===null?null:point(y),.2,i/8);if(r)events.push(r.kind);});return events;}
test('long transfer and short adjustment',()=>assert.deepEqual(sequence([...block(10,.3,.32),...block(10,.45,.47),...block(10,.49,.51)]),['transfer','adjustment']));
test('pivot around stable heel',()=>assert.deepEqual(sequence([...block(10,.3,.32),...block(10,.35,.32)]),['pivot']));
test('return without new stable endpoint',()=>assert.deepEqual(sequence([...block(10,.3,.32),...block(2,.4,.42),...block(10,.3,.32)]),['return']));
test('occlusion resets cycle',()=>assert.deepEqual(sequence([...block(10,.3,.32),[null,null],...block(10,.5,.52)]),[]));
test('jitter and insufficient stabilization',()=>assert.deepEqual(sequence([...block(10,.3,.32),...Array.from({length:20},(_,i)=>[.3+(i%2)*.003,.32+(i%2)*.003]),...block(2,.5,.52)]),[]));
test('wall translation alone',()=>{const c=createContactTracker({sampleFps:8,footAdjustmentMaxDistanceTorso:.35},1000);for(let i=0;i<40;i++){let x=i*.003;assert.deepEqual(c.update({hipCenter:point(.4+x),torsoLength:.2,leftFoot:point(.3+x),leftFootSecondary:point(.32+x)},i/8,i?{x:.003,y:0}:null),[]);}assert.equal(c.summary(5).footTransfers,0);});
test('benchmark matches once by side and type',()=>{const a={type:'foot-transfer',side:'left',time:2};const s=scoreContactEvents([a,{...a,time:2.1},{...a,side:'right'}],[a]);assert.deepEqual([s.tp,s.fp,s.fn,s.f1],[1,2,0,.5]);assert.equal(scoreContactEvents([],[]).f1,null);});

test('disjoint foot observations cannot inflate simultaneous coverage',()=>{
 const c=createContactTracker({sampleFps:8,footAdjustmentMaxDistanceTorso:.35},1000);
 for(let i=0;i<20;i++){const side=i<10?'left':'right';c.update({hipCenter:point(.4),torsoLength:.2,[side+'Foot']:point(.3),[side+'FootSecondary']:point(.32)},i/8,i?{x:0,y:0}:null);}
 const s=c.summary(3);assert.equal(s.bothFeetSeconds,0);assert.equal(s.coverage.leftFoot>0,true);assert.equal(s.coverage.rightFoot>0,true);
});
