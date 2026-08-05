const canvas=document.getElementById('sceneCanvas'),floorView=document.getElementById('floorView'),floorImage=document.getElementById('floorImage'),timeline=document.getElementById('timeline'),timeRange=document.getElementById('timeRange'),timeValue=document.getElementById('timeValue'),seasonValue=document.getElementById('seasonValue'),sunStatus=document.getElementById('sunStatus'),modeTabs=[...document.querySelectorAll('.mode-tab')],seasonButtons=[...document.querySelectorAll('.season-button')],resetView=document.getElementById('resetView'),dragHint=document.getElementById('dragHint'),sunScheme=document.querySelector('.sun-scheme'),scene=SunScene.create(canvas);
const INITIAL_YAW=-.62;
let mode='3d',season='summer',minutes=780,dragging=false,pointerId=null,lastX=0,lastY=0;
function syncCompass(){const angle=(scene.camera.yaw-INITIAL_YAW)*180/Math.PI;sunScheme.style.transform=`rotate(${angle}deg)`}
function readout(result){const sun=result.sun||result;timeValue.textContent=SunMath.formatTime(minutes);seasonValue.textContent=SunMath.SEASONS[season].label;sunStatus.textContent=sun.altitude>0?`${SunMath.directionLabel(sun.azimuth)} · высота ${Math.round(sun.altitude)}°${result.litWindows?` · прямой свет`:''}`:`солнце за горизонтом · ${SunMath.directionLabel(sun.azimuth)}`}
function render(){const is3d=mode==='3d';floorView.hidden=is3d;canvas.hidden=!is3d;timeline.classList.toggle('is-disabled',!is3d);resetView.hidden=!is3d;dragHint.hidden=!is3d;sunScheme.hidden=!is3d;if(is3d){syncCompass();readout(scene.render())}}
function setMode(value){mode=value;modeTabs.forEach(b=>b.classList.toggle('is-active',b.dataset.mode===value));render()}
function setSeason(value){season=value;scene.setSeason(value);seasonButtons.forEach(b=>b.classList.toggle('is-active',b.dataset.season===value));render()}
modeTabs.forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.mode)));seasonButtons.forEach(b=>b.addEventListener('click',()=>setSeason(b.dataset.season)));
timeRange.addEventListener('input',()=>{minutes=Number(timeRange.value);scene.setMinutes(minutes);if(mode==='3d'){syncCompass();readout(scene.render())}});resetView.addEventListener('click',()=>{scene.reset();render()});
canvas.addEventListener('pointerdown',e=>{if(mode!=='3d')return;dragging=true;pointerId=e.pointerId;lastX=e.clientX;lastY=e.clientY;dragHint.style.opacity='0';canvas.setPointerCapture(e.pointerId)});
canvas.addEventListener('pointermove',e=>{if(!dragging||e.pointerId!==pointerId)return;scene.camera.yaw+=(e.clientX-lastX)*.008;scene.camera.pitch=SunMath.clamp(scene.camera.pitch-(e.clientY-lastY)*.0032,.52,1.14);lastX=e.clientX;lastY=e.clientY;syncCompass();readout(scene.render())});
function stop(e){if(e.pointerId!==pointerId)return;dragging=false;pointerId=null;try{canvas.releasePointerCapture(e.pointerId)}catch(_){}}
canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);window.addEventListener('resize',render);
floorImage.addEventListener('error',()=>{floorImage.src='assets/plan.svg';floorImage.alt='Планировка квартиры №2'});
timeRange.value='780';scene.setMinutes(780);setSeason('summer');setMode('3d');
