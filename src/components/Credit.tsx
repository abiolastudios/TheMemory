const DEVELOPER = { name: "Abiolas Studio", url: "https://techallowed.cloud" };

export function Credit({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] tracking-wide ${className}`}>
      Developed by{" "}
      <a href={DEVELOPER.url} target="_blank" rel="noopener" className="font-medium underline-offset-2 hover:underline">
        {DEVELOPER.name}
      </a>
    </p>
  );
}
