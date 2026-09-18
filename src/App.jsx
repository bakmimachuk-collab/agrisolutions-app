import React, { useEffect, useMemo, useRef, useState } from "react";
import { Routes, Route, NavLink, useNavigate } from "react-router-dom";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Bell, Bot, CalendarDays,
  Camera, CheckCircle2, ChevronRight, CloudRain, Droplets, Egg, FileText,
  Home, Leaf, Menu, MessageCircle, Mic, MoreHorizontal, PawPrint, Plus,
  Search, Settings, ShieldCheck, Sprout, Sun, Tractor, TrendingUp, Upload,
  UserRound, Users, Wallet, Wheat, X, Wind, Zap
} from "lucide-react";

const initialCrops = [
  { id: 1, name: "Maize", variety: "Early yellow", area: "2.0 ha", status: "Healthy", image: "🌽" },
  { id: 2, name: "Tomato", variety: "Roma", area: "1.2 ha", status: "Attention", image: "🍅" },
  { id: 3, name: "Cassava", variety: "TMS", area: "1.0 ha", status: "Healthy", image: "🥔" },
  { id: 4, name: "Pepper", variety: "Scotch bonnet", area: "0.8 ha", status: "Healthy", image: "🌶️" }
];

const initialLivestock = [
  { id: 1, type: "Dairy Cow", breed: "White Fulani", age: "1 year", sex: "Female", status: "Healthy", image: "🐄" },
  { id: 2, type: "Goat", breed: "West African Dwarf", age: "6 months", sex: "Male", status: "Healthy", image: "🐐" },
  { id: 3, type: "Chicken", breed: "Broiler", age: "3 months", sex: "Female", status: "Watch", image: "🐔" }
];

const activities = [
  ["AI insight", "Possible pest pressure detected on maize", "2 hours ago", "alert"],
  ["Crop added", "Tomato plot updated in your farm", "4 hours ago", "leaf"],
  ["Weather", "Rain expected in the next 24 hours", "Yesterday", "cloud"],
  ["Finance", "Feed expense recorded — ₦15,000", "Yesterday", "money"]
];

function Layout({ children, crops, livestock, alerts, onAddCrop, onAddLivestock }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const links = [
    ["/dashboard", "Dashboard", Home],
    ["/crops", "Crops", Wheat],
    ["/livestock", "Livestock", PawPrint],
    ["/ask-ai", "AI Assistant", Bot],
    ["/diagnose", "Diagnose", Activity],
    ["/weather", "Weather", CloudRain],
    ["/journal", "Farm Records", FileText],
    ["/finance", "Finance", Wallet],
    ["/calendar", "Calendar", CalendarDays],
    ["/alerts", "Alerts", Bell],
    ["/community", "Community", Users]
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand" onClick={() => navigate("/dashboard")}>
          <div className="brand-mark"><Sprout size={24}/></div>
          <span>Agri<span>Plus</span></span>
        </div>
        <nav className="nav-list">
          {links.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} onClick={() => setOpen(false)} className={({isActive}) => `nav-link ${isActive ? "active" : ""}`}>
              <Icon size={19}/><span>{label}</span>
              {label === "Alerts" && alerts > 0 && <b className="badge">{alerts}</b>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/profile" className="profile-mini">
            <div className="avatar">BM</div>
            <div><strong>Farmer</strong><small>AgriPlus user</small></div>
            <ChevronRight size={17}/>
          </NavLink>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setOpen(!open)}><Menu/></button>
          <div className="search"><Search size={18}/><input placeholder="Search crops, livestock, records..." /></div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => navigate("/alerts")}><Bell size={19}/><span className="notification-dot">{alerts}</span></button>
            <button className="avatar top-avatar" onClick={() => navigate("/profile")}>BM</button>
          </div>
        </header>
        <div className="page">{children}</div>
        <div className="mobile-nav">
          {links.slice(0,5).map(([to,label,Icon]) => <NavLink key={to} to={to} className={({isActive}) => isActive ? "active": ""}><Icon size={18}/><span>{label === "AI Assistant" ? "AI" : label}</span></NavLink>)}
        </div>
      </main>

      <div className="global-float">
        <button title="Ask AgriPlus AI" onClick={() => navigate("/ask-ai")}><Bot size={22}/></button>
      </div>

      {/* These callbacks are kept in the layout contract so page-level forms remain reusable. */}
      <span hidden>{String(crops.length + livestock.length + onAddCrop + onAddLivestock)}</span>
    </div>
  );
}

