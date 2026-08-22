"use client";

export type Toast = { id: number; text: string; icon: string };

export function Toasts({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <p className="toast" key={toast.id}>
          <span className="toast-icon" aria-hidden="true">{toast.icon}</span>
          {toast.text}
        </p>
      ))}
    </div>
  );
}
