'use strict';
const slides=[...document.querySelectorAll('.slide')],canvas=document.querySelector('#canvas'),overview=document.querySelector('#overview'),profile=document.querySelector('#profile'),dialogs=[overview,profile],reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
let current=0,returnFocus=null,peekTimer,spinReset=null;
let keyboardInput=false;
document.addEventListener('keydown',()=>{keyboardInput=true},{capture:true});
document.addEventListener('pointerdown',()=>{keyboardInput=false},{capture:true,passive:true});
document.addEventListener('touchstart',()=>{keyboardInput=false},{capture:true,passive:true});
function fit(){
  const mobile=innerWidth<800;
  document.body.classList.toggle('portrait-layout',mobile);
  document.body.classList.toggle('fullscreen-unavailable',!document.fullscreenEnabled);
  canvas.style.setProperty('--scale',mobile?1:Math.min(innerWidth/1600,innerHeight/900));
  const width=mobile?innerWidth:1600,height=mobile?innerHeight:900;
  if(visual.width!==width)visual.width=width;
  if(visual.height!==height)visual.height=height;
  visual.style.width=width+'px';visual.style.height=height+'px';
  render();
}
function showDock(autoHide=true){document.body.classList.add('dock-on');clearTimeout(peekTimer);if(autoHide)peekTimer=setTimeout(hideDock,2400)}
function hideDock(){clearTimeout(peekTimer);if(document.querySelector('#dock :focus-visible'))return;document.body.classList.remove('dock-on')}

