const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const planSelect = document.getElementById('planSelect');
const planName = document.getElementById('planName');
const planId = document.getElementById('planId');
const scoringEl = document.getElementById('scoring');
const twistEl = document.getElementById('twist');
const rulesEl = document.getElementById('rules');
const unitSearch = document.getElementById('unitSearch');
const unitResults = document.getElementById('unitResults');
const armyKey = document.getElementById('armyKey');
const armyNameInput = document.getElementById('armyName');
const tacticSelect = document.getElementById('tacticSelect');
const tacticCard = document.getElementById('tacticCard');
const coordsEl = document.getElementById('coords');
const selectedInfo = document.getElementById('selectedInfo');

const BOARD_W = 60;
const BOARD_H = 44;
const CELL_W = 15;
const CELL_H = 11;
const MM_PER_INCH = 25.4;
const OBJECTIVE_TOKEN_DIAMETER = 40 / MM_PER_INCH; // 40mm objective token
const OBJECTIVE_CONTROL_DIAMETER = 6 + OBJECTIVE_TOKEN_DIAMETER; // 3" control zone beyond the 40mm token
const OBJECTIVE_TOKEN_RADIUS = OBJECTIVE_TOKEN_DIAMETER / 2;
const OBJECTIVE_CONTROL_RADIUS = OBJECTIVE_CONTROL_DIAMETER / 2;

const state = {
  planId: PLANS[0].id,
  army: 'blue',
  armies: {blue:{name:'Blue Army'}, red:{name:'Red Army'}},
  units: [],
  selected: null,
  showGrid: true,
  showSections: true,
  showRulers: true,
  showObjectives: true,
  showTerrain: true,
  showLabels: true,
  snap: true,
  history: [],
  future: [],
  dragging: null,
  measurements: [],
  selectedMeasurement: null,
  trailMode: false,
  trails: [],
  canvasScale: 1
};

const layerIds = ['gridToggle','sectionsToggle','rulersToggle','objectivesToggle','terrainToggle'];

