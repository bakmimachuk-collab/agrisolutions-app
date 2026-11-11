import React, { useCallback, useEffect, useRef, useState } from "react";
import { Routes, Route, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, BarChart3, Bell, Bot, CalendarDays,
  Camera, CheckCircle2, ChevronLeft, ChevronRight, Cloud, CloudRain, Droplets, FileText, Globe2,
  Home, Languages, Leaf, Menu, MessageCircle, Mic, MoreHorizontal, PawPrint, Plus,
  LocateFixed, MapPin, Search, Settings, ShieldCheck, Sprout, Sun, Tractor, TrendingUp, Upload,
  Trash2, UserRound, Users, Wallet, Wheat, Wind, X, Zap
} from "lucide-react";
import { languages, Localize, useLanguage } from "./i18n.jsx";
import {
  calendarEventsStorageKey,
  createNotification,
  defaultNotificationPreferences,
  formatNotificationText,
  notificationPreferencesStorageKey,
  notificationStorageKey,
  readStoredValue,
  writeStoredValue
} from "./notifications.js";
import {
  describeWeatherCode,
  fetchWeather,
  plateauLocalGovernments,
  searchWeatherLocations,
  weatherLocationLabel,
  weatherLocationStorageKey
} from "./weather.js";
import { useAuth } from "./lib/AuthContext.jsx";
import AuthScreen from "./lib/AuthScreen.jsx";
import { CalendarPage } from "./lib/CalendarPage.jsx";
import { CommunityPage } from "./lib/CommunityPage.jsx";
import { AdminDashboard, AdminLogin } from "./lib/AdminDashboard.jsx";

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

const dashboardSlides = [
  {
    title: "Maize in the field",
    text: "Manage crops, track growth, and plan farm work.",
    image: "/dashboard-maize-field.jpg",
    credit: "Onwuka Glory · CC BY-SA 4.0",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Bud_maize_garden.jpg"
  },
  {
    title: "Crop health",
    text: "Spot pest damage early and record what you see.",
    image: "/dashboard-crop-health.jpg",
    credit: "Wikimedia Commons · CC0",
    creditUrl: "https://commons.wikimedia.org/wiki/File:Maize_Pest_Festation.jpg"
  },
  {
    title: "Goat care in Kaduna",
    text: "Keep livestock health, feeding, and farm records together.",
    image: "/dashboard-goats.jpg",
    credit: "JoabJacob · CC BY-SA 4.0",
    creditUrl: "https://commons.wikimedia.org/wiki/File:A_small_Goat_farm_at_Monday_Market,_Kaduna_South_Local_Government_in_Kaduna_State_01.jpg"
  }
];

function getFarmerFirstName(user,profileName="") {
  const name=profileName||user?.user_metadata?.full_name||user?.user_metadata?.first_name||user?.user_metadata?.name||user?.email?.split("@")[0]||"Farmer";
  const firstName=name.trim().split(/[\s._-]+/)[0]||"Farmer";
  return firstName.charAt(0).toLocaleUpperCase()+firstName.slice(1);
}

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function dateTimeInTimezone(date,time,timezone) {
  const [year,month,day]=date.split("-").map(Number);
  const [hours,minutes]=String(time||"09:00").split(":").map(Number);
  const target=Date.UTC(year,month-1,day,hours,minutes);
  let timestamp=target;
  for(let attempt=0;attempt<3;attempt++){
    const parts=new Intl.DateTimeFormat("en-CA",{
      timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",hourCycle:"h23"
    }).formatToParts(new Date(timestamp));
    const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    const represented=Date.UTC(Number(values.year),Number(values.month)-1,Number(values.day),Number(values.hour),Number(values.minute));
    timestamp+=target-represented;
  }
  return new Date(timestamp);
}

function cropFromRecord(record) {
  const metadata=record.metadata||{};
  return {
    ...metadata,id:record.id,name:record.name,variety:record.variety||"General",
    area:record.area==null?"—":`${record.area} ha`,
    status:record.status==="attention"?"Attention":"Healthy",
    image:metadata.image||"🌱",metadata
  };
}

function livestockFromRecord(record) {
  const metadata=record.metadata||{};
  return {
    ...metadata,id:record.id,type:record.animal_type,breed:record.breed||"Local",
    age:metadata.age||"—",sex:metadata.sex||"—",
    status:record.status==="watch"?"Watch":"Healthy",
    image:metadata.image||(record.animal_type.toLowerCase().includes("goat")?"🐐":"🐄"),metadata
  };
}

function formatForecastTime(value,timezone,utcOffsetSeconds,locale,options) {
  const timestamp=Date.parse(`${value}:00Z`)-utcOffsetSeconds*1000;
  return new Intl.DateTimeFormat(locale,{...options,timeZone:timezone}).format(new Date(timestamp));
}

function Layout({ children, crops, livestock, alerts, onAddCrop, onAddLivestock }) {
  const {configured,user,signOut}=useAuth();
  const [open, setOpen] = useState(false);
  const [authError,setAuthError]=useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const {language,setLanguage}=useLanguage();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);
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
    ["/community", "Community", Users],
    ["/settings", "Settings", Settings]
  ];

  return (
    <Localize><div className="app-shell">
      {open && <button className="sidebar-backdrop" aria-label="Close navigation menu" onClick={() => setOpen(false)} />}
      <aside id="primary-navigation" className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="brand" onClick={() => { setOpen(false); navigate("/dashboard"); }}>
          <div className="brand-mark"><Sprout size={24}/></div>
          <span className="brand-name">MBs Agro<br/><span>Solution</span></span>
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
          <NavLink to="/profile" onClick={() => setOpen(false)} className="profile-mini">
            <div className="avatar">BM</div>
            <div><strong>Farmer</strong><small>MBs Agro Solution user</small></div>
            <ChevronRight size={17}/>
          </NavLink>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <button className="mobile-menu" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen(!open)}><Menu/></button>
          <div className="search"><Search size={18}/><input placeholder="Search crops, livestock, records..." /></div>
          <div className="top-actions">
            <label className="language-control" title="Application Language"><Languages size={17}/><select aria-label="Application Language" value={language} onChange={event=>setLanguage(event.target.value)}><option value="en">EN</option><option value="ha">HA</option><option value="pcm">PCM</option></select></label>
            <button className="icon-button" aria-label="Open alerts" onClick={() => navigate("/alerts")}><Bell size={19}/>{alerts>0&&<span className="notification-dot">{alerts}</span>}</button>
            <button className="avatar top-avatar" onClick={() => navigate("/profile")}>BM</button>
          </div>
        </header>
        <div className={`page ${location.pathname === "/ask-ai" ? "page-chat" : ""}`}>
          {!configured&&<div className="backend-notice" role="status">Supabase is not configured. This session uses this browser only; accounts, cloud backups, and cross-device sync are unavailable.</div>}
          {configured&&user&&<div className="account-bar"><span>Signed in as {user.email||user.phone}. Calendar, community, crop/livestock records, and notifications use Supabase; AI conversations and diagnosis history are not yet cloud-backed.</span><button className="auth-link" onClick={async()=>{const result=await signOut();if(result?.error)setAuthError(result.error.message);}}>Sign out</button>{authError&&<span role="alert">{authError}</span>}</div>}
          {children}
        </div>
        <div className="mobile-nav">
          {links.slice(0,5).map(([to,label,Icon]) => <NavLink key={to} to={to} className={({isActive}) => isActive ? "active": ""}><Icon size={18}/><span>{label === "AI Assistant" ? "AI" : label}</span></NavLink>)}
        </div>
      </main>

      <div className="global-float">
        <button title="Ask MBs Agro Solution AI" onClick={() => navigate("/ask-ai")}><Bot size={22}/></button>
      </div>

      {/* These callbacks are kept in the layout contract so page-level forms remain reusable. */}
      <span hidden>{String(crops.length + livestock.length + onAddCrop + onAddLivestock)}</span>
    </div></Localize>
  );
}

function PageTitle({ eyebrow, title, text, action, onAction }) {
  return <div className="page-title">
    <div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{text && <p>{text}</p>}</div>
    {action && <button className="primary" onClick={onAction}><Plus size={17}/>{action}</button>}
  </div>;
}