function go(index,updateHash=true){const previous=current;current=Math.max(0,Math.min(slides.length-1,index));canvas.style.setProperty('--enter-x',current<previous?'-24px':'24px');const oldFocus=document.activeElement;slides.forEach((s,i)=>{s.hidden=i!==current;s.inert=i!==current;s.tabIndex=-1});if(oldFocus?.closest('.slide')?.hidden)slides[current].focus({preventScroll:true});document.querySelector('#page-input').value=current+1;document.querySelector('#total').textContent=String(slides.length).padStart(2,'0');const title=document.querySelector('#current-title');title.replaceChildren(Object.assign(document.createElement('span'),{className:'title-text',textContent:slides[current].dataset.title}),Object.assign(document.createElement('span'),{className:'dock-key',textContent:'目录'}));document.querySelector('#page-announcement').textContent=`第 ${current+1} 页，共 ${slides.length} 页：${slides[current].dataset.title}`;const p=document.querySelector('#progress');p.setAttribute('aria-valuemax',slides.length);p.setAttribute('aria-valuenow',current+1);p.firstElementChild.style.width=(current+1)/slides.length*100+'%';document.querySelector('#prev').disabled=current===0;document.querySelector('#next-page').disabled=current===slides.length-1;document.querySelectorAll('#toc-grid button').forEach((b,i)=>{if(i===current)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});if(previous!==current)slides[current].scrollTop=0;if(updateHash)history.replaceState(null,'','#'+slides[current].id);setShape(slides[current].dataset.shape);if(slides[current].id==='products'&&spinReset)spinReset();document.dispatchEvent(new Event('deckchange'))}
function fromHash(){const i=slides.findIndex(s=>'#'+s.id===location.hash);go(i<0?0:i,false)}
function openDialog(d){returnFocus=document.activeElement;d.tabIndex=-1;d.showModal();if(!keyboardInput)d.focus({preventScroll:true});document.body.classList.add('dialog-open');if(d===profile){profile.querySelector('.resume-main').scrollTop=0;setResumeNav('resume-work')}}for(const d of dialogs){d.querySelector('[data-close]').onclick=()=>d.close();d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()});d.addEventListener('close',()=>{if(!dialogs.some(x=>x.open))document.body.classList.remove('dialog-open');if(returnFocus?.isConnected&&!returnFocus.closest('[hidden]'))returnFocus.focus({preventScroll:true});else document.querySelector('#current-title').focus({preventScroll:true})})}
slides.forEach((s,i)=>{const b=document.createElement('button'),n=document.createElement('span');n.className='toc-number';n.textContent=String(i+1).padStart(2,'0');b.append(n,document.createTextNode(s.dataset.title));b.onclick=()=>{go(i);overview.close()};document.querySelector('#toc-grid').append(b)});
document.querySelector('#prev').onclick=()=>go(current-1);document.querySelector('#next-page').onclick=()=>go(current+1);document.querySelector('#home').onclick=()=>go(0);document.querySelector('#current-title').onclick=()=>openDialog(overview);document.querySelector('#profile-open').onclick=()=>openDialog(profile);document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>go(+b.dataset.go));const pageInput=document.querySelector('#page-input');pageInput.max=slides.length;function jump(){const n=Number(pageInput.value);if(Number.isInteger(n)&&n>=1&&n<=slides.length)go(n-1);else{pageInput.value=current+1;notice(`请输入 1—${slides.length} 之间的页码。`)}}pageInput.onchange=jump;pageInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();jump();pageInput.blur()}});
let noticeTimer;function notice(message){document.querySelector('#notice').textContent=message;clearTimeout(noticeTimer);if(message)noticeTimer=setTimeout(()=>document.querySelector('#notice').textContent='',4500)}
async function fullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else{if(!document.documentElement.requestFullscreen)throw Error();await document.documentElement.requestFullscreen()}notice('')}catch{notice('当前浏览器未允许全屏，可使用浏览器的全屏功能。')}}document.querySelector('#fullscreen').onclick=()=>{fullscreen();hideDock()};document.addEventListener('fullscreenchange',()=>{const active=Boolean(document.fullscreenElement),b=document.querySelector('#fullscreen');b.innerHTML='<span class="full-icon">⛶</span> '+(active?'退出全屏':'全屏');b.setAttribute('aria-pressed',String(active));b.setAttribute('aria-label',active?'退出全屏':'进入全屏');fit()});
document.addEventListener('keydown',e=>{if(e.altKey||e.ctrlKey||e.metaKey||e.repeat)return;const k=e.key.toLowerCase();if(dialogs.some(d=>d.open)){if(k==='o'&&overview.open){e.preventDefault();overview.close()}return}if(e.target.closest?.('input,textarea,select,[contenteditable=true]'))return;if(k===' '&&e.target.closest?.('button,a'))return;if(['arrowright','arrowdown','arrowleft','arrowup','home','end','f','o',' '].includes(k))e.preventDefault();if(['arrowright','arrowdown',' '].includes(k))go(current+1);if(['arrowleft','arrowup'].includes(k))go(current-1);if(k==='home')go(0);if(k==='end')go(slides.length-1);if(k==='f')fullscreen();if(k==='o')openDialog(overview)});
let touchStart=null;
document.querySelector('#stage').addEventListener('touchstart',e=>{
  touchStart=null;
  if(e.touches.length!==1||e.target.closest('button,a,input,summary'))return;
  touchStart=[e.touches[0].clientX,e.touches[0].clientY,Date.now()];
},{passive:true});
document.querySelector('#stage').addEventListener('touchend',e=>{
  const start=touchStart;touchStart=null;
  if(!start||e.touches.length||dialogs.some(d=>d.open))return;
  const dx=e.changedTouches[0].clientX-start[0],dy=e.changedTouches[0].clientY-start[1];
  if(Date.now()-start[2]<800&&Math.abs(dx)>48&&Math.abs(dx)>Math.abs(dy)*1.5)go(current+(dx<0?1:-1));
},{passive:true});
document.querySelector('#stage').addEventListener('touchcancel',()=>touchStart=null,{passive:true});let wheelSum=0,lastWheel=0;document.querySelector('#stage').addEventListener('wheel',e=>{if(e.ctrlKey||document.body.classList.contains('portrait-layout')||dialogs.some(d=>d.open))return;if(Date.now()-lastWheel<800)return;wheelSum+=e.deltaY;if(Math.abs(wheelSum)>70){go(current+(wheelSum>0?1:-1));wheelSum=0;lastWheel=Date.now()}},{passive:true});
document.querySelectorAll('[data-slide-target]').forEach(button=>button.onclick=()=>{const index=slides.findIndex(slide=>slide.id===button.dataset.slideTarget);if(index>=0)go(index)});
const visual=document.querySelector('#visual'),ctx=visual.getContext('2d'),N=1800,TAU=Math.PI*2;let time=0,frame=0,paused=reduceMotion.matches,pointerX=0,pointerY=0,targetName='',targets=[],coords=[],lastFrame=0;const shapes={};
function makeShape(name){const a=[];for(let i=0;i<N;i++){const u=(i+.5)/N,v=(i*.61803398875)%1,theta=i*2.399963;let x,y,z;if(name==='terrain'){const col=i%60,row=Math.floor(i/60),xx=(col/59-.5)*2.5,zz=(row/29-.5)*2.2;x=xx;y=.28*Math.sin(xx*3)*Math.cos(zz*2.5)+.18*Math.sin(zz*5+xx*2);z=zz;}else if(name==='halo'||name==='rings'){const ang=u*TAU*15,r=(name==='rings'?.8:.95)+.12*Math.cos(theta);x=r*Math.cos(ang);z=r*Math.sin(ang);y=.18*Math.sin(theta);if(name==='rings'){const k=i%3,yy=y;y=k===0?yy:k===1?x:z;if(k===1)x=yy;if(k===2)z=yy;}}else if(name==='helix'){const ang=u*TAU*3.6+(i%2)*Math.PI;x=.65*Math.cos(ang);z=.65*Math.sin(ang);y=(u-.5)*2.3;}else if(name==='cube'){const face=i%6,a1=v*2-1,a2=((i*.41421356)%1)*2-1;x=face<2?(face===0?-1:1):a1;y=face>=2&&face<4?(face===2?-1:1):a2;z=face>=4?(face===4?-1:1):(face<2?a1:a2);x*=.8;y*=.8;z*=.8;}else if(name==='network'){const k=i%5,centers=[[-.8,-.4,0],[.75,-.5,.1],[-.2,.65,.3],[.5,.3,-.7],[-.5,.1,-.8]],b=Math.acos(1-2*u),r=.23+.04*Math.sin(theta*3);x=centers[k][0]+Math.sin(b)*Math.cos(theta)*r;y=centers[k][1]+Math.cos(b)*r;z=centers[k][2]+Math.sin(b)*Math.sin(theta)*r;}else if(name==='wave'){x=(u-.5)*3;y=.16*Math.sin(u*TAU*3+v*4);z=(v-.5)*2;}else{const b=Math.acos(1-2*u),r=1+.075*Math.sin(b*7+theta*3);x=Math.sin(b)*Math.cos(theta)*r;y=Math.cos(b)*r;z=Math.sin(b)*Math.sin(theta)*r;}a.push([x,y,z])}return a}
function setShape(name){targetName=name;if(!shapes[name])shapes[name]=makeShape(name);targets=shapes[name];if(!coords.length)coords=targets.map(p=>[...p]);if(paused){coords=targets.map(p=>[...p]);render()}startAnimation()}
function render(){if(!targets.length)return;ctx.clearRect(0,0,visual.width,visual.height);if(targetName==='quiet')return;const centered=['halo','wave'].includes(targetName)||slides[current]?.classList.contains('concept-slide'),isCover=slides[current]?.classList.contains('cover'),portrait=document.body.classList.contains('portrait-layout'),cx=portrait?visual.width*.54:centered?800:isCover?1250:targetName==='terrain'?1148:1130,cy=portrait?visual.height*.73:targetName==='wave'?790:isCover?430:460,scale=portrait?Math.min(130,visual.width*.28):targetName==='wave'?430:centered?385:isCover?272:targetName==='terrain'?244:300,angle=time*.000075+pointerX*.16,c=Math.cos(angle),s=Math.sin(angle),rx=targetName==='terrain'?-.50:targetName==='wave'?-.18:.18+pointerY*.12,cr=Math.cos(rx),sr=Math.sin(rx);const ps=[];for(let i=0;i<N;i++){for(let j=0;j<3;j++)coords[i][j]+=(targets[i][j]-coords[i][j])*(paused?1:.045);let [x,y,z]=coords[i];if(targetName==='terrain')y+=.025*Math.sin(time*.001+i*.12);const xx=x*c+z*s,zz=-x*s+z*c,yy=y*cr-zz*sr,z2=y*sr+zz*cr,p=3.6/(3.6-z2*.5);ps.push([cx+xx*scale*p,cy+yy*scale*p,z2,i])}ps.sort((a,b)=>a[2]-b[2]);const fade=slides[current]?.classList.contains('concept-slide')?.11:centered?.2:1,glow=ctx.createRadialGradient(cx,cy,0,cx,cy,400);glow.addColorStop(0,'rgba(255,255,255,'+(centered?.014:.025)+')');glow.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,visual.width,visual.height);const fx=slides[current]?.dataset.fx,sweep=fx==='select'?-1.45+((time*.00019)%1)*3.0:-9;
for(const [x,y,z,i]of ps){let alpha=(.16+(z+1.5)*.24)*fade,gold=i%15===0,r=.7+(z+1.5)*.6;
if(fx==='select'){const d=Math.abs(coords[i][0]-sweep);if(d<.32){const k=1-d/.32;alpha=Math.min(1,(.2+k*.85))*fade;gold=true;r+=k*.6}else{alpha*=.46}}
ctx.fillStyle=gold?`rgba(212,180,106,${alpha})`:`rgba(255,255,255,${alpha})`;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}if(targetName==='network'&&!centered){const lines=[[0,1],[0,2],[1,2],[1,3],[2,4],[3,4]];ctx.strokeStyle='rgba(255,255,255,.22)';ctx.lineWidth=1.3;for(const [a,b]of lines){const p=ps.find(q=>q[3]===a),q=ps.find(q=>q[3]===b);if(p&&q){ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke()}}}}
function tick(stamp){frame=0;if(paused||document.hidden)return;if(stamp-lastFrame>=30){time+=Math.min(stamp-lastFrame||33,60);lastFrame=stamp;render()}frame=requestAnimationFrame(tick)}function startAnimation(){if(!frame&&!paused&&!document.hidden)frame=requestAnimationFrame(tick)}function syncMotion(){const b=document.querySelector('#motion');b.innerHTML=paused?'动效 <span>▶</span>':'动效 <span>Ⅱ</span>';b.setAttribute('aria-pressed',String(paused));b.setAttribute('aria-label',paused?'播放三维动效':'暂停三维动效');if(paused){cancelAnimationFrame(frame);frame=0;render()}else startAnimation()}document.querySelector('#motion').onclick=()=>{paused=!paused;syncMotion();document.dispatchEvent(new Event('motionstatechange'))};reduceMotion.addEventListener('change',e=>{paused=e.matches;syncMotion();document.dispatchEvent(new Event('motionstatechange'))});document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0}else{lastFrame=performance.now();startAnimation()}});document.querySelector('#stage').addEventListener('pointermove',e=>{if(paused)return;pointerX=e.clientX/innerWidth-.5;pointerY=e.clientY/innerHeight-.5});addEventListener('resize',fit);addEventListener('hashchange',fromHash);fit();fromHash();syncMotion();
// 产品 logo：用多层堆叠模仿厚度，双面有纹理、侧边取图标自身颜色
document.querySelectorAll('.p-mark img.spin').forEach(img=>{
  const LAYERS=12,STEP=1.0;
  for(let i=1;i<=LAYERS;i++){
    const c=img.cloneNode(true);
    c.removeAttribute('class');
    c.className='layer';c.alt='';c.setAttribute('aria-hidden','true');
    c.style.transform=`translateZ(${(-i*STEP).toFixed(2)}px)`;
    img.parentNode.insertBefore(c,img.nextSibling);
  }
  img.classList.remove('spin');
});

