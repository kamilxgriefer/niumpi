"use client";

export function SpeechBubble({ message }: { message: string }) {
  return (
    <div className="speech-bubble">
      <p className="speech-text" aria-live="polite">{message}</p>
      <span className="speech-spark" aria-hidden="true">✦</span>
    </div>
  );
}
