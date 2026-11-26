const median = values => { const sorted = [...values].sort((a,b)=>a-b); const mid = Math.floor(sorted.length/2); return sorted.length%2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2; };
const SEARCH = 8;
const PATCH = 4;
function patchCost(a,b,w,x,y,dx,dy) {
  let cost=0;
  for(let j=-PATCH;j<=PATCH;j+=2) for(let i=-PATCH;i<=PATCH;i+=2) cost+=Math.abs(a[(y+j)*w+x+i]-b[(y+j+dy)*w+x+i+dx]);
  return cost/25;
}
export function estimateCameraTranslation(previous,current,width,height) {
  if (!previous || previous.length!==current.length || width<64 || height<64) return null;
  const margin=SEARCH+PATCH+2, matches=[];
  for(let row=0;row<5;row++) for(let col=0;col<5;col++) {
    const cx=Math.round(margin+(width-2*margin-1)*(col+.5)/5), cy=Math.round(margin+(height-2*margin-1)*(row+.5)/5);
    let x=cx,y=cy,texture=0;
    for(let oy=-5;oy<=5;oy+=5) for(let ox=-5;ox<=5;ox+=5) {
      const px=cx+ox,py=cy+oy;
      if(px<margin||py<margin||px>=width-margin||py>=height-margin) continue;
      let score=0;
      for(let j=-PATCH;j<=PATCH;j+=2) for(let i=-PATCH;i<=PATCH;i+=2) {
        const k=(py+j)*width+px+i;
        score+=Math.abs(previous[k-1]-previous[k+1])+Math.abs(previous[k-width]-previous[k+width]);
      }
      if(score>texture){texture=score;x=px;y=py;}
    }
    if(texture<220) continue;
    let dx=0,dy=0,best=Infinity;
    for(let j=-SEARCH;j<=SEARCH;j++) for(let i=-SEARCH;i<=SEARCH;i++) {
      const cost=patchCost(previous,current,width,x,y,i,j);
      if(cost<best){best=cost;dx=i;dy=j;}
    }
    if(best>25||Math.abs(dx)===SEARCH||Math.abs(dy)===SEARCH) continue;
    const refine=(left,right)=>{const curvature=left+right-2*best;return curvature>0?Math.max(-.5,Math.min(.5,(left-right)/(2*curvature))):0;};
    matches.push({x:dx+refine(patchCost(previous,current,width,x,y,dx-1,dy),patchCost(previous,current,width,x,y,dx+1,dy)),y:dy+refine(patchCost(previous,current,width,x,y,dx,dy-1),patchCost(previous,current,width,x,y,dx,dy+1))});
  }
  if(matches.length<8) return null;
  const x=median(matches.map(p=>p.x)),y=median(matches.map(p=>p.y));
  const inliers=matches.filter(p=>Math.hypot(p.x-x,p.y-y)<=1.3);
  if(inliers.length<8||inliers.length/matches.length<.65) return null;
  return {x:median(inliers.map(p=>p.x)),y:median(inliers.map(p=>p.y)),agreement:inliers.length/matches.length};
}

// Le mur occupe la majorité de l’image. Un consensus de petits blocs
// texturés répartis dans le cadre isole sa translation des mouvements locaux.
export function createCameraTracker(video) {
  const canvas=document.createElement("canvas");
  const scale=Math.min(1,424/Math.max(video.videoWidth,video.videoHeight));
  canvas.width=Math.max(1,Math.round(video.videoWidth*scale));
  canvas.height=Math.max(1,Math.round(video.videoHeight*scale));
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  let previous=null, unavailable=!ctx;
  return {
    capture() {
      if(unavailable)return null;
      try {
        ctx.drawImage(video,0,0,canvas.width,canvas.height);
        const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;
        const gray=new Uint8Array(canvas.width*canvas.height);
        for(let i=0,j=0;i<gray.length;i++,j+=4)gray[i]=(77*rgba[j]+150*rgba[j+1]+29*rgba[j+2])>>8;
        const shift=estimateCameraTranslation(previous,gray,canvas.width,canvas.height);
        previous=gray;
        return shift?{x:shift.x*video.videoWidth/canvas.width/video.videoHeight,y:shift.y/canvas.height}:null;
      } catch {
        // Une vidéo cross-origin non lisible ne doit pas produire de vitesses fictives.
        unavailable=true;
        return null;
      }
    }
  };
}
