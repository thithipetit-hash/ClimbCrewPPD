const POINTS = ['hipCenter','leftWrist','rightWrist','leftAnkle','rightAnkle'];
const median = values => { const sorted=[...values].sort((a,b)=>a-b); const i=Math.floor(sorted.length/2);return sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2; };
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);

export function createFootCycle(rules, imageHeight) {
  let stable=[],anchor=null,lastTime=null,lastEvent=-Infinity,peakSpeed=0;
  function reset(){stable=[];anchor=null;lastTime=null;peakSpeed=0;}
  function update(point,hip,torso,time,speed) {
    if(!finitePoint(point)||!finitePoint(hip)||!Number.isFinite(torso)||torso<=0){reset();return false;}
    if(lastTime!==null && (time<=lastTime||time-lastTime>1.5/rules.sampleFps))reset();
    lastTime=time;
    const tolerance=Math.max(.055*torso,1.5/imageHeight);
    if(Number.isFinite(speed))peakSpeed=Math.max(peakSpeed,speed);
    if(stable.some(p=>distance(p.point,point)>tolerance))stable=[];
    stable.push({point,hip,time});
    // Fenêtre bornée : l’appui doit persister, pas seulement traverser un seuil.
    while(stable.length>2&&stable[1].time<=time-.5)stable.shift();
    if(time-stable[0].time<.5-1e-6)return false;
    const center={x:median(stable.map(p=>p.point.x)),y:median(stable.map(p=>p.point.y))};
    if(!anchor){anchor={point:center,hip};peakSpeed=0;return false;}
    const displacement=distance(anchor.point,center)/torso;
    if(displacement<Math.max(.10,3/imageHeight/torso))return false;
    const event=displacement<=rules.footAdjustmentMaxDistanceTorso && distance(anchor.hip,hip)/torso<=.35 && peakSpeed>=rules.footAdjustmentSpeedTorsoPerSecond && time-lastEvent>=Math.max(1.2,rules.footAdjustmentMinGapSeconds);
    anchor={point:center,hip};peakSpeed=0;
    if(event)lastEvent=time;
    return event;
  }
  return {update,reset};
}

export function createMotionTracker(rules,imageHeight) {
  let offset={x:0,y:0},histories={},previous=null,previousTime=null,dynamicCount=0,dynamicActive=false,lastDynamic=-Infinity;
  const cycles={left:createFootCycle(rules,imageHeight),right:createFootCycle(rules,imageHeight)};
  function reset(){offset={x:0,y:0};histories={};previous=null;previousTime=null;dynamicCount=0;dynamicActive=false;cycles.left.reset();cycles.right.reset();}
  function update(raw,time,translation) {
    if(!raw||!finitePoint(raw.hipCenter)||!Number.isFinite(raw.torsoLength)||raw.torsoLength<=0){reset();return null;}
    if(!translation || previousTime!==null&&(time<=previousTime||time-previousTime>1.5/rules.sampleFps))reset();
    else {offset.x+=translation.x;offset.y+=translation.y;}
    const pose={torsoLength:raw.torsoLength};
    for(const key of POINTS){
      const point=raw[key];
      if(!finitePoint(point)){histories[key]=[];pose[key]=null;continue;}
      const adjusted={x:point.x-offset.x,y:point.y-offset.y};
      const history=histories[key]||[];history.push(adjusted);
      const size=Math.max(3,Math.round(rules.sampleFps*.6)|1);
      while(history.length>size)history.shift();histories[key]=history;
      pose[key]={x:median(history.map(p=>p.x)),y:median(history.map(p=>p.y))};
    }
    const prev=previous,prevTime=previousTime;previous=pose;previousTime=time;
    if(!prev||!translation)return null;
    const dt=time-prevTime,torso=(pose.torsoLength+prev.torsoLength)/2;
    if(distance(pose.hipCenter,prev.hipCenter)>torso*1.5||Math.max(pose.torsoLength,prev.torsoLength)/Math.min(pose.torsoLength,prev.torsoLength)>1.8){reset();return null;}
    const speeds={};
    for(const key of POINTS){
      speeds[key]=finitePoint(prev[key])&&finitePoint(pose[key])?Math.max(0,distance(prev[key],pose[key])-Math.max(torso*.025,1.5/imageHeight))/torso/dt:null;
    }
    const available=Object.values(speeds).filter(Number.isFinite);
    const bodySpeed=available.length>=3?median(available):null;
    const feet=[];
    for(const side of ['left','right'])if(cycles[side].update(pose[side+'Ankle'],pose.hipCenter,torso,time,speeds[side+'Ankle']))feet.push(side);
    const maxUpper=Math.max(speeds.leftWrist??0,speeds.rightWrist??0,speeds.hipCenter??0);
    if(maxUpper>=rules.dynamicSpeedTorsoPerSecond && (speeds.hipCenter??0)>=.25)dynamicCount++;
    else {dynamicCount=0;if(maxUpper<rules.dynamicSpeedTorsoPerSecond*.6)dynamicActive=false;}
    const dynamic=dynamicCount>=2&&!dynamicActive&&time-lastDynamic>=1.2;
    if(dynamic){dynamicActive=true;lastDynamic=time;}
    const pauseSpeed=Math.max(.12,rules.pauseSpeedTorsoPerSecond);
    const feetKnown=Number.isFinite(speeds.leftAnkle)&&Number.isFinite(speeds.rightAnkle);
    const stabilitySpeed=feetKnown&&bodySpeed!==null?Math.max(bodySpeed,speeds.hipCenter??0,speeds.leftAnkle/2,speeds.rightAnkle/2):null;
    return {pose,previous:prev,previousTime:prevTime,dt,torso,hipSpeed:speeds.hipCenter,bodySpeed,stabilitySpeed,pauseSpeed,feet,dynamic,feetKnown};
  }
  return {update,reset};
}
