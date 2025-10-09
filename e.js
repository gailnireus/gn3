(async function(){
const CASH_PER_MIN = 0.01;
const TAX_INTERVAL_MIN = 5; // setiap 5 minit
const TAX_AMOUNT = 0.01;

const db = new Dexie('gn3_db_v1');
db.version(1).stores({
  players: 'tag,createdAt,lastUpdated,cash,active'
});

const center = document.getElementById('center');
const createLink = document.getElementById('create-link');
const pingLink = document.getElementById('ping-link');
const fileInput = document.getElementById('file-input');

let current=null;
let ticker=null;
let isPromptActive=false;
let lastTax = Date.now();

const now = ()=>Date.now();
const fmtMoney = n=>n.toFixed(2)+'e';
const spinners = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];
let spinIndex=0;
setInterval(()=>{spinIndex=(spinIndex+1)%spinners.length;},500);

// ------------------ CALC ------------------
const calc = p=>{
  const t = now();
  const mins = Math.floor((t - p.lastUpdated)/60000);
  const live = p.cash + mins*CASH_PER_MIN;
  const totalMins = Math.floor((t-p.createdAt)/60000);
  const hrs = Math.floor(totalMins/60);
  const minsLeft = totalMins%60;
  return {hrs, mins:minsLeft, live};
};

// ------------------ RENDER ------------------
const render = p=>{
  if(isPromptActive) return;
  if(!p){center.innerHTML=`<div>tag: —</div><div>time: —</div><div>cash: —</div>`; return;}
  const {hrs, mins, live} = calc(p);
  const clockChar = `<span style="color:#a855f7">${spinners[spinIndex]}</span>`;
  center.innerHTML = `
    <div>tag: ${p.tag} <span class="tag-flash">⦿</span></div>
    <div>time: ${hrs} h ${String(mins).padStart(2,'0')} m ${clockChar}</div>
    <div>cash: ${fmtMoney(live)} <span class="pulse-dot">•</span></div>`;
};

// ------------------ PERSIST ------------------
const persist = async p=>{
  const t = now();
  const mins = Math.floor((t-p.lastUpdated)/60000);
  if(mins>=1){ 
    p.cash += mins*CASH_PER_MIN; 
    p.lastUpdated += mins*60000; 
    await db.players.put(p);
  }
};

// ------------------ TICKER ------------------
const startTicker = ()=>{
  if(ticker) clearInterval(ticker);
  ticker=setInterval(async()=>{
    if(current && !isPromptActive){
      render(current);
      await persist(current);

      // ---- Maintenance Tax ----
      const minsSinceTax = (now() - lastTax)/60000;
      if(minsSinceTax >= TAX_INTERVAL_MIN){
        current.cash -= TAX_AMOUNT;
        if(current.cash < 0) current.cash = 0;
        lastTax = now();
        await db.players.put(current);
        center.innerHTML = `system maintenance executed.<br>cash: -${fmtMoney(TAX_AMOUNT)}`;
        setTimeout(()=>{isPromptActive=false; render(current);},2500);
      }
    }
  },1000);
};

// ------------------ PROMPT ------------------
const showPrompt = (text, cb)=>{
  isPromptActive=true;
  center.innerHTML=`<div>${text}</div><input id="inline-input" maxlength="3" autofocus /><div id="create-btns" class="mt-2"></div>`;
  const inp = document.getElementById('inline-input');
  inp.focus();
  const btnsDiv = document.getElementById('create-btns');
  const saveBtn = document.createElement('span'); saveBtn.textContent='[save]'; saveBtn.className='center-link';
  const loadBtn = document.createElement('span'); loadBtn.textContent='[load]'; loadBtn.className='center-link';
  const resetBtn = document.createElement('span'); resetBtn.textContent='[reset]'; resetBtn.className='center-link';
  btnsDiv.append(saveBtn, loadBtn, resetBtn);

  inp.addEventListener('keydown', e=>{
    if(e.key==='Enter'){ isPromptActive=false; cb(inp.value.trim()); }
    else if(e.key==='Escape'){ isPromptActive=false; render(current);}
  });

  saveBtn.onclick=e=>{ e.preventDefault(); saveFlow(); };
  loadBtn.onclick=e=>{ e.preventDefault(); loadFlow(); };
  resetBtn.onclick=e=>{ e.preventDefault(); resetFlow(inp.value.trim()); };
};

// ------------------ CLICK OUTSIDE TO CLOSE ------------------
document.addEventListener('click', e=>{
  if(!isPromptActive) return;
  const id = e.target.id;
  if(['create-link','ping-link'].includes(id)) return;
  isPromptActive=false; render(current);
});

// ------------------ FLOWS ------------------
async function createFlow(){
  showPrompt('enter 3-digit tag:', async val=>{
    if(!/^[0-9]{3}$/.test(val)){ render(current); return; }
    let p = await db.players.get(val);
    
    if(p && p.active){ 
      // LOGIN flow
      current = p;
      localStorage.setItem('gn3_last_tag', val);
      center.innerHTML=`<div>tag ${val} loaded (login)</div>`;
      setTimeout(()=>{isPromptActive=false; render(current);},1500);
      return;
    }
    
    if(p && !p.active){ 
      // unactive, cannot use
      center.innerHTML=`<div>tag ${val} is unactive, cannot use</div>`; 
      setTimeout(()=>{isPromptActive=false; render(current);},1500);
      return;
    }
    
    // CREATE new tag
    const t=now();
    p={tag:val,createdAt:t,lastUpdated:t,cash:0,active:true};
    await db.players.add(p);
    current=p;
    localStorage.setItem('gn3_last_tag', val);
    center.innerHTML=`<div>created tag ${val}</div>`;
    setTimeout(()=>{isPromptActive=false; render(current);},1000);
  });
}

async function resetFlow(val){
  if(!val || !/^[0-9]{3}$/.test(val)){ render(current); return; }
  const p = await db.players.get(val);
  if(!p || !p.active){ center.innerHTML='<div>not found or already unactive.</div>'; setTimeout(()=>{isPromptActive=false; render(current);},1500); return;}
  p.active=false; await db.players.put(p);
  if(current && current.tag===val) current=null;
  center.innerHTML=`<div>tag ${val} reset (unactive)</div>`;
  setTimeout(()=>{isPromptActive=false; render(current);},1200);
}

async function pingFlow(){
  isPromptActive=true;
  const all = await db.players.toArray();
  let lines=[];
  for(const p of all){
    const {hrs, mins} = calc(p);
    if(p.active) lines.push(`${p.tag} [${hrs>0?hrs+'h ':''}${String(mins).padStart(2,'0')}m] still alive`);
    else lines.push(`${p.tag} not alive`);
  }
  center.innerHTML='> ping<br>'+lines.join('<br>');
  setTimeout(()=>{isPromptActive=false; render(current);},4000);
}

// ------------------ SAVE / LOAD ------------------
async function saveFlow(){
  try{
    const all = await db.players.toArray();
    const sanitized=all.map(p=>({tag:p.tag,createdAt:p.createdAt,lastUpdated:p.lastUpdated,cash:p.cash,active:p.active}));
    const blob=new Blob([JSON.stringify({exportedAt:now(),players:sanitized},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`gn3_save_${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    center.innerHTML='> save<br>file downloaded.';
  } catch(err){center.innerHTML='> save<br>failed.'; console.error(err);}
  setTimeout(()=>{isPromptActive=false; render(current);},1200);
}

async function loadFlow(){
  isPromptActive=true;
  fileInput.value=''; fileInput.click();
  fileInput.onchange=async e=>{
    const f=e.target.files[0];
    if(!f){isPromptActive=false;render(current); return;}
    try{
      const text=await f.text();
      const data=JSON.parse(text);
      const arr=Array.isArray(data.players)?data.players:data;
      if(!arr){center.innerHTML='invalid file'; setTimeout(()=>{isPromptActive=false; render(current);},1500); return;}
      await db.transaction('rw',db.players, async()=>{
        await db.players.clear();
        await db.players.bulkAdd(arr.map(p=>({
          tag:String(p.tag).padStart(3,'0'),
          createdAt:Number(p.createdAt)||now(),
          lastUpdated:Number(p.lastUpdated)||now(),
          cash:Number(p.cash||0),
          active:Boolean(p.active)
        })));
      });
      const lastTag=localStorage.getItem('gn3_last_tag');
      current=await db.players.get(lastTag) || await db.players.get(arr[0].tag);
      center.innerHTML='> load<br>save loaded.';
      setTimeout(()=>{isPromptActive=false; render(current);},1200);
    } catch(err){console.error(err); center.innerHTML='> load<br>error reading file'; setTimeout(()=>{isPromptActive=false; render(current);},1500);}
  };
}

// ------------------ HANDLERS ------------------
createLink.onclick=e=>{e.preventDefault(); createFlow();};
pingLink.onclick=e=>{e.preventDefault(); pingFlow();};

// ------------------ INITIAL LOAD ------------------
const last = localStorage.getItem('gn3_last_tag');
if(last){
  const p = await db.players.get(last);
  if(p){current=p; render(p);} else render(null);
} else render(null);
startTicker();
})();