function PageTitle({ eyebrow, title, text, action, onAction }) {
  return <div className="page-title">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{text && <p>{text}</p>}</div>
    {action && <button className="primary" onClick={onAction}><Plus size={17}/>{action}</button>}
  </div>;
}

function Dashboard({ crops, livestock, addCrop, addLivestock }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [showCrop, setShowCrop] = useState(false);
  const [showAnimal, setShowAnimal] = useState(false);

  return <div>
    <section className="hero">
      <div className="hero-photo"></div>
      <div className="hero-overlay">
        <div className="hero-copy">
          <span className="hero-kicker"><Sun size={15}/> Smart farming, made practical</span>
          <h1>Good morning, Farmer. <span>🌱</span></h1>
          <p>Understand your farm, spot problems early, and make better decisions with AI.</p>
          <div className="hero-pills"><span>📍 Jos, Plateau State</span><span><Sun size={15}/> 22°C</span><span>Partly cloudy</span></div>
        </div>
        <div className="weather-card">
          <div className="weather-main"><Sun size={38}/><div><strong>22°C</strong><span>Partly Cloudy</span></div></div>
          <div className="forecast-row">{["Today","Thu","Fri","Sat","Sun"].map((d,i)=><div key={d}><small>{d}</small><b>{22-i}°</b><span>{14+i}°</span></div>)}</div>
        </div>
      </div>
    </section>

    <section className="ai-prompt">
      <div className="ai-icon"><Bot size={24}/></div>
      <div className="ai-prompt-text"><strong>Ask AgriPlus AI</strong><span>Ask about crops, livestock, pests, weather, or farm planning.</span></div>
      <div className="ai-input">
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter" && navigate("/ask-ai",{state:{query}})} placeholder="What would you like to know about your farm?" />
        <button onClick={()=>navigate("/ask-ai",{state:{query}})}><ArrowRight size={18}/></button>
      </div>
      <div className="ai-tools"><button onClick={()=>navigate("/diagnose")}><Camera size={15}/> Diagnose</button><button onClick={()=>navigate("/ask-ai")}><Mic size={15}/> Voice</button><button onClick={()=>navigate("/ask-ai")}><MessageCircle size={15}/> Chat</button></div>
    </section>

    <div className="stats-grid">
      <Stat icon={Leaf} label="Active Crops" value={crops.length} note="+1 this month" />
      <Stat icon={PawPrint} label="Livestock" value={livestock.length} note="All tracked" />
      <Stat icon={Tractor} label="Farm Area" value="4.5 ha" note="Across 3 plots" />
      <Stat icon={Wallet} label="Net This Month" value="₦230k" note="+12% vs last month" />
    </div>

    <div className="dashboard-grid">
      <section className="card">
        <CardHead title="Your Crops" action="View all" onClick={()=>navigate("/crops")}/>
        <div className="crop-list">{crops.map(c=><div className="crop-row" key={c.id} onClick={()=>navigate("/crops")}>
          <div className="crop-emoji">{c.image}</div><div className="row-main"><strong>{c.name}</strong><span>{c.area} · {c.variety}</span></div>
          <Status status={c.status}/><ChevronRight size={17}/>
        </div>)}</div>
      </section>
      <section className="card">
        <CardHead title="Recent Activity" action="View all" onClick={()=>navigate("/journal")}/>
        <div className="timeline">{activities.map((a,i)=><div className="timeline-item" key={i}><div className={`timeline-icon ${a[3]}`}>{a[3]==="alert"?<AlertTriangle size={15}/>:a[3]==="leaf"?<Leaf size={15}/>:a[3]==="cloud"?<CloudRain size={15}/>:<Wallet size={15}/>}</div><div><strong>{a[1]}</strong><span>{a[0]} · {a[2]}</span></div></div>)}</div>
      </section>
    </div>

    <section className="insight-banner">
      <div className="insight-image"></div><div><span className="eyebrow">AI farm insight</span><h2>Rain is coming. Check your drainage.</h2><p>The forecast suggests rainfall. Consider inspecting drainage and avoid unnecessary irrigation.</p><button className="secondary" onClick={()=>navigate("/weather")}>View weather <ArrowRight size={16}/></button></div>
    </section>

    {showCrop && <Modal title="Add a crop" onClose={()=>setShowCrop(false)}><QuickForm label="Crop name" placeholder="e.g. Maize" onSave={(name)=>{addCrop(name);setShowCrop(false)}}/></Modal>}
    {showAnimal && <Modal title="Add livestock" onClose={()=>setShowAnimal(false)}><QuickForm label="Animal type" placeholder="e.g. Goat" onSave={(name)=>{addLivestock(name);setShowAnimal(false)}}/></Modal>}
    <div className="quick-dock">
      <button onClick={()=>setShowCrop(true)}><Leaf size={17}/> Add Crop</button><button onClick={()=>setShowAnimal(true)}><PawPrint size={17}/> Add Livestock</button>
    </div>
  </div>
}

