const INSTRUMENTS = {
  '6E': {name:'Euro FX', tickSize:0.00005, tickValue:6.25, eq:1},
  '6J': {name:'Japanese Yen', tickSize:0.0000005, tickValue:6.25, eq:1},
  'ES': {name:'E-mini S&P 500', tickSize:0.25, tickValue:12.50, eq:1},
  'MES':{name:'Micro E-mini S&P 500', tickSize:0.25, tickValue:1.25, eq:0.1},
  'NQ': {name:'E-mini Nasdaq-100', tickSize:0.25, tickValue:5.00, eq:1},
  'MNQ':{name:'Micro E-mini Nasdaq-100', tickSize:0.25, tickValue:0.50, eq:0.1},
  'MGC':{name:'Micro Gold', tickSize:0.10, tickValue:1.00, eq:0.1}
};

const DEFAULT_SETTINGS = {startBalance:25000, profitTarget:1500, drawdown:1000, maxEq:3, dailyStop:300, maxTrades:3, minRR:1.5, maxRisk:250};
let settings = load('ofa_settings', DEFAULT_SETTINGS);
let journal = load('ofa_journal', []);
let screenshotData = '';
let deferredPrompt = null;

const $ = id => document.getElementById(id);
const money = n => Number.isFinite(n) ? n.toLocaleString('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}) : '—';
const num = id => Number($(id).value);
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback}}
function save(key,value){localStorage.setItem(key,JSON.stringify(value))}

function init(){
  Object.entries(INSTRUMENTS).forEach(([code,x])=> $('instrument').add(new Option(`${code} – ${x.name}`,code)));
  bindTabs(); bindInputs(); fillSettings(); renderAccount(); updateRisk(); renderJournal(); renderStats();
  if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
}

