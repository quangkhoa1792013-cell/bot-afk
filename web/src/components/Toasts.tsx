interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'otp' | 'error';
}

/** Thông báo nổi góc phải. */
export default function Toasts({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[320px] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in pointer-events-auto rounded-xl border px-3.5 py-2.5 text-[13px] shadow-lg backdrop-blur
            ${t.kind === 'otp'
              ? 'border-amber-400/50 bg-amber-500/15 text-amber-100'
              : t.kind === 'error'
                ? 'border-red-400/50 bg-red-500/15 text-red-100'
                : 'border-white/15 bg-[#1a1e26]/95 text-gray-200'}`}
          dangerouslySetInnerHTML={{ __html: t.text }}
        />
      ))}
    </div>
  );
}