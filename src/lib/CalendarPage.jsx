import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Localize, useLanguage } from "../i18n.jsx";
import { useAuth } from "./AuthContext.jsx";

const categories = [
  ["planting","Planting"],["watering","Watering"],["fertilizing","Fertilizing"],["spraying","Spraying"],
  ["weed_control","Weed control"],["soil_inspection","Soil inspection"],["crop_inspection","Crop inspection"],
  ["harvesting","Harvesting"],["livestock_feeding","Livestock feeding"],["livestock_vaccination","Livestock vaccination"],
  ["livestock_inspection","Livestock inspection"],["medication","Medication"],["breeding","Breeding"],
  ["equipment_maintenance","Equipment maintenance"],["custom","Custom farm activity"]
];
const dateKey = (date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const parseDate = (key) => {
  const [year,month,day]=key.split("-").map(Number);
  return new Date(year,month-1,day);
};
const emptyEvent = (date) => ({
  title:"",description:"",category:"custom",start_date:date,start_time:"",
  end_date:"",end_time:"",location:"",related_crop_id:"",related_livestock_id:"",priority:"normal",status:"scheduled",
  recurrence_rule:{frequency:"none",interval:1},
  reminder_settings:{enabled:true,minutes_before:[0]}
});
const normalizeLocalEvent=(event)=>({
  ...event,start_date:event.start_date||event.date,category:event.category||"custom",
  recurrence_rule:event.recurrence_rule||{frequency:"none",interval:1},
  reminder_settings:event.reminder_settings||{enabled:true,minutes_before:[0]}
});

function expandEvent(event, monthStart, monthEnd) {
  const start = parseDate(event.start_date);
  const rule = event.recurrence_rule || {frequency:"none",interval:1};
  if (!rule.frequency || rule.frequency === "none") {
    return start >= monthStart && start <= monthEnd ? [{...event, occurrenceDate:event.start_date}] : [];
  }
  const frequency = rule.frequency;
  const interval = Math.max(1, Number(rule.interval) || 1);
  const until = rule.until ? parseDate(rule.until) : monthEnd;
  const finalDate = until < monthEnd ? until : monthEnd;
  if (finalDate < monthStart || start > finalDate) return [];
  const results = [];
  let guard = 0;
  let date = new Date(start);
  while (date <= finalDate && guard < 4000) {
    if (date >= monthStart) results.push({...event, occurrenceDate:dateKey(date), isOccurrence:dateKey(date)!==event.start_date});
    if (frequency === "daily" || frequency === "custom") date.setDate(date.getDate()+interval);
    else if (frequency === "weekly") date.setDate(date.getDate()+7*interval);
    else if (frequency === "monthly") {
      const monthIndex=start.getMonth()+interval*(guard+1);
      const targetMonth=new Date(start.getFullYear(),monthIndex,1);
      const lastDay=new Date(targetMonth.getFullYear(),targetMonth.getMonth()+1,0).getDate();
      date=new Date(targetMonth.getFullYear(),targetMonth.getMonth(),Math.min(start.getDate(),lastDay));
    }
    else break;
    guard++;
  }
  return results;
}

function EventForm({initial,onCancel,onSave,busy,crops,livestock}) {
  const [values,setValues]=useState({...emptyEvent(initial.start_date||dateKey(new Date())),...initial});
  const [reminderMinutes,setReminderMinutes]=useState(String(values.reminder_settings?.minutes_before?.[0]??0));
  const update=(key,value)=>setValues(current=>({...current,[key]:value}));
  const submit=(event)=>{
    event.preventDefault();
    const interval=Math.max(1,Number(values.recurrence_rule?.interval)||1);
    onSave({
      ...values,
      recurrence_rule:{frequency:values.recurrence_rule?.frequency||"none",interval,...(values.recurrence_rule?.until?{until:values.recurrence_rule.until}:{})},
      reminder_settings:{enabled:true,minutes_before:[Number(reminderMinutes)]}
    });
  };
  return <form className="form-grid calendar-form" onSubmit={submit}>
    <label>Event title<input autoFocus required maxLength={160} value={values.title} onChange={e=>update("title",e.target.value)}/></label>
    <label>Description<textarea maxLength={2000} value={values.description} onChange={e=>update("description",e.target.value)}/></label>
    <label>Category<select value={values.category} onChange={e=>update("category",e.target.value)}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <div className="calendar-form-row"><label>Start date<input type="date" required value={values.start_date} onChange={e=>update("start_date",e.target.value)}/></label><label>Start time<input type="time" value={values.start_time||""} onChange={e=>update("start_time",e.target.value)}/></label></div>
    <div className="calendar-form-row"><label>End date (optional)<input type="date" min={values.start_date} value={values.end_date||""} onChange={e=>update("end_date",e.target.value)}/></label><label>End time<input type="time" value={values.end_time||""} onChange={e=>update("end_time",e.target.value)}/></label></div>
    <label>Location (optional)<input maxLength={180} value={values.location||""} onChange={e=>update("location",e.target.value)}/></label>
    <div className="calendar-form-row"><label>Related crop (optional)<select value={values.related_crop_id||""} onChange={e=>update("related_crop_id",e.target.value)}><option value="">None</option>{crops.map(crop=><option key={crop.id} value={crop.id}>{crop.name}</option>)}</select></label><label>Related livestock (optional)<select value={values.related_livestock_id||""} onChange={e=>update("related_livestock_id",e.target.value)}><option value="">None</option>{livestock.map(animal=><option key={animal.id} value={animal.id}>{animal.type}</option>)}</select></label></div>
    <div className="calendar-form-row"><label>Priority<select value={values.priority} onChange={e=>update("priority",e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label><label>Reminder<select value={reminderMinutes} onChange={e=>setReminderMinutes(e.target.value)}><option value="0">At event time</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label></div>
    <div className="calendar-form-row"><label>Repeat<select value={values.recurrence_rule?.frequency||"none"} onChange={e=>update("recurrence_rule",{...values.recurrence_rule,frequency:e.target.value})}><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="custom">Every N days</option></select></label>{values.recurrence_rule?.frequency==="custom"&&<label>Interval (days)<input type="number" min="1" max="365" value={values.recurrence_rule.interval||1} onChange={e=>update("recurrence_rule",{...values.recurrence_rule,interval:e.target.value})}/></label>}</div>
    {values.recurrence_rule?.frequency!=="none"&&<label>Repeat until (optional)<input type="date" min={values.start_date} value={values.recurrence_rule?.until||""} onChange={e=>update("recurrence_rule",{...values.recurrence_rule,until:e.target.value})}/></label>}
    <div className="calendar-form-actions"><button type="button" className="outline" onClick={onCancel}>Cancel</button><button className="primary" disabled={busy}>{busy?"Saving…":"Save event"}</button></div>
  </form>;
}

export function CalendarPage({localEvents=[],onAddEvent,onDeleteEvent,crops=[],livestock=[]}) {
  const {client,user,configured}=useAuth();
  const {language,t}=useLanguage();
  const [events,setEvents]=useState(localEvents.map(normalizeLocalEvent));
  const [month,setMonth]=useState(()=>{const today=new Date();return new Date(today.getFullYear(),today.getMonth(),1)});
  const [selectedDate,setSelectedDate]=useState(dateKey(new Date()));
  const [modalEvent,setModalEvent]=useState(null);
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("all");
  const [loading,setLoading]=useState(configured);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [timezone,setTimezone]=useState("Africa/Lagos");
  const locale=language==="ha"?"ha-NG":language==="pcm"?"en-NG":"en-NG";

  useEffect(()=>{
    if(!configured)return;
    client.from("profiles").select("timezone").eq("id",user.id).single()
      .then(({data,error:profileError})=>{
        if(profileError)setError(`Could not load calendar timezone: ${profileError.message}`);
        else setTimezone(data.timezone||"Africa/Lagos");
      }).catch(profileError=>setError(`Could not load calendar timezone: ${profileError.message}`));
  },[client,configured,user?.id]);

  const loadCloudEvents=useCallback(async()=>{
    const {data,error:loadError}=await client.from("calendar_events").select("*").eq("user_id",user.id)
      .lte("start_date",dateKey(new Date(month.getFullYear(),month.getMonth()+1,0)))
      .order("start_date",{ascending:true}).limit(1000);
    if(loadError){setError(`Could not load farm events: ${loadError.message}`);setEvents([]);}
    else{setError("");setEvents(data||[]);}
    setLoading(false);
  },[client,month,user?.id]);

  useEffect(()=>{
    if(!configured){setEvents(localEvents.map(normalizeLocalEvent));setLoading(false);return undefined;}
    let active=true;
    setLoading(true);
    loadCloudEvents().catch(loadError=>{if(active){setError(`Could not load farm events: ${loadError.message}`);setLoading(false);}});
    const channel=client.channel(`calendar-events-${user.id}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"calendar_events",filter:`user_id=eq.${user.id}`},()=>loadCloudEvents().catch(loadError=>setError(`Could not refresh farm events: ${loadError.message}`)))
      .subscribe();
    return()=>{active=false;client.removeChannel(channel);};
  },[client,configured,loadCloudEvents,localEvents,user?.id]);

  const monthStart=new Date(month.getFullYear(),month.getMonth(),1);
  const monthEnd=new Date(month.getFullYear(),month.getMonth()+1,0);
  const occurrences=useMemo(()=>events.flatMap(event=>expandEvent(event,monthStart,monthEnd)),[events,month.getFullYear(),month.getMonth()]);
  const eventDates=new Set(occurrences.map(event=>event.occurrenceDate));
  const daysInMonth=monthEnd.getDate(), firstDay=monthStart.getDay();
  const monthLabel=new Intl.DateTimeFormat(locale,{month:"long",year:"numeric"}).format(month);
  const selectedEvents=occurrences.filter(event=>event.occurrenceDate===selectedDate)
    .filter(event=>(category==="all"||event.category===category)&&`${event.title} ${event.description}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a,b)=>(a.start_time||"").localeCompare(b.start_time||""));

  const saveEvent=async(values)=>{
    setBusy(true);setError("");
    try{
      if(configured){
        const {id,created_at,updated_at,...fields}=values;
          fields.related_crop_id=fields.related_crop_id||null;
          fields.related_livestock_id=fields.related_livestock_id||null;
          let result;
        if(values.id)result=await client.from("calendar_events").update(fields).eq("id",values.id).eq("user_id",user.id).select().single();
        else result=await client.from("calendar_events").insert({...fields,user_id:user.id,timezone}).select().single();
        if(result.error)throw result.error;
        setEvents(current=>values.id?current.map(item=>item.id===values.id?result.data:item):[result.data,...current]);
        onAddEvent?.({...result.data,date:result.data.start_date});
      }else{
        const saved={...values,id:Date.now()};
        onAddEvent?.({...saved,date:saved.start_date,type:categories.find(([key])=>key===saved.category)?.[1]||"Farm activity"});
        setEvents(current=>[saved,...current]);
      }
      setModalEvent(null);
    }catch(saveError){setError(`Could not save event: ${saveError.message}`);}
    finally{setBusy(false);}
  };

  const updateStatus=async(event,status)=>{
    setError("");
    if(configured){
      const {error:updateError}=await client.from("calendar_events").update({status}).eq("id",event.id).eq("user_id",user.id);
      if(updateError){setError(`Could not update event: ${updateError.message}`);return;}
    }
    setEvents(current=>current.map(item=>item.id===event.id?{...item,status}:item));
    onAddEvent?.({...event,status});
  };
  const removeEvent=async(event)=>{
    if(!window.confirm(`Delete "${event.title}"?`))return;
    setError("");
    if(configured){
      const {error:deleteError}=await client.from("calendar_events").delete().eq("id",event.id).eq("user_id",user.id);
      if(deleteError){setError(`Could not delete event: ${deleteError.message}`);return;}
    }
    setEvents(current=>current.filter(item=>item.id!==event.id));
    onDeleteEvent?.(event.id);
  };
  const openEdit=(event)=>setModalEvent({...event,start_date:event.start_date||event.date});
  const dateLabel=(date)=>new Intl.DateTimeFormat(locale,{weekday:"long",month:"long",day:"numeric",year:"numeric"}).format(parseDate(date));
  const days=[...Array(firstDay).fill(null),...Array.from({length:daysInMonth},(_,index)=>index+1)];
  const activeCount=occurrences.filter(event=>event.occurrenceDate===selectedDate&&event.status==="scheduled").length;

  return <Localize><div className="calendar-page">
    <div className="page-title"><div><div className="eyebrow">FARM CALENDAR</div><h1>Farm calendar</h1><p>Plan and track your farm activities.</p></div><button className="primary" onClick={()=>setModalEvent(emptyEvent(selectedDate))}><Plus size={16}/> Add event</button></div>
    {!configured&&<p className="backend-notice">Calendar entries in local mode are saved only in this browser. Configure Supabase to enable account-scoped cloud storage.</p>}
    {error&&<div className="auth-message error" role="alert">{error}</div>}
    <div className="calendar-layout">
      <section className="card calendar-card">
        <div className="calendar-head"><button aria-label="Previous month" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()-1,1))}><ChevronLeft/></button><h2>{monthLabel}</h2><button aria-label="Next month" onClick={()=>setMonth(value=>new Date(value.getFullYear(),value.getMonth()+1,1))}><ChevronRight/></button></div>
        <button className="calendar-today-button" onClick={()=>{const today=new Date();setMonth(new Date(today.getFullYear(),today.getMonth(),1));setSelectedDate(dateKey(today));}}>Today</button>
        <div className="calendar-week">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><span key={day}>{day}</span>)}</div>
        <div className="calendar-days">{days.map((day,index)=>{
          if(day===null)return <span className="calendar-empty" key={`empty-${index}`}/>;
          const date=dateKey(new Date(month.getFullYear(),month.getMonth(),day));
          const today=date===dateKey(new Date());
          return <button key={date} className={`${today?"today":""} ${selectedDate===date?"selected":""} ${eventDates.has(date)?"has-events":""}`} aria-pressed={selectedDate===date} onClick={()=>setSelectedDate(date)}>{day}{eventDates.has(date)&&<i/>}</button>;
        })}</div>
        <p className="calendar-timezone"><span>{t("Dates use calendar days without UTC shifting. Event timezone:")}</span> {configured?timezone:"Africa/Lagos"}.</p>
      </section>
      <section className="card calendar-event-panel">
        <div className="calendar-event-heading"><div><div className="eyebrow">SELECTED DAY</div><h2>{dateLabel(selectedDate)}</h2></div><span className="calendar-count">{activeCount} scheduled</span></div>
        <div className="calendar-filters"><label className="calendar-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search events"/></label><select aria-label="Filter by category" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></div>
        {loading?<p className="calendar-empty-state">Loading your calendar…</p>:selectedEvents.length===0?<div className="calendar-empty-state"><CalendarDays size={28}/><strong>No events for this day</strong><span>Select another date or add a farm activity.</span></div>:<div className="calendar-events-list">{selectedEvents.map(event=><article className={`calendar-event-card priority-${event.priority}`} key={`${event.id}-${event.occurrenceDate}`}>
          <div className="calendar-event-time"><Clock3 size={14}/>{event.start_time?event.start_time.slice(0,5):"Any time"}</div><div className="calendar-event-body"><span className="calendar-event-category">{categories.find(([key])=>key===event.category)?.[1]||event.category}{event.isOccurrence?" · recurring":""}</span><h3>{event.title}</h3>{event.description&&<p>{event.description}</p>}{event.location&&<small><MapPin size={13}/>{event.location}</small>}{event.related_crop_id&&<small>Crop: {crops.find(crop=>String(crop.id)===String(event.related_crop_id))?.name||"Crop record"}</small>}{event.related_livestock_id&&<small>Livestock: {livestock.find(animal=>String(animal.id)===String(event.related_livestock_id))?.type||"Livestock record"}</small>}<span className={`event-status ${event.status}`}>{event.status}</span></div>
          <div className="calendar-event-actions">{event.status==="scheduled"&&<><button title="Mark completed" aria-label="Mark completed" onClick={()=>updateStatus(event,"completed")}><Check size={16}/></button><button title="Mark missed" aria-label="Mark missed" onClick={()=>updateStatus(event,"missed")}>×</button></>}<button title="Edit event" aria-label="Edit event" onClick={()=>openEdit(event)}><Pencil size={15}/></button><button title="Delete event" aria-label="Delete event" onClick={()=>removeEvent(event)}><Trash2 size={15}/></button></div>
        </article>)}</div>}
      </section>
    </div>
    {modalEvent&&<div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&!busy&&setModalEvent(null)}><div className="modal card calendar-modal"><div className="modal-head"><h2>{modalEvent.id?"Edit farm event":"Add farm event"}</h2><button aria-label="Close" onClick={()=>!busy&&setModalEvent(null)}><X/></button></div><EventForm initial={modalEvent} onCancel={()=>setModalEvent(null)} onSave={saveEvent} busy={busy} crops={crops} livestock={livestock}/></div></div>}
  </div></Localize>;
}
