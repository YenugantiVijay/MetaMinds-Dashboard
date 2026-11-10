import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserRound, Phone, MapPin, ShieldCheck, FileLock2, BriefcaseBusiness, Save } from "lucide-react";
import type { NotifyFn, User } from "../../types";
import { api } from "../../services/api";
import { Button } from "../../components/ui/Button";

type Profile = {
  employeeId: string; fullName: string; email: string; position: string;
  phone: string; address: string; emergencyName: string; emergencyRelationship: string;
  emergencyPhone: string; updatedAt: string | null;
};
const empty: Profile = {
  employeeId: "", fullName: "", email: "", position: "", phone: "", address: "",
  emergencyName: "", emergencyRelationship: "", emergencyPhone: "", updatedAt: null,
};
export function EmployeeProfilePage({ user, notify, onNavigate }: {
  user: User; notify: NotifyFn; onNavigate: (section: "leave") => void;
}) {
  const [form, setForm] = useState<Profile>(empty);
  const [original, setOriginal] = useState<Profile>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const profile = await api<Profile>("/api/me/profile");
      setForm(profile); setOriginal(profile); setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profile could not be loaded.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function update(key: keyof Profile, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      await api("/api/me/profile", { method: "POST", body: JSON.stringify({
        phone: form.phone, address: form.address,
        emergencyName: form.emergencyName, emergencyRelationship: form.emergencyRelationship,
        emergencyPhone: form.emergencyPhone,
      }) });
      notify("Your contact and emergency details were saved.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save profile."); }
    finally { setSaving(false); }
  }
  if (loading) return <div className="page-content"><p>Loading your profile…</p></div>;
  return (
    <div className="page-content employee-hub">
      <header className="hub-page-header">
        <div className="hub-heading-icon"><UserRound size={26} aria-hidden="true" /></div>
        <div><p className="hub-eyebrow">MY WORKSPACE</p>
          <h1>My Profile</h1>
          <p>Keep your contact details accurate and securely manage your employee information.</p></div>
      </header>
      <nav className="hub-tabbar" aria-label="Employee self-service">
        <span className="hub-tab active" aria-current="page"><UserRound size={17}/> My Profile</span>
        <button className="hub-tab" type="button" onClick={() => onNavigate("leave")}>Leave &amp; Calendar</button>
      </nav>
      {error && <p role="alert" className="form-error-banner">{error}</p>}
      <form className="hub-profile-grid" onSubmit={save}>
        <section className="hub-card">
          <div className="hub-card-title"><UserRound size={19} aria-hidden="true"/><div><h2>Personal information</h2><p>Your official company identity is verified by management.</p></div></div>
          <div className="hub-form-grid">
            <label>Full name<input value={form.fullName} readOnly aria-readonly="true" title="Contact management for legal name corrections" /></label>
            <label>Employee ID<input value={form.employeeId} readOnly aria-readonly="true" /></label>
            <label>Work email<input value={form.email} readOnly aria-readonly="true" /></label>
            <label>Job title<input value={form.position} readOnly aria-readonly="true" /></label>
          </div>
          <p className="hub-footnote"><ShieldCheck size={15}/> Identity, job title and company email changes require verification by management.</p>
        </section>
        <section className="hub-card">
          <div className="hub-card-title"><Phone size={19} aria-hidden="true"/><div><h2>Contact information</h2><p>Where the company can reach you.</p></div></div>
          <div className="hub-form-grid">
            <label>Phone number<input type="tel" maxLength={20} value={form.phone} onChange={(event)=>update("phone",event.target.value)} placeholder="+91 98765 43210" /></label>
            <label className="hub-field-wide">Address<textarea rows={3} maxLength={600} value={form.address} onChange={(event)=>update("address",event.target.value)} placeholder="Enter your current address" /></label>
          </div>
        </section>
        <section className="hub-card">
          <div className="hub-card-title"><MapPin size={19} aria-hidden="true"/><div><h2>Emergency contact</h2><p>A trusted contact in case of an emergency.</p></div></div>
          <div className="hub-form-grid">
            <label>Contact name<input maxLength={100} value={form.emergencyName} onChange={(event)=>update("emergencyName",event.target.value)} placeholder="Full name" /></label>
            <label>Relationship<input maxLength={50} value={form.emergencyRelationship} onChange={(event)=>update("emergencyRelationship",event.target.value)} placeholder="e.g. Parent, spouse" /></label>
            <label>Contact number<input type="tel" maxLength={20} value={form.emergencyPhone} onChange={(event)=>update("emergencyPhone",event.target.value)} placeholder="Contact phone number" /></label>
          </div>
        </section>
        <section className="hub-card">
          <div className="hub-card-title"><FileLock2 size={19} aria-hidden="true"/><div><h2>Documents &amp; certificates</h2><p>Protected employment verification</p></div></div>
          <div className="hub-restricted">
            <ShieldCheck size={24} aria-hidden="true" />
            <div><strong>Private document collection</strong><p>Certificates, PAN, bank details and identity proof require a dedicated encrypted upload and authorized verification workflow. This portal does not accept these sensitive documents through ordinary profile fields.</p></div>
          </div>
          <p className="hub-footnote">For verified updates, contact your authorized administrator. Do not send identity documents through public forms.</p>
        </section>
        <div className="hub-save-bar">
          <div><BriefcaseBusiness size={17} aria-hidden="true"/> Changes are recorded with an audit event.</div>
          <div className="hub-save-actions">
            <Button type="button" variant="secondary" onClick={()=>{setForm(original);setError("");}} disabled={saving}>Discard</Button>
            <Button type="submit" disabled={saving}><Save size={16} aria-hidden="true"/> {saving?"Saving…":"Save Changes"}</Button>
          </div>
        </div>
      </form>
    </div>
  );
}
