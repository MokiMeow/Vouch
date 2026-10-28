import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  CheckCircleIcon,
  PlusIcon,
  ShieldCheckIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
} from "react";
import type { Navigate } from "../types";
function plainLeftClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey
  );
}
export function Link({
  to,
  navigate,
  children,
  className = "",
  ...props
}: Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  to: string;
  navigate: Navigate;
}) {
  function click(e: MouseEvent<HTMLAnchorElement>) {
    props.onClick?.(e);
    if (e.defaultPrevented || !plainLeftClick(e)) return;
    if (!["", "_self"].includes(e.currentTarget.target)) return;
    if (e.currentTarget.hasAttribute("download")) return;
    e.preventDefault();
    navigate(to);
  }
  return (
    <a {...props} href={to} onClick={click} className={className}>
      {children}
    </a>
  );
}
export function Brand({ navigate }: { navigate: Navigate }) {
  return (
    <Link
      to="/"
      navigate={navigate}
      className="brand"
      aria-label="Vouch home"
      draggable={false}
    >
      <img
        src="/brand/vouch-mark.webp"
        width="48"
        height="48"
        alt=""
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      />
      <span>vouch</span>
    </Link>
  );
}
export function CreditsLink({
  navigate,
  size = 14,
}: {
  navigate: Navigate;
  size?: number;
}) {
  return (
    <Link to="/credits" navigate={navigate}>
      Credits & assets <ArrowUpRightIcon size={size} />
    </Link>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}
export function Empty({
  title,
  text,
  button,
  action,
}: {
  title: string;
  text: string;
  button?: string;
  action?: () => void;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark">
        <ShieldCheckIcon size={30} weight="light" />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {button && action && (
        <button className="button primary" onClick={action}>
          <PlusIcon />
          {button}
          <ArrowRightIcon />
        </button>
      )}
    </div>
  );
}
export function Notice({
  kind,
  message,
  close,
}: {
  kind: "error" | "success";
  message: string;
  close: () => void;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={`notice ${kind}`}
    >
      {kind === "error" ? (
        <WarningCircleIcon size={20} />
      ) : (
        <CheckCircleIcon size={20} />
      )}
      <span>{message}</span>
      <button
        className="icon-button"
        aria-label={`Dismiss ${kind === "error" ? "error" : "notification"}`}
        onClick={close}
      >
        <XIcon size={18} />
      </button>
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = scroll;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-heading">
        <span className="eyebrow">VOUCH WORKSPACE</span>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <XIcon size={22} />
        </button>
        <h2 id="modal-title">{title}</h2>
      </div>
      {children}
    </dialog>
  );
}
export function ArrowLink({
  children,
  action,
}: {
  children: ReactNode;
  action: () => void;
}) {
  return (
    <button className="text-button" onClick={action}>
      {children}
      <ArrowUpRightIcon size={17} />
    </button>
  );
}
