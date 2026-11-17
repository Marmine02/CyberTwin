// Opt-in E2E diagnostic (E2E_DIAG=1): preloaded into the frontend webServer's node processes via NODE_OPTIONS.
// Records how each process ends, plus a 30 s heartbeat from `vite preview`, in logs/frontend-diag.log:
//   "exit code=N"          -> the process exited by itself (stdin end, signal handler, uncaught error ...)
//   heartbeat just stops   -> killed from outside or a native crash
//   heartbeat gap          -> the whole machine was suspended (e.g. Modern Standby)
const fs = require("fs");
const out = process.env.CT_DIAG_LOG;
const log = (m) => fs.appendFileSync(out, `${new Date().toISOString()} pid=${process.pid} ppid=${process.ppid} ${m}\n`);
const argv = process.argv.slice(1).join(" ").slice(-120);
log(`start ${argv}`);
process.stdin.on("end", () => log(`STDIN END (${argv})`));
process.stdin.on("close", () => log(`stdin close (${argv})`));
process.on("SIGTERM", () => log("SIGTERM"));
for (const s of ["SIGINT", "SIGBREAK", "SIGHUP"]) process.on(s, () => { log(s); process.exit(130); });
process.on("uncaughtException", (e) => { log(`uncaughtException ${e && e.stack}`); process.exit(1); });
process.on("unhandledRejection", (e) => log(`unhandledRejection ${e && e.stack}`));
process.on("exit", (c) => log(`exit code=${c} (${argv})`));
if (/vite\.js preview/.test(argv)) setInterval(() => log("alive"), 30000).unref();
