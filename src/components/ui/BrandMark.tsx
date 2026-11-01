export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <div className={`brand-header-lockup ${className}`} aria-label="MetaMinds Pvt. Ltd.">
      <div className="brand-logo-tile">
        <img
          src="/meta-minds-pvt-ltd.png"
          alt="MetaMinds Pvt. Ltd."
          className="brand-logo-img"
        />
      </div>
      <div className="brand-text-stack">
        <span className="brand-title-bold">MetaMinds</span>
        <span className="brand-title-sub">Pvt. Ltd.</span>
      </div>
    </div>
  );
}
