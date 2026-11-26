import test from "node:test";
import assert from "node:assert/strict";
import { createMotionTracker, createFootCycle } from "../src/lib/video-motion-tracking.js";
import { estimateCameraTranslation } from "../src/lib/video-camera-motion.js";
import { observedPauseRatio, hasMotionCoverage } from "../src/lib/video-analysis-observations.js";

const rules={sampleFps:4,footAdjustmentMaxDistanceTorso:.35,footAdjustmentSpeedTorsoPerSecond:.12,footAdjustmentMinGapSeconds:.7,dynamicSpeedTorsoPerSecond:1.6,pauseSpeedTorsoPerSecond:.08};
function pose(shift,foot,jitter=0) {
  return {torsoLength:.12,hipCenter:{x:.4+shift,y:.4},leftWrist:{x:.3+shift,y:.3},rightWrist:{x:.5+shift,y:.3},leftAnkle:{x:foot+shift+jitter,y:.7},rightAnkle:{x:.55+shift,y:.7}};
}
test("translation du mur et bruit parasite : aucun mouvement, pause observable",()=>{
  const tracker=createMotionTracker(rules,848);
  for(let i=0;i<80;i++){
    const result=tracker.update(pose(i*.005,.5,(i%2?1:-1)*.002),i/4,i?{x:.005,y:0}:null);
    if(result){assert.equal(result.feet.length,0);assert.equal(result.dynamic,false);assert.ok(result.stabilitySpeed<=result.pauseSpeed);}
  }
});
test("un repositionnement court suivi d'un nouvel appui stable compte une seule fois",()=>{
  const tracker=createMotionTracker(rules,848);let events=0;
  for(let i=0;i<80;i++){const foot=i<30?.5:i<34?.5+(i-30)*.006:.524;const r=tracker.update(pose(i*.005,foot,(i%2?1:-1)*.002),i/4,i?{x:.005,y:0}:null);if(r)events+=r.feet.length;}
  assert.equal(events,1);
});
test("un déplacement long ou une occultation ne devient pas un ajustement court",()=>{
  const cycle=createFootCycle(rules,848);let events=0;
  for(let i=0;i<40;i++){const point=i===12?null:{x:i<12?.1:.3,y:.5};if(cycle.update(point,{x:.2,y:.3},.12,i/4,.5))events++;}
  assert.equal(events,0);
  const tracker=createMotionTracker(rules,848);
  tracker.update(pose(0,.5),0,null);
  assert.equal(tracker.update(pose(.2,.5),.25,null),null);
});
test("l'estimation de translation retrouve un déplacement connu et rejette un fond uniforme",()=>{
  const width=100,height=140,first=new Uint8Array(width*height),second=new Uint8Array(width*height);
  let seed=19;for(let i=0;i<first.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;first[i]=seed>>>24;}
  for(let y=2;y<height;y++)for(let x=3;x<width;x++)second[y*width+x]=first[(y-2)*width+x-3];
  const shift=estimateCameraTranslation(first,second,width,height);
  assert.ok(shift && Math.abs(shift.x-3)<.3 && Math.abs(shift.y-2)<.3);
  assert.equal(estimateCameraTranslation(new Uint8Array(first.length),new Uint8Array(first.length),width,height),null);
});
test("les pauses utilisent le temps observable et les faibles couvertures ne sont pas interprétées",()=>{
  const metrics={duration:100,analyzedSeconds:95,motionObservation:{pauseSeconds:40,feetSeconds:25},pauses:[{start:5,end:15}]};
  assert.equal(observedPauseRatio(metrics),.25);
  assert.equal(hasMotionCoverage(metrics,"feetSeconds"),false);
  assert.equal(hasMotionCoverage(metrics,"pauseSeconds"),false);
});
