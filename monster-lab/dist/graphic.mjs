import {visible} from './metrics.mjs';

const edges=[[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,29],[29,31],[28,30],[30,32]];
const partNames={foot:'足部',hip:'髖部',elbow:'肘部',hand:'手部',knee:'膝部',torso:'軀幹',shoulder:'肩部'};
export function selectCandidate(current,sample,key,mode){return Number.isFinite(sample?.[key])&&(!current||!Number.isFinite(current.sample?.[key])||(mode==='min'?sample[key]<current.sample[key]:sample[key]>current.sample[key]));}
export function fitRect(width,height,x,y,w,h){const scale=Math.min(w/width,h/height);return {x:x+(w-width*scale)/2,y:y+(h-height*scale)/2,w:width*scale,h:height*scale};}
export function delta(a,b){return Number.isFinite(a)&&Number.isFinite(b)?b-a:null;}
export function inferBodyPart(correction){
 const part=correction?.bodyPart;
 if(part==='unknown')return null;
 if(partNames[part])return part;
 const words=`${correction?.title??''} ${correction?.instruction??''}`;
 for(const [name,re] of [['foot',/足|腳|foot|ankle/i],['hip',/髖|臀|骨盆|hip|pelvis/i],['elbow',/肘|elbow/i],['hand',/手|腕|hand|wrist/i],['knee',/膝|knee/i],['torso',/軀幹|胸|torso|trunk/i],['shoulder',/肩|shoulder/i]])if(re.test(words))return name;
 return null;
}
export function bodyPartPositions(sample,part,hand,sport){
 const p=sample?.landmarks;if(!p)return [];
 const lead=sport==='golf'?(hand==='right'?0:1):(hand==='right'?1:0);
 const side=lead?{shoulder:12,elbow:14,hand:16,hip:24,knee:26,foot:28}:{shoulder:11,elbow:13,hand:15,hip:23,knee:25,foot:27};
 const one=i=>visible(p[i])?[p[i]]:[];
 if(part==='foot')return [27,28].flatMap(one);
 if(part==='hip')return [23,24].flatMap(one);
 if(part==='torso'){
  const a=p[side.shoulder],b=p[side.hip];return visible(a)&&visible(b)?[{x:(a.x+b.x)/2,y:(a.y+b.y)/2}]:[];
 }
 return side[part]===undefined?[]:one(side[part]);
}
export function createGraphic({getState,seek,video,onLock}){
 const $=id=>document.getElementById(id),canvas=$('graphicCanvas'),ctx=canvas.getContext('2d');
 let frame=null,review=null,capturing=false,exportURL=null;
 const priority=()=>review?.corrections?.[0]??null;
 function sync(){const s=getState();$('captureA').disabled=!s.file||s.busy||capturing;$('graphicJump').disabled=!s.file||s.busy||capturing||!Number.isFinite(priority()?.time);$('graphicFocus').disabled=!!priority();$('downloadGraphic').disabled=!frame||s.busy||capturing;}
 function reset(){frame=null;review=null;$('graphicFocus').value='none';if(exportURL)URL.revokeObjectURL(exportURL);exportURL=null;$('graphicDownloadFallback').hidden=true;$('graphicExportImage').removeAttribute('src');$('graphicStatus').textContent='先選擇影片，再擷取要檢視的畫面。';render();}
 function setReview(value){review=value;if(priority())$('graphicFocus').value='none';render();}
 function complete(){render();}
 async function capture(time){const s=getState();if(!s.file||s.busy||capturing)return;capturing=true;video.pause();onLock(true);sync();try{
  let t=Number.isFinite(time)?time:video.currentTime;
  let sample=null;
  if(s.samples.length){const i=Math.min(s.samples.length-1,Math.max(0,Math.round(t*15)));sample=s.samples[i];t=sample.time;}
  await seek(t);
  const scale=Math.min(1,1600/Math.max(video.videoWidth,video.videoHeight));
  const image=document.createElement('canvas');image.width=Math.max(1,Math.round(video.videoWidth*scale));image.height=Math.max(1,Math.round(video.videoHeight*scale));
  image.getContext('2d').drawImage(video,0,0,image.width,image.height);
  frame={image,time:video.currentTime,sample:sample&&Math.abs(sample.time-video.currentTime)<.12?structuredClone(sample):null};
  $('graphicStatus').textContent=`已擷取原片 ${frame.time.toFixed(2)} 秒。${frame.sample?.landmarks?'骨架可用；請核對圈選位置。':'目前沒有足夠的骨架資料可圈選。'}`;
  render();
 }catch(e){$('graphicStatus').textContent=`無法擷取畫面：${e.message}`;}finally{capturing=false;onLock(false);sync();}}
 function lines(text,maxWidth){const words=[...String(text??'')],out=[];let line='';for(const char of words){if(ctx.measureText(line+char).width>maxWidth&&line){out.push(line);line=char;}else line+=char;}if(line)out.push(line);return out;}
 function render(){
  const s=getState(),c=priority(),manual=!c&&$('graphicFocus').value!=='none',part=c?inferBodyPart(c):manual?$('graphicFocus').value:null,matched=!!(frame&&(manual||c&&Number.isFinite(c.time)&&Math.abs(frame.time-c.time)<=.18));
  const points=matched?bodyPartPositions(frame.sample,part,s.hand,s.sport):[];
  const hasCircle=points.length>0;
  $('graphicPart').textContent=`${manual?'手動觀察部位':'優先修正部位'}：${part?partNames[part]:'待確認'}`;
  $('graphicPriority').textContent=c?`${c.title||'優先練習重點'}：${c.instruction}`:review?`${review.practice?.title||'下一次練習方向'}：${review.practice?.instruction||'以半速重複 5 次，保持動作連續與平衡；熟悉後再逐步恢復原速。'}`:'尚未有可確認的優先修正重點。';
  $('graphicEvidence').textContent=c?`判斷依據：${c.evidence}`:review?`練習方式：${review.practice?.detail||'先建立穩定、可重複的動作節奏。'}`:'AI 尚未檢視這段影片；完成整段檢視後會提供練習方向。';
  $('graphicUncertainty').textContent=manual?hasCircle?'這是你選的觀察位置，不代表 AI 判定該部位需要修正。':'所選部位未被可靠偵測，因此不畫圈。':!c?'單幀骨架只能顯示可見關節，不能判斷完整動作時序。':!Number.isFinite(c.time)?'建議缺少可定位的時間；請對照原片，圖面不圈選。':!matched?`優先建議位於約 ${c.time.toFixed(2)} 秒。請按「擷取優先建議的影格」，再核對圈選。`:!hasCircle?'對應關節未被可靠偵測，或建議部位不明；因此不畫圈，請回看原片。':'圓圈只定位原片中可見的部位；不是改善後的角度或效果。';
  ctx.fillStyle='#252525';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#e5e5e5';ctx.font='600 29px sans-serif';ctx.fillText('MOTION LAB / 單幀骨架重點',52,59);
  const box={x:48,y:92,w:1504,h:738};ctx.fillStyle='#353535';ctx.fillRect(box.x,box.y,box.w,box.h);
  if(frame){const r=fitRect(frame.image.width,frame.image.height,box.x,box.y,box.w,box.h);ctx.drawImage(frame.image,r.x,r.y,r.w,r.h);
   const landmarks=frame.sample?.landmarks;if(landmarks){ctx.save();ctx.beginPath();ctx.rect(box.x,box.y,box.w,box.h);ctx.clip();ctx.strokeStyle='#e8e8e8';ctx.fillStyle='#f6f6f6';ctx.lineWidth=4;
    for(const [a,b] of edges){if(!visible(landmarks[a])||!visible(landmarks[b]))continue;ctx.beginPath();ctx.moveTo(r.x+landmarks[a].x*r.w,r.y+landmarks[a].y*r.h);ctx.lineTo(r.x+landmarks[b].x*r.w,r.y+landmarks[b].y*r.h);ctx.stroke();}
    if(hasCircle){for(const p of points){ctx.beginPath();ctx.arc(r.x+p.x*r.w,r.y+p.y*r.h,Math.max(24,r.w*.028),0,Math.PI*2);ctx.lineWidth=8;ctx.strokeStyle='#ffb779';ctx.stroke();ctx.fillStyle='#ffb77944';ctx.fill();}}ctx.restore();}
  }else{ctx.fillStyle='#bababa';ctx.font='30px sans-serif';ctx.fillText('暫停影片後，擷取一個想檢視的畫面',375,460);}
  ctx.fillStyle='#e2e2e2';ctx.font='600 27px sans-serif';ctx.fillText(frame?`原始影片 · ${frame.time.toFixed(2)} 秒`:'原始影片 · 尚未擷取',54,885);
  ctx.fillStyle='#e8f4d8';ctx.font='25px sans-serif';
  const title=c?`${part?partNames[part]+' · ':''}${c.title||'練習重點'}：${c.instruction}`:review?`${review.practice?.title||'下一次練習方向'}：${review.practice?.instruction||'以半速重複 5 次，保持動作連續與平衡；熟悉後再逐步恢復原速。'}`:'尚未完成 AI 檢視；完成檢視後會提供練習方向。';
  lines(title,1490).slice(0,3).forEach((line,i)=>ctx.fillText(line,54,935+i*32));
  ctx.fillStyle='#b7b7b7';ctx.font='18px sans-serif';ctx.fillText(hasCircle?manual?'圓圈＝手動觀察位置，並非 AI 修正結論。':'圓圈＝原片中可見的重點關節；請回看完整影片確認。':'無可靠對應部位或時間時不畫圈；單張圖不能證明動作時序。',54,1050);
  $('graphicAccessible').textContent=`${frame?`原始影片 ${frame.time.toFixed(2)} 秒`:'尚未擷取'}；${hasCircle?`已圈選${partNames[part]}`:'沒有可靠圈選'}。`;
  canvas.setAttribute('aria-label',$('graphicAccessible').textContent);sync();
 }
 $('captureA').onclick=()=>capture();$('graphicJump').onclick=()=>capture(priority()?.time);$('graphicFocus').onchange=render;
 $('downloadGraphic').onclick=async()=>{if(!frame||getState().busy)return;await document.fonts.ready;render();canvas.toBlob(blob=>{if(!blob){$('graphicStatus').textContent='PNG 匯出失敗，請重試。';return;}if(exportURL)URL.revokeObjectURL(exportURL);exportURL=URL.createObjectURL(blob);const a=$('graphicSaveLink');a.href=exportURL;a.download=`motion-lab-${getState().sport}-single-frame.png`;$('graphicExportImage').src=exportURL;$('graphicDownloadFallback').hidden=false;a.click();$('graphicStatus').textContent='已產生單幀骨架重點 PNG；若未自動下載，請點下方儲存連結。';},'image/png');};
 document.fonts.ready.then(render);render();return {reset,complete,sync,render,setReview};
}
