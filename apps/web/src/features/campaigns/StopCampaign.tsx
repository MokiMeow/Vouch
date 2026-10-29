import { StopIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { Campaign } from "../../shared/types";
import { Modal } from "../../shared/ui/Primitives";

export function StopCampaign({
  campaign,
  onCancel,
  onStop,
}: {
  campaign: Campaign;
  onCancel: () => void;
  onStop: () => Promise<void>;
}) {
  const pending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onStop();
      if (mounted.current) onCancel();
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "The stop request failed. Please try again.",
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Stop this campaign?"
      onClose={() => {
        if (!busy) onCancel();
      }}
    >
      <div className="stop-confirmation" aria-busy={busy}>
        <p>
          <strong>{campaign.name}</strong>
        </p>
        <p>
          Queued calls will be cancelled. Active calls will receive a
          cancellation request. Calls with an uncertain provider outcome remain
          under reconciliation.
        </p>
        <p>Your evidence is kept. A stopped campaign cannot be resumed.</p>
        {error && (
          <p className="inline-error" role="alert">
            <WarningCircleIcon size={18} />
            {error}
          </p>
        )}
        <div className="review-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={onCancel}
          >
            Keep campaign
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void confirm()}
          >
            <StopIcon size={16} />
            {busy ? "Requesting stop…" : "Stop campaign"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
