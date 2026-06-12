interface PlaceholderProps {
  title: string;
  blurb: string;
}

export function Placeholder({ title, blurb }: PlaceholderProps) {
  return (
    <div className="border border-pitch-300 bg-paper p-8 sm:p-12">
      <p className="font-mono text-[10px] uppercase tracking-widest text-pitch-700">
        Coming next
      </p>
      <h2 className="mt-2 font-display text-4xl font-black leading-none tracking-tightest text-pitch-950 sm:text-5xl">
        {title}
      </h2>
      <p className="mt-4 max-w-xl font-display text-lg italic text-pitch-700">
        {blurb}
      </p>
    </div>
  );
}