function Stat({icon:Icon,label,value,note}) { return <div className="stat card"><div className="stat-icon"><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div> }
function CardHead({title,action,onClick}) { return <div className="card-head"><h3>{title}</h3>{action && <button onClick={onClick}>{action} <ArrowRight size={14}/></button>}</div> }
function Status({status}) { return <span className={`status ${status.toLowerCase()}`}>{status}</span> }

function Crops({crops, addCrop}) {
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState("All");
  const filtered = filter==="All" ? crops : crops.filter(c=>c.status===filter);
  return <div><PageTitle eyebrow="MY FARM" title="Crops" text="Track your fields, growth stages, and crop health." action="Add Crop" onAction={()=>setShow(true)}/>
    <div className="filter-row">{["All","Healthy","Attention"].map(x=><button key={x} className={filter===x?"selected":""} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    <div className="record-grid">{filtered.map(c=><div className="record-card card" key={c.id}><div className="record-visual">{c.image}</div><div className="record-body"><div className="between"><h3>{c.name}</h3><Status status={c.status}/></div><p>{c.variety}</p><div className="record-meta"><span>Area <b>{c.area}</b></span><span>Stage <b>Growing</b></span></div><button className="outline full" onClick={()=>alert(`Opening ${c.name} crop record`)}>View crop record <ChevronRight size={15}/></button></div></div>)}</div>
    {show && <Modal title="Add a crop" onClose={()=>setShow(false)}><CropForm onSave={(name,variety,area)=>{addCrop(name,variety,area);setShow(false)}}/></Modal>}
  </div>
}

function CropForm({onSave}) {
  const [name,setName]=useState(""); const [variety,setVariety]=useState(""); const [area,setArea]=useState("");
  return <form onSubmit={e=>{e.preventDefault();if(name.trim())onSave(name.trim(),variety||"General",area||"0.5 ha")}} className="form-grid">
    <label>Crop name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Rice"/></label>
    <label>Variety<input value={variety} onChange={e=>setVariety(e.target.value)} placeholder="e.g. Faro 44"/></label>
    <label>Farm area<input value={area} onChange={e=>setArea(e.target.value)} placeholder="e.g. 1.5 ha"/></label>
    <button className="primary" type="submit">Save crop</button>
  </form>
}

function Livestock({livestock,addLivestock}) {
  const [show,setShow]=useState(false);
  return <div><PageTitle eyebrow="MY FARM" title="Livestock" text="Keep animal records, health events, and feeding information in one place." action="Add Livestock" onAction={()=>setShow(true)}/>
    <div className="record-grid">{livestock.map(a=><div className="record-card card" key={a.id}><div className="animal-visual">{a.image}</div><div className="record-body"><div className="between"><h3>{a.type}</h3><Status status={a.status}/></div><p>{a.breed}</p><div className="record-meta"><span>Age <b>{a.age}</b></span><span>Sex <b>{a.sex}</b></span></div><button className="outline full" onClick={()=>alert(`Opening ${a.type} record`)}>View animal record <ChevronRight size={15}/></button></div></div>)}</div>
    {show && <Modal title="Add livestock" onClose={()=>setShow(false)}><QuickForm label="Animal type" placeholder="e.g. Goat" onSave={(name)=>{addLivestock(name);setShow(false)}}/></Modal>}
  </div>
}

function QuickForm({label,placeholder,onSave}) { const [v,setV]=useState(""); return <form onSubmit={e=>{e.preventDefault();if(v.trim())onSave(v.trim())}} className="form-grid"><label>{label}<input autoFocus required value={v} onChange={e=>setV(e.target.value)} placeholder={placeholder}/></label><button className="primary">Save</button></form> }

function AskAI() {
  const [messages,setMessages]=useState([{role:"ai",text:"Hello! I’m your AgriPlus assistant. Tell me what is happening on your farm, and I’ll help you work through it step by step."}]);
  const [input,setInput]=useState(""); const [busy,setBusy]=useState(false);
  const send=()=>{if(!input.trim())return; const q=input.trim();setMessages(m=>[...m,{role:"user",text:q}]);setInput("");setBusy(true);setTimeout(()=>{setMessages(m=>[...m,{role:"ai",text:`Thanks. Based on what you described, I would investigate the situation further rather than assume a diagnosis. What crop or animal is affected, how old is it, and when did you first notice the change?` }]);setBusy(false)},650)};
  return <div className="chat-page"><PageTitle eyebrow="AI ASSISTANT" title="Ask AgriPlus" text="A context-aware agricultural conversation, built to ask questions before making conclusions."/>
    <div className="chat-shell card">
      <div className="chat-top"><div className="ai-icon"><Bot size={22}/></div><div><strong>AgriPlus AI</strong><span>Evidence-conscious agricultural guidance</span></div><span className="online"><i/> Ready</span></div>
      <div className="messages">{messages.map((m,i)=><div key={i} className={`message ${m.role}`}><div className="message-avatar">{m.role==="ai"?<Sprout size={16}/>:<UserRound size={16}/>}</div><div><p>{m.text}</p>{m.role==="ai" && i===0 && <div className="suggestions"><button onClick={()=>setInput("Why are my maize leaves turning yellow?")}>🌽 Yellowing maize leaves</button><button onClick={()=>setInput("How should I prepare for heavy rain?")}>🌧️ Heavy rain preparation</button><button onClick={()=>setInput("My goat is not eating normally.")}>🐐 Livestock concern</button></div>}</div></div>)}{busy&&<div className="typing"><span/><span/><span/> AgriPlus is thinking…</div>}</div>
      <div className="chat-compose"><button title="Upload image" onClick={()=>alert("Image upload is ready to connect to the diagnosis API.")}><Upload size={18}/></button><input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder="Ask about your farm..." /><button className="send" onClick={send}><ArrowRight size={18}/></button></div>
    </div>
  </div>
}

function Diagnose() {
  const [type,setType]=useState("crop"); const [image,setImage]=useState(null); const [analyzing,setAnalyzing]=useState(false); const [result,setResult]=useState(null);
  const inputRef=useRef();
  const analyze=()=>{if(!image)return;setAnalyzing(true);setTimeout(()=>{setAnalyzing(false);setResult({issue:"Possible leaf-spot stress",confidence:"Moderate",observed:["Visible spotting on the affected leaf","Several areas show discoloration"],actions:["Inspect nearby plants for similar symptoms","Review recent rainfall and irrigation","Avoid unnecessary treatment until more evidence is available"]})},900)};
  return <div><PageTitle eyebrow="AI DIAGNOSIS" title="Investigate a problem" text="Image + farm context + follow-up questions. An image alone does not guarantee a diagnosis."/>
    <div className="diagnose-grid">
      <section className="card diagnosis-upload">
        <div className="segmented"><button className={type==="crop"?"selected":""} onClick={()=>setType("crop")}><Leaf size={17}/> Crop / Plant</button><button className={type==="animal"?"selected":""} onClick={()=>setType("animal")}><PawPrint size={17}/> Livestock</button></div>
        <div className="upload-box" onClick={()=>inputRef.current?.click()}>
          {image ? <><img src={image} alt="Uploaded farm subject"/><button className="remove-image" onClick={e=>{e.stopPropagation();setImage(null);setResult(null)}}><X size={16}/></button></> : <><div className="upload-icon"><Camera/></div><h3>Upload or take a photo</h3><p>Clear images of affected areas produce better context.</p><span className="outline">Choose image</span></>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)setImage(URL.createObjectURL(f))}}/>
        {image && <button className="primary full" onClick={analyze}>{analyzing?<><Activity className="spin"/> Investigating…</>:<><Zap size={17}/> Analyze with AgriPlus AI</>}</button>}
      </section>
      <section className="card result-card">
        {!result ? <div className="empty-result"><div className="empty-icon"><ShieldCheck/></div><h3>Your investigation appears here</h3><p>AgriPlus will separate observations, possible causes, confidence, recommended actions, and what information is still needed.</p></div> :
        <div><div className="result-head"><div><span className="eyebrow">ASSESSMENT</span><h2>{result.issue}</h2></div><span className="confidence">{result.confidence} confidence</span></div><ResultSection title="What we observed" items={result.observed}/><ResultSection title="Recommended next steps" items={result.actions}/><div className="safety"><ShieldCheck size={18}/><span>This is a possible issue, not a guaranteed diagnosis. Seek appropriate agricultural or veterinary professional help for serious cases.</span></div></div>}
      </section>
    </div>
  </div>
}
function ResultSection({title,items}) { return <div className="result-section"><h4>{title}</h4>{items.map(x=><div key={x}><CheckCircle2 size={16}/><span>{x}</span></div>)}</div> }

