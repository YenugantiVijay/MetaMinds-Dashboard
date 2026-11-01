import { CreditCard, ShieldCheck } from "lucide-react";
import { PageHeader } from "../../components/ui/PageHeader";

export function PayrollPage() {
  return (
    <div className="page-content">
      <PageHeader
        title="Payroll & compensation"
        subtitle="Payroll calculations and disbursement are unavailable until company-approved compensation and statutory policies are configured."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              <CreditCard size={19} style={{ verticalAlign: "middle", marginRight: 8 }} />
              Payroll is safely disabled
            </h2>
            <p>MetaMinds will not estimate salaries, deductions, tax, payable days or payment status.</p>
          </div>
          <span className="status-pill status-inactive">Not configured</span>
        </div>
        <div className="notice notice-warning compact-notice">
          <ShieldCheck size={18} />
          <div>
            <strong>Configuration required before payroll can be enabled</strong>
            <p>
              Company-approved salary structures, effective dates, attendance and leave treatment, applicable
              statutory deductions, tax rules, payment reconciliation and audit controls must be implemented
              and reviewed first.
            </p>
          </div>
        </div>
        <div className="empty-state">
          <div className="empty-icon">
            <CreditCard size={24} />
          </div>
          <strong>No payroll has been calculated or disbursed</strong>
          <p>
            This is intentional. No figures on this screen should be treated as an employee pay statement or
            payment confirmation.
          </p>
        </div>
      </section>
    </div>
  );
}
