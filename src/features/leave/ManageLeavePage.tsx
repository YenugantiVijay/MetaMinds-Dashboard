import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarCheck2, Check, X } from "lucide-react";
import type { Leave, NotifyFn, User } from "../../types";
import { api, formatDate } from "../../services/api";
import { Button } from "../../components/ui/Button";

export function ManageLeavePage({ user, notify }: {user:User; notify:NotifyFn}) {
  const [rows,setRows]=useState<Leave[]>([]);
  const [busy,setBusy]=useState<number|null>(null);
  const [rejectId,setRejectId]=useState<number|null>(null);
  const [rejection,setRejection]=useState("");
  const [error,setError]=useState("");
  const reload=useCallback(async()=>{
    try {setRows(await api<Leave[]>("/api/leave"));setError("");}
    catch(cause){setError(cause instanceof Error?cause.message:"Unable to load requests.");}
  },[]);
  useEffect(()=>{void reload();},[reload]);
  async function decide(id:number,decision:"approve"|"reject",event?:FormEvent){
    event?.preventDefault();setBusy(id);setError("");
    try {
      await api(`/api/leave/${id}/${decision}`,{method:"POST",
        body:JSON.stringify(decision==="reject"?{reason:rejection}:{})});
      notify(decision==="approve"?"Leave approved.":"Leave rejected.");
      setRejectId(null);setRejection("");await reload();
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to update request.");}
    finally{setBusy(null);}
  }
  return <div className="page-content employee-hub">
    <header className="hub-page-header">
      <div className="hub-heading-icon"><CalendarCheck2 size={25}/></div>
      <div><p className="hub-eyebrow">MANAGEMENT</p><h1>Leave approvals</h1>
        <p>Review personal leave requests without displaying payroll classifications.</p></div>
    </header>
    {error&&<p role="alert" className="form-error-banner">{error}</p>}
    <section className="hub-card">
      <div className="hub-card-title"><CalendarCheck2 size={20}/><div><h2>Employee requests</h2>
        <p>One exemption day is available to each employee per calendar year. Other personal leave requests require CEO approval.</p></div></div>
      {rows.length===0?<div className="hub-empty-state"><CalendarCheck2 size={43}/><h3>No requests yet</h3><p>Requests will appear after employees submit them.</p></div>:
      <div className="table-scroll"><table>
        <thead><tr><th>Employee</th><th>Date range</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.id}>
          <td><strong>{row.name??row.employeeId??"Employee"}</strong><small className="table-sub">{row.employeeId}</small></td>
          <td>{formatDate(row.startDate)} – {formatDate(row.endDate)}</td>
          <td>{row.reason}</td>
          <td><span className={`hub-request-status ${row.status}`}>{row.exemptionDay?"Exemption · ":""}{row.status}</span></td>
          <td>{row.status==="pending"?
            (user.role==="ceo"||!row.requiresCeoApproval&&!row.policyMode)?
              <div className="hub-management-actions">
                <Button type="button" disabled={busy===row.id} onClick={()=>void decide(row.id,"approve")}><Check size={15}/> Approve</Button>
                <Button type="button" variant="secondary" onClick={()=>setRejectId(row.id)}><X size={15}/> Reject</Button>
                {rejectId===row.id&&<form className="hub-reject-form" onSubmit={event=>void decide(row.id,"reject",event)}>
                  <input aria-label="Rejection explanation" required minLength={3} maxLength={500}
                    placeholder="Reason for rejection" value={rejection} onChange={event=>setRejection(event.target.value)} />
                  <Button type="submit" disabled={busy===row.id}>Confirm</Button>
                </form>}
              </div>:<span className="muted-cell">Awaiting CEO decision</span>
          :<span className="muted-cell">—</span>}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