function Weather() {
  const [unit,setUnit]=useState("C");
  return <div><PageTitle eyebrow="WEATHER" title="Weather for your farm" text="Weather becomes useful when it changes what you decide to do next."/>
    <div className="weather-layout"><section className="weather-current card"><div className="location"><span>📍 Jos, Plateau State</span><small>Updated just now</small></div><div className="big-weather"><Sun size={58}/><div><strong>{unit==="C"?"22°C":"72°F"}</strong><span>Partly cloudy</span></div></div><div className="weather-metrics"><Metric icon={Droplets} label="Humidity" value="78%"/><Metric icon={CloudRain} label="Rain chance" value="45%"/><Metric icon={Wind} label="Wind" value="12 km/h"/></div><div className="unit-toggle"><button className={unit==="C"?"selected":""} onClick={()=>setUnit("C")}>°C</button><button className={unit==="F"?"selected":""} onClick={()=>setUnit("F")}>°F</button></div></section>
      <section className="card"><CardHead title="5-day forecast"/><div className="forecast-large">{["Today","Thu","Fri","Sat","Sun"].map((d,i)=><div key={d}><span>{d}</span><Sun size={23}/><strong>{22-i}°</strong><small>{14+i}°</small><em>{i===1?"60%":i===2?"35%":"20%" } rain</em></div>)}</div></section></div>
    <div className="farm-tip"><div><Zap size={20}/></div><div><strong>Agricultural consideration</strong><p>Rain is expected. Consider checking drainage around your fields and avoid unnecessary irrigation.</p></div></div>
  </div>
}
function Metric({icon:Icon,label,value}) {return <div><Icon size={18}/><span>{label}</span><strong>{value}</strong></div>}

