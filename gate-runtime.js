'use strict';
const PAYLOAD_URL='site-v3.3.1.enc?v=__VERSION__',PAYLOAD_BYTES=__SIZE__,ITERATIONS=250000;
const form=document.getElementById('gate'),input=document.getElementById('pw'),toggle=document.getElementById('toggle'),button=document.getElementById('go'),msg=document.getElementById('msg');
let payloadPromise=null,submitting=false;
const metrics={};
window.__unlockMetrics=metrics;
const loading=document.getElementById('loading'),loadTitle=document.getElementById('load-title'),loadPercent=document.getElementById('load-percent'),loadTrack=document.getElementById('load-track'),loadFill=document.getElementById('load-fill');
const retry=document.getElementById('load-retry'),buttonLabel=button.innerHTML;
function paintLoading(stage,percent=null,ready=false){
  const titles={download:'正在加载内容',decrypt:'正在安全解锁',prepare:'正在准备展示',error:'加载未完成，请重试'};
  loading.dataset.state=stage==='error'?'error':ready?'ready':'loading';
  retry.hidden=stage!=='error';
  loading.setAttribute('aria-busy',String(!ready&&stage!=='error'));
  loadTitle.textContent=ready?'内容已就绪，请输入密码':titles[stage];
  loadPercent.textContent=percent===null?'':Math.round(percent)+'%';
  loadTrack.classList.toggle('indeterminate',percent===null&&stage!=='error');
  loadTrack.setAttribute('aria-label',loadTitle.textContent);
  if(percent!==null){loadTrack.setAttribute('aria-valuenow',String(percent));loadFill.style.width=percent+'%';}else loadTrack.removeAttribute('aria-valuenow');
  const current=['download','decrypt','prepare'].indexOf(stage);
  document.querySelectorAll('[data-load-step]').forEach((step,i)=>{step.dataset.state=i<current||ready&&i===0?'done':i===current&&!ready?'active':'pending';});
}
function fromB64(value){const bin=atob(value.replace(/\s+/g,''));return Uint8Array.from(bin,c=>c.charCodeAt(0));}
function requestPayload(){
  if(payloadPromise)return payloadPromise;
  payloadPromise=(async()=>{
    const start=performance.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{
      msg.textContent='';paintLoading('download',0);
      const res=await fetch(PAYLOAD_URL,{signal:controller.signal,cache:'force-cache',priority:'high'});
      if(!res.ok)throw Error('network');
      const chunks=[];let length=0;
      if(res.body){const reader=res.body.getReader();for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);length+=value.length;paintLoading('download',Math.min(99,Math.round(length/PAYLOAD_BYTES*100)));}}
      else{const value=new Uint8Array(await res.arrayBuffer());chunks.push(value);length=value.length;}
      const raw=new Uint8Array(length);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
      metrics.downloadMs=Math.round(performance.now()-start);metrics.downloadBytes=length;
      if(!submitting)paintLoading('download',100,true);
      return raw[0]===77&&raw[1]===84&&raw[2]===80&&raw[3]===52?raw.slice(4):fromB64(new TextDecoder().decode(raw));
    }finally{clearTimeout(timer);}
  })().catch(error=>{payloadPromise=null;if(!submitting){paintLoading('error');msg.textContent='网络较慢，输入密码后可重试';}throw error;});
  return payloadPromise;
}
async function unlock(password,raw){
  const start=performance.now();
  const baseKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(password.trim().toLowerCase()),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:raw.slice(0,16),iterations:ITERATIONS,hash:'SHA-256'},baseKey,{name:'AES-GCM',length:256},false,['decrypt']);
  const plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:raw.slice(16,28)},key,raw.slice(28)));
  metrics.decryptMs=Math.round(performance.now()-start);
  const expandStart=performance.now();
  const bytes=plain[0]===31&&plain[1]===139?DeckGzip.gunzipSync(plain):plain;
  metrics.expandMs=Math.round(performance.now()-expandStart);
  return new TextDecoder().decode(bytes);
}
toggle.addEventListener('click',()=>{const hidden=input.type==='password';input.type=hidden?'text':'password';toggle.textContent=hidden?'隐藏':'显示';toggle.setAttribute('aria-pressed',String(hidden));input.focus();});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(!input.value||submitting)return;
  if(!window.crypto?.subtle){msg.textContent='请使用 HTTPS 地址或更新浏览器后重试';return;}
  submitting=true;button.disabled=true;button.textContent='正在打开…';const start=performance.now();
  let raw;
  try{raw=await requestPayload();}catch{paintLoading('error');msg.textContent='下载超时或连接中断，请重试；大陆网络访问 GitHub 可能较慢';button.disabled=false;button.innerHTML=buttonLabel;submitting=false;return;}
  msg.textContent='';paintLoading('decrypt');
  let html;
  try{html=await unlock(input.value,raw);}catch{paintLoading('download',100,true);msg.textContent='密码不对，请重试';button.disabled=false;button.innerHTML=buttonLabel;submitting=false;input.select();return;}
  paintLoading('prepare',100);
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  metrics.submitMs=Math.round(performance.now()-start);
  input.value='';
  history.replaceState(null,'',location.pathname+location.search+'#hello');
  document.open();document.write(html);document.close();
  metrics.htmlBackground=getComputedStyle(document.documentElement).backgroundColor;
  metrics.bodyBackground=getComputedStyle(document.body).backgroundColor;
  document.documentElement.dataset.unlockMetrics=JSON.stringify(metrics);
  document.fonts.ready.then(()=>document.documentElement.dataset.fontStatus=[...document.fonts].map(face=>face.family+':'+face.status).join(','));
});
retry.addEventListener('click',()=>requestPayload().catch(()=>{}));
requestPayload().catch(()=>{});
