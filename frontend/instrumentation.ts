export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build" && process.env.KBO_COLLECTOR_ENABLED !== "false") {
    const { startKboCollector } = await import("./lib/kbo/collector");
    startKboCollector();
    const { startKboArchive } = await import("./lib/kbo/archive");
    startKboArchive();
  }
}
