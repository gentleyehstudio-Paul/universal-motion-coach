export const visible=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??0)>=.65;
export function angle(a,b,c){if(![a,b,c].every(visible))return null;const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y];const norm=Math.hypot(...u)*Math.hypot(...v);return norm<1e-8?null:Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/norm)))*180/Math.PI;}
export function measure(landmarks,width,height,hand='right',sport='basketball'){
 if(!landmarks?.length)return {elbow:null,knee:null,lean:null,hipX:null,torso:null};
 const p=landmarks.map(l=>({...l,x:l.x*width,y:l.y*height}));
 // Basketball uses the shooting side. Golf uses the opposite, lead side.
 const right=sport==='golf'?hand==='left':hand==='right';const [s,e,w,h,k,a]=right?[12,14,16,24,26,28]:[11,13,15,23,25,27];
 const valid=[p[s],p[h]].every(visible);const dx=valid?p[s].x-p[h].x:0,dy=valid?p[h].y-p[s].y:0;
 return {elbow:angle(p[s],p[e],p[w]),knee:angle(p[h],p[k],p[a]),lean:valid&&Math.hypot(dx,dy)>1?Math.atan2(Math.abs(dx),dy)*180/Math.PI:null,hipX:valid?p[h].x:null,torso:valid?Math.hypot(dx,dy):null};
}
export function summary(samples){
 const stats=k=>{const a=samples.map(s=>s[k]).filter(Number.isFinite);return a.length?{min:Math.min(...a),max:Math.max(...a),count:a.length}:null;};
 const valid=samples.filter(s=>Number.isFinite(s.hipX)&&s.torso>1);const scale=valid.length?valid.map(s=>s.torso).sort((a,b)=>a-b)[Math.floor(valid.length/2)]:0;
 return {total:samples.length,detected:samples.filter(s=>s.landmarks?.length).length,elbow:stats('elbow'),knee:stats('knee'),lean:stats('lean'),horizontalSpan:valid.length>1&&scale?(Math.max(...valid.map(s=>s.hipX))-Math.min(...valid.map(s=>s.hipX)))/scale:null};
}
export function timing(sport,marks){const keys=sport==='basketball'?['dip','rise','release','finish']:['address','top','impact','finish'];if(!keys.every(k=>Number.isFinite(marks[k])))return {complete:false};if(!keys.slice(1).every((k,i)=>marks[k]>marks[keys[i]]))return {complete:true,error:'標記需依動作順序遞增；請調整重複或前後顛倒的時間。'};const durations=keys.slice(1).map((k,i)=>marks[k]-marks[keys[i]]);return {complete:true,durations,ratio:sport==='golf'?durations[0]/durations[1]:null};}