function Journal() {
  const [entries,setEntries]=useState([{id:1,title:"Possible pest pressure on maize",category:"AI Insight",date:"Today",text:"Observed changes on several maize leaves; monitoring recommended."},{id:2,title:"Tomato plot updated",category:"Farm Activity",date:"Yesterday",text:"Added tomato crop to the farm record."}]);
  const [show,setShow]=useState(false);
  return <div><PageTitle eyebrow="FARM RECORDS" title="Farm Journal" text="Keep observations, AI assessments, activities, and interventions together." action="New Entry" onAction={()=>setShow(true)}/><div className="journal-list">{entries.map(e=><article className="journal-entry card" key={e.id}><div className="journal-date">{e.date}</div><div><span className="eyebrow">{e.category}</span><h3>{e.title}</h3><p>{e.text}</p></div><MoreHorizontal/></article>)}</div>
  {show&&<Modal title="New journal entry" onClose={()=>setShow(false)}><JournalForm onSave={(title,text)=>{setEntries([{id:Date.now(),title,text,category:"Farm Note",date:"Just now"},...entries]);setShow(false)}}/></Modal>}</div>
}
function JournalForm({onSave}) {const [t,setT]=useState("");const [d,setD]=useState("");return <form className="form-grid" onSubmit={e=>{e.preventDefault();if(t.trim())onSave(t.trim(),d||"Farm observation")}}><label>Title<input required value={t} onChange={e=>setT(e.target.value)} placeholder="What happened?"/></label><label>Notes<textarea value={d} onChange={e=>setD(e.target.value)} placeholder="Add useful details…"/></label><button className="primary">Save entry</button></form>}