function bindTabs(){document.querySelectorAll('.tab').forEach(btn=>btn.onclick=()=>{document.querySelectorAll('.tab,.view').forEach(x=>x.classList.remove('active'));btn.classList.add('active');$(`view-${btn.dataset.view}`).classList.add('active');if(btn.dataset.view==='journal')renderJournal();if(btn.dataset.view==='stats')renderStats();});}
function bindInputs(){
  ['instrument','direction','balance','dailyPnL','tradesToday','contracts','entry','stop','tp1','tp2'].forEach(id=>$(id).addEventListener('input',updateRisk));
  $('evaluateBtn').onclick=evaluate; $('resetBtn').onclick=resetForm; $('saveSettingsBtn').onclick=saveSettings;
  $('exportBtn').onclick=exportJournal; $('importFile').onchange=importJournal; $('clearDataBtn').onclick=clearData;
  $('screenshot').onchange=readImage; $('confirmCloseBtn').onclick=confirmClose;
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('installBtn').classList.remove('hidden')});
  $('installBtn').onclick=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;$('installBtn').classList.add('hidden')};
}
function renderAccount(){
  $('targetLabel').textContent=money(settings.profitTarget);$('drawdownLabel').textContent=money(settings.drawdown);$('contractLimitLabel').textContent=settings.maxEq.toFixed(1);
}
function calcRisk(){
  const inst=INSTRUMENTS[$('instrument').value]; const entry=num('entry'), stop=num('stop'), tp1=num('tp1'), contracts=num('contracts')||0;
  const valid=Number.isFinite(entry)&&Number.isFinite(stop)&&entry!==stop&&contracts>0;
  const ticks=valid?Math.abs(entry-stop)/inst.tickSize:NaN; const risk=valid?ticks*inst.tickValue*contracts:NaN;
  const reward=valid&&Number.isFinite(tp1)?Math.abs(tp1-entry)/inst.tickSize*inst.tickValue*contracts:NaN;
  const rr=Number.isFinite(risk)&&risk>0&&Number.isFinite(reward)?reward/risk:NaN;
  const eq=contracts*inst.eq; const dailyPnL=num('dailyPnL')||0; const balance=num('balance')||settings.startBalance;
  const floor=balance-settings.drawdown; const projected=balance+dailyPnL-(Number.isFinite(risk)?risk:0); const buffer=projected-floor;
  return {inst,entry,stop,tp1,contracts,ticks,risk,reward,rr,eq,dailyPnL,balance,buffer};
}
function updateRisk(){
  const r=calcRisk(); $('riskSummary').innerHTML=[['Stop',Number.isFinite(r.ticks)?`${r.ticks.toFixed(1)} tick`:'—'],['Kockázat',money(r.risk)],['R:R',Number.isFinite(r.rr)?r.rr.toFixed(2):'—'],['E-mini eq.',r.eq.toFixed(1)]].map(([a,b])=>`<div class="metric"><span>${a}</span><strong>${b}</strong></div>`).join('');
}
function checkboxData(){return [...document.querySelectorAll('#tradeForm input[type=checkbox]')].map(x=>({key:x.dataset.key,checked:x.checked,weight:Number(x.dataset.weight||0),required:x.dataset.required==='true',blocker:x.dataset.blocker==='true'}));}
function evaluate(){
  const r=calcRisk(), checks=checkboxData(); let blockers=[]; let warnings=[];
  if(!Number.isFinite(r.risk)||r.risk<=0) blockers.push('Hiányos vagy hibás entry/stop/kontraktus adat.');
  if(Number.isFinite(r.risk)&&r.risk>settings.maxRisk) blockers.push(`A kockázat ${money(r.risk)}, ami meghaladja a belső ${money(settings.maxRisk)} limitet.`);
  if(r.eq>settings.maxEq) blockers.push(`A pozíció ${r.eq.toFixed(1)} E-mini egyenérték, a limit ${settings.maxEq.toFixed(1)}.`);
  if(Number.isFinite(r.rr)&&r.rr<settings.minRR) blockers.push(`Az R:R ${r.rr.toFixed(2)}, a minimum ${settings.minRR.toFixed(2)}.`);
  if(!Number.isFinite(r.rr)) warnings.push('A TP1 hiányzik, ezért az R:R nem számolható.');
  if(r.dailyPnL<=-settings.dailyStop) blockers.push('A belső napi veszteséglimit már elérve.');
  if(r.dailyPnL-(Number.isFinite(r.risk)?r.risk:0)<=-settings.dailyStop) blockers.push('A stop esetén sérülne a belső napi veszteséglimit.');
  if(num('tradesToday')>=settings.maxTrades) blockers.push('Elérted a napi maximális tradeszámot.');
  if(r.buffer<0) blockers.push('A stop esetén a beállított drawdown-puffer sérülne.');
  checks.filter(x=>x.blocker&&x.checked).forEach(()=>blockers.push('Kizáró pszichológiai, technikai vagy tervbeli körülmény van jelen.'));
  checks.filter(x=>x.required&&!x.checked).forEach(x=>blockers.push(`Kötelező feltétel hiányzik: ${labelFor(x.key)}`));
  const weighted=checks.filter(x=>x.weight>0); const earned=weighted.reduce((s,x)=>s+(x.checked?x.weight:0),0); const total=weighted.reduce((s,x)=>s+x.weight,0); const score=Math.round(earned/total*100);
  let grade='Nincs trade', cls='no', decision='NE LÉPJ BE';
  if(!blockers.length){if(score>=85){grade='A+';cls='good';decision='BELÉPÉS MEGFONTOLHATÓ'}else if(score>=72){grade='A';cls='good';decision='SZABÁLYOS SETUP'}else if(score>=58){grade='B';cls='wait';decision='VÁRJ TOVÁBBI MEGERŐSÍTÉSRE'}else{grade='Nincs trade';cls='no';decision='NINCS ELÉG KONFLUENCIA'}}
  const missing=weighted.filter(x=>!x.checked).sort((a,b)=>b.weight-a.weight).slice(0,4).map(x=>labelFor(x.key));
  const result={id:crypto.randomUUID(),createdAt:new Date().toISOString(),instrument:$('instrument').value,direction:$('direction').value,entry:r.entry,stop:r.stop,tp1:r.tp1,tp2:num('tp2'),contracts:r.contracts,risk:r.risk,rr:r.rr,eq:r.eq,score,grade,decision,blockers,warnings,missing,notes:$('notes').value,screenshot:screenshotData,status:'open',pnl:null,checks:Object.fromEntries(checks.map(x=>[x.key,x.checked]))};
  showResult(result,cls); journal.unshift(result); save('ofa_journal',journal); renderJournal(); renderStats();
}
function showResult(x,cls){
  $('resultCard').className=`result ${cls}`; $('resultCard').innerHTML=`<div class="result-score">${x.score}%</div><h2>${x.grade} – ${x.decision}</h2><p>Kockázat: <strong>${money(x.risk)}</strong> · R:R: <strong>${Number.isFinite(x.rr)?x.rr.toFixed(2):'—'}</strong> · E-mini eq.: <strong>${x.eq.toFixed(1)}</strong></p>${x.blockers.length?`<h3>Kizáró okok</h3><ul class="reason-list">${x.blockers.map(v=>`<li>${v}</li>`).join('')}</ul>`:''}${!x.blockers.length&&x.missing.length?`<h3>Fejleszthető pontok</h3><ul class="reason-list">${x.missing.map(v=>`<li>${v}</li>`).join('')}</ul>`:''}<p class="muted">Az értékelés mentve a naplóba.</p>`; $('resultCard').scrollIntoView({behavior:'smooth',block:'center'});
}
function labelFor(key){const map={clearContext:'Egyértelmű kontextus',importantLocation:'Fontos lokáció',htfAlignment:'Magasabb idősík támogatása',roomToTarget:'Tiszta tér a célárig',rejection:'Elutasítás',structureConfirm:'Struktúra-megerősítés',notChasing:'Nem chase belépő',footprintConfirmation:'Footprint-megerősítés',stackedImbalance:'Stacked imbalance/agresszió',absorption:'Abszorpció',exhaustion:'Exhaustion',cvdDivergence:'CVD-divergencia',deltaDivergence:'Delta-divergencia',cvdNotAgainst:'CVD nem dolgozik ellened'};return map[key]||key}
function resetForm(){$('tradeForm').reset();$('balance').value=settings.startBalance;$('contracts').value=1;$('dailyPnL').value=0;$('tradesToday').value=0;screenshotData='';$('imagePreview').classList.add('hidden');$('resultCard').classList.add('hidden');updateRisk();}
function readImage(e){const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{screenshotData=reader.result;$('imagePreview').innerHTML=`<img src="${screenshotData}" alt="Chart előnézet">`;$('imagePreview').classList.remove('hidden')};reader.readAsDataURL(f)}
function renderJournal(){
  const root=$('journalList'); if(!journal.length){root.innerHTML='<p class="muted">Még nincs mentett setup.</p>';return}
  root.innerHTML=journal.map(x=>`<div class="journal-item"><div class="journal-top"><div><strong>${x.instrument} · ${x.direction.toUpperCase()}</strong><div class="muted">${new Date(x.createdAt).toLocaleString('hu-HU')}</div></div><span class="badge ${x.grade==='A+'||x.grade==='A'?'good':x.grade==='B'?'wait':'no'}">${x.grade} ${x.score}%</span></div><p>${x.decision}</p><div class="muted">Kockázat: ${money(x.risk)} · R:R: ${Number.isFinite(x.rr)?x.rr.toFixed(2):'—'} · ${x.status==='closed'?`P/L: ${money(x.pnl)}`:'Nyitott naplóbejegyzés'}</div>${x.notes?`<p>${escapeHtml(x.notes)}</p>`:''}${x.screenshot?`<img class="journal-image" src="${x.screenshot}" alt="Mentett chart">`:''}<div class="journal-actions">${x.status!=='closed'?`<button class="primary" onclick="openClose('${x.id}')">Lezárás</button>`:''}<button class="danger" onclick="deleteEntry('${x.id}')">Törlés</button></div></div>`).join('');
}
function openClose(id){$('closeId').value=id;$('closePnl').value='';$('closeNotes').value='';$('closeDialog').showModal()}
function confirmClose(){const id=$('closeId').value;const x=journal.find(j=>j.id===id);if(!x)return;x.status='closed';x.pnl=num('closePnl');x.closeNotes=$('closeNotes').value;x.closedAt=new Date().toISOString();save('ofa_journal',journal);$('closeDialog').close();renderJournal();renderStats()}
function deleteEntry(id){if(!confirm('Biztosan törlöd ezt a bejegyzést?'))return;journal=journal.filter(x=>x.id!==id);save('ofa_journal',journal);renderJournal();renderStats()}
window.openClose=openClose;window.deleteEntry=deleteEntry;
function renderStats(){
  const closed=journal.filter(x=>x.status==='closed'&&Number.isFinite(x.pnl)); const wins=closed.filter(x=>x.pnl>0); const losses=closed.filter(x=>x.pnl<0); const grossWin=wins.reduce((s,x)=>s+x.pnl,0); const grossLoss=Math.abs(losses.reduce((s,x)=>s+x.pnl,0)); const net=closed.reduce((s,x)=>s+x.pnl,0); const winRate=closed.length?wins.length/closed.length*100:0; const pf=grossLoss?grossWin/grossLoss:(grossWin?Infinity:0); const avgR=closed.length?closed.reduce((s,x)=>s+(x.risk?x.pnl/x.risk:0),0)/closed.length:0;
  const cards=[['Lezárt trade',closed.length],['Win rate',`${winRate.toFixed(1)}%`],['Nettó P/L',money(net)],['Profit factor',pf===Infinity?'∞':pf.toFixed(2)],['Átlagos R',avgR.toFixed(2)],['A/A+ setup',journal.filter(x=>['A','A+'].includes(x.grade)).length]];
  $('statsGrid').innerHTML=cards.map(([a,b])=>`<div class="stat"><span>${a}</span><strong>${b}</strong></div>`).join('');
}
function fillSettings(){[['setStartBalance','startBalance'],['setProfitTarget','profitTarget'],['setDrawdown','drawdown'],['setMaxEq','maxEq'],['setDailyStop','dailyStop'],['setMaxTrades','maxTrades'],['setMinRR','minRR'],['setMaxRisk','maxRisk']].forEach(([id,k])=>$(id).value=settings[k])}
function saveSettings(){settings={startBalance:num('setStartBalance'),profitTarget:num('setProfitTarget'),drawdown:num('setDrawdown'),maxEq:num('setMaxEq'),dailyStop:num('setDailyStop'),maxTrades:num('setMaxTrades'),minRR:num('setMinRR'),maxRisk:num('setMaxRisk')};save('ofa_settings',settings);renderAccount();$('balance').value=settings.startBalance;updateRisk();alert('Beállítások elmentve.')}
function exportJournal(){const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),settings,journal},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`orderflow-assistant-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href)}
function importJournal(e){const f=e.target.files[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{try{const d=JSON.parse(reader.result);if(!Array.isArray(d.journal))throw new Error();journal=d.journal;if(d.settings)settings={...DEFAULT_SETTINGS,...d.settings};save('ofa_journal',journal);save('ofa_settings',settings);fillSettings();renderAccount();renderJournal();renderStats();alert('Import sikeres.')}catch{alert('Érvénytelen fájl.')}};reader.readAsText(f)}
function clearData(){if(!confirm('Minden naplóbejegyzés és beállítás törlődik. Folytatod?'))return;localStorage.removeItem('ofa_journal');localStorage.removeItem('ofa_settings');journal=[];settings={...DEFAULT_SETTINGS};fillSettings();renderAccount();renderJournal();renderStats();resetForm()}
function escapeHtml(s){return s.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
init();
