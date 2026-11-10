import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, ShieldCheck, Send, Umbrella } from "lucide-react";
import type { Leave, NotifyFn, User } from "../../types";
import { api, formatDate } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { CustomDatePicker } from "../../components/ui/CustomDatePicker";
import { calculateWorkingDaysClient } from "../leave/LeavePage";

type Holiday = { id: number; holidayDate: string; name: string };
type Quota = { year: number; entitled: number; used: number; remaining: number };
const reasons = [
  { id: "personal", label: "Personal work" }, { id: "medical", label: "Medical / health" },
  { id: "family", label: "Family function" }, { id: "emergency", label: "Emergency" },
  { id: "travel", label: "Travel" }, { id: "festival", label: "Festival / occasion" },
  { id: "other", label: "Other — please specify" },
];
function holidaySymbol(name: string) {
  const value = name.toLowerCase();
  if (/independence|republic|gandhi|constitution/.test(value)) return "🇮🇳";
  if (/diwali|deepavali|karthika/.test(value)) return "🪔";
  if (/christmas/.test(value)) return "🎄";
  if (/eid|ramzan|bakrid|muharram|milad/.test(value)) return "🌙";
  if (/sankranti|pongal|ugadi|onam|bihu/.test(value)) return "🌾";
  if (/ganesh|vinayaka/.test(value)) return "🌺";
  if (/holi|dussehra|dasara|navratri|durga/.test(value)) return "🌸";
  return "✦";
}
function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}
export function EmployeeLeavePage({ user, notify, onNavigate }: {
  user: User; notify: NotifyFn; onNavigate: (section: "profile") => void;
}) {
  const [rows, setRows] = useState<Leave[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [quota, setQuota] = useState<Quota|null>(null);
  const [month, setMonth] = useState(()=>new Date(new Date().getFullYear(),new Date().getMonth(),1));
  const [form, setForm] = useState({ reasonCategory:"", details:"", startDate:"", endDate:"" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState<string|null>(null);

  const load = useCallback(async ()=>{
    try {
      const [requests, publicHolidays, yearlyQuota] = await Promise.all([
        api<Leave[]>("/api/leave"),
        api<Holiday[]>("/api/company-holidays"),
        api<Quota>("/api/personal-leave/quota"),
      ]);
      setRows(requests);setHolidays(publicHolidays);setQuota(yearlyQuota);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load leave calendar."); }
  }, []);
  useEffect(()=>{void load();},[load]);

  const holidayMap = useMemo(()=>new Map(holidays.map(item=>[item.holidayDate,item])),[holidays]);
  const leaveDays = useMemo(()=>{
    const map=new Map<string,Leave[]>();
    for(const row of rows){
      if(row.status==="rejected") continue;
      const cursor=new Date(`${row.startDate}T12:00:00Z`);
      const end=new Date(`${row.endDate}T12:00:00Z`);
      for(let i=0;i<370&&cursor<=end;i++,cursor.setUTCDate(cursor.getUTCDate()+1)){
        const key=cursor.toISOString().slice(0,10);
        map.set(key,[...(map.get(key)||[]),row]);
      }
    }
    return map;
  },[rows]);

  const days = useMemo(()=>{
    const first=new Date(month.getFullYear(),month.getMonth(),1);
    const offset=first.getDay();
    const length=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
    return Array.from({length:Math.ceil((offset+length)/7)*7},(_,index)=>{
      const cell=new Date(month.getFullYear(),month.getMonth(),index-offset+1);
      return {key:toDateKey(cell),date:cell.getDate(),inMonth:cell.getMonth()===month.getMonth(),weekDay:cell.getDay()};
    });
  },[month]);
  const requestWorkingDays=form.startDate&&form.endDate?
    calculateWorkingDaysClient(form.startDate,form.endDate,new Set(holidays.map(x=>x.holidayDate))):0;
  const chosen=selectedDate?{holiday:holidayMap.get(selectedDate),leaves:leaveDays.get(selectedDate)||[]}:null;

  async function submit(event:FormEvent){
    event.preventDefault();setSubmitting(true);setError("");
    try {
      const outcome=await api<{status:string;exemption:boolean}>("/api/personal-leave",{
        method:"POST",body:JSON.stringify(form),
      });
      notify(outcome.exemption
        ?"Your annual exemption day was recorded."
        :"Your leave request was submitted for CEO approval.");
      setForm({reasonCategory:"",details:"",startDate:"",endDate:""});
      await load();
    } catch (err) {setError(err instanceof Error?err.message:"Unable to submit leave.");}
    finally {setSubmitting(false);}
  }
  return (
    <div className="page-content employee-hub">
      <header className="hub-page-header">
        <div className="hub-heading-icon"><CalendarDays size={26} aria-hidden="true"/></div>
        <div><p className="hub-eyebrow">TIME OFF</p><h1>Leave &amp; Calendar</h1>
          <p>Explore company holidays, request leave, and follow your approval status.</p></div>
      </header>
      <nav className="hub-tabbar" aria-label="Employee self-service">
        <button className="hub-tab" type="button" onClick={()=>onNavigate("profile")}>My Profile</button>
        <span className="hub-tab active" aria-current="page"><CalendarDays size={17}/> Leave &amp; Calendar</span>
      </nav>
      <div className="hub-calendar-layout">
        <section className="hub-card hub-calendar-card">
          <div className="hub-calendar-header">
            <div className="hub-card-title"><CalendarDays size={19}/><div><h2>Company holiday calendar</h2>
              <p>Government holidays approved for the company, plus your personal requests.</p></div></div>
            <div className="hub-month-nav">
              <button type="button" aria-label="Previous month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()-1,1))}><ChevronLeft size={18}/></button>
              <strong>{new Intl.DateTimeFormat("en-IN",{month:"long",year:"numeric"}).format(month)}</strong>
              <button type="button" aria-label="Next month" onClick={()=>setMonth(new Date(month.getFullYear(),month.getMonth()+1,1))}><ChevronRight size={18}/></button>
            </div>
          </div>
          <div className="hub-calendar-grid" role="group" aria-label="Monthly leave and holiday calendar">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day=><div key={day} className="hub-calendar-weekday">{day}</div>)}
            {days.map(day=>{
              const holiday=holidayMap.get(day.key);
              const personal=leaveDays.get(day.key);
              const hasApproved=personal?.some(row=>row.status==="approved");
              const isWeeklyOff=day.weekDay===0||(day.weekDay===6&&day.date>=8&&day.date<=14);
              return <button key={day.key} type="button" title={[day.key,holiday?.name,personal?.map(r=>`${r.reason}: ${r.status}`).join(", "),isWeeklyOff?"Weekly off":""].filter(Boolean).join(" · ")}
                aria-label={`${day.key}${holiday?", "+holiday.name:""}${personal?.length?", personal leave "+personal.map(r=>r.status).join(", "):""}`}
                aria-pressed={selectedDate===day.key}
                onClick={()=>setSelectedDate(day.key)}
                className={["hub-calendar-day",!day.inMonth?"out-month":"",holiday?"holiday-day":"",personal?.length?(hasApproved?"personal-approved":"personal-pending"):"",isWeeklyOff?"weekly-off":"",selectedDate===day.key?"selected-day":""].filter(Boolean).join(" ")}>
                <span className="calendar-date-number">{day.date}</span>
                {holiday&&<span className="holiday-glyph" aria-hidden="true">{holidaySymbol(holiday.name)}</span>}
                {personal?.length&&!holiday&&<span className="personal-glyph" aria-hidden="true">{hasApproved?"●":"◌"}</span>}
              </button>;
            })}
          </div>
          <div className="hub-calendar-legend">
            <span><span className="legend-symbol govt">✦</span> Government / company holiday</span>
            <span><span className="legend-symbol personal">●</span> Approved personal leave</span>
            <span><span className="legend-symbol pending">◌</span> Pending personal leave</span>
            <span><span className="legend-symbol weekly">·</span> Weekly off</span>
          </div>
          {chosen&&<div className="hub-selected-date" role="status">
            <strong>{formatDate(selectedDate!)}</strong>
            {chosen.holiday&&<span>Company holiday: {chosen.holiday.name}</span>}
            {chosen.leaves.map(row=><span key={row.id}>Your leave: {row.reason} — {row.status}</span>)}
            {!chosen.holiday&&!chosen.leaves.length&&<span>No leave or company holiday recorded.</span>}
          </div>}
        </section>
        <aside className="hub-policy-card">
          <div className="hub-card-title"><ShieldCheck size={20}/><div><h2>Company leave policy</h2><p>Clear and simple rules</p></div></div>
          <p><CircleCheck size={16}/> Government holidays listed by the company are non-working days.</p>
          <p><Umbrella size={16}/> One eligible exemption day per calendar year.</p>
          <p><Clock3 size={16}/> Further leave requests require CEO approval.</p>
          <div className="hub-quota"><strong>{quota?.remaining??"—"} of 1</strong><span>Exemption day available in {quota?.year??new Date().getFullYear()}</span></div>
          <small>Dates are maintained by company administration. Check official holiday announcements for changes.</small>
        </aside>
      </div>
      {error&&<p className="form-error-banner" role="alert">{error}</p>}
      <div className="hub-leave-bottom">
        <section className="hub-card">
          <div className="hub-card-title"><Send size={19}/><div><h2>Request time off</h2><p>Tell us why and select the dates you need.</p></div></div>
          <form onSubmit={submit} className="hub-leave-form">
            <label>Reason for leave
              <select required value={form.reasonCategory} onChange={event=>setForm({...form,reasonCategory:event.target.value})}>
                <option value="">Select a reason</option>
                {reasons.map(r=><option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </label>
            {(form.reasonCategory==="other"||Boolean(form.reasonCategory))&&
              <label>{form.reasonCategory==="other"?"Please mention your reason (required)":"Additional details (optional)"}
                <textarea rows={3} required={form.reasonCategory==="other"} minLength={form.reasonCategory==="other"?3:undefined}
                  maxLength={1000} placeholder="Give context for your request" value={form.details}
                  onChange={event=>setForm({...form,details:event.target.value})}/>
              </label>}
            <div className="hub-date-range">
              <label>From date<CustomDatePicker required value={form.startDate} onChange={value=>setForm({...form,startDate:value})} placeholder="Start date"/></label>
              <label>To date<CustomDatePicker required value={form.endDate} minDate={form.startDate||undefined} onChange={value=>setForm({...form,endDate:value})} placeholder="End date"/></label>
            </div>
            {requestWorkingDays>0&&<p className="hub-workdays-preview">{requestWorkingDays} scheduled working day(s) requested. {requestWorkingDays===1&&quota?.remaining?"Eligible for your annual exemption.":"Requires CEO approval."}</p>}
            <div className="hub-save-actions">
              <Button variant="secondary" type="button" onClick={()=>setForm({reasonCategory:"",details:"",startDate:"",endDate:""})}>Clear</Button>
              <Button type="submit" disabled={submitting||requestWorkingDays===0}><Send size={15}/> {submitting?"Submitting…":"Submit Request"}</Button>
            </div>
          </form>
        </section>
        <section className="hub-card">
          <div className="hub-card-title"><ShieldCheck size={19}/><div><h2>My leave requests</h2><p>Track exemption days and CEO decisions.</p></div></div>
          {rows.length? <div className="hub-request-list">
            {rows.map(row=><div key={row.id} className="hub-request-row">
              <div><strong>{row.reason}</strong><small>{formatDate(row.startDate)} – {formatDate(row.endDate)}</small></div>
              <span className={`hub-request-status ${row.status}`}>{row.exemptionDay?"Exemption · ":""}{row.status}</span>
            </div>)}
          </div>:<div className="hub-empty-state"><CalendarDays size={44}/><h3>No leave requests yet</h3>
            <p>Your personal leaves and CEO decisions will appear here when you apply.</p></div>}
        </section>
      </div>
    </div>
  );
}