function Finance() {
 const [rows,setRows]=useState([{name:"Feed",amount:15000,type:"Expense"},{name:"Fertilizer",amount:32000,type:"Expense"},{name:"Tomato sales",amount:85000,type:"Income"}]);
 const [show,setShow]=useState(false);
 const income=rows.filter(x=>x.type==="Income").reduce((a,x)=>a+x.amount,0), expense=rows.filter(x=>x.type==="Expense").reduce((a,x)=>a+x.amount,0);
 return <div><PageTitle eyebrow="FARM FINANCE" title="Finance" text="Track income and expenses with transparent totals." action="Add transaction" onAction={()=>setShow(true)}/><div className="stats-grid"><Stat icon={TrendingUp} label="Total income" value={`₦${income.toLocaleString()}`} note="Recorded income"/><Stat icon={Wallet} label="Expenses" value={`₦${expense.toLocaleString()}`} note="Recorded costs"/><Stat icon={BarChart3} label="Net result" value={`₦${(income-expense).toLocaleString()}`} note="Income minus expenses"/></div><section className="card table-card"><CardHead title="Recent transactions"/>{rows.map((r,i)=><div className="transaction" key={i}><div className="transaction-icon">{r.type==="Income"?<TrendingUp/>:<Wallet/>}</div><div><strong>{r.name}</strong><span>{r.type} · This month</span></div><b className={r.type==="Income"?"income":"expense"}>{r.type==="Income"?"+":"-"}₦{r.amount.toLocaleString()}</b></div>)}</section>{show&&<Modal title="Add transaction" onClose={()=>setShow(false)}><TransactionForm onSave={(name,amount,type)=>{setRows([{name,amount:Number(amount),type},...rows]);setShow(false)}}/></Modal>}</div>
}
function TransactionForm({onSave}) {const[n,setN]=useState("");const[a,setA]=useState("");const[t,setT]=useState("Expense");return <form className="form-grid" onSubmit={e=>{e.preventDefault();if(n.trim()&&Number(a)>0)onSave(n.trim(),a,t)}}><label>Description<input required value={n} onChange={e=>setN(e.target.value)} placeholder="e.g. Seeds"/></label><label>Amount (₦)<input required type="number" min="1" value={a} onChange={e=>setA(e.target.value)} placeholder="15000"/></label><label>Type<select value={t} onChange={e=>setT(e.target.value)}><option>Expense</option><option>Income</option></select></label><button className="primary">Save transaction</button></form>}

function Calendar() {const [events,setEvents]=useState([{title:"Check soil moisture",date:"Aug 15",type:"Crop care"},{title:"Feed livestock",date:"Tomorrow",type:"Livestock"},{title:"Farm inspection",date:"Aug 18",type:"Farm"}]);const[show,setShow]=useState(false);return <div><PageTitle eyebrow="FARM CALENDAR" title="Calendar" text="Plan planting, feeding, inspections, harvests, and custom farm activities." action="Add event" onAction={()=>setShow(true)}/><section className="card calendar-card"><div className="calendar-head"><button>‹</button><h3>August 2026</h3><button>›</button></div><div className="calendar-week">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(x=><span key={x}>{x}</span>)}</div><div className="calendar-days">{Array.from({length:31},(_,i)=><button key={i} className={i+1===18?"today":""}>{i+1}</button>)}</div></section><section className="card upcoming"><CardHead title="Upcoming events"/>{events.map((e,i)=><div className="event-row" key={i}><div className="event-date">{e.date}</div><div><strong>{e.title}</strong><span>{e.type}</span></div><CheckCircle2 size={18}/></div>)}</section>{show&&<Modal title="Add calendar event" onClose={()=>setShow(false)}><QuickForm label="Event name" placeholder="e.g. Fertilizer application" onSave={name=>{setEvents([{title:name,date:"New",type:"Custom"},...events]);setShow(false)}}/></Modal>}</div>}