function clone(x){return JSON.parse(JSON.stringify(x));}
function applyBattleplanData(data){
  if(!data || !Array.isArray(data.plans) || !data.maps) throw new Error('Invalid battleplan data file. Expected plans[] and maps{}.');
  if(data.coordinateSystem?.width !== BOARD_W || data.coordinateSystem?.height !== BOARD_H) throw new Error('This planner expects a 60 x 44 inch battlefield.');
  window.BATTLEPLAN_DATA = data;
  window.PLANS = data.plans;
  window.MAP_DB = data;
  window.MAPS = data.maps;
  if(!PLANS.some(p=>p.id===state.planId)) state.planId=PLANS[0]?.id;
  populatePlans();
  renderPlan();
}
function downloadBattleplanData(){
  const data=window.BATTLEPLAN_DATA || {schemaVersion:'2.0',coordinateSystem:{units:'inches',width:60,height:44},plans:PLANS,maps:MAPS};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.download='battleplans.json'; a.href=URL.createObjectURL(blob); a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function currentPlan(){return PLANS.find(p=>p.id===state.planId)||PLANS[0];}
function currentMap(){return MAPS[state.planId]||MAPS[PLANS[0].id];}
function normalize(s){return s.toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function parseBase(base){
  const m=base.toLowerCase().replace(/\s+/g,' ').match(/([\d.]+)\s*x\s*([\d.]+)/);
  if(m) return {w:+m[1]/MM_PER_INCH,h:+m[2]/MM_PER_INCH};
  const d=parseFloat(base);
  return {w:d/MM_PER_INCH,h:d/MM_PER_INCH};
}
function unitDisplayName(u){return (u.customName||u.unit||'Unit').trim();}
function unitAbbreviation(name){
  const words=String(name||'Unit').trim().split(/\s+/).filter(Boolean);
  let initials=words.map(w=>Array.from(w)[0].toUpperCase()).join('');
  if(initials.length>7) initials=initials.slice(0,7);
  return initials||'U';
}
function unitLabel(u){
  const same=state.units.filter(x=>x.army===u.army&&normalize(unitDisplayName(x))===normalize(unitDisplayName(u)));
  const suffix=same.length>1?String(same.indexOf(u)+1):'';
  return unitAbbreviation(unitDisplayName(u))+suffix;
}
function renameSelectedUnit(name){
  const u=state.units.find(x=>x.id===state.selected); if(!u)return;
  const value=String(name||'').trim(); if(!value)return;
  record(); u.customName=value; renderArmy(); draw();
}
function idForArmy(army){
  const prefix=army==='blue'?'B':'R';
  let n=1; while(state.units.some(u=>u.army===army && u.id===prefix+n)) n++;
  return prefix+n;
}
function record(){
  state.history.push(snapshot(false));
  if(state.history.length>60) state.history.shift();
  state.future=[];
}
function snapshot(includeHistory=true){
  const s={
    planId:state.planId,army:state.army,armies:clone(state.armies),units:clone(state.units),
    showGrid:state.showGrid,showSections:state.showSections,showRulers:state.showRulers,
    showObjectives:state.showObjectives,showTerrain:state.showTerrain,showLabels:state.showLabels,measurements:clone(state.measurements),trailMode:state.trailMode,trails:clone(state.trails)
  };
  if(includeHistory){s.history=clone(state.history);s.future=clone(state.future);}
  return s;
}
function restore(s){
  state.planId=s.planId||PLANS[0].id;
  state.army=s.army||'blue';
  state.armies=clone(s.armies||{blue:{name:'Blue Army'},red:{name:'Red Army'}});
  state.units=clone(s.units||[]);
  state.showGrid=s.showGrid!==false;
  state.showSections=s.showSections!==false;
  state.showRulers=s.showRulers!==false;
  state.showObjectives=s.showObjectives!==false;
  state.showTerrain=s.showTerrain!==false;
  state.showLabels=s.showLabels!==false;
  state.snap=s.snap!==false;
  state.measurements=clone(s.measurements||[]);
  state.trailMode=s.trailMode===true;
  state.trails=clone(s.trails||[]);
  state.selectedMeasurement=null;
  state.selected=null;
  planSelect.value=state.planId;
  syncLayerControls();
  renderPlan(); renderArmy(); draw();
}
function addUnit(entry, army=state.army, count=1){
  const size=parseBase(entry.base);
  record();
  for(let i=0;i<count;i++){
    state.units.push({
      id:idForArmy(army),army,armyName:state.armies[army].name,unit:entry.unit,sourceArmy:entry.army,
      base:entry.base,w:size.w,h:size.h,x:army==='blue'?8:52,y:army==='blue'?8:36,rotation:0
    });
  }
  renderArmy(); draw();
}
function removeSelected(){
  if(!state.selected)return;
  const i=state.units.findIndex(u=>u.id===state.selected);
  if(i<0)return;
  record(); state.units.splice(i,1); state.selected=null; renderArmy(); draw();
}
function clearUnits(){
  if(!state.units.length)return;
  record(); state.units=[]; state.selected=null; renderArmy(); draw();
}
function undo(){
  if(!state.history.length)return;
  const now=snapshot(false); state.future.push(now);
  const prev=state.history.pop(); restore(prev);
}
function redo(){
  if(!state.future.length)return;
  const now=snapshot(false); state.history.push(now);
  const next=state.future.pop(); restore(next);
}
function populatePlans(){
  planSelect.innerHTML=PLANS.map(p=>`<option value="${p.id}">${p.id} — ${p.name}</option>`).join('');
  planSelect.value=state.planId;
}
function validateMapGeometry(map){
  const xPoints=new Set([0,7.5,15,22.5,30,37.5,45,52.5,60]);
  const yPoints=new Set([0,5.5,11,16.5,22,27.5,33,38.5,44]);
  const errors=[];
  const inBoard=(x,y)=>x>=0&&x<=BOARD_W&&y>=0&&y<=BOARD_H;
  for(const side of ['attacker','defender']){
    for(const r of (map.territories?.[side]||[])){
      if(r.x<0||r.y<0||r.x+r.w>BOARD_W||r.y+r.h>BOARD_H) errors.push(`${side} territory outside board`);
      if(r.w<=0||r.h<=0) errors.push(`${side} territory has invalid size`);
    }
  }
  for(const o of (map.objectives||[])){
    if(!inBoard(o.x,o.y)) errors.push(`${o.id} outside board`);
    if(!xPoints.has(o.x)||!yPoints.has(o.y)||(o.x%15!==0&&o.y%11!==0)) errors.push(`${o.id} is not on the section corner/edge-midpoint lattice`);
  }
  for(const t of (map.terrain||[])){
    if(!inBoard(t.x,t.y)) errors.push(`${t.id} outside board`);
    if(Math.abs(t.x*2-Math.round(t.x*2))>1e-6||Math.abs(t.y*2-Math.round(t.y*2))>1e-6) errors.push(`${t.id} is not on the 0.5 inch lattice`);
  }
  return errors;
}

function renderPlan(){
  const p=currentPlan();
  const map=currentMap();
  const errors=validateMapGeometry(map);
  if(errors.length) console.warn(`Map geometry ${state.planId}:`,errors);
  planName.textContent=p.name;
  planId.textContent=p.id;
  scoringEl.innerHTML='<div class="scoring">'+p.scoring.map(s=>`<div class="score-line">${s}</div>`).join('')+'</div>';
  twistEl.textContent=p.twist;
  rulesEl.innerHTML=p.rules.map(r=>`<p class="rule">${r}</p>`).join('')+`<p class="source-note">Source: <a href="${RULES_SOURCE.url}" target="_blank" rel="noopener">${RULES_SOURCE.name}</a></p>`;
  renderMapKey(map);
  resizeCanvas(); draw();
}
function renderMapKey(map){
  const objectiveRows=(map.objectives||[]).map((o)=>{
    const c=objectiveColor(o.icon);
    return `<div class="map-key-row"><span class="map-key-swatch objective" style="background:${c.fill};border-color:${c.stroke}"></span><strong>${o.id}</strong><span>${objectiveName(o.icon)}</span><span class="map-key-size">40mm token + 3" control • ${o.x.toFixed(1)}", ${o.y.toFixed(1)}"</span></div>`;
  }).join('');
  const terrain=map.terrain||[];
  const countBy=(kind)=>terrain.filter(t=>t.kind===kind).length;
  document.getElementById('mapKey').innerHTML=`
    <div class="map-key-group"><div class="map-key-title">Objectives <span>${map.objectives.length}</span></div>${objectiveRows||'<small>None</small>'}</div>
    <div class="map-key-group"><div class="map-key-title">Fixed battlefield features <span>${terrain.length}</span></div>
      <div class="map-key-row"><span class="map-key-swatch power"></span><span>Place of Power</span><span class="map-key-size">${countBy('place-of-power')}</span></div>
      <div class="map-key-row"><span class="map-key-swatch tree"></span><span>Obscuring terrain</span><span class="map-key-size">${countBy('obscuring')}</span></div>
      <div class="map-key-row"><span class="map-key-swatch ruin"></span><span>Area terrain / obstacle</span><span class="map-key-size">${countBy('area-or-obstacle')}</span></div>
    </div>
    <div class="map-key-group"><small>Geometry DB: ${MAP_DB.schemaVersion} • inches • 60 × 44 • no map artwork</small></div>`;
}
function renderTactics(){
  tacticSelect.innerHTML=BATTLE_TACTICS.map(t=>`<option value="${t.id}">${t.id} — ${t.name}</option>`).join('');
  tacticSelect.value='1'; showTactic(1);
}
function showTactic(id){
  const t=BATTLE_TACTICS.find(x=>x.id===+id); if(!t)return;
  tacticCard.innerHTML=[
    ['I. Affray',t.affray,t.affray_text],['II. Strike',t.strike,t.strike_text],['III. Domination',t.domination,t.domination_text]
  ].map(a=>`<div class="tactic"><b>${a[0]}: ${a[1]} — 5VP</b><div>${a[2]}</div></div>`).join('');
}
function renderArmy(){
  document.querySelectorAll('.army-tab').forEach(b=>b.classList.toggle('active',b.dataset.army===state.army));
  armyNameInput.value=state.armies[state.army].name;
  const q=normalize(unitSearch.value);
  const filtered=BASES.filter(b=>!q||normalize(b.unit).includes(q)||normalize(b.army).includes(q)||normalize(b.grandFaction).includes(q)).slice(0,80);
  unitResults.innerHTML=filtered.map(b=>`<div class="unit-result" data-index="${BASES.indexOf(b)}"><strong>${b.unit}</strong><small>${b.army} • ${b.base}</small></div>`).join('')||'<div class="unit-result">No match — use a base preset or import your list.</div>';
  const own=state.units.filter(u=>u.army===state.army);
  armyKey.innerHTML=own.length?own.map(u=>`<div class="key-row" title="${escapeHtml(unitDisplayName(u))}"><span class="swatch" style="background:${u.army==='blue'?'#3488ff':'#ef4f55'}"></span><span class="key-id">${u.id}</span><span>${escapeHtml(unitDisplayName(u))}</span><span style="margin-left:auto;color:#9ca7b8">${u.base}</span></div>`).join(''):'<small>No units yet.</small>';
  const renameInput=document.getElementById('renameUnitInput'); const renameBtn=document.getElementById('renameUnitBtn');
  const selectedUnit=state.units.find(x=>x.id===state.selected);
  if(renameInput && document.activeElement!==renameInput) renameInput.value=selectedUnit?unitDisplayName(selectedUnit):'';
  if(renameBtn) renameBtn.disabled=!selectedUnit;
  if(state.selected){
    const u=state.units.find(x=>x.id===state.selected);
    selectedInfo.textContent=u?`${u.id} • ${u.unit} • ${u.base} • ${u.x.toFixed(1)}", ${u.y.toFixed(1)}"`:'Nothing selected';
  } else if(state.selectedMeasurement){
    const m=state.measurements.find(x=>x.id===state.selectedMeasurement);
    selectedInfo.textContent=m?`${m.id} • ${m.diameter.toFixed(1).replace(/\.0$/,'')}" diameter • ${m.x.toFixed(1)}", ${m.y.toFixed(1)}"`:'Nothing selected';
  } else {
    selectedInfo.textContent='Nothing selected';
  }
}
function resizeCanvas(){
  const wrap=canvas.parentElement;
  const dpr=window.devicePixelRatio||1;
  const availableW=Math.max(1,wrap.clientWidth-2);
  const availableH=Math.max(1,wrap.clientHeight-2);
  const cssPixelsPerInch=Math.max(1,Math.min(availableW/BOARD_W,availableH/BOARD_H));
  const backingPixelsPerInch=Math.max(1,Math.floor(cssPixelsPerInch*dpr));
  canvas.width=BOARD_W*backingPixelsPerInch;
  canvas.height=BOARD_H*backingPixelsPerInch;
  canvas.style.width=(canvas.width/dpr)+'px';
  canvas.style.height=(canvas.height/dpr)+'px';
  state.canvasScale=backingPixelsPerInch;
  ctx.setTransform(backingPixelsPerInch,0,0,backingPixelsPerInch,0,0);
}
function objectiveName(icon){return {red:'Red objective',yellow:'Yellow objective',cyan:'Blue objective',black:'Black objective'}[icon]||'Aqshian objective';}
function objectiveColor(color){
  return {
    red:{fill:'rgba(239,79,85,.80)',stroke:'#a71f2a',text:'#fff'},
    yellow:{fill:'rgba(247,191,32,.82)',stroke:'#9d7410',text:'#161616'},
    cyan:{fill:'rgba(21,195,238,.78)',stroke:'#087c9b',text:'#06252e'},
    black:{fill:'rgba(38,34,32,.86)',stroke:'#111',text:'#fff'}
  }[color]||{fill:'rgba(180,180,180,.7)',stroke:'#555',text:'#fff'};
}
function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1)}
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function draw(){
  ctx.save();
  ctx.clearRect(0,0,BOARD_W,BOARD_H);
  drawBoardBase();
  drawZones();
  if(state.showGrid) drawGrid();
  if(state.showSections) drawSections();
  if(state.showTerrain) drawTerrain();
  if(state.showObjectives) drawObjectives();
  drawMovementTrails();
  drawMeasurements();
  state.units.forEach(u=>drawUnit(u));
  if(state.showRulers) drawRulers();
  ctx.restore();
}
function drawBoardBase(){
  ctx.fillStyle='#e8e5db'; ctx.fillRect(0,0,BOARD_W,BOARD_H);
  ctx.strokeStyle='#11161d'; ctx.lineWidth=.12; ctx.strokeRect(.06,.06,BOARD_W-.12,BOARD_H-.12);
}
function drawZones(){
  const t=currentMap().territories||{};
  ctx.save();
  for(const r of (t.attacker||[])){
    ctx.fillStyle='rgba(239,79,85,.34)';
    ctx.fillRect(r.x,r.y,r.w,r.h);
  }
  for(const r of (t.defender||[])){
    ctx.fillStyle='rgba(52,136,255,.34)';
    ctx.fillRect(r.x,r.y,r.w,r.h);
  }
  ctx.restore();
}
function drawGrid(){
  ctx.save();
  ctx.lineWidth=.025; ctx.strokeStyle='rgba(28,36,48,.22)';
  for(let x=0;x<=BOARD_W;x++){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,BOARD_H);ctx.stroke();}
  for(let y=0;y<=BOARD_H;y++){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(BOARD_W,y);ctx.stroke();}
  ctx.restore();
}
function drawSections(){
  ctx.save();
  ctx.lineWidth=.075; ctx.strokeStyle='rgba(18,25,34,.45)';
  [15,30,45].forEach(x=>{ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,BOARD_H);ctx.stroke();});
  [11,22,33].forEach(y=>{ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(BOARD_W,y);ctx.stroke();});
  ctx.restore();
}
function drawRulers(){
  ctx.save();
  ctx.fillStyle='rgba(12,18,26,.82)';
  ctx.fillRect(0,0,BOARD_W,.55); ctx.fillRect(0,0,.55,BOARD_H);
  ctx.font='700 .42px system-ui'; ctx.fillStyle='#fff'; ctx.textBaseline='middle';
  for(let x=0;x<=60;x+=5){ctx.fillText(`${x}\"`,Math.min(x+.12,58.9),.27);}
  ctx.save(); ctx.translate(.27,0); ctx.rotate(-Math.PI/2); ctx.textAlign='center';
  for(let y=0;y<=44;y+=5){ctx.fillText(`${y}\"`,-Math.min(y+.12,43.9),0);}
  ctx.restore();
  ctx.restore();
}
function drawObjectives(){
  currentMap().objectives.forEach((o)=>{
    const c=objectiveColor(o.icon);
    const tokenRadius=(o.tokenDiameterIn||OBJECTIVE_TOKEN_DIAMETER)/2;
    const controlRadius=o.controlRadiusIn||OBJECTIVE_CONTROL_RADIUS;
    ctx.save();
    ctx.translate(o.x,o.y);
    ctx.beginPath();
    ctx.arc(0,0,controlRadius,0,Math.PI*2);
    ctx.fillStyle='rgba(255,255,255,.07)';
    ctx.fill();
    ctx.lineWidth=.07;
    ctx.strokeStyle=c.stroke;
    ctx.setLineDash([.16,.10]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0,0,tokenRadius,0,Math.PI*2);
    ctx.fillStyle=c.fill;
    ctx.fill();
    ctx.lineWidth=.055;
    ctx.strokeStyle=c.stroke;
    ctx.stroke();
    if(state.showLabels){
      ctx.font='800 .55px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=c.text;
      ctx.strokeStyle='rgba(0,0,0,.55)';ctx.lineWidth=.035;ctx.strokeText(o.id,0,0);ctx.fillText(o.id,0,0);
    }
    ctx.restore();
  });
}
function drawTerrain(){
  for(const t of (currentMap().terrain||[])){
    if(t.kind==='obscuring') drawTree(t);
    else if(t.kind==='area-or-obstacle') drawRuin(t);
    else if(t.kind==='place-of-power') drawPlaceOfPower(t);
  }
}
function drawTree(t){
  ctx.save(); ctx.translate(t.x,t.y); ctx.rotate((t.rotationDeg||0)*Math.PI/180);
  ctx.beginPath(); ctx.ellipse(0,0,t.w/2,t.h/2,0,0,Math.PI*2);
  ctx.fillStyle='rgba(108,164,82,.25)'; ctx.fill(); ctx.strokeStyle='#4c7d3d'; ctx.lineWidth=.07; ctx.stroke();
  ctx.fillStyle='#3f7a36';
  ctx.beginPath();ctx.arc(-t.w*.16,-t.h*.05,t.w*.22,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(t.w*.12,-t.h*.08,t.w*.24,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(0,t.h*.12,t.w*.23,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#6b4d2d'; ctx.fillRect(-t.w*.06,t.h*.10,t.w*.12,t.h*.28);
  ctx.restore();
}
function drawRuin(t){
  ctx.save(); ctx.translate(t.x,t.y); ctx.rotate((t.rotationDeg||0)*Math.PI/180);
  ctx.beginPath(); ctx.ellipse(0,0,t.w/2,t.h/2,0,0,Math.PI*2);
  ctx.fillStyle='rgba(245,240,218,.74)'; ctx.fill(); ctx.strokeStyle='#8e866f'; ctx.lineWidth=.07; ctx.stroke();
  ctx.strokeStyle='#4f5555'; ctx.lineWidth=.18; ctx.lineCap='round';
  const w=t.w*.22,h=t.h*.34;
  [[-w,-h/2,-w,-h*.05], [0,-h*.72,0,h*.05], [w,-h*.35,w,h*.05],[-w,-h*.05,w,h*.05]].forEach(a=>{ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(a[2],a[3]);ctx.stroke();});
  ctx.lineWidth=.1; ctx.beginPath();ctx.moveTo(-w*1.2,h*.15);ctx.lineTo(w*1.2,h*.15);ctx.stroke();
  ctx.restore();
}
function drawObstacle(t){
  ctx.save(); ctx.translate(t.x,t.y);
  ctx.beginPath();ctx.arc(0,0,Math.min(t.w,t.h)/2,0,Math.PI*2);
  const g=ctx.createRadialGradient(-t.w*.12,-t.h*.16,.05,t.x,t.y,t.w/2);
  g.addColorStop(0,'#6f655b');g.addColorStop(.45,'#342d29');g.addColorStop(1,'#181716');
  ctx.fillStyle=g;ctx.fill();ctx.strokeStyle='#111';ctx.lineWidth=.08;ctx.stroke();
  ctx.restore();
}
function drawPlaceOfPower(t){
  const d=t.w||4.0;
  ctx.save();ctx.translate(t.x,t.y);
  ctx.beginPath();ctx.arc(0,0,d/2,0,Math.PI*2);ctx.fillStyle='rgba(17,182,238,.20)';ctx.fill();ctx.strokeStyle='#087c9b';ctx.lineWidth=.08;ctx.stroke();
  ctx.fillStyle='#12c7f4';ctx.strokeStyle='#b9f5ff';ctx.lineWidth=.05;
  ctx.beginPath();ctx.moveTo(0,-d*.40);ctx.lineTo(d*.24,-d*.05);ctx.lineTo(d*.10,d*.36);ctx.lineTo(-d*.15,d*.23);ctx.lineTo(-d*.28,-d*.10);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,-d*.40);ctx.lineTo(0,d*.20);ctx.lineTo(d*.10,d*.36);ctx.moveTo(0,d*.20);ctx.lineTo(-d*.15,d*.23);ctx.stroke();
  ctx.restore();
}

function drawMovementTrails(){
  for(const trail of state.trails){
    const pts=trail.points||[]; if(pts.length<2) continue;
    const color=trail.army==='red'?'239,79,85':'52,136,255';
    ctx.save();
    ctx.beginPath(); ctx.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x,pts[i].y);
    ctx.strokeStyle=`rgba(${color},.34)`; ctx.lineWidth=.42; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.stroke();

    // Small direction markers spaced along the path; no arrow is added at the endpoint.
    const spacing=4.5, head=.42, half=.23;
    let travelled=0, nextArrow=spacing;
    for(let i=1;i<pts.length;i++){
      const a=pts[i-1], b=pts[i], dx=b.x-a.x, dy=b.y-a.y;
      const segLen=Math.hypot(dx,dy);
      if(segLen<1e-6) continue;
      while(travelled+segLen>=nextArrow){
        const t=(nextArrow-travelled)/segLen;
        const x=a.x+dx*t, y=a.y+dy*t;
        const ux=dx/segLen, uy=dy/segLen, px=-uy, py=ux;
        ctx.beginPath();
        ctx.moveTo(x+ux*head,y+uy*head);
        ctx.lineTo(x-ux*head+px*half,y-uy*head+py*half);
        ctx.lineTo(x-ux*head-px*half,y-uy*head-py*half);
        ctx.closePath();
        ctx.fillStyle=`rgba(${color},.58)`; ctx.fill();
        nextArrow+=spacing;
      }
      travelled+=segLen;
    }
    ctx.restore();
  }
}
function clearMovementTrails(){
  if(!state.trails.length) return;
  record(); state.trails=[]; draw();
}

function drawMeasurements(){
  for(const m of state.measurements){
    const r=m.diameter/2;
    const selected=m.id===state.selectedMeasurement;
    ctx.save();
    ctx.translate(m.x,m.y);
    ctx.beginPath();
    ctx.arc(0,0,r,0,Math.PI*2);
    ctx.fillStyle=selected?'rgba(255,255,255,.10)':'rgba(255,255,255,.055)';
    ctx.fill();
    ctx.lineWidth=selected?.10:.055;
    ctx.strokeStyle=selected?'rgba(255,255,255,.78)':'rgba(220,230,240,.42)';
    ctx.setLineDash([.25,.18]);
    ctx.stroke();
    ctx.setLineDash([]);
    if(state.showLabels){
      ctx.font='700 .52px system-ui';
      ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillStyle='rgba(255,255,255,.82)';
      ctx.fillText(`${m.diameter.toFixed(1).replace(/\.0$/,'')}"`,0,0);
    }
    ctx.restore();
  }
}
function drawUnit(u){
  const selected=u.id===state.selected;
  const fill=u.army==='blue'?'rgba(52,136,255,.72)':'rgba(239,79,85,.72)';
  const stroke=u.army==='blue'?'#0d4ea8':'#9e1e26';
  ctx.save();ctx.translate(u.x,u.y);ctx.rotate((u.rotation||0)*Math.PI/180);
  ctx.beginPath();ctx.ellipse(0,0,u.w/2,u.h/2,0,0,Math.PI*2);ctx.fillStyle=fill;ctx.fill();ctx.lineWidth=selected?.16:.07;ctx.strokeStyle=selected?'#fff':stroke;ctx.stroke();
  if(selected){ctx.setLineDash([.15,.12]);ctx.strokeStyle='#fff';ctx.lineWidth=.06;ctx.stroke();ctx.setLineDash([]);}
  if(state.showLabels){
    const label=unitLabel(u);
    const fs=Math.max(.28,Math.min(.72,Math.min(u.w,u.h)*.48));
    ctx.font=`800 ${fs}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle='#fff';ctx.strokeStyle='#000b';ctx.lineWidth=.07;ctx.strokeText(label,0,0);ctx.fillText(label,0,0);
  }
  // Rotation handles are only needed for non-circular (oval) bases.
  if(selected && Math.abs(u.w-u.h)>.01){
    const hy=-u.h/2-.42; ctx.beginPath();ctx.moveTo(0,-u.h/2);ctx.lineTo(0,hy);ctx.strokeStyle='#fff';ctx.lineWidth=.10;ctx.stroke();
    ctx.beginPath();ctx.arc(0,hy,.27,0,Math.PI*2);ctx.fillStyle='#f8d66d';ctx.fill();ctx.lineWidth=.09;ctx.strokeStyle='#202733';ctx.stroke();
    ctx.beginPath();ctx.moveTo(-.12,hy);ctx.lineTo(.12,hy);ctx.moveTo(0,hy-.12);ctx.lineTo(0,hy+.12);ctx.strokeStyle='#202733';ctx.lineWidth=.06;ctx.stroke();
  }
  ctx.restore();
}
function pointerToBoard(e){
  const r=canvas.getBoundingClientRect();
  return {x:(e.clientX-r.left)/r.width*BOARD_W,y:(e.clientY-r.top)/r.height*BOARD_H};
}
function hitTestRotationHandle(pt){
  const u=state.units.find(x=>x.id===state.selected); if(!u||Math.abs(u.w-u.h)<=.01)return null;
  const a=(u.rotation||0)*Math.PI/180, hx=u.x+Math.sin(a)*(u.h/2+.42), hy=u.y-Math.cos(a)*(u.h/2+.42);
  return Math.hypot(pt.x-hx,pt.y-hy)<=.38?u:null;
}
function hitTest(pt){
  for(let i=state.units.length-1;i>=0;i--){
    const u=state.units[i]; const dx=pt.x-u.x,dy=pt.y-u.y,a=(u.rotation||0)*Math.PI/180;
    const rx=dx*Math.cos(-a)-dy*Math.sin(-a), ry=dx*Math.sin(-a)+dy*Math.cos(-a);
    if((rx/(u.w/2))**2+(ry/(u.h/2))**2<=1)return u;
  }
  return null;
}
function nextMeasurementId(){
  let n=1;
  while(state.measurements.some(m=>m.id==='M'+n)) n++;
  return 'M'+n;
}
function addMeasurement(){
  const value=Math.max(0.1,parseFloat(document.getElementById('measurementSize').value)||9);
  const mode=document.getElementById('measurementMode').value;
  const diameter=mode==='radius'?value*2:value;
  record();
  state.measurements.push({id:nextMeasurementId(),diameter,x:BOARD_W/2,y:BOARD_H/2});
  state.selectedMeasurement=state.measurements[state.measurements.length-1].id;
  state.selected=null;
  renderArmy(); draw();
}
function hitTestMeasurement(pt){
  for(let i=state.measurements.length-1;i>=0;i--){
    const m=state.measurements[i],r=m.diameter/2;
    if(Math.hypot(pt.x-m.x,pt.y-m.y)<=r+0.35) return m;
  }
  return null;
}
function removeSelected(){
  if(state.selected){
    const i=state.units.findIndex(u=>u.id===state.selected);
    if(i>=0){record();state.units.splice(i,1);state.selected=null;renderArmy();draw();return;}
  }
  if(state.selectedMeasurement){
    const i=state.measurements.findIndex(m=>m.id===state.selectedMeasurement);
    if(i>=0){record();state.measurements.splice(i,1);state.selectedMeasurement=null;draw();return;}
  }
  if(!state.selected&&!state.selectedMeasurement) return;
}
function syncLayerControls(){
  document.getElementById('gridToggle').checked=state.showGrid;
  document.getElementById('sectionsToggle').checked=state.showSections;
  document.getElementById('rulersToggle').checked=state.showRulers;
  document.getElementById('objectivesToggle').checked=state.showObjectives;
  document.getElementById('terrainToggle').checked=state.showTerrain;
  const trailToggle=document.getElementById('trailModeToggle'); if(trailToggle) trailToggle.checked=state.trailMode;
}

canvas.addEventListener('pointerdown',e=>{
  const pt=pointerToBoard(e);
  const rotateUnit=hitTestRotationHandle(pt);
  if(rotateUnit){
    record(); const startAngle=Math.atan2(pt.y-rotateUnit.y,pt.x-rotateUnit.x);
    state.dragging={type:'rotate',id:rotateUnit.id,startAngle,startRotation:rotateUnit.rotation||0};
    canvas.setPointerCapture(e.pointerId); return;
  }
  const u=hitTest(pt);
  if(u){
    state.selected=u.id;
    state.selectedMeasurement=null;
    record();
    let trailIndex=null;
    if(state.trailMode){
      state.trails.push({id:`T${Date.now()}-${state.trails.length}`,unitId:u.id,army:u.army,points:[{x:u.x,y:u.y}]});
      trailIndex=state.trails.length-1;
    }
    state.dragging={type:'unit',id:u.id,dx:pt.x-u.x,dy:pt.y-u.y,trailIndex,lastTrailX:u.x,lastTrailY:u.y};
    renderArmy(); draw(); canvas.setPointerCapture(e.pointerId); return;
  }
  const m=hitTestMeasurement(pt);
  if(m){
    state.selected=null;
    state.selectedMeasurement=m.id;
    record();
    state.dragging={type:'measurement',id:m.id,dx:pt.x-m.x,dy:pt.y-m.y};
    renderArmy(); draw(); canvas.setPointerCapture(e.pointerId); return;
  }
  state.selected=null;
  state.selectedMeasurement=null;
  renderArmy(); draw();
});
canvas.addEventListener('pointermove',e=>{
  const pt=pointerToBoard(e);
  coordsEl.textContent=`x: ${pt.x.toFixed(1)}\"  y: ${pt.y.toFixed(1)}\"`;
  if(!state.dragging){const hover=hitTest(pt); canvas.title=hover?`${unitDisplayName(hover)} (${hover.base})`:'';}
  if(!state.dragging)return;
  if(state.dragging.type==='rotate'){
    const u=state.units.find(x=>x.id===state.dragging.id); if(!u)return;
    const angle=Math.atan2(pt.y-u.y,pt.x-u.x);
    u.rotation=state.dragging.startRotation+(angle-state.dragging.startAngle)*180/Math.PI;
    draw(); renderArmy(); return;
  }
  if(state.dragging.type==='unit'){
    const u=state.units.find(x=>x.id===state.dragging.id);if(!u)return;
    u.x=Math.max(u.w/2,Math.min(BOARD_W-u.w/2,pt.x-state.dragging.dx));
    u.y=Math.max(u.h/2,Math.min(BOARD_H-u.h/2,pt.y-state.dragging.dy));
    if(state.dragging.trailIndex!==null && state.dragging.trailIndex!==undefined){
      const trail=state.trails[state.dragging.trailIndex];
      if(trail){
        const dx=u.x-state.dragging.lastTrailX,dy=u.y-state.dragging.lastTrailY;
        if(Math.hypot(dx,dy)>=.12){trail.points.push({x:u.x,y:u.y});state.dragging.lastTrailX=u.x;state.dragging.lastTrailY=u.y;}
        else if(trail.points.length===1){trail.points.push({x:u.x,y:u.y});}
      }
    }
  } else {
    const m=state.measurements.find(x=>x.id===state.dragging.id);if(!m)return;
    m.x=Math.max(m.diameter/2,Math.min(BOARD_W-m.diameter/2,pt.x-state.dragging.dx));
    m.y=Math.max(m.diameter/2,Math.min(BOARD_H-m.diameter/2,pt.y-state.dragging.dy));
  }
  draw(); renderArmy();
});
canvas.addEventListener('pointerup',()=>{state.dragging=null;});
canvas.addEventListener('pointerleave',()=>coordsEl.textContent='x: — y: —');
const boardResizeObserver=new ResizeObserver(()=>{resizeCanvas();draw();});
boardResizeObserver.observe(canvas.parentElement);
window.addEventListener('resize',()=>{resizeCanvas();draw();});
document.addEventListener('keydown',e=>{
  if((e.key==='Delete'||e.key==='Backspace')&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();removeSelected();}
  if(e.key.toLowerCase()==='r'&&state.selected&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){const u=state.units.find(x=>x.id===state.selected);if(u){record();u.rotation=(u.rotation||0)+15;draw();}}
});

planSelect.addEventListener('change',()=>{record();state.planId=planSelect.value;renderPlan();});
document.querySelectorAll('.army-tab').forEach(b=>b.addEventListener('click',()=>{state.army=b.dataset.army;renderArmy();}));
armyNameInput.addEventListener('change',()=>{state.armies[state.army].name=armyNameInput.value||`${state.army==='blue'?'Blue':'Red'} Army`;state.units.filter(u=>u.army===state.army).forEach(u=>u.armyName=state.armies[state.army].name);renderArmy();});
unitSearch.addEventListener('input',renderArmy);
unitResults.addEventListener('click',e=>{const row=e.target.closest('.unit-result');if(!row)return;const b=BASES[+row.dataset.index];if(b)addUnit(b);});
document.getElementById('addArmyUnit').addEventListener('click',()=>{const b=BASES.find(x=>normalize(x.unit)===normalize(unitSearch.value));if(b)addUnit(b);});
document.getElementById('undoBtn').addEventListener('click',undo);
document.getElementById('redoBtn').addEventListener('click',redo);
document.getElementById('deleteBtn').addEventListener('click',removeSelected);
document.getElementById('renameUnitBtn').addEventListener('click',()=>renameSelectedUnit(document.getElementById('renameUnitInput').value));
document.getElementById('renameUnitInput').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();renameSelectedUnit(e.currentTarget.value);}});
document.getElementById('clearBtn').addEventListener('click',clearUnits);
document.getElementById('labelsBtn').addEventListener('click',()=>{state.showLabels=!state.showLabels;draw();});
document.getElementById('addMeasurement').addEventListener('click',addMeasurement);
document.getElementById('gridToggle').addEventListener('change',e=>{state.showGrid=e.target.checked;draw();});
document.getElementById('sectionsToggle').addEventListener('change',e=>{state.showSections=e.target.checked;draw();});
document.getElementById('rulersToggle').addEventListener('change',e=>{state.showRulers=e.target.checked;draw();});
document.getElementById('objectivesToggle').addEventListener('change',e=>{state.showObjectives=e.target.checked;draw();});
document.getElementById('terrainToggle').addEventListener('change',e=>{state.showTerrain=e.target.checked;draw();});
document.getElementById('trailModeToggle').addEventListener('change',e=>{state.trailMode=e.target.checked;});
document.getElementById('clearTrailsBtn').addEventListener('click',clearMovementTrails);
tacticSelect.addEventListener('change',e=>showTactic(e.target.value));
document.getElementById('importList').addEventListener('click',()=>{
  const lines=document.getElementById('listText').value.split(/\n/).map(x=>x.trim()).filter(Boolean),added=[];
  lines.forEach(line=>{
    let count=1,name=line,m=line.match(/^(?:x|×)?\s*(\d+)\s+(.+)$/i); if(m){count=+m[1];name=m[2];}
    m=line.match(/^(.+?)\s+(?:x|×)\s*(\d+)$/i); if(m){name=m[1];count=+m[2];}
    const n=normalize(name); let b=BASES.find(x=>normalize(x.unit)===n); if(!b)b=BASES.find(x=>n.includes(normalize(x.unit))||normalize(x.unit).includes(n));
    if(b){addUnit(b,state.army,Math.min(count,30));added.push(`${name} ×${count}`);}
  });
  alert(added.length?`Imported: ${added.join(', ')}`:'No unit names matched the bundled base-size index.');
});
document.getElementById('exportBtn').addEventListener('click',()=>{
  const a=document.createElement('a');a.download=`aos-${state.planId}-battle-plan.png`;a.href=canvas.toDataURL('image/png');a.click();
});
document.getElementById('saveBtn').addEventListener('click',()=>{
  const blob=new Blob([JSON.stringify(snapshot(),null,2)],{type:'application/json'}),a=document.createElement('a');
  a.download=`aos-war-room-${state.planId}.json`;a.href=URL.createObjectURL(blob);a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
});
document.getElementById('loadBtn').addEventListener('click',()=>document.getElementById('loadFile').click());
document.getElementById('loadFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{restore(JSON.parse(await f.text()));}catch(err){alert('Could not load that plan file.');}e.target.value='';});
document.getElementById('exportDataBtn').addEventListener('click',downloadBattleplanData);
document.getElementById('loadDataBtn').addEventListener('click',()=>document.getElementById('loadDataFile').click());
document.getElementById('loadDataFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{applyBattleplanData(JSON.parse(await f.text()));}catch(err){alert('Could not load battleplan data: '+err.message);}e.target.value='';});

populatePlans();syncLayerControls();renderPlan();renderTactics();renderArmy();