// A shared animation clock; only run while the product slide is visible.
{
 const marks=[...document.querySelectorAll('.p-mark')];let clock=0,last=0,spinFrame=0;
 function paintMarks(){const t=(clock%14000)/14000,ang=t<.4?330*(1-Math.pow(1-t/.4,5)):330+30*((t-.4)/.6);for(const m of marks)m.style.transform='perspective(760px) rotateY('+ang.toFixed(2)+'deg)'}
 function canSpin(){return !paused&&!document.hidden&&slides[current].id==='products'&&!dialogs.some(d=>d.open)}
 function spin(now){spinFrame=0;if(!canSpin())return;clock+=Math.min(Math.max(0,now-last),80);last=now;paintMarks();spinFrame=requestAnimationFrame(spin)}
 function schedule(){if(canSpin()&&!spinFrame){last=performance.now();spinFrame=requestAnimationFrame(spin)}else if(!canSpin()){cancelAnimationFrame(spinFrame);spinFrame=0;paintMarks()}}
 spinReset=()=>{clock=0;paintMarks();schedule()};
 for(const event of ['deckchange','visibilitychange','motionstatechange'])document.addEventListener(event,schedule);
 for(const d of dialogs){d.addEventListener('close',schedule);new MutationObserver(schedule).observe(d,{attributes:true,attributeFilter:['open']})}
 paintMarks();schedule();
}
addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;if(e.clientY>=innerHeight-112){showDock()}else if(!e.target.closest?.('#dock,#overview,#profile')){hideDock()}},{passive:true});
addEventListener('pointerdown',e=>{if(e.target.closest?.('#dock'))showDock()});
document.querySelector('#dock').addEventListener('focusin',e=>{if(e.target.matches?.(':focus-visible'))showDock(false)});
document.querySelector('#dock').addEventListener('focusout',()=>showDock());
document.addEventListener('fullscreenchange',()=>{if(document.activeElement?.closest('#dock'))slides[current].focus({preventScroll:true});hideDock()});



const resumeMain=profile.querySelector('.resume-main'),resumeNav=[...profile.querySelectorAll('[data-resume-target]')];
function setResumeNav(id){for(const b of resumeNav){if(b.dataset.resumeTarget===id)b.setAttribute('aria-current','location');else b.removeAttribute('aria-current')}}
for(const b of resumeNav)b.onclick=()=>{const target=document.getElementById(b.dataset.resumeTarget),top=target.getBoundingClientRect().top-resumeMain.getBoundingClientRect().top+resumeMain.scrollTop-24;resumeMain.scrollTo({top,behavior:reduceMotion.matches?'instant':'smooth'});setResumeNav(target.id)};
let resumeScrollFrame=0;resumeMain.addEventListener('scroll',()=>{if(resumeScrollFrame)return;resumeScrollFrame=requestAnimationFrame(()=>{resumeScrollFrame=0;let id='resume-work';const y=resumeMain.getBoundingClientRect().top;for(const b of resumeNav){const s=document.getElementById(b.dataset.resumeTarget);if(s.getBoundingClientRect().top-y<150)id=s.id}setResumeNav(id)})},{passive:true});

