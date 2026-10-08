import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateFrames,validateReview,REVIEW_PROMPT,editPrompt} from './ai-policy.mjs';
import {createHandlers} from './access/handlers.mjs';
import {memoryStore,storeFromEnv} from './access/store.mjs';
import {makeCallModel,loadKnowledge} from './access/model.mjs';
import {resendMailer} from './access/mail.mjs';
const root=new URL('./dist/',import.meta.url),port=Number(process.env.PORT||8765),origin=`http://127.0.0.1:${port}`;
const basketballKnowledge=await loadKnowledge();
const key=process.env.OPENAI_API_KEY;
// Local default is 'open' (owner use, unchanged). Set ML_ACCESS_MODE=enforced + ACCESS_SECRET to test tickets locally.
const accessMode=process.env.ML_ACCESS_MODE==='enforced'?'enforced':'open';
const handlers=createHandlers({env:process.env,store:accessMode==='enforced'?(process.env.UPSTASH_REDIS_REST_URL?storeFromEnv():{...memoryStore(),persistent:true}):memoryStore(),mode:accessMode,mail:resendMailer(process.env),devLogin:process.env.ML_DEV_LOGIN==='1'?origin:'',callModel:makeCallModel(process.env,basketballKnowledge)});
const hdrs=req=>({cookie:req.headers.cookie||'',authorization:req.headers.authorization||'','x-forwarded-for':'','stripe-signature':req.headers['stripe-signature']||''});
const routes={'/api/redeem':'redeem','/api/auth/request':'authRequest','/api/auth/verify':'authVerify','/api/auth/logout':'logout','/api/checkout':'checkout','/api/portal':'portal'};const jobs=new Map();let active=false;
const models={review:process.env.OPENAI_VISION_MODEL||'gpt-6-astra',image:process.env.OPENAI_IMAGE_MODEL||'gpt-image-2.5-sunburst'};
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>15000000)throw new Error('畫面資料過大。');}return JSON.parse(text);}
function safeDetail(value){return String(value??'').replace(/\bBearer\s+[^\s,;]+/gi,'Bearer [已隱藏]').replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g,'[已隱藏 API 金鑰]').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,600);}
async function openai(path,options){const r=await fetch('https://api.openai.com/v1/'+path,{...options,headers:{...options.headers,Authorization:`Bearer ${key}`},signal:AbortSignal.timeout(240000)});let data;try{data=await r.json();}catch{data={};}if(!r.ok){const apiError=data?.error??{},details=[apiError.code&&`代碼 ${safeDetail(apiError.code)}`,apiError.param&&`欄位 ${safeDetail(apiError.param)}`,apiError.message&&safeDetail(apiError.message)].filter(Boolean).join(' · ');const requestId=r.headers.get('x-request-id');const err=new Error(`OpenAI API ${r.status}${details?`：${details}`:'：未提供錯誤細節'}${requestId?`（request ID ${safeDetail(requestId)}）`:''}。不會自動重試。`);err.status=r.status;throw err;}return data;}
export const server=http.createServer(async(req,res)=>{
 if(req.headers.host!==`127.0.0.1:${port}`){send(res,403,{error:'只允許本機存取。'});return;}
 const path=new URL(req.url,origin).pathname;
 if(path==='/api/status'&&req.method==='GET'){const r=await handlers.status({headers:hdrs(req)});send(res,r.status,{...r.body,models});return;}
 if(path.startsWith('/api/')){
  if(req.method!=='POST'||req.headers.origin!==origin||req.headers['x-motion-lab']!=='1'||!(req.headers['content-type']||'').startsWith('application/json')){send(res,403,{error:'請由 Motion Lab 本機介面發送。'});return;}
  if(!key&&path==='/api/review'||!key&&path==='/api/generate'){send(res,503,{error:'尚未設定伺服器 OPENAI_API_KEY；未傳送任何畫面。'});return;}
  if(routes[path]){try{const r=await handlers[routes[path]]({headers:hdrs(req),body:await body(req)});if(r.cookies)res.setHeader('Set-Cookie',r.cookies);send(res,r.status,r.body);}catch(e){send(res,e.expose?500:400,{error:e.message});}return;}
  if(active){send(res,409,{error:'已有一個 AI 工作正在處理，請等待完成。'});return;}
  if(path==='/api/review'&&accessMode==='enforced'){active=true;try{const r=await handlers.review({headers:hdrs(req),body:await body(req)});send(res,r.status,r.body);}catch(e){send(res,400,{error:e.message});}finally{active=false;}return;}
  active=true;
  try{const b=await body(req);if(b.consent!==true)throw new Error('必須先同意將選取畫面送至 OpenAI。');
   for(const [id,j] of jobs)if(Date.now()-j.created>3600000)jobs.delete(id);
   if(path==='/api/review'){
    validateFrames(b);const metadata={sport:b.sport,hand:b.hand,view:b.view,duration:b.duration,sampleRate:15,orderedImages:b.frames.map((f,i)=>({index:i,time:f.time})),bodyMotion15fps:b.motion,phaseAnchors:b.phaseAnchors??null};
    const result=await openai('responses',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:models.review,store:false,instructions:b.sport==='basketball'?`${REVIEW_PROMPT}\n\nBasketball knowledge references (the core checklist is general; the IMG_4216 module is conditional and must not be treated as a universal priority. The current video is the only basis for case-specific conclusions. In user-facing wording, say 細節 rather than using 證據 as a label):\n${basketballKnowledge}`:REVIEW_PROMPT,input:[{role:'user',content:[{type:'input_text',text:`Review the full clip as a chronological video sample. Image order and timestamps are in orderedImages. Use all bodyMotion15fps rows to reason about movement between sampled images. Return your findings as JSON. ${JSON.stringify(metadata)}`},...b.frames.map(f=>({type:'input_image',image_url:f.image,detail:'auto'}))]}],text:{format:{type:'json_object'}}})});
    const output=(result.output??[]).flatMap(o=>o.content??[]).filter(c=>c.type==='output_text').map(c=>c.text).join('');
    const review=validateReview(JSON.parse(output),b.sport);const id=randomUUID();if(jobs.size>=5)jobs.delete(jobs.keys().next().value);jobs.set(id,{sport:b.sport,review,created:Date.now(),generated:new Set()});send(res,200,{id,review});
   }else if(path==='/api/generate'){
    const job=jobs.get(b.id);if(!job)throw new Error('分析已過期，請重新檢視證據。');const phase=b.phase;if(![0,1,2].includes(phase))throw new Error('無效階段。');if(job.generated.has(phase))throw new Error('此階段已生成；如需重新生成，請重新分析並確認。');if(typeof b.goal==='string'&&b.goal.length>500)throw new Error('練習目標請限制在 500 字內。');
    const goal=typeof b.goal==='string'?b.goal.trim():'';if(typeof b.image!=='string'||b.image.length>1800000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(b.image))throw new Error('請先擷取所選階段的原始 JPEG 畫面。');const prompt=editPrompt(job,phase,goal),form=new FormData();form.set('model',models.image);form.set('prompt',prompt);form.set('size','auto');form.set('quality','high');form.set('n','1');
    form.append('image[]',new Blob([Buffer.from(b.image.split(',')[1],'base64')],{type:'image/jpeg'}),`phase-${phase}.jpg`);
    const result=await openai('images/edits',{method:'POST',body:form});const image=result.data?.[0]?.b64_json;if(!image)throw new Error('服務沒有回傳圖片；未建立替代圖。');job.generated.add(phase);send(res,200,{phase,image:`data:image/png;base64,${image}`,disclaimer:'AI 生成建議示意，非實際拍攝或效果保證'});
   }else send(res,404,{error:'找不到服務。'});
  }catch(e){const status=Number.isInteger(e.status)&&e.status>=400&&e.status<600?e.status:400;send(res,status,{error:e.name==='TimeoutError'?'服務處理逾時，可能已產生費用；不會自動重試。':e.message});}finally{active=false;}return;
 }
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
 // Fixed allowlist: keys, source and local files are never served.
 const name=path==='/'?'index.html':path==='/pricing'?'pricing.html':path==='/login'?'login.html':path==='/terms'?'terms.html':path==='/privacy'?'privacy.html':(['/app','/app/'].includes(path)?'app/index.html':path.slice(1));const allowed=['index.html','app/index.html','app.js','metrics.mjs','graphic.mjs','coach.mjs','coach-core.mjs','style.css','landing.css','landing.js','access.mjs','login.html','login.js','terms.html','privacy.html','legal.css','pricing.html','pricing.css','pricing.js','banner1006-2.png','moster-banner3.png','moster-banner4.png'];
 if(!allowed.includes(name)){res.writeHead(404);res.end();return;}
 try{const data=await readFile(new URL(name,root));res.writeHead(200,{'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'application/javascript','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end();}
});
if(process.argv[1]===fileURLToPath(import.meta.url)){
 server.once('error',error=>{
  if(error.code==='EADDRINUSE'){
   console.error(`連接埠 ${port} 已被占用。若 Motion Lab 已在執行，請直接開啟 ${origin}/，不必啟動第二份。`);
   process.exit(1);
  }
  console.error(error);
  process.exit(1);
 });
 server.listen(port,'127.0.0.1',()=>console.log(`Motion Lab: ${origin} · AI ${key?'configured':'not configured'}`));
}
