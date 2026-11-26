// Candidates only: 2D stability does not prove physical contact.
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
const limbs=['leftFoot','rightFoot','leftHand','rightHand'];
const median=a=>{const s=[...a].sort((x,y)=>x-y);return (s[Math.floor((s.length-1)/2)]+s[Math.ceil((s.length-1)/2)])/2;};
const center=a=>({x:median(a.map(p=>p.x)),y:median(a.map(p=>p.y))});
export function createContactCycle({fps,imageHeight,shortDistance=.35,foot=true}){
 let anchor=null,win=[],last=null,excursion=0,started=null;
 function reset(){anchor=null;win=[];last=null;excursion=0;started=null;}
 function update(point,secondary,torso,t){
  if(!valid(point)||!valid(secondary)||!Number.isFinite(torso)||torso<=0||!Number.isFinite(t)){reset();return null;}
  if(last!==null&&(t<=last||t-last>1.6/fps))reset();last=t;
  const radius=Math.max(.045*torso,2/imageHeight),threshold=Math.max(.13*torso,4/imageHeight);
  if(anchor){
   const d=dist(anchor.point,point);
   if(d>threshold){if(started===null)started=t;excursion=Math.max(excursion,d);}
   if(started!==null&&t-started>8){reset();last=t;}
  }
  if(win.some(p=>dist(p.point,point)>radius||dist(p.secondary,secondary)>radius*1.5))win=[];
  win.push({point,secondary,t});
  while(win.length>2&&win[1].t<=t-.4+1e-9)win.shift();
  if(win.length<Math.min(3,Math.ceil(fps*.4)+1)||t-win[0].t<.4-1e-6)return null;
  const next={point:center(win.map(p=>p.point)),secondary:center(win.map(p=>p.secondary))};
  if(!anchor){anchor=next;return null;}
  if(started===null)return null;
  const d=dist(anchor.point,next.point),second=dist(anchor.secondary,next.secondary),start=started;
  let kind=null;
  if(d<threshold){if(excursion>=threshold*1.5)kind='return';}
  else if(second<radius*1.5)kind='pivot';
  else if(foot&&d/torso<=shortDistance)kind='adjustment';
  else kind='transfer';
  anchor=next;started=null;excursion=0;win=[];
  return kind?{kind,start,time:t}:null;
 }
 return {update,reset};
}
export function createContactTracker(rules,imageHeight){
 const cycles=Object.fromEntries(limbs.map(l=>[l,createContactCycle({fps:rules.sampleFps,imageHeight,shortDistance:rules.footAdjustmentMaxDistanceTorso,foot:l.endsWith('Foot')})]));
 const coverage=Object.fromEntries(limbs.map(l=>[l,0]));
 const counts={footTransfers:0,handTransfers:0,footReturns:0,footPivots:0};
 let offset={x:0,y:0},last=null,previousTorso=null,previousValid={};
 function reset(){offset={x:0,y:0};last=null;previousTorso=null;previousValid={};Object.values(cycles).forEach(c=>c.reset());}
 function update(pose,time,translation){
  if(!pose||!valid(pose.hipCenter)||!Number.isFinite(pose.torsoLength)||pose.torsoLength<=0){reset();return [];}
  if(!translation||!valid(translation)||last!==null&&(time<=last||time-last>1.6/rules.sampleFps)||previousTorso!==null&&Math.max(pose.torsoLength,previousTorso)/Math.min(pose.torsoLength,previousTorso)>1.35)reset();
  else {offset.x+=translation.x;offset.y+=translation.y;}
  const dt=last===null?0:time-last, corrected=p=>valid(p)?{x:p.x-offset.x,y:p.y-offset.y}:null;
  const events=[];
  for(const limb of limbs){
   const foot=limb.endsWith('Foot'),side=limb.startsWith('left')?'left':'right';
   const p=corrected(pose[limb]),q=corrected(pose[limb+'Secondary']);
   const ok=valid(p)&&valid(q)&&dist(p,q)>2/imageHeight;
   if(ok&&previousValid[limb])coverage[limb]+=dt;previousValid[limb]=ok;
   const event=cycles[limb].update(ok?p:null,ok?q:null,pose.torsoLength,time);
   if(!event)continue;
   let type=null;
   if(foot&&event.kind==='adjustment')type='foot-adjustment';
   else if(event.kind==='transfer'){type=foot?'foot-transfer':'hand-transfer';counts[foot?'footTransfers':'handTransfers']++;}
   else if(foot&&event.kind==='return'){type='foot-return';counts.footReturns++;}
   else if(foot&&event.kind==='pivot'){type='foot-pivot';counts.footPivots++;}
   if(type)events.push({type,side,time:event.start,end:event.time,confidence:.55});
  }
  last=time;previousTorso=pose.torsoLength;return events;
 }
 return {update,reset,summary:duration=>({...counts,coverage:Object.fromEntries(limbs.map(l=>[l,Math.min(duration,coverage[l])]))})};
}
export function scoreContactEvents(predicted,reference,tolerance=.5){
 if(!Number.isFinite(tolerance)||tolerance<0)throw Error('Tolérance invalide');
 const usable=e=>e&&typeof e.type==='string'&&['left','right'].includes(e.side)&&Number.isFinite(e.time)&&e.time>=0;
 if(!predicted.every(usable)||!reference.every(usable))throw Error('Événement invalide');
 const key=e=>e.type+':'+e.side,keys=new Set([...predicted,...reference].map(key));
 let tp=0,abs=0;
 for(const k of keys){
  const p=predicted.filter(e=>key(e)===k).sort((a,b)=>a.time-b.time),r=reference.filter(e=>key(e)===k).sort((a,b)=>a.time-b.time);
  let i=0,j=0;while(i<p.length&&j<r.length){const d=p[i].time-r[j].time;if(Math.abs(d)<=tolerance){tp++;abs+=Math.abs(d);i++;j++;}else if(d<0)i++;else j++;}
 }
 const fp=predicted.length-tp,fn=reference.length-tp;
 return {tp,fp,fn,precision:predicted.length?tp/predicted.length:null,recall:reference.length?tp/reference.length:null,f1:predicted.length+reference.length?2*tp/(predicted.length+reference.length):null,maeSeconds:tp?abs/tp:null};
}