function Dashboard({ crops, livestock, notifications, addCrop, addLivestock, farmerName }) {
  const navigate = useNavigate();
  const {t}=useLanguage();
  const [query, setQuery] = useState("");
  const [showCrop, setShowCrop] = useState(false);
  const [showAnimal, setShowAnimal] = useState(false);
  const [slideIndex,setSlideIndex]=useState(0);
  const [carouselPaused,setCarouselPaused]=useState(false);
  useEffect(()=>{
    if(carouselPaused)return undefined;
    const timer=window.setInterval(()=>setSlideIndex(current=>(current+1)%dashboardSlides.length),6000);
    return()=>window.clearInterval(timer);
  },[carouselPaused]);
  const changeSlide=offset=>setSlideIndex(current=>(current+offset+dashboardSlides.length)%dashboardSlides.length);
  const currentSlide=dashboardSlides[slideIndex];

  return <Localize><div>
    <section className="hero" onMouseEnter={()=>setCarouselPaused(true)} onMouseLeave={()=>setCarouselPaused(false)} onFocusCapture={()=>setCarouselPaused(true)} onBlurCapture={event=>{if(!event.currentTarget.contains(event.relatedTarget))setCarouselPaused(false);}}>
      {dashboardSlides.map((slide,index)=><div key={slide.title} className={`hero-photo ${index===slideIndex?"active":""}`} style={{backgroundImage:`url("${slide.image}")`}} aria-hidden="true"/>)}
      <div className="hero-overlay">
        <div className="hero-copy">
          <span className="hero-kicker"><Sun size={15}/> {t(currentSlide.title)}</span>
          <h1>{t("Good morning, {name}.").replace("{name}",farmerName)} <span>🌱</span></h1>
          <p>{t(currentSlide.text)}</p>
          <div className="hero-pills"><span>📍 Nigeria</span><span>{t("Farm records and practical advice")}</span></div>
          <div className="hero-carousel-controls" aria-label={t("Dashboard image carousel")}>
            <button type="button" className="hero-carousel-arrow" aria-label={t("Previous slide")} onClick={()=>changeSlide(-1)}><ChevronLeft size={17}/></button>
            {dashboardSlides.map((slide,index)=><button key={slide.title} type="button" className={`hero-carousel-dot ${index===slideIndex?"active":""}`} aria-label={`${t("Show slide")} ${index+1}: ${t(slide.title)}`} aria-pressed={index===slideIndex} onClick={()=>setSlideIndex(index)}/>)}
            <button type="button" className="hero-carousel-arrow" aria-label={t("Next slide")} onClick={()=>changeSlide(1)}><ChevronRight size={17}/></button>
          </div>
        </div>
        <div className="weather-card">
          <div className="weather-main"><CloudRain size={38}/><div><strong>Check your local weather</strong><span>Get the current conditions and forecast for your area.</span></div></div>
          <button className="secondary" onClick={()=>navigate("/weather")}>View weather <ArrowRight size={16}/></button>
        </div>
        <a className="hero-photo-credit" href={currentSlide.creditUrl} target="_blank" rel="noreferrer">{currentSlide.credit}</a>
      </div>
    </section>

    <section className="ai-prompt">
      <div className="ai-icon"><Bot size={24}/></div>
      <div className="ai-prompt-text"><strong>Ask MBs Agro Solution AI</strong><span>Ask about crops, livestock, pests, weather, or farm planning.</span></div>
      <div className="ai-input">
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter" && navigate("/ask-ai",{state:{query}})} placeholder="What would you like to know about your farm?" />
        <button onClick={()=>navigate("/ask-ai",{state:{query}})}><ArrowRight size={18}/></button>
      </div>
      <div className="ai-tools"><button onClick={()=>navigate("/diagnose")}><Camera size={15}/> Diagnose</button><button onClick={()=>navigate("/settings")}><Settings size={15}/> Settings</button><button onClick={()=>navigate("/ask-ai")}><MessageCircle size={15}/> Chat</button></div>
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
        <CardHead title="Recent Activity" action="View all" onClick={()=>navigate("/alerts")}/>
        {notifications.length===0?<p className="timeline-empty">{t("No notifications yet")}</p>:<div className="timeline">{notifications.slice(0,4).map(notification=><div className="timeline-item" key={notification.id}><div className={`timeline-icon ${notification.priority==="critical"?"alert":notification.category==="livestock"?"leaf":"cloud"}`}><Bell size={15}/></div><div><strong>{t(notification.titleKey)}</strong><span>{formatNotificationText(notification,t)}</span></div></div>)}</div>}
      </section>
    </div>

    <section className="insight-banner">
      <div className="insight-image"></div><div><span className="eyebrow">Local forecast</span><h2>Check weather near your farm.</h2><p>Use your device location, search another Nigerian area, or choose a Plateau State LGA.</p><button className="secondary" onClick={()=>navigate("/weather")}>View weather <ArrowRight size={16}/></button></div>
    </section>

    {showCrop && <Modal title="Add a crop" onClose={()=>setShowCrop(false)}><QuickForm label="Crop name" placeholder="e.g. Maize" onSave={(name)=>{addCrop(name);setShowCrop(false)}}/></Modal>}
    {showAnimal && <Modal title="Add livestock" onClose={()=>setShowAnimal(false)}><QuickForm label="Animal type" placeholder="e.g. Goat" onSave={(name)=>{addLivestock(name);setShowAnimal(false)}}/></Modal>}
    <div className="quick-dock">
      <button onClick={()=>setShowCrop(true)}><Leaf size={17}/> Add Crop</button><button onClick={()=>setShowAnimal(true)}><PawPrint size={17}/> Add Livestock</button>
    </div>
  </div></Localize>
}

function Stat({icon:Icon,label,value,note}) { return <div className="stat card"><div className="stat-icon"><Icon size={20}/></div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></div> }
function CardHead({title,action,onClick}) { return <div className="card-head"><h3>{title}</h3>{action && <button onClick={onClick}>{action} <ArrowRight size={14}/></button>}</div> }
function Status({status}) { const {t}=useLanguage(); return <span className={`status ${status.toLowerCase()}`}>{t(status)}</span> }

function Crops({crops, addCrop, recordIssue}) {
  const {t}=useLanguage();
  const [show, setShow] = useState(false);
  const [filter, setFilter] = useState("All");
  const [issueCrop, setIssueCrop] = useState(null);
  const filtered = filter==="All" ? crops : crops.filter(c=>c.status===filter);
  return <Localize><div><PageTitle eyebrow="MY FARM" title="Crops" text="Track your fields, growth stages, and crop health." action="Add Crop" onAction={()=>setShow(true)}/>
    <div className="filter-row">{["All","Healthy","Attention"].map(x=><button key={x} className={filter===x?"selected":""} onClick={()=>setFilter(x)}>{x}</button>)}</div>
    <div className="record-grid">{filtered.map(c=><div className="record-card card" key={c.id}><div className="record-visual">{c.image}</div><div className="record-body"><div className="between"><h3>{c.name}</h3><Status status={c.status}/></div><p>{c.variety}</p><div className="record-meta"><span>Area <b>{c.area}</b></span><span>Stage <b>{c.growthStage||t("Growing")}</b></span></div><button className="outline full" onClick={()=>alert(`${t("Opening")} ${c.name} ${t("crop record")}`)}>{t("View crop record")} <ChevronRight size={15}/></button><button className="secondary full report-issue" onClick={()=>setIssueCrop(c)}>{t("Report issue")}</button></div></div>)}</div>
    {show && <Modal title="Add a crop" onClose={()=>setShow(false)}><CropForm onSave={(name,variety,area,schedule)=>{addCrop(name,variety,area,schedule);setShow(false)}}/></Modal>}
    {issueCrop && <Modal title="Report a crop concern" onClose={()=>setIssueCrop(null)}><IssueForm onSave={(detail,priority)=>{recordIssue(issueCrop,detail,priority);setIssueCrop(null)}}/></Modal>}
  </div></Localize>
}

function CropForm({onSave}) {
  const [name,setName]=useState(""); const [variety,setVariety]=useState(""); const [area,setArea]=useState("");
  const [wateringDate,setWateringDate]=useState(""); const [harvestDate,setHarvestDate]=useState("");
  const [growthStage,setGrowthStage]=useState(""); const [milestoneDate,setMilestoneDate]=useState("");
  return <Localize><form onSubmit={e=>{e.preventDefault();if(name.trim())onSave(name.trim(),variety||"General",area||"0.5 ha",{wateringDate,harvestDate,growthStage,milestoneDate})}} className="form-grid">
    <label>Crop name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Rice"/></label>
    <label>Variety<input value={variety} onChange={e=>setVariety(e.target.value)} placeholder="e.g. Faro 44"/></label>
    <label>Farm area<input value={area} onChange={e=>setArea(e.target.value)} placeholder="e.g. 1.5 ha"/></label>
    <label>Next watering date (optional)<input type="date" value={wateringDate} onChange={e=>setWateringDate(e.target.value)}/></label>
    <label>Expected harvest date (optional)<input type="date" value={harvestDate} onChange={e=>setHarvestDate(e.target.value)}/></label>
    <label>Growth milestone<input value={growthStage} onChange={e=>setGrowthStage(e.target.value)} placeholder="e.g. Flowering"/></label>
    <label>Milestone date (optional)<input type="date" value={milestoneDate} onChange={e=>setMilestoneDate(e.target.value)}/></label>
    <button className="primary" type="submit">Save crop</button>
  </form></Localize>
}

function IssueForm({onSave}) {
  const [detail,setDetail]=useState("");
  const [priority,setPriority]=useState("warning");
  return <Localize><form className="form-grid" onSubmit={event=>{event.preventDefault();if(detail.trim())onSave(detail.trim(),priority)}}>
    <label>Describe what you observed<textarea required value={detail} onChange={event=>setDetail(event.target.value)} placeholder="Details of the concern"/></label>
    <label>Urgency<select value={priority} onChange={event=>setPriority(event.target.value)}><option value="warning">Warning</option><option value="critical">Critical</option></select></label>
    <button className="primary">Record concern</button>
  </form></Localize>
}

function Livestock({livestock,addLivestock,recordIssue}) {
  const {t}=useLanguage();
  const [show,setShow]=useState(false);
  const [issueAnimal,setIssueAnimal]=useState(null);
  return <Localize><div><PageTitle eyebrow="MY FARM" title="Livestock" text="Keep animal records, health events, and feeding information in one place." action="Add Livestock" onAction={()=>setShow(true)}/>
    <div className="record-grid">{livestock.map(a=><div className="record-card card" key={a.id}><div className="animal-visual">{a.image}</div><div className="record-body"><div className="between"><h3>{a.type}</h3><Status status={a.status}/></div><p>{a.breed}</p><div className="record-meta"><span>Age <b>{a.age}</b></span><span>Sex <b>{a.sex}</b></span></div><button className="outline full" onClick={()=>alert(`${t("Opening")} ${a.type} ${t("animal record")}`)}>{t("View animal record")} <ChevronRight size={15}/></button><button className="secondary full report-issue" onClick={()=>setIssueAnimal(a)}>{t("Report issue")}</button></div></div>)}</div>
    {show && <Modal title="Add livestock" onClose={()=>setShow(false)}><LivestockForm onSave={(name,schedule)=>{addLivestock(name,schedule);setShow(false)}}/></Modal>}
    {issueAnimal && <Modal title="Report an animal health concern" onClose={()=>setIssueAnimal(null)}><IssueForm onSave={(detail,priority)=>{recordIssue(issueAnimal,detail,priority);setIssueAnimal(null)}}/></Modal>}
  </div></Localize>
}

function QuickForm({label,placeholder,onSave}) { const [v,setV]=useState(""); return <Localize><form onSubmit={e=>{e.preventDefault();if(v.trim())onSave(v.trim())}} className="form-grid"><label>{label}<input autoFocus required value={v} onChange={e=>setV(e.target.value)} placeholder={placeholder}/></label><button className="primary">Save</button></form></Localize> }

function LivestockForm({onSave}) {
  const [name,setName]=useState("");
  const [vaccinationDate,setVaccinationDate]=useState("");
  const [checkupDate,setCheckupDate]=useState("");
  const [feedingDate,setFeedingDate]=useState("");
  return <Localize><form className="form-grid" onSubmit={event=>{event.preventDefault();if(name.trim())onSave(name.trim(),{vaccinationDate,checkupDate,feedingDate})}}>
    <label>Animal type<input autoFocus required value={name} onChange={event=>setName(event.target.value)} placeholder="e.g. Goat"/></label>
    <label>Vaccination date (optional)<input type="date" value={vaccinationDate} onChange={event=>setVaccinationDate(event.target.value)}/></label>
    <label>Veterinary checkup date (optional)<input type="date" value={checkupDate} onChange={event=>setCheckupDate(event.target.value)}/></label>
    <label>Feeding reminder date (optional)<input type="date" value={feedingDate} onChange={event=>setFeedingDate(event.target.value)}/></label>
    <button className="primary">Save</button>
  </form></Localize>
}

