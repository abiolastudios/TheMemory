type IconProps = { className?: string };

export function CameraIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M9.4 3.5a2 2 0 0 0-1.7.95L6.9 5.8H5A3 3 0 0 0 2 8.8v9.2a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3V8.8a3 3 0 0 0-3-3h-1.9l-.8-1.35a2 2 0 0 0-1.7-.95H9.4ZM12 17.5a4.6 4.6 0 1 1 0-9.2 4.6 4.6 0 0 1 0 9.2Zm0-1.8a2.8 2.8 0 1 0 0-5.6 2.8 2.8 0 0 0 0 5.6Z" />
    </svg>
  );
}

export function PhotosIcon({ className = "h-6 w-6" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className} aria-hidden>
      <rect x="3" y="6" width="14" height="14" rx="3" />
      <path d="M7 3h11a3 3 0 0 1 3 3v11" strokeLinecap="round" />
      <path d="m3.5 17 4-4.2a1.5 1.5 0 0 1 2.2 0L14 17.5" strokeLinejoin="round" />
      <circle cx="12.8" cy="10.2" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function RingIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <circle cx="12" cy="15" r="6" />
      <path d="m9.5 5.5 2.5-3 2.5 3-2.5 3.5-2.5-3.5Z" fill="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} className={className} aria-hidden>
      <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className} aria-hidden>
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} className={className} aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
    </svg>
  );
}
