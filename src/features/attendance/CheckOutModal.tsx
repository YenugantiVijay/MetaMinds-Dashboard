import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ClockAlert,
  Coffee,
  Loader2,
  MessageSquareText,
  X,
} from "lucide-react";
import type { CheckoutReason } from "../../types";

export type CheckOutOption = "workday_complete" | "take_break" | "leaving_early" | "other";

export interface CheckOutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmBreak: () => Promise<void>;
  onConfirmCheckout: (
    reason: CheckoutReason,
    note?: string,
    reportData?: { workSummary: string; projectReference?: string; blockers?: string }
  ) => Promise<void>;
}

export function CheckOutModal({
  isOpen,
  onClose,
  onConfirmBreak,
  onConfirmCheckout,
}: CheckOutModalProps) {
  const [selectedOption, setSelectedOption] = useState<CheckOutOption>("workday_complete");
  const [workSummary, setWorkSummary] = useState("");
  const [projectReference, setProjectReference] = useState("");
  const [blockers, setBlockers] = useState("");
  const [showAdditional, setShowAdditional] = useState(false);
  const [explanationNote, setExplanationNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const workSummaryRef = useRef<HTMLTextAreaElement>(null);
  const explanationRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isOpen) {
      setSelectedOption("workday_complete");
      setWorkSummary("");
      setProjectReference("");
      setBlockers("");
      setShowAdditional(false);
      setExplanationNote("");
      setError(null);
      setSubmitting(false);
      setTimeout(() => {
        workSummaryRef.current?.focus();
      }, 60);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, submitting, onClose]);

  // Focus relevant inputs when option changes
  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (selectedOption === "workday_complete") {
      setTimeout(() => workSummaryRef.current?.focus(), 50);
    } else if (selectedOption === "leaving_early" || selectedOption === "other") {
      setTimeout(() => explanationRef.current?.focus(), 50);
    }
  }, [selectedOption, isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;

    setError(null);

    if (selectedOption === "take_break") {
      setSubmitting(true);
      try {
        await onConfirmBreak();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to pause session.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (selectedOption === "workday_complete") {
      const trimmed = workSummary.trim();
      if (!trimmed) {
        setError("Please provide a summary of what you worked on today.");
        workSummaryRef.current?.focus();
        return;
      }
      if (trimmed.length < 20) {
        setError(`Work summary must be at least 20 characters (currently ${trimmed.length}). Please summarize your tasks.`);
        workSummaryRef.current?.focus();
        return;
      }
      if (trimmed.length > 2000) {
        setError("Work summary cannot exceed 2,000 characters.");
        return;
      }

      setSubmitting(true);
      try {
        await onConfirmCheckout("workday_complete", trimmed, {
          workSummary: trimmed,
          projectReference: projectReference.trim() || undefined,
          blockers: blockers.trim() || undefined,
        });
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to complete workday.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (selectedOption === "leaving_early") {
      const trimmed = explanationNote.trim();
      if (!trimmed) {
        setError("Please provide a reason for ending your shift early.");
        explanationRef.current?.focus();
        return;
      }
      if (trimmed.length < 3) {
        setError("Reason must be at least 3 characters.");
        explanationRef.current?.focus();
        return;
      }
      if (trimmed.length > 500) {
        setError("Reason cannot exceed 500 characters.");
        return;
      }

      setSubmitting(true);
      try {
        await onConfirmCheckout("leaving_early", trimmed);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to submit departure reason.");
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (selectedOption === "other") {
      const trimmed = explanationNote.trim();
      if (!trimmed) {
        setError("Please provide an explanation for ending your session.");
        explanationRef.current?.focus();
        return;
      }
      if (trimmed.length < 3) {
        setError("Explanation must be at least 3 characters.");
        explanationRef.current?.focus();
        return;
      }
      if (trimmed.length > 500) {
        setError("Explanation cannot exceed 500 characters.");
        return;
      }

      setSubmitting(true);
      try {
        await onConfirmCheckout("other", trimmed);
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to submit explanation.");
      } finally {
        setSubmitting(false);
      }
    }
  }

  const options: Array<{
    id: CheckOutOption;
    title: string;
    description: string;
    icon: typeof Coffee;
    badge?: string;
  }> = [
    {
      id: "take_break",
      title: "Take a Break",
      description: "Pause your session and return when you're ready.",
      icon: Coffee,
      badge: "Temporary Pause",
    },
    {
      id: "workday_complete",
      title: "Workday Complete",
      description: "Finish your shift and submit today's work summary.",
      icon: CheckCircle2,
    },
    {
      id: "leaving_early",
      title: "Leaving Early",
      description: "End your shift before your scheduled finishing time.",
      icon: ClockAlert,
    },
    {
      id: "other",
      title: "Other Reason",
      description: "Finish your session with an additional explanation.",
      icon: MessageSquareText,
    },
  ];

  return (
    <div
      className="modal-backdrop checkout-modal-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
    >
      <div
        className="modal-dialog checkout-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-modal-title"
        aria-describedby="checkout-modal-desc"
        ref={dialogRef}
      >
        {/* Header */}
        <div className="checkout-modal-header">
          <div className="checkout-header-left">
            <div className="checkout-header-icon-wrap" aria-hidden="true">
              <Clock size={20} className="checkout-clock-icon" />
            </div>
            <div>
              <h2 id="checkout-modal-title" className="checkout-title">
                How would you like to end your session?
              </h2>
              <p id="checkout-modal-desc" className="checkout-subtitle">
                Choose your next step and keep your attendance record accurate.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="checkout-close-btn"
            aria-label="Close dialog"
            onClick={onClose}
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="checkout-modal-form">
          {/* Option Cards */}
          <div className="checkout-cards-group" role="radiogroup" aria-label="Ending options">
            {options.map((opt) => {
              const Icon = opt.icon;
              const isSelected = selectedOption === opt.id;
              return (
                <label
                  key={opt.id}
                  className={`checkout-card ${isSelected ? "selected" : ""}`}
                  htmlFor={`checkout-opt-${opt.id}`}
                >
                  {/* Visually hidden native radio button */}
                  <input
                    type="radio"
                    id={`checkout-opt-${opt.id}`}
                    name="checkout-session-option"
                    value={opt.id}
                    checked={isSelected}
                    onChange={() => {
                      setSelectedOption(opt.id);
                      setError(null);
                    }}
                    className="sr-only"
                    disabled={submitting}
                  />

                  {/* Left: Professionally styled icon */}
                  <div className={`checkout-card-icon ${isSelected ? "icon-active" : ""}`} aria-hidden="true">
                    <Icon size={20} />
                  </div>

                  {/* Center: Title & Description */}
                  <div className="checkout-card-content">
                    <div className="checkout-card-title-row">
                      <span className="checkout-card-title">{opt.title}</span>
                      {opt.badge && <span className="checkout-card-badge">{opt.badge}</span>}
                    </div>
                    <span className="checkout-card-desc">{opt.description}</span>
                  </div>

                  {/* Right: Exactly ONE custom radio circle indicator */}
                  <div className={`checkout-card-radio ${isSelected ? "radio-checked" : ""}`} aria-hidden="true">
                    {isSelected && <span className="radio-inner-dot" />}
                  </div>
                </label>
              );
            })}
          </div>

          {/* Dynamic Form 1: Workday Complete (Mandatory daily summary) */}
          {selectedOption === "workday_complete" && (
            <div className="checkout-form-panel">
              <div className="form-field-header">
                <label htmlFor="daily-work-summary" className="field-title">
                  What did you work on today? <span className="required-star">*</span>
                </label>
                <span className="field-counter" style={{ color: workSummary.trim().length >= 20 ? "#16a34a" : "#64748b" }}>
                  {workSummary.length} / 2,000 (min 20)
                </span>
              </div>
              <p className="field-hint">
                Summarize the tasks, progress, and accomplishments from your workday. Your report will be available to authorized company management.
              </p>
              <textarea
                id="daily-work-summary"
                ref={workSummaryRef}
                rows={4}
                maxLength={2000}
                placeholder="Example: Completed the employee dashboard UI, fixed attendance chart issues, tested the login workflow, and updated project components."
                value={workSummary}
                onChange={(e) => {
                  setWorkSummary(e.target.value);
                  if (error) setError(null);
                }}
                disabled={submitting}
                className="checkout-textarea"
                required
              />

              {/* Optional Collapsible Details */}
              <div className="collapsible-details-section">
                <button
                  type="button"
                  className="collapsible-toggle"
                  onClick={() => setShowAdditional((prev) => !prev)}
                >
                  <span>Additional details</span>
                  {showAdditional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>

                {showAdditional && (
                  <div className="collapsible-content">
                    <div className="collapsible-field">
                      <label htmlFor="project-reference-input" className="collapsible-label">
                        Project or Task Reference (Optional)
                      </label>
                      <input
                        type="text"
                        id="project-reference-input"
                        placeholder="e.g. MM-PROJ-01, Attendance System UI, Sprint 4"
                        value={projectReference}
                        onChange={(e) => setProjectReference(e.target.value)}
                        disabled={submitting}
                        maxLength={255}
                        className="checkout-input"
                      />
                    </div>
                    <div className="collapsible-field">
                      <label htmlFor="blockers-input" className="collapsible-label">
                        Challenges or Blockers (Optional)
                      </label>
                      <textarea
                        id="blockers-input"
                        rows={2}
                        placeholder="Describe any obstacles or dependencies encountered..."
                        value={blockers}
                        onChange={(e) => setBlockers(e.target.value)}
                        disabled={submitting}
                        maxLength={1000}
                        className="checkout-textarea"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Dynamic Form 2: Take a Break */}
          {selectedOption === "take_break" && (
            <div className="checkout-info-banner">
              <Coffee size={18} className="info-banner-icon" />
              <div>
                <strong>Work session will be paused.</strong>
                <p>Your session stays open and your elapsed work time is preserved. Click "Resume Work" on the dashboard when you return.</p>
              </div>
            </div>
          )}

          {/* Dynamic Form 3: Leaving Early */}
          {selectedOption === "leaving_early" && (
            <div className="checkout-form-panel">
              <div className="form-field-header">
                <label htmlFor="checkout-early-reason" className="field-title">
                  Reason for leaving early <span className="required-star">*</span>
                </label>
                <span className="field-counter">{explanationNote.length} / 500</span>
              </div>
              <textarea
                id="checkout-early-reason"
                ref={explanationRef}
                rows={2}
                maxLength={500}
                placeholder="Briefly explain why you're ending your shift early."
                value={explanationNote}
                onChange={(e) => {
                  setExplanationNote(e.target.value);
                  if (error) setError(null);
                }}
                disabled={submitting}
                className="checkout-textarea"
                required
              />
              <p className="field-hint-policy">
                Leaving early records your checkout reason. It does not automatically apply salary deductions or unapproved absences.
              </p>
            </div>
          )}

          {/* Dynamic Form 4: Other Reason */}
          {selectedOption === "other" && (
            <div className="checkout-form-panel">
              <div className="form-field-header">
                <label htmlFor="checkout-other-reason" className="field-title">
                  Please explain <span className="required-star">*</span>
                </label>
                <span className="field-counter">{explanationNote.length} / 500</span>
              </div>
              <textarea
                id="checkout-other-reason"
                ref={explanationRef}
                rows={2}
                maxLength={500}
                placeholder="Briefly describe why you're ending this work session."
                value={explanationNote}
                onChange={(e) => {
                  setExplanationNote(e.target.value);
                  if (error) setError(null);
                }}
                disabled={submitting}
                className="checkout-textarea"
                required
              />
              <p className="field-hint-policy">
                Required for company attendance records and management review.
              </p>
            </div>
          )}

          {/* Inline Error Notice */}
          {error && (
            <div className="checkout-error-banner" role="alert">
              <span>{error}</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="checkout-modal-footer">
            <button
              type="button"
              className="checkout-btn-cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`checkout-btn-primary ${selectedOption === "take_break" ? "btn-amber" : "btn-primary-orange"}`}
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="checkout-spinner" /> Processing...
                </>
              ) : selectedOption === "take_break" ? (
                "Start Break"
              ) : selectedOption === "workday_complete" ? (
                "Submit Report & Check Out"
              ) : selectedOption === "leaving_early" ? (
                "Submit Reason & Check Out"
              ) : (
                "Submit & Check Out"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