function readAIConversations(key) {
  const saved=readStoredValue(key,[]);
  if(!Array.isArray(saved))return [];
  return saved.filter(chat=>typeof chat?.id==="string"&&Array.isArray(chat.messages)&&chat.messages.every(message=>typeof message?.text==="string"&&["ai","user"].includes(message.role)))
    .sort((first,second)=>(second.updatedAt||0)-(first.updatedAt||0));
}

function AskAI({onSaveRecommendation}) {
  const {language,aiLanguage,t}=useLanguage();
  const {user}=useAuth();
  const navigate=useNavigate();
  const storageKey=`agriplus-ai-history:${user?.id||"local"}`;
  const [initialState]=useState(()=>{
    const conversations=readAIConversations(storageKey);
    const current=conversations[0];
    return {conversations,activeId:current?.id||null,messages:current?.messages||[{role:"ai",text:"Hello! I’m your MBs Agro Solution assistant. Tell me what is happening on your farm, and I’ll help you work through it step by step.",isWelcome:true}]};
  });
  const [conversations,setConversations]=useState(initialState.conversations);
  const [activeConversationId,setActiveConversationId]=useState(initialState.activeId);
  const [messages,setMessages]=useState(initialState.messages);
  const [input,setInput]=useState(""); const [busy,setBusy]=useState(false);
  const messagesEndRef=useRef(null);
  const composerRef=useRef(null);
  useEffect(()=>{
    writeStoredValue(storageKey,conversations);
  },[storageKey,conversations]);
  useEffect(()=>{
    messagesEndRef.current?.scrollIntoView({behavior:"smooth",block:"end"});
  },[messages,busy]);
  const storeConversation=(id,nextMessages)=>{
    const firstUserMessage=nextMessages.find(message=>message.role==="user");
    const title=(firstUserMessage?.text||t("New chat")).trim();
    const conversation={id,title:title.length>48?`${title.slice(0,47)}…`:title,messages:nextMessages,updatedAt:Date.now()};
    setConversations(current=>[conversation,...current.filter(item=>item.id!==id)].slice(0,30));
  };
  const startNewChat=()=>{
    setMessages([{role:"ai",text:t("Hello! I’m your MBs Agro Solution assistant. Tell me what is happening on your farm, and I’ll help you work through it step by step."),isWelcome:true}]);
    setActiveConversationId(null);
    setInput("");
  };
  const openConversation=conversation=>{
    if(busy)return;
    setActiveConversationId(conversation.id);
    setMessages(conversation.messages);
    setInput("");
  };
  const deleteConversation=(event,id)=>{
    event.stopPropagation();
    if(busy)return;
    setConversations(current=>current.filter(conversation=>conversation.id!==id));
    if(activeConversationId===id)startNewChat();
  };
  const useSuggestion=value=>{
    setInput(value);
    composerRef.current?.focus();
  };
  const send=async()=>{
    const q=input.trim();
    if(!q||busy)return;
    const userMessage={role:"user",text:q};
    const conversation=[...messages,userMessage].slice(-20);
    const conversationId=activeConversationId||globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random()}`;
    setActiveConversationId(conversationId);
    storeConversation(conversationId,conversation);
    const apiMessages=[...messages.filter(message=>!message.isWelcome),userMessage].slice(-20);
    if(apiMessages[0]?.role==="ai")apiMessages.shift();
    setMessages(conversation);
    setInput("");
    setBusy(true);
    try {
      const response=await fetch("/api/chat",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          language:aiLanguage==="app"?language:aiLanguage,
          messages:apiMessages.map(({role,text})=>({role:role==="ai"?"assistant":role,text}))
        })
      });
      const body=await response.text();
      let result;
      if(body){
        try {
          result=JSON.parse(body);
        } catch {
          throw new Error(`${t("The API returned an invalid response")} (HTTP ${response.status}). ${t("Check that the local API server is running.")}`);
        }
      }
      if(!response.ok)throw new Error(result?.error||`${t("The AI API returned HTTP ")}${response.status}.`);
      if(typeof result?.text!=="string"||!result.text.trim())throw new Error(t("The AI API returned an empty reply. Check the server configuration and logs."));
      const reply={id:`${Date.now()}`,role:"ai",text:result.text,fromApi:true};
      const updatedConversation=[...conversation,reply].slice(-20);
      setMessages(updatedConversation);
      storeConversation(conversationId,updatedConversation);
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      const reply={role:"ai",text:`${t("Sorry, I couldn’t get a reply: ")}${t(message)}`};
      const updatedConversation=[...conversation,reply].slice(-20);
      setMessages(updatedConversation);
      storeConversation(conversationId,updatedConversation);
    } finally {
      setBusy(false);
    }
  };
  return <Localize><div className="chat-page"><PageTitle eyebrow="AI ASSISTANT" title="Ask MBs Agro Solution" text="Practical farm guidance, one question at a time."/>
      <div className="chat-workspace">
        <aside className="chat-history" aria-label={t("Chat history")}>
          <div className="chat-history-heading"><strong>{t("Chat history")}</strong><span>{conversations.length}</span></div>
          {conversations.length===0?<p className="chat-history-empty">{t("No saved chats yet.")}</p>:<div className="chat-history-list">{conversations.map(conversation=><div className={`chat-history-row ${activeConversationId===conversation.id?"active":""}`} key={conversation.id}>
            <button type="button" className="chat-history-select" onClick={()=>openConversation(conversation)} disabled={busy} aria-current={activeConversationId===conversation.id?"page":undefined}><span>{conversation.title}</span><small>{new Intl.DateTimeFormat("en-NG",{month:"short",day:"numeric"}).format(new Date(conversation.updatedAt))}</small></button>
            <button type="button" className="chat-history-delete" onClick={event=>deleteConversation(event,conversation.id)} disabled={busy} title={t("Delete chat")} aria-label={`${t("Delete chat")}: ${conversation.title}`}><Trash2 size={15}/></button>
          </div>)}</div>}
          <p className="chat-history-note">{t("Chats are saved on this browser only.")}</p>
        </aside>
    <div className="chat-shell card">
      <div className="chat-top"><div className="ai-icon"><Bot size={21}/></div><div className="chat-identity"><strong>MBs Agro Solution</strong><span>Farm assistant · grounded, practical guidance</span></div><div className="chat-actions"><span className="online"><i/> Ready</span><button type="button" className="chat-reset" title={t("New chat")} aria-label={t("New chat")} onClick={startNewChat} disabled={busy}><Plus size={18}/></button></div></div>
      <div className="messages" role="log" aria-live="polite" aria-label="Conversation">
        <div className="message-list">
          {messages.map((m,i)=><div key={i} className={`message ${m.role}`}><div className="message-avatar">{m.role==="ai"?<Sprout size={16}/>:<UserRound size={16}/>}</div><div className="message-content"><p>{m.text}</p>{m.fromApi&&<button className="alert-save" onClick={()=>onSaveRecommendation({id:m.id,text:m.text})}>{t("Save as alert")}</button>}{m.role==="ai" && i===0 && <div className="suggestions"><button onClick={()=>useSuggestion("Why are my maize leaves turning yellow?")}>🌽 Yellowing maize leaves</button><button onClick={()=>useSuggestion("How should I prepare for heavy rain?")}>🌧️ Heavy rain preparation</button><button onClick={()=>useSuggestion("My goat is not eating normally.")}>🐐 Livestock concern</button></div>}</div></div>)}
          {busy&&<div className="typing"><span/><span/><span/> MBs Agro Solution is thinking…</div>}
          <div ref={messagesEndRef}/>
        </div>
      </div>
      <form className="chat-compose" onSubmit={event=>{event.preventDefault();send()}}>
        <button type="button" title="Open image diagnosis" aria-label="Open image diagnosis" onClick={()=>navigate("/diagnose")}><Camera size={18}/></button>
        <input ref={composerRef} aria-label="Ask about your farm" value={input} onChange={e=>setInput(e.target.value)} placeholder="Message MBs Agro Solution..." />
        <button className="send" type="submit" aria-label="Send message" disabled={busy||!input.trim()}><ArrowRight size={18}/></button>
      </form>
      </div>
    </div>
  </div></Localize>
}

function Diagnose() {
  const [type,setType]=useState("crop"); const [image,setImage]=useState(null); const [analyzing,setAnalyzing]=useState(false); const [result,setResult]=useState(null);
  const inputRef=useRef();
  const analyze=()=>{if(!image)return;setAnalyzing(true);setTimeout(()=>{setAnalyzing(false);setResult({issue:"Possible leaf-spot stress",confidence:"Moderate",observed:["Visible spotting on the affected leaf","Several areas show discoloration"],actions:["Inspect nearby plants for similar symptoms","Review recent rainfall and irrigation","Avoid unnecessary treatment until more evidence is available"]})},900)};
  return <Localize><div><PageTitle eyebrow="AI DIAGNOSIS" title="Investigate a problem" text="Image + farm context + follow-up questions. An image alone does not guarantee a diagnosis."/>
    <div className="diagnose-grid">
      <section className="card diagnosis-upload">
        <div className="segmented"><button className={type==="crop"?"selected":""} onClick={()=>setType("crop")}><Leaf size={17}/> Crop / Plant</button><button className={type==="animal"?"selected":""} onClick={()=>setType("animal")}><PawPrint size={17}/> Livestock</button></div>
        <div className="upload-box" onClick={()=>inputRef.current?.click()}>
          {image ? <><img src={image} alt="Uploaded farm subject"/><button className="remove-image" onClick={e=>{e.stopPropagation();setImage(null);setResult(null)}}><X size={16}/></button></> : <><div className="upload-icon"><Camera/></div><h3>Upload or take a photo</h3><p>Clear images of affected areas produce better context.</p><span className="outline">Choose image</span></>}
        </div>
        <input ref={inputRef} type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)setImage(URL.createObjectURL(f))}}/>
        {image && <button className="primary full" onClick={analyze}>{analyzing?<><Activity className="spin"/> Investigating…</>:<><Zap size={17}/> Analyze with MBs Agro Solution AI</>}</button>}
      </section>
      <section className="card result-card">
        {!result ? <div className="empty-result"><div className="empty-icon"><ShieldCheck/></div><h3>Your investigation appears here</h3><p>MBs Agro Solution will separate observations, possible causes, confidence, recommended actions, and what information is still needed.</p></div> :
        <div><div className="result-head"><div><span className="eyebrow">ASSESSMENT</span><h2>{result.issue}</h2></div><span className="confidence">{result.confidence} confidence</span></div><ResultSection title="What we observed" items={result.observed}/><ResultSection title="Recommended next steps" items={result.actions}/><div className="safety"><ShieldCheck size={18}/><span>This is a possible issue, not a guaranteed diagnosis. Seek appropriate agricultural or veterinary professional help for serious cases.</span></div></div>}
      </section>
    </div>
  </div></Localize>
}
function ResultSection({title,items}) { return <Localize><div className="result-section"><h4>{title}</h4>{items.map(x=><div key={x}><CheckCircle2 size={16}/><span>{x}</span></div>)}</div></Localize> }

function Weather() {
  const {language,t}=useLanguage();
  const [location,setLocation]=useState(()=>{
    const saved=readStoredValue(weatherLocationStorageKey,null);
    return saved&&Number.isFinite(saved.latitude)&&Number.isFinite(saved.longitude)?saved:null;
  });
  const [weather,setWeather]=useState(null);
  const [weatherError,setWeatherError]=useState("");
  const [locationError,setLocationError]=useState("");
  const [loading,setLoading]=useState(false);
  const [refreshKey,setRefreshKey]=useState(0);
  const [locating,setLocating]=useState(false);
  const [query,setQuery]=useState("");
  const [searchResults,setSearchResults]=useState([]);
  const [searchError,setSearchError]=useState("");
  const [searching,setSearching]=useState(false);
  const [unit,setUnit]=useState("C");

  const saveLocation=nextLocation=>{
    setLocation(nextLocation);
    writeStoredValue(weatherLocationStorageKey,nextLocation);
    setLocationError("");
    setSearchResults([]);
    setSearchError("");
  };

  const requestDeviceLocation=()=>{
    if(!navigator.geolocation){
      setLocationError("Device location is not available in this browser.");
      return;
    }
    setLocating(true);
    setLocationError("");
    navigator.geolocation.getCurrentPosition(position=>{
      const {latitude,longitude,accuracy}=position.coords;
      saveLocation({
        id:"device-location",
        name:"My device location",
        latitude,
        longitude,
        accuracy,
        source:"device"
      });
      setLocating(false);
    },error=>{
      setLocating(false);
      setLocationError(error.code===1
        ?"Location permission was denied. Allow location access in your browser or choose a Plateau LGA or search an area."
        :error.code===2
          ?"Your device location could not be determined. Try again or choose a Plateau LGA or search an area."
          :"The location request timed out. Try again or choose a Plateau LGA or search an area.");
    },{enableHighAccuracy:true,timeout:15000,maximumAge:300000});
  };

  useEffect(()=>{
    if(!location)requestDeviceLocation();
  },[]);

  useEffect(()=>{
    if(!location)return undefined;
    const controller=new AbortController();
    setWeather(null);
    setWeatherError("");
    setLoading(true);
    fetchWeather(location.latitude,location.longitude,controller.signal)
      .then(setWeather)
      .catch(error=>{
        if(error.name!=="AbortError"){
          console.error("Could not load the weather forecast.",error);
          setWeatherError("Weather data could not be loaded. Check your internet connection and try again.");
        }
      })
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[location,refreshKey]);

  const searchLocations=async event=>{
    event.preventDefault();
    if(query.trim().length<2){
      setSearchError("Enter at least two characters to search for a location.");
      setSearchResults([]);
      return;
    }
    setSearching(true);
    setSearchError("");
    setSearchResults([]);
    try{
      const results=await searchWeatherLocations(query.trim());
      setSearchResults(results);
      if(results.length===0)setSearchError("No locations found in Nigeria. Try a town or Local Government Area name.");
    }catch(error){
      console.error("Could not search for weather locations.",error);
      setSearchError("Location search failed. Check your internet connection and try again.");
    }finally{
      setSearching(false);
    }
  };

  const locale=language==="ha"?"ha-NG":"en-NG";
  const selectedLabel=location?.source==="device"
    ?`${t("My device location")} (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`
    :weatherLocationLabel(location??{});
  const temperature=value=>unit==="C"?`${Math.round(value)}°C`:`${Math.round(value*9/5+32)}°F`;
  const selectedLga=location?.source==="plateau";
  const current=weather?.current;
  const daily=weather?.daily;
  const hourly=weather?.hourly;
  const hourlyStart=hourly&&current?Math.max(0,hourly.time.findIndex(time=>time>=current.time)):0;
  const hourlyForecast=hourly?hourly.time.slice(hourlyStart,hourlyStart+12).map((time,index)=>{
    const sourceIndex=hourlyStart+index;
    return {time,temperature:hourly.temperature_2m[sourceIndex],probability:hourly.precipitation_probability[sourceIndex],code:hourly.weather_code[sourceIndex],isDay:hourly.is_day?.[sourceIndex]??true};
  }):[];

  return <Localize><div className="weather-page">
    <PageTitle eyebrow="WEATHER" title="Weather for your farm" text="Get a local forecast from your device location, or check another Nigerian town or Plateau LGA."/>
    <section className="card weather-location-panel">
      <div className="weather-location-header"><div><MapPin size={19}/><strong>Choose a location</strong></div><button className="outline" type="button" onClick={requestDeviceLocation} disabled={locating}>{locating?<><span className="loading-spinner"/> Getting location…</>:<><LocateFixed size={16}/> Use my location</>}</button></div>
      <div className="weather-location-controls">
        <label className="weather-lga-select">Plateau State Local Government
          <select value={selectedLga?location.name:""} onChange={event=>{const selected=plateauLocalGovernments.find(item=>item.name===event.target.value);if(selected)saveLocation({id:`plateau-${selected.name}`,name:selected.name,place:selected.place,admin1:"Plateau State",country:"Nigeria",latitude:selected.latitude,longitude:selected.longitude,source:"plateau"})}}>
            <option value="">Choose a Plateau LGA</option>
            {plateauLocalGovernments.map(item=><option value={item.name} key={item.name}>{item.name}</option>)}
          </select>
        </label>
        <form className="weather-search" onSubmit={searchLocations}>
          <label htmlFor="weather-location-search">Search Nigerian locations</label>
          <div><input id="weather-location-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="e.g. Jos North, Abuja, Lagos"/><button className="primary" type="submit" disabled={searching}>{searching?<span className="loading-spinner"/>:<Search size={16}/>} Search</button></div>
        </form>
      </div>
      {locationError&&<p className="weather-location-error" role="status">{t(locationError)}</p>}
      {searchError&&<p className="weather-location-error" role="status">{t(searchError)}</p>}
      {searchResults.length>0&&<div className="weather-search-results" role="list" aria-label="Location search results">{searchResults.map(result=><button type="button" key={result.id} role="listitem" onClick={()=>saveLocation({...result,source:"search"})}><MapPin size={16}/><span><strong>{result.name}</strong><small>{[result.admin2,result.admin1,result.country].filter(Boolean).join(", ")}</small></span></button>)}</div>}
      {location&&<p className="weather-selected-location"><MapPin size={14}/><strong>{t("Selected location")}:</strong> {selectedLabel}{location.accuracy&&<span> · {t("GPS accuracy")}: ±{Math.round(location.accuracy)} m</span>}</p>}
    </section>

    {loading&&<section className="card weather-status" role="status"><span className="loading-spinner"/> Loading the latest forecast…</section>}
    {weatherError&&<section className="card weather-status weather-location-error" role="alert"><p>{t(weatherError)}</p><button className="outline" onClick={()=>setLocation(value=>value?{...value}:null)}>{t("Try again")}</button></section>}
    {!location&&!loading&&!locationError&&<section className="card weather-status">{t("Choose your device location or select/search an area to see its weather.")}</section>}

    {current&&weather&&<div className="weather-results">
      <section className="weather-current-card card">
        <div className="weather-current-heading"><div><span className="eyebrow">{t("Current conditions")}</span><h2>{selectedLabel}</h2><span className="weather-updated">{t("Updated")} {formatForecastTime(current.time,weather.timezone,weather.utc_offset_seconds,locale,{hour:"numeric",minute:"2-digit"})} · {weather.timezone}</span></div><div className="weather-heading-actions"><div className="temperature-toggle" role="group" aria-label="Temperature units"><button className={unit==="C"?"selected":""} onClick={()=>setUnit("C")}>°C</button><button className={unit==="F"?"selected":""} onClick={()=>setUnit("F")}>°F</button></div><button className="outline weather-refresh" onClick={()=>setRefreshKey(value=>value+1)} disabled={loading}><Activity size={14}/>{t("Refresh forecast")}</button></div></div>
        <div className="weather-current-main"><WeatherConditionIcon code={current.weather_code} isDay={current.is_day===1}/><div className="weather-current-temp"><strong>{temperature(current.temperature_2m)}</strong><span>{t(describeWeatherCode(current.weather_code,current.is_day===1))}</span><small>{t("Feels like")} {temperature(current.apparent_temperature)}</small></div></div>
        <div className="weather-metric-grid">
          <WeatherMetric icon={Droplets} label="Humidity" value={`${current.relative_humidity_2m}%`}/>
          <WeatherMetric icon={CloudRain} label="Rain now" value={`${current.precipitation} mm`}/>
          <WeatherMetric icon={Wind} label="Wind" value={`${current.wind_speed_10m} km/h`}/>
          <WeatherMetric icon={CloudRain} label="Chance of rain" value={`${hourly?.precipitation_probability?.[hourlyStart]??"—"}%`}/>
        </div>
        <p className="weather-data-note">{t("Forecast conditions are model-based estimates for the selected coordinates, not readings from a weather station at your exact farm.")} <span>{t("Forecast provider")}: Open-Meteo. {t("Your selected coordinates are sent to Open-Meteo to retrieve the forecast.")}</span></p>
      </section>

      {daily&&<section className="card weather-forecast-section"><div className="weather-section-heading"><h2>7-day forecast</h2><span>{t("Daily outlook")}</span></div><div className="weather-daily-grid">{daily.time.map((date,index)=><article className="weather-day-card" key={date}><strong>{index===0?t("Today"):new Intl.DateTimeFormat(locale,{weekday:"short",timeZone:weather.timezone}).format(new Date(`${date}T12:00:00`))}</strong><WeatherConditionIcon code={daily.weather_code[index]} isDay/><span>{t(describeWeatherCode(daily.weather_code[index]))}</span><div><b>{temperature(daily.temperature_2m_max[index])}</b><small>{temperature(daily.temperature_2m_min[index])}</small></div><small>{t("Chance of rain")}: {daily.precipitation_probability_max[index]??0}%</small><small>{t("Rainfall")}: {daily.precipitation_sum[index]} mm</small></article>)}</div></section>}

      {hourlyForecast.length>0&&<section className="card weather-forecast-section"><div className="weather-section-heading"><h2>Next 12 hours</h2><span>{t("Hourly forecast")}</span></div><div className="weather-hourly-list">{hourlyForecast.map(hour=><article className="weather-hour-card" key={hour.time}><strong>{formatForecastTime(hour.time,weather.timezone,weather.utc_offset_seconds,locale,{hour:"numeric"})}</strong><WeatherConditionIcon code={hour.code} isDay={hour.isDay===1}/><span>{temperature(hour.temperature)}</span><small><CloudRain size={13}/> {hour.probability??0}%</small></article>)}</div></section>}
      <p className="weather-attribution">Weather forecast by <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>. {t("Forecast data can differ from conditions at the exact location.")}</p>
    </div>}
  </div></Localize>
}

function WeatherConditionIcon({code,isDay}) {
  if([0,1].includes(code)&&isDay)return <Sun className="weather-condition-icon weather-sun" size={34}/>;
  if([2,3,45,48].includes(code))return <Cloud className="weather-condition-icon weather-cloud" size={34}/>;
  return <CloudRain className="weather-condition-icon weather-rain" size={34}/>;
}

function WeatherMetric({icon:Icon,label,value}) {
  return <div className="weather-metric"><Icon size={18}/><span>{label}</span><strong>{value}</strong></div>;
}

function Journal() {
  const [entries,setEntries]=useState([{id:1,title:"Possible pest pressure on maize",category:"AI Insight",date:"Today",text:"Observed changes on several maize leaves; monitoring recommended."},{id:2,title:"Tomato plot updated",category:"Farm Activity",date:"Yesterday",text:"Added tomato crop to the farm record."}]);
  const [show,setShow]=useState(false);
  return <Localize><div><PageTitle eyebrow="FARM RECORDS" title="Farm Journal" text="Keep observations, AI assessments, activities, and interventions together." action="New Entry" onAction={()=>setShow(true)}/><div className="journal-list">{entries.map(e=><article className="journal-entry card" key={e.id}><div className="journal-date">{e.date}</div><div><span className="eyebrow">{e.category}</span><h3>{e.title}</h3><p>{e.text}</p></div><MoreHorizontal/></article>)}</div>
  {show&&<Modal title="New journal entry" onClose={()=>setShow(false)}><JournalForm onSave={(title,text)=>{setEntries([{id:Date.now(),title,text,category:"Farm Note",date:"Just now"},...entries]);setShow(false)}}/></Modal>}</div></Localize>
}
function JournalForm({onSave}) {const [t,setT]=useState("");const [d,setD]=useState("");return <Localize><form className="form-grid" onSubmit={e=>{e.preventDefault();if(t.trim())onSave(t.trim(),d||"Farm observation")}}><label>Title<input required value={t} onChange={e=>setT(e.target.value)} placeholder="What happened?"/></label><label>Notes<textarea value={d} onChange={e=>setD(e.target.value)} placeholder="Add useful details…"/></label><button className="primary">Save entry</button></form></Localize>}

function Finance() {
 const [rows,setRows]=useState([]);
 const [show,setShow]=useState(false);
 const income=rows.filter(x=>x.type==="Income").reduce((a,x)=>a+x.amount,0), expense=rows.filter(x=>x.type==="Expense").reduce((a,x)=>a+x.amount,0);
 return <Localize><div><PageTitle eyebrow="FARM FINANCE" title="Finance" text="Track income and expenses with transparent totals." action="Add transaction" onAction={()=>setShow(true)}/><div className="stats-grid"><Stat icon={TrendingUp} label="Total income" value={`₦${income.toLocaleString()}`} note="Recorded income"/><Stat icon={Wallet} label="Expenses" value={`₦${expense.toLocaleString()}`} note="Recorded costs"/><Stat icon={BarChart3} label="Net result" value={`₦${(income-expense).toLocaleString()}`} note="Income minus expenses"/></div><section className="card table-card"><CardHead title="Recent transactions"/>{rows.length===0?<p className="finance-empty-state">No transactions yet. Add a transaction to start tracking your farm finances.</p>:rows.map((r,i)=><div className="transaction" key={i}><div className="transaction-icon">{r.type==="Income"?<TrendingUp/>:<Wallet/>}</div><div><strong>{r.name}</strong><span>{r.type} · This month</span></div><b className={r.type==="Income"?"income":"expense"}>{r.type==="Income"?"+":"-"}₦{r.amount.toLocaleString()}</b></div>)}</section>{show&&<Modal title="Add transaction" onClose={()=>setShow(false)}><TransactionForm onSave={(name,amount,type)=>{setRows([{name,amount:Number(amount),type},...rows]);setShow(false)}}/></Modal>}</div></Localize>
}
function TransactionForm({onSave}) {const[n,setN]=useState("");const[a,setA]=useState("");const[t,setT]=useState("Expense");return <Localize><form className="form-grid" onSubmit={e=>{e.preventDefault();if(n.trim()&&Number(a)>0)onSave(n.trim(),a,t)}}><label>Description<input required value={n} onChange={e=>setN(e.target.value)} placeholder="e.g. Seeds"/></label><label>Amount (₦)<input required type="number" min="1" value={a} onChange={e=>setA(e.target.value)} placeholder="15000"/></label><label>Type<select value={t} onChange={e=>setT(e.target.value)}><option>Expense</option><option>Income</option></select></label><button className="primary">Save transaction</button></form></Localize>}

function Calendar({events,onAddEvent}) {
  const [month,setMonth]=useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [show,setShow]=useState(false);
  const {language}=useLanguage();
  const daysInMonth=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  const firstDay=month.getDay();
  const monthLabel=new Intl.DateTimeFormat(language==="ha"?"ha-NG":"en-NG",{month:"long",year:"numeric"}).format(month);
  const upcoming=events.filter(event=>event.date>=localDateKey(new Date())).sort((a,b)=>a.date.localeCompare(b.date));
  const calendarCells=[...Array(firstDay).fill(null),...Array.from({length:daysInMonth},(_,index)=>index+1)];
  return <Localize><div><PageTitle eyebrow="FARM CALENDAR" title="Calendar" text="Plan planting, feeding, inspections, harvests, and custom farm activities." action="Add event" onAction={()=>setShow(true)}/>
    <section className="card calendar-card"><div className="calendar-head"><button aria-label="Previous month" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()-1,1))}>‹</button><h3>{monthLabel}</h3><button aria-label="Next month" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()+1,1))}>›</button></div><div className="calendar-week">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><span key={day}>{day}</span>)}</div><div className="calendar-days">{calendarCells.map((day,index)=>day===null?<span className="calendar-empty" key={`empty-${index}`}/>:<span key={day} className={day===new Date().getDate()&&month.getMonth()===new Date().getMonth()&&month.getFullYear()===new Date().getFullYear()?"today":""}>{day}</span>)}</div></section>
    <section className="card upcoming"><CardHead title="Upcoming events"/>{upcoming.length===0?<p className="calendar-empty-state">No scheduled farm activities yet.</p>:upcoming.map(event=><div className="event-row" key={event.id}><div className="event-date">{new Intl.DateTimeFormat(language==="ha"?"ha-NG":"en-NG",{month:"short",day:"numeric"}).format(new Date(`${event.date}T00:00:00`))}</div><div><strong>{event.title}</strong><span>{event.type}</span></div><CheckCircle2 size={18}/></div>)}</section>
    {show&&<Modal title="Add calendar event" onClose={()=>setShow(false)}><CalendarEventForm onSave={event=>{onAddEvent(event);setShow(false)}}/></Modal>}
  </div></Localize>
}

function CalendarEventForm({onSave}) {
  const [title,setTitle]=useState("");
  const [date,setDate]=useState("");
  return <Localize><form className="form-grid" onSubmit={event=>{event.preventDefault();if(title.trim()&&date)onSave({title:title.trim(),date,type:"Farm activity"});}}>
    <label>Event name<input autoFocus required value={title} onChange={event=>setTitle(event.target.value)} placeholder="e.g. Fertilizer application"/></label>
    <label>Event date<input type="date" required min={localDateKey(new Date())} value={date} onChange={event=>setDate(event.target.value)}/></label>
    <button className="primary">Save event</button>
  </form></Localize>
}

function Alerts({items,onMarkRead,onMarkAllRead,onDelete,unreadCount}) {
  const {t,language}=useLanguage();
  const navigate=useNavigate();
  const [filter,setFilter]=useState("all");
  const categories=["all","unread","crop","livestock","weather","activity","ai","community"];
  const categoryLabels={all:"All alerts",unread:"Unread",crop:"Crop notifications",livestock:"Livestock notifications",weather:"Weather notifications",activity:"Farming activity reminders",ai:"AI-generated recommendations",community:"Community updates"};
  const priorityOrder={critical:0,warning:1,reminder:2,information:3};
  const filtered=items
    .filter(item=>filter==="all"||(filter==="unread"?!item.read:item.category===filter))
    .sort((a,b)=>(priorityOrder[a.priority]??4)-(priorityOrder[b.priority]??4)||b.createdAt.localeCompare(a.createdAt));
  return <Localize><div><PageTitle eyebrow="SMART ALERTS" title="Alerts" text="Updates and reminders from your recorded farm activities."/>
    <div className="alert-toolbar"><div className="alert-filters" role="group" aria-label="Alert filters">{categories.map(category=><button key={category} className={filter===category?"selected":""} onClick={()=>setFilter(category)}>{t(categoryLabels[category])}</button>)}</div>{unreadCount>0&&<button className="outline mark-all-read" onClick={onMarkAllRead}>{t("Mark all as read")}</button>}</div>
    {filtered.length===0?<div className="empty card alert-empty"><CheckCircle2/><h3>{items.length===0?"No notifications yet":"No notifications match this filter."}</h3></div>:<div className="alert-list">{filtered.map(item=><article className={`alert-card card priority-${item.priority} ${item.read?"is-read":"is-unread"}`} key={item.id}>
      <div className="alert-symbol"><Bell size={19}/></div>
      <div className="alert-content"><div className="alert-meta"><span className="eyebrow">{t(categoryLabels[item.category]??item.category)}</span><span className={`priority-label priority-text-${item.priority}`}>{t(item.priority.charAt(0).toUpperCase()+item.priority.slice(1))}</span><time dateTime={item.createdAt}>{new Intl.DateTimeFormat(language==="ha"?"ha-NG":"en-NG",{dateStyle:"medium",timeStyle:"short"}).format(new Date(item.createdAt))}</time></div><h3>{t(item.titleKey)}</h3><p>{item.message??formatNotificationText(item,t)}</p>
        {item.href&&<button className="alert-open" onClick={()=>{onMarkRead(item.id);navigate(item.href)}}>{t("Open details")} <ChevronRight size={15}/></button>}
      </div>
      <div className="alert-actions">{!item.read&&<button className="outline" onClick={()=>onMarkRead(item.id)}>{t("Mark as read")}</button>}<button className="outline" onClick={()=>onDelete(item.id)}>{t("Delete")}</button></div>
    </article>)}</div>}
  </div></Localize>
}

function Profile(){
 const {client,user,configured}=useAuth();
 const [profile,setProfile]=useState(null);
 const [name,setName]=useState("");
 const [region,setRegion]=useState("");
 const [farmLocation,setFarmLocation]=useState("");
 const [experience,setExperience]=useState("beginner");
 const [timezone,setTimezone]=useState("Africa/Lagos");
 const [phone,setPhone]=useState("");
 const [otp,setOtp]=useState("");
 const [newPassword,setNewPassword]=useState("");
 const [confirmPassword,setConfirmPassword]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("");
 const [error,setError]=useState("");
 const [phoneStep,setPhoneStep]=useState(false);
 const loadProfile=async()=>{
   const {data,error:loadError}=await client.from("profiles").select("display_name,phone,date_of_birth,gender,region,farm_location,experience_level,phone_verified_at,timezone").eq("id",user.id).single();
   if(loadError){setError(`Could not load profile: ${loadError.message}`);return;}
   setProfile(data);setName(data.display_name||"");setPhone(data.phone||user.phone||"");
   setRegion(data.region||"");setFarmLocation(data.farm_location||"");setExperience(data.experience_level||"beginner");setTimezone(data.timezone||"Africa/Lagos");
 };
 useEffect(()=>{if(configured)loadProfile();},[configured,user?.id]);
 const saveProfile=async(event)=>{
   event.preventDefault();setBusy(true);setError("");setMessage("");
   const {error:saveError}=await client.from("profiles").update({
     display_name:name.trim(),region:region.trim()||null,farm_location:farmLocation.trim()||null,
     experience_level:experience,timezone
   }).eq("id",user.id);
   if(saveError)setError(`Could not save profile: ${saveError.message}`);else setMessage("Profile updated.");
   setBusy(false);
 };
 const updatePassword=async(event)=>{
   event.preventDefault();
   if(newPassword.length<8||newPassword!==confirmPassword){setError("Use a password of at least 8 characters and make sure both entries match.");return;}
   setBusy(true);setError("");setMessage("");
   const {error:passwordError}=await client.auth.updateUser({password:newPassword});
   if(passwordError)setError(`Could not update password: ${passwordError.message}`);
   else{setNewPassword("");setConfirmPassword("");setMessage("Password updated.");}
   setBusy(false);
 };
 const requestPhoneVerification=async()=>{
   setBusy(true);setError("");setMessage("");
   const normalized=phone.replace(/[()\s-]/g,"");
   const {error:phoneError}=await client.auth.updateUser({phone:normalized});
   if(phoneError)setError(`Could not send phone verification: ${phoneError.message}`);
   else{setPhoneStep(true);setMessage("A verification code was sent to the phone number.");}
   setBusy(false);
 };
 const verifyPhone=async(event)=>{
   event.preventDefault();setBusy(true);setError("");setMessage("");
   const {error:verifyError}=await client.auth.verifyOtp({phone:phone.replace(/[()\s-]/g,""),token:otp.trim(),type:"phone_change"});
   if(verifyError)setError(`Could not verify phone number: ${verifyError.message}`);
   else{setPhoneStep(false);setOtp("");setMessage("Phone number verified.");await loadProfile();}
   setBusy(false);
 };
 return <Localize><div><PageTitle eyebrow="PROFILE" title="Your profile" text="Manage your personal information, farm details, and account security."/>
   {!configured?<div className="backend-notice">Profile and account settings require Supabase. No signed-in account is configured in this browser.</div>:<>
     {error&&<div className="auth-message error" role="alert">{error}</div>}{message&&<div className="auth-message success" role="status">{message}</div>}
     <section className="card settings-section"><h2>Personal and farm information</h2>{profile?<form className="form-grid profile-form" onSubmit={saveProfile}>
       <label>Full name<input required maxLength={100} value={name} onChange={event=>setName(event.target.value)}/></label>
       <label>Email<input value={user.email||""} disabled/></label>
       <label>Date of birth<input type="date" value={profile.date_of_birth||""} disabled/></label>
       <label>Gender<select value={profile.gender||""} disabled><option value="">Not provided</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option><option value="prefer_not_to_say">Prefer not to say</option></select></label>
       <label>Region<input maxLength={100} value={region} onChange={event=>setRegion(event.target.value)} placeholder="e.g. Plateau State"/></label>
       <label>Farm location<input maxLength={180} value={farmLocation} onChange={event=>setFarmLocation(event.target.value)} placeholder="Town or local government"/></label>
       <label>AI knowledge level<select value={experience} onChange={event=>setExperience(event.target.value)}><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="expert">Expert</option></select></label>
       <label>Calendar timezone<select value={timezone} onChange={event=>setTimezone(event.target.value)}><option value="Africa/Lagos">Africa/Lagos (Nigeria)</option><option value="Africa/Accra">Africa/Accra</option><option value="Africa/Abidjan">Africa/Abidjan</option><option value="Europe/London">Europe/London</option><option value="America/New_York">America/New_York</option><option value="UTC">UTC</option></select></label>
       <button className="primary" disabled={busy}>{busy?"Saving…":"Save profile"}</button>
     </form>:<p>Loading profile…</p>}</section>
     <section className="card settings-section"><h2>Phone verification</h2><p>{profile?.phone_verified_at?"Your phone number is verified.":"Your phone number is not verified."}</p><label className="settings-select-label">Phone number<input type="tel" value={phone} onChange={event=>setPhone(event.target.value)} placeholder="+2348012345678"/></label>{phoneStep?<form className="form-grid profile-form" onSubmit={verifyPhone}><label>SMS code<input inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={event=>setOtp(event.target.value)} required/></label><button className="primary" disabled={busy}>Verify phone</button></form>:<button className="outline" disabled={busy||!phone} onClick={requestPhoneVerification}>Send verification code</button>}</section>
     <section className="card settings-section"><h2>Change password</h2><form className="form-grid profile-form" onSubmit={updatePassword}><label>New password<input type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={event=>setNewPassword(event.target.value)}/></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} required value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)}/></label><button className="primary" disabled={busy}>Update password</button></form></section>
     <section className="card settings-section"><h2>Account deletion</h2><p>Account deletion must be processed by a trusted server-side function so related private data can be handled safely. This service is not configured yet.</p><button className="outline" disabled>Request account deletion unavailable</button></section>
   </>}
 </div></Localize>
}

function SettingsPage({notificationPreferences,onNotificationPreferencesChange,cloudConnected}) {
  const {language,setLanguage,aiLanguage,setAiLanguage}=useLanguage();
  return <Localize><div>
    <PageTitle eyebrow="SETTINGS" title="Settings" text="Choose how AgriPlus communicates with you."/>
    <section className="card settings-section language-settings">
      <div className="settings-section-head"><div className="settings-section-icon"><Globe2 size={20}/></div><div><h2>Language Preferences</h2><p>Your choice updates the interface right away and is saved on this device.</p></div></div>
      <h3>Application Language</h3>
      <div className="language-options" role="group" aria-label="Application Language">
        {Object.entries(languages).map(([code,name])=><button type="button" key={code} className={`language-option ${language===code?"selected":""}`} aria-pressed={language===code} onClick={()=>setLanguage(code)}>
          <span className="language-option-name">{name}</span>{language===code&&<span className="language-current"><CheckCircle2 size={15}/> Selected</span>}
        </button>)}
      </div>
      <p className="settings-help">Your language choice is saved on this device and will stay selected when you move between pages.</p>
    </section>
    <section className="card settings-section">
      <div className="settings-section-head"><div className="settings-section-icon"><UserRound size={20}/></div><div><h2>Account Settings</h2><p>Personal and account details will remain managed by your existing profile.</p></div></div>
      <div className="settings-detail-grid"><div><strong>Personal information</strong><span>Profile and contact details</span></div><div><strong>Profile information</strong><span>Farm location and experience</span></div><div><strong>Account preferences</strong><span>Existing account options</span></div></div>
    </section>
    <section className="card settings-section">
      <div className="settings-section-head"><div className="settings-section-icon"><Bot size={20}/></div><div><h2>AI Preferences</h2><p>Set the language used by the text-based farm assistant.</p></div></div>
      <label className="settings-select-label">Preferred AI response language
        <select value={aiLanguage} onChange={event=>setAiLanguage(event.target.value)}>
          <option value="app">Use application language</option>
          {Object.entries(languages).map(([code,name])=><option key={code} value={code}>{name}</option>)}
        </select>
      </label>
      <p className="settings-help">Your AI language preference is saved on this device.</p>
      <div className="settings-future"><div><strong>Voice response preference</strong><span>Coming in a future update. Voice features are not available yet.</span></div><Mic size={18}/></div>
      <div className="settings-preference"><strong>AI communication preferences</strong><span>The assistant will answer in your selected language unless you ask it to use another language.</span></div>
    </section>
    <section className="card settings-section">
      <div className="settings-section-head"><div className="settings-section-icon"><Bell size={20}/></div><div><h2>Notification Preferences</h2><p>Choose which farm updates can notify you.</p></div></div>
      <NotificationPreferences preferences={notificationPreferences} onChange={onNotificationPreferencesChange}/>
      <p className="settings-help"><span>{cloudConnected?"Alert preferences are saved to your Supabase profile.":"Alert preferences are saved on this device."}</span> <span>Live weather forecasts are available, but weather-triggered alerts are not enabled yet.</span> <span>Push notifications are unavailable until a push service is configured.</span></p>
    </section>
  </div></Localize>
}

function NotificationPreferences({preferences,onChange}) {
  const options=[
    ["crop","Crop notifications"],
    ["livestock","Livestock notifications"],
    ["weather","Weather notifications"],
    ["activity","Farming activity reminders"],
    ["ai","AI-generated recommendations"],
    ["community","Community updates"],
    ["inApp","In-app notifications"]
  ];
  return <div className="notification-preferences">
    {options.map(([key,label])=><label className="notification-preference" key={key}><input type="checkbox" checked={Boolean(preferences[key])} onChange={event=>onChange({...preferences,[key]:event.target.checked})}/><span>{label}</span></label>)}
    <label className="notification-preference unavailable"><input type="checkbox" checked={false} disabled/><span>Push notifications</span><small>Push notifications are unavailable until a push service is configured.</small></label>
  </div>
}

function Modal({title,onClose,children}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><div className="modal card"><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X/></button></div>{children}</div></div>}

function MainApp({user,client,configured}){
 const [profileDisplayName,setProfileDisplayName]=useState(()=>user?.user_metadata?.full_name||user?.user_metadata?.first_name||user?.user_metadata?.name||"");
 const farmerName=getFarmerFirstName(user,profileDisplayName);
 const scopedKey=key=>configured?`${key}:${user.id}`:key;
 useEffect(()=>{
   if(!configured||!user||!client)return undefined;
   let active=true;
   const heartbeat=async()=>{
     const {error}=await client.from("user_presence").upsert({user_id:user.id,last_seen_at:new Date().toISOString()});
     if(active&&error)console.error("Could not update account presence.",error);
   };
   heartbeat();
   const timer=window.setInterval(heartbeat,2*60*1000);
   return()=>{active=false;window.clearInterval(timer);};
 },[client,configured,user?.id]);
 const cropKey=scopedKey("agriplus-crops"),livestockKey=scopedKey("agriplus-livestock");
 const eventsKey=scopedKey(calendarEventsStorageKey),notificationsKey=scopedKey(notificationStorageKey);
 const preferencesKey=scopedKey(notificationPreferencesStorageKey);
 const [cloudError,setCloudError]=useState("");
 const [crops,setCrops]=useState(()=>{if(configured)return [];const stored=readStoredValue(cropKey,initialCrops);return Array.isArray(stored)?stored:initialCrops});
 const [livestock,setLivestock]=useState(()=>{if(configured)return [];const stored=readStoredValue(livestockKey,initialLivestock);return Array.isArray(stored)?stored:initialLivestock});
 const [calendarEvents,setCalendarEvents]=useState(()=>{if(configured)return [];const stored=readStoredValue(eventsKey,[]);return Array.isArray(stored)?stored:[]});
 const [notifications,setNotifications]=useState(()=>{if(configured)return [];const stored=readStoredValue(notificationsKey,[]);return Array.isArray(stored)?stored:[]});
 const [notificationPreferences,setNotificationPreferences]=useState(()=>({...defaultNotificationPreferences,...(configured?{}:readStoredValue(preferencesKey,{})),push:false}));
 const [preferencesLoaded,setPreferencesLoaded]=useState(!configured);
 const {t,language,setLanguage,aiLanguage,setAiLanguage}=useLanguage();
 useEffect(()=>{
   if(!configured)return undefined;
   let active=true;
   Promise.all([
     client.from("crop_records").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
     client.from("livestock_records").select("*").eq("user_id",user.id).order("created_at",{ascending:false}),
     client.from("notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(200),
    client.from("profiles").select("display_name,notification_preferences,language,ai_language").eq("id",user.id).single(),
     client.from("calendar_events").select("id,title,category,start_date,start_time,timezone,status,reminder_settings").eq("user_id",user.id).eq("status","scheduled").limit(1000)
   ]).then(([cropResult,livestockResult,notificationResult,profileResult,eventResult])=>{
     if(!active)return;
     if(profileResult.data?.display_name)setProfileDisplayName(profileResult.data.display_name);
     if(cropResult.error||livestockResult.error||notificationResult.error||profileResult.error||eventResult.error){
       const failure=cropResult.error||livestockResult.error||notificationResult.error||profileResult.error||eventResult.error;
       setCloudError(`Could not load your account data: ${failure.message}`);
       return;
     }
     setCloudError("");
     setCrops((cropResult.data||[]).map(cropFromRecord));
     setLivestock((livestockResult.data||[]).map(livestockFromRecord));
     setCalendarEvents((eventResult.data||[]).map(item=>({...item,date:item.start_date})));
     setNotifications((notificationResult.data||[]).map(item=>({
       id:item.id,category:item.category,priority:item.priority,titleKey:item.title_key||item.title,
       textKey:item.message_key,params:item.params||{},message:item.message_key?null:item.message,
       href:item.href,eventKey:item.event_key,createdAt:item.created_at,read:Boolean(item.read_at)
     })));
     setNotificationPreferences({...defaultNotificationPreferences,...profileResult.data.notification_preferences,push:false});
     setLanguage(profileResult.data.language||"en");
     setAiLanguage(profileResult.data.ai_language||"app");
     setPreferencesLoaded(true);
   }).catch(error=>{if(active)setCloudError(`Could not load your farm records: ${error.message}`);});
   return()=>{active=false;};
 },[client,configured,user?.id]);
 const addNotification=useCallback(async notification=>{
   if(!notificationPreferences.inApp||!notificationPreferences[notification.category])return;
   if(configured){
     const {data,error}=await client.from("notifications").insert({
       user_id:user.id,category:notification.category,priority:notification.priority,
       title:t(notification.titleKey),message:formatNotificationText(notification,t),
       title_key:notification.titleKey||null,message_key:notification.textKey||null,
       params:notification.params||{},event_key:notification.eventKey||null,href:notification.href||null
     }).select().single();
     if(error){
       if(error.code!=="23505")setCloudError(`Could not save notification: ${error.message}`);
       return;
     }
     const saved={
       id:data.id,category:data.category,priority:data.priority,titleKey:data.title_key||data.title,
       textKey:data.message_key,params:data.params||{},message:data.message_key?null:data.message,
       href:data.href,eventKey:data.event_key,createdAt:data.created_at,read:Boolean(data.read_at)
     };
     setNotifications(current=>current.some(item=>item.eventKey===saved.eventKey)?current:[saved,...current].slice(0,200));
   }else{
     setNotifications(current=>current.some(item=>item.eventKey===notification.eventKey)?current:[notification,...current].slice(0,200));
   }
 },[client,configured,notificationPreferences,t,user?.id]);
 const addCrop=async(name,variety="General",area="0.5 ha",schedule={})=>{
   let crop={id:Date.now(),name,variety,area,status:"Healthy",image:"🌱",...schedule};
   if(configured){
     const numericArea=Number.parseFloat(String(area).replace(/[^0-9.]/g,""));
     const {data,error}=await client.from("crop_records").insert({
       user_id:user.id,name,variety,area:Number.isFinite(numericArea)?numericArea:null,
       status:"healthy",metadata:{...schedule,image:crop.image}
     }).select().single();
     if(error){setCloudError(`Could not save crop: ${error.message}`);return;}
     crop=cropFromRecord(data);
   }
   setCrops(current=>[...current,crop]);
   addNotification(createNotification({category:"crop",priority:"information",titleKey:"Crop added",textKey:"A crop record was added: {name}.",params:{name},href:"/crops",eventKey:`crop-added:${crop.id}`}));
 };
 const addLivestock=async(type,schedule={})=>{
   let animal={id:Date.now(),type,breed:"Local",age:"New",sex:"—",status:"Healthy",image:type.toLowerCase().includes("goat")?"🐐":"🐄",...schedule};
   if(configured){
     const {data,error}=await client.from("livestock_records").insert({
       user_id:user.id,animal_type:type,breed:"Local",count:1,status:"healthy",
       metadata:{...schedule,age:"New",sex:"—",image:animal.image}
     }).select().single();
     if(error){setCloudError(`Could not save livestock record: ${error.message}`);return;}
     animal=livestockFromRecord(data);
   }
   setLivestock(current=>[...current,animal]);
   addNotification(createNotification({category:"livestock",priority:"information",titleKey:"Livestock added",textKey:"An animal record was added: {name}.",params:{name:type},href:"/livestock",eventKey:`animal-added:${animal.id}`}));
 };
 const recordCropIssue=async(crop,detail,priority)=>{
   if(configured){
     const {error}=await client.from("crop_records").update({status:"attention",metadata:{...(crop.metadata||{}),lastIssue:detail}}).eq("id",crop.id).eq("user_id",user.id);
     if(error){setCloudError(`Could not save crop concern: ${error.message}`);return;}
   }
   setCrops(current=>current.map(item=>item.id===crop.id?{...item,status:"Attention",lastIssue:detail}:item));
   addNotification(createNotification({category:"crop",priority,titleKey:"Crop health concern",textKey:"A crop health concern was reported for {name}: {detail}",params:{name:crop.name,detail},href:"/crops",eventKey:`crop-issue:${crop.id}:${Date.now()}`}));
 };
 const recordLivestockIssue=async(animal,detail,priority)=>{
   if(configured){
     const {error}=await client.from("livestock_records").update({status:"watch",metadata:{...(animal.metadata||{}),healthConcern:detail}}).eq("id",animal.id).eq("user_id",user.id);
     if(error){setCloudError(`Could not save livestock concern: ${error.message}`);return;}
   }
   setLivestock(current=>current.map(item=>item.id===animal.id?{...item,status:"Watch",healthConcern:detail}:item));
   addNotification(createNotification({category:"livestock",priority,titleKey:"Livestock health concern",textKey:"A health concern was reported for {name}: {detail}",params:{name:animal.type,detail},href:"/livestock",eventKey:`animal-issue:${animal.id}:${Date.now()}`}));
 };
 const addCalendarEvent=event=>{
   const savedEvent={...event,id:event.id||Date.now(),date:event.start_date||event.date};
   setCalendarEvents(current=>current.some(item=>String(item.id)===String(savedEvent.id))
     ?current.map(item=>String(item.id)===String(savedEvent.id)?savedEvent:item)
     :[savedEvent,...current]);
 };
 const removeCalendarEvent=id=>setCalendarEvents(current=>current.filter(item=>String(item.id)!==String(id)));
 const markNotificationRead=async id=>{
   if(configured){
     const {error}=await client.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id).eq("user_id",user.id);
     if(error){setCloudError(`Could not mark notification as read: ${error.message}`);return;}
   }
   setNotifications(current=>current.map(item=>item.id===id?{...item,read:true}:item));
 };
 const markAllNotificationsRead=async()=>{
   if(configured){
     const {error}=await client.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user.id).is("read_at",null);
     if(error){setCloudError(`Could not mark notifications as read: ${error.message}`);return;}
   }
   setNotifications(current=>current.map(item=>({...item,read:true})));
 };
 const deleteNotification=async id=>{
   if(configured){
     const {error}=await client.from("notifications").delete().eq("id",id).eq("user_id",user.id);
     if(error){setCloudError(`Could not delete notification: ${error.message}`);return;}
   }
   setNotifications(current=>current.filter(item=>item.id!==id));
 };
 const saveAIRecommendation=({id,text})=>addNotification(createNotification({category:"ai",priority:"information",titleKey:"Saved AI recommendation",message:text,href:"/ask-ai",eventKey:`ai-saved:${id}`}));

 useEffect(()=>{if(!configured)writeStoredValue(cropKey,crops)},[configured,cropKey,crops]);
 useEffect(()=>{if(!configured)writeStoredValue(livestockKey,livestock)},[configured,livestockKey,livestock]);
 useEffect(()=>{if(!configured)writeStoredValue(eventsKey,calendarEvents)},[configured,eventsKey,calendarEvents]);
 useEffect(()=>{if(!configured)writeStoredValue(notificationsKey,notifications)},[configured,notificationsKey,notifications]);
 useEffect(()=>{if(!configured)writeStoredValue(preferencesKey,notificationPreferences)},[configured,preferencesKey,notificationPreferences]);
 useEffect(()=>{
   if(!configured||!preferencesLoaded)return;
   client.from("profiles").update({notification_preferences:notificationPreferences,language,ai_language:aiLanguage}).eq("id",user.id)
     .then(({error})=>{if(error)setCloudError(`Could not save notification preferences: ${error.message}`);});
 },[aiLanguage,client,configured,language,notificationPreferences,preferencesLoaded,user?.id]);
 useEffect(()=>{
   if(!configured)return undefined;
   const refreshNotifications=async()=>{
     const {data,error}=await client.from("notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(200);
     if(error){setCloudError(`Could not refresh notifications: ${error.message}`);return;}
     setNotifications((data||[]).map(item=>({
       id:item.id,category:item.category,priority:item.priority,titleKey:item.title_key||item.title,
       textKey:item.message_key,params:item.params||{},message:item.message_key?null:item.message,
       href:item.href,eventKey:item.event_key,createdAt:item.created_at,read:Boolean(item.read_at)
     })));
   };
   const channel=client.channel(`notifications-${user.id}`)
     .on("postgres_changes",{event:"*",schema:"public",table:"notifications",filter:`user_id=eq.${user.id}`},()=>refreshNotifications().catch(error=>setCloudError(`Could not refresh notifications: ${error.message}`)))
     .subscribe();
   return()=>{client.removeChannel(channel);};
 },[client,configured,user?.id]);
 useEffect(()=>{
   if(!configured)return undefined;
   const refreshCalendarEvents=async()=>{
     const {data,error}=await client.from("calendar_events").select("id,title,category,start_date,start_time,timezone,status,reminder_settings").eq("user_id",user.id).eq("status","scheduled").limit(1000);
     if(error){setCloudError(`Could not refresh calendar reminders: ${error.message}`);return;}
     setCalendarEvents((data||[]).map(item=>({...item,date:item.start_date})));
   };
   const channel=client.channel(`calendar-reminders-${user.id}`)
     .on("postgres_changes",{event:"*",schema:"public",table:"calendar_events",filter:`user_id=eq.${user.id}`},()=>refreshCalendarEvents().catch(error=>setCloudError(`Could not refresh calendar reminders: ${error.message}`)))
     .subscribe();
   return()=>{client.removeChannel(channel);};
 },[client,configured,user?.id]);
 useEffect(()=>{
   const handleStorage=event=>{
     if(event.key===notificationsKey)setNotifications(readStoredValue(notificationsKey,[]));
     if(event.key===preferencesKey)setNotificationPreferences({...defaultNotificationPreferences,...readStoredValue(preferencesKey,{}),push:false});
     if(event.key===eventsKey)setCalendarEvents(readStoredValue(eventsKey,[]));
     if(event.key===cropKey)setCrops(readStoredValue(cropKey,configured?[]:initialCrops));
     if(event.key===livestockKey)setLivestock(readStoredValue(livestockKey,configured?[]:initialLivestock));
   };
   window.addEventListener("storage",handleStorage);
   return()=>window.removeEventListener("storage",handleStorage);
 },[configured,cropKey,eventsKey,livestockKey,notificationsKey,preferencesKey]);
 useEffect(()=>{
   const checkUpcoming=()=>{
     const now=new Date();
     const today=new Date(now.getFullYear(),now.getMonth(),now.getDate());
     const isDueSoon=date=>{
       if(!date||! /^\d{4}-\d{2}-\d{2}$/.test(date))return false;
       const due=new Date(`${date}T00:00:00`);
       const days=Math.floor((due-today)/86400000);
       return days>=0&&days<=2;
     };
     crops.forEach(crop=>{
       if(isDueSoon(crop.wateringDate))addNotification(createNotification({category:"crop",priority:"reminder",titleKey:"Watering reminder",textKey:"A recorded watering date for {name} is coming up.",params:{name:crop.name},href:"/crops",eventKey:`crop-water:${crop.id}:${crop.wateringDate}`}));
       if(isDueSoon(crop.harvestDate))addNotification(createNotification({category:"crop",priority:"reminder",titleKey:"Harvest date approaching",textKey:"The recorded harvest date for {name} is coming up.",params:{name:crop.name},href:"/crops",eventKey:`crop-harvest:${crop.id}:${crop.harvestDate}`}));
       if(crop.growthStage&&isDueSoon(crop.milestoneDate))addNotification(createNotification({category:"crop",priority:"reminder",titleKey:"Crop growth milestone",textKey:"A growth milestone for {name} is scheduled soon: {stage}.",params:{name:crop.name,stage:crop.growthStage},href:"/crops",eventKey:`crop-stage:${crop.id}:${crop.milestoneDate}`}));
     });
     livestock.forEach(animal=>{
       if(isDueSoon(animal.vaccinationDate))addNotification(createNotification({category:"livestock",priority:"reminder",titleKey:"Vaccination reminder",textKey:"A vaccination for {name} is scheduled soon.",params:{name:animal.type},href:"/livestock",eventKey:`animal-vaccine:${animal.id}:${animal.vaccinationDate}`}));
       if(isDueSoon(animal.checkupDate))addNotification(createNotification({category:"livestock",priority:"reminder",titleKey:"Veterinary checkup reminder",textKey:"A veterinary checkup for {name} is coming up.",params:{name:animal.type},href:"/livestock",eventKey:`animal-checkup:${animal.id}:${animal.checkupDate}`}));
       if(isDueSoon(animal.feedingDate))addNotification(createNotification({category:"livestock",priority:"reminder",titleKey:"Feeding reminder",textKey:"A feeding reminder for {name} is coming up.",params:{name:animal.type},href:"/livestock",eventKey:`animal-feeding:${animal.id}:${animal.feedingDate}`}));
     });
     calendarEvents.forEach(event=>{
       if(event.status!=="scheduled"||event.reminder_settings?.enabled===false)return;
       let eventTime;
       try{eventTime=dateTimeInTimezone(event.date,event.start_time,event.timezone||"Africa/Lagos");}
       catch(timezoneError){setCloudError(`A calendar event has an invalid timezone: ${timezoneError.message}`);return;}
       const minutes=event.reminder_settings?.minutes_before||[0];
       for(const offset of minutes){
         const reminderTime=eventTime.getTime()-Number(offset)*60_000;
         const elapsed=now.getTime()-reminderTime;
         if(Number.isFinite(reminderTime)&&elapsed>=0&&elapsed<60_000){
           addNotification(createNotification({category:"activity",priority:"reminder",titleKey:"Farm activity reminder",textKey:"Your scheduled activity is due soon: {name}.",params:{name:event.title},href:"/calendar",eventKey:`calendar:${event.id}:${event.date}:${offset}`}));
         }
       }
     });
   };
   checkUpcoming();
   const timer=window.setInterval(checkUpcoming,60*1000);
   return()=>window.clearInterval(timer);
 },[crops,livestock,calendarEvents,addNotification]);
 useEffect(()=>{document.title=t("MBs Agro Solution — Smart Farming")},[t]);
 const unreadCount=notifications.filter(item=>!item.read).length;
 return <Layout crops={crops} livestock={livestock} alerts={unreadCount} onAddCrop={addCrop} onAddLivestock={addLivestock}>
   {cloudError&&<div className="auth-message error" role="alert">{cloudError}</div>}
   <Routes>
    <Route path="/" element={<Dashboard crops={crops} livestock={livestock} notifications={notifications} addCrop={addCrop} addLivestock={addLivestock} farmerName={farmerName}/>}/>
    <Route path="/dashboard" element={<Dashboard crops={crops} livestock={livestock} notifications={notifications} addCrop={addCrop} addLivestock={addLivestock} farmerName={farmerName}/>}/>
    <Route path="/crops" element={<Crops crops={crops} addCrop={addCrop} recordIssue={recordCropIssue}/>}/>
    <Route path="/livestock" element={<Livestock livestock={livestock} addLivestock={addLivestock} recordIssue={recordLivestockIssue}/>}/>
    <Route path="/ask-ai" element={<AskAI onSaveRecommendation={saveAIRecommendation}/>}/><Route path="/diagnose" element={<Diagnose/>}/><Route path="/weather" element={<Weather/>}/>
    <Route path="/journal" element={<Journal/>}/><Route path="/finance" element={<Finance/>}/><Route path="/calendar" element={<CalendarPage localEvents={calendarEvents} onAddEvent={addCalendarEvent} onDeleteEvent={removeCalendarEvent} crops={crops} livestock={livestock}/>}/>
    <Route path="/alerts" element={<Alerts items={notifications} unreadCount={unreadCount} onMarkRead={markNotificationRead} onMarkAllRead={markAllNotificationsRead} onDelete={deleteNotification}/>}/><Route path="/community" element={<CommunityPage/>}/><Route path="/profile" element={<Profile/>}/><Route path="/settings" element={<SettingsPage notificationPreferences={notificationPreferences} onNotificationPreferencesChange={setNotificationPreferences} cloudConnected={configured}/>}/>
   </Routes>
 </Layout>
}
function App(){
 const {configured,user,loading,recovery,client,authError}=useAuth();
 const location=useLocation();
 const isAdminRoute=location.pathname==="/admin"||location.pathname.startsWith("/admin/");
 if(isAdminRoute){
   if(configured&&loading)return <div className="auth-loading" role="status">Checking your secure session…</div>;
   if(location.pathname==="/admin/login"||!user||recovery)return <AdminLogin/>;
   return <AdminDashboard/>;
 }
 if(configured&&loading)return <div className="auth-loading" role="status">Checking your secure session…</div>;
 if(configured&&authError)return <div className="auth-page"><section className="card auth-card"><h1>Supabase configuration error</h1><p className="auth-message error" role="alert">{authError}</p></section></div>;
 if(configured&&(!user||recovery))return <AuthScreen recovery={recovery}/>;
 return <MainApp user={user} client={client} configured={configured}/>;
}
export default App;