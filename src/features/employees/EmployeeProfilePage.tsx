import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { UserRound, Phone, MapPin, ShieldCheck, FileLock2, BriefcaseBusiness, Save, Camera, Upload, X } from "lucide-react";
import type { NotifyFn, User } from "../../types";
import { api } from "../../services/api";
import { Button } from "../../components/ui/Button";

const ALLOWED_PHOTO_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the selected image."));
    };
    reader.onerror = () => reject(new Error("Could not read the selected image."));
    reader.readAsDataURL(file);
  });
}

type Profile = {
  employeeId: string; fullName: string; email: string; position: string;
  photoUrl: string | null;
  phone: string; address: string; emergencyName: string; emergencyRelationship: string;
  emergencyPhone: string; updatedAt: string | null;
};
const empty: Profile = {
  employeeId: "", fullName: "", email: "", position: "", photoUrl: null, phone: "", address: "",
  emergencyName: "", emergencyRelationship: "", emergencyPhone: "", updatedAt: null,
};
export function EmployeeProfilePage({ user, notify, onPhotoChange }: {
  user: User; notify: NotifyFn; onPhotoChange?: (photoUrl: string | null) => void;
}) {
  const [form, setForm] = useState<Profile>(empty);
  const [original, setOriginal] = useState<Profile>(empty);
  const [photoUrl, setPhotoUrl] = useState<string | null>(user.photoUrl ?? null);
  const [headerPhotoFailed, setHeaderPhotoFailed] = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);
  const [photoSaving, setPhotoSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const profile = await api<Profile>("/api/me/profile");
      setForm(profile); setOriginal(profile);
      setPhotoUrl(profile.photoUrl ?? null);
      setHeaderPhotoFailed(false);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Profile could not be loaded.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  function update(key: keyof Profile, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function uploadPhoto(file: File) {
    if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
      setError("Please choose a valid image file (JPG, PNG, or WebP).");
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError("Profile image must be less than 2MB.");
      return;
    }
    setPhotoSaving(true);
    setError("");
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = await api<{ ok: boolean; photoUrl: string | null }>("/api/me/profile/photo", {
        method: "POST",
        body: JSON.stringify({ photoUrl: dataUrl }),
      });
      setPhotoUrl(result.photoUrl);
      setHeaderPhotoFailed(false);
      onPhotoChange?.(result.photoUrl);
      notify("Your profile image was updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update profile image.");
    } finally {
      setPhotoSaving(false);
    }
  }

  async function removePhoto() {
    setPhotoSaving(true);
    setError("");
    try {
      const result = await api<{ ok: boolean; photoUrl: string | null }>("/api/me/profile/photo", {
        method: "POST",
        body: JSON.stringify({ photoUrl: null }),
      });
      setPhotoUrl(result.photoUrl);
      setHeaderPhotoFailed(false);
      onPhotoChange?.(result.photoUrl);
      notify("Your profile image was removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to remove profile image.");
    } finally {
      setPhotoSaving(false);
    }
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
  const activePhotoUrl = photoUrl && !headerPhotoFailed ? photoUrl : null;
  if (loading) return <div className="page-content"><p>Loading your profile…</p></div>;
  return (
    <div className="page-content employee-hub">
      <header className="hub-page-header">
        <div className={`hub-heading-icon ${activePhotoUrl ? "has-photo" : ""}`}>
          {activePhotoUrl ? (
            <img
              src={activePhotoUrl}
              alt={`${user.name} profile`}
              className="hub-heading-photo"
              onError={() => setHeaderPhotoFailed(true)}
            />
          ) : (
            <UserRound size={26} aria-hidden="true" />
          )}
        </div>
        <div><p className="hub-eyebrow">MY WORKSPACE</p>
          <h1>My Profile</h1>
          <p>Keep your contact details accurate and securely manage your employee information, {user.name}.</p></div>
      </header>
      {error && <p role="alert" className="form-error-banner">{error}</p>}
      <section
        className={`hub-card hub-photo-card ${photoDragOver ? "photo-card-dragover" : ""} ${activePhotoUrl ? "photo-card-filled" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!photoSaving) setPhotoDragOver(true);
        }}
        onDragLeave={() => setPhotoDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setPhotoDragOver(false);
          const file = event.dataTransfer.files?.[0];
          if (file && !photoSaving) void uploadPhoto(file);
        }}
      >
        <div className="hub-card-title">
          <Camera size={19} aria-hidden="true" />
          <div>
            <h2>Profile photo</h2>
            <p>Upload a profile image so it appears on your profile header, top bar, and team directory.</p>
          </div>
        </div>
        <div className="photo-card-body">
          <div
            className="photo-avatar-wrap"
            role="button"
            tabIndex={0}
            aria-label={activePhotoUrl ? "Change profile photo" : "Upload profile photo"}
            title={activePhotoUrl ? "Click to change profile photo" : "Click to upload profile photo"}
            onClick={() => { if (!photoSaving) fileInputRef.current?.click(); }}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !photoSaving) {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
          >
            {activePhotoUrl ? (
              <img src={activePhotoUrl} alt={`${user.name} profile preview`} className="photo-avatar-img" />
            ) : (
              <div className="photo-avatar-placeholder">
                <UserRound size={36} className="photo-avatar-icon" aria-hidden="true" />
              </div>
            )}
            <span className="photo-avatar-badge" aria-hidden="true">
              <Camera size={13} />
            </span>
          </div>
          <div className="photo-meta-col">
            <input
              ref={fileInputRef}
              type="file"
              id="profile-photo-upload"
              aria-label="Upload profile photo"
              accept="image/png, image/jpeg, image/jpg, image/webp"
              style={{ display: "none" }}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void uploadPhoto(file);
              }}
            />
            <div className="photo-action-buttons">
              <Button
                type="button"
                variant="secondary"
                className="photo-upload-btn"
                disabled={photoSaving}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={14} aria-hidden="true" />
                {photoSaving ? "Saving…" : activePhotoUrl ? "Change photo" : "Upload photo"}
              </Button>
              {activePhotoUrl && (
                <Button
                  type="button"
                  variant="quiet"
                  className="photo-remove-btn"
                  disabled={photoSaving}
                  onClick={() => void removePhoto()}
                >
                  <X size={14} aria-hidden="true" /> Remove
                </Button>
              )}
            </div>
            <div className="photo-guidelines">
              <span>JPG, PNG or WebP</span>
              <span aria-hidden="true">•</span>
              <span>Max 2 MB</span>
              <span aria-hidden="true">•</span>
              <span>Click or drag and drop to upload</span>
            </div>
          </div>
        </div>
      </section>
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
