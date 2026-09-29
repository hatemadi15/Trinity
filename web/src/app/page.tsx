export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm uppercase tracking-[0.3em] text-zinc-400">NASA Space Apps 2026 · Astroy/Ed</p>
      <h1 className="text-5xl font-semibold tracking-tight">Earthrise</h1>
      <p className="text-lg text-zinc-300">
        Pick a lunar landing site and a date in 60 seconds. See exactly when the Sun powers you and
        when Earth can hear you.
      </p>
      <p className="text-sm text-zinc-500">
        Engine status: TypeScript port of the LOLA / SPICE pipeline in progress (Week 2).
      </p>
    </main>
  );
}