function Alerts() {const [items,setItems]=useState([{id:1,title:"Rain expected",text:"Consider checking drainage before the next rainfall.",type:"Weather"},{id:2,title:"Tomato plot needs attention",text:"Review recent observations and inspect affected plants.",type:"Crop"}]);return <div><PageTitle eyebrow="SMART ALERTS" title="Alerts" text="Timely reminders based on your farm records and conditions."/><div className="alert-list">{items.length===0?<div className="empty card"><CheckCircle2/><h3>You're all caught up</h3></div>:items.map(a=><div className="alert-card card" key={a.id}><div className="alert-symbol"><Bell size={19}/></div><div><span className="eyebrow">{a.type}</span><h3>{a.title}</h3><p>{a.text}</p></div><button className="outline" onClick={()=>setItems(items.filter(x=>x.id!==a.id))}>Mark done</button></div>)}</div></div>}

function Community(){const[posts,setPosts]=useState([{name:"Amina",title:"How do you prepare maize fields for heavy rain?",text:"Sharing practical drainage ideas from my farm."},{name:"Joseph",title:"Tomato leaves showing spots",text:"I’m documenting the symptoms before deciding on an intervention."}]);const[text,setText]=useState("");return <div><PageTitle eyebrow="COMMUNITY" title="Agriculture Community" text="A place to share experiences and learn from other agricultural users."/><section className="card compose-post"><textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Share a farm question or useful experience…"/><button className="primary" onClick={()=>{if(text.trim()){setPosts([{name:"You",title:"New farm post",text:text.trim()},...posts]);setText("")}}}>Post</button></section><div className="post-list">{posts.map((p,i)=><article className="card post" key={i}><div className="post-avatar">{p.name[0]}</div><div><span>{p.name} · Farmer</span><h3>{p.title}</h3><p>{p.text}</p><div className="post-actions"><button><MessageCircle size={15}/> Reply</button><button>♡ Helpful</button></div></div></article>)}</div></div>}

function Profile(){return <div><PageTitle eyebrow="PROFILE" title="Your profile" text="Set your experience level so AgriPlus can adapt its explanations."/><section className="card profile-card"><div className="avatar big">BM</div><div><h2>AgriPlus Farmer</h2><p>Jos, Plateau State · 4.5 ha farm</p></div><button className="outline">Edit profile</button></section><section className="card settings-card"><h3>AI knowledge level</h3><div className="level-grid">{["Beginner","Intermediate","Expert"].map((x,i)=><button key={x} className={i===0?"selected":""} onClick={e=>{document.querySelectorAll(".level-grid button").forEach(b=>b.classList.remove("selected"));e.currentTarget.classList.add("selected")}}><strong>{x}</strong><span>{i===0?"Simple explanations and clear steps":i===1?"Moderate technical detail":"Technical agricultural detail"}</span></button>)}</div></section></div>}

function Modal({title,onClose,children}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal card"><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X/></button></div>{children}</div></div>}

function App(){
 const [crops,setCrops]=useState(initialCrops); const [livestock,setLivestock]=useState(initialLivestock);
 const addCrop=(name,variety="General",area="0.5 ha")=>setCrops(c=>[...c,{id:Date.now(),name,variety,area,status:"Healthy",image:"🌱"}]);
 const addLivestock=(type)=>setLivestock(l=>[...l,{id:Date.now(),type,breed:"Local",age:"New",sex:"—",status:"Healthy",image:type.toLowerCase().includes("goat")?"🐐":"🐄"}]);
 useEffect(()=>{document.title="AgriPlus — Smart Farming"},[]);
 return <Layout crops={crops} livestock={livestock} alerts={2} onAddCrop={addCrop} onAddLivestock={addLivestock}>
   <Routes>
    <Route path="/" element={<Dashboard crops={crops} livestock={livestock} addCrop={addCrop} addLivestock={addLivestock}/>}/>
    <Route path="/dashboard" element={<Dashboard crops={crops} livestock={livestock} addCrop={addCrop} addLivestock={addLivestock}/>}/>
    <Route path="/crops" element={<Crops crops={crops} addCrop={addCrop}/>}/>
    <Route path="/livestock" element={<Livestock livestock={livestock} addLivestock={addLivestock}/>}/>
    <Route path="/ask-ai" element={<AskAI/>}/><Route path="/diagnose" element={<Diagnose/>}/><Route path="/weather" element={<Weather/>}/>
    <Route path="/journal" element={<Journal/>}/><Route path="/finance" element={<Finance/>}/><Route path="/calendar" element={<Calendar/>}/>
    <Route path="/alerts" element={<Alerts/>}/><Route path="/community" element={<Community/>}/><Route path="/profile" element={<Profile/>}/>
   </Routes>
 </Layout>
}
export default App;