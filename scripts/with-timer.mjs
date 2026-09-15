// Runs the given shell command, printing a running elapsed-time tick every
// 10s while it's in progress, plus a final elapsed time when it finishes
// (or fails). Usage: node scripts/with-timer.mjs "<command>"
import { spawn } from "node:child_process";

const TICK_MS = 10_000;

/** Formats a duration in milliseconds as "Xm Ys". */
const formatElapsed = (ms) => {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
};

const command = process.argv[2];
const start = Date.now();

let tickShown = false;

/** Clears the in-progress tick line, if one is currently drawn. */
const clearTick = () => {
  if (tickShown) {
    process.stdout.write("\r\x1b[2K");
    tickShown = false;
  }
};

/** Redraws the tick line with the current elapsed time. */
const drawTick = () => {
  process.stdout.write(`⏱  still running... ${formatElapsed(Date.now() - start)}`);
  tickShown = true;
};

const tick = setInterval(() => {
  clearTick();
  drawTick();
}, TICK_MS);

const child = spawn(command, { stdio: ["inherit", "pipe", "pipe"], shell: true });

child.stdout.on("data", (data) => {
  clearTick();
  process.stdout.write(data);
});

child.stderr.on("data", (data) => {
  clearTick();
  process.stderr.write(data);
});

child.on("exit", (code) => {
  clearInterval(tick);
  clearTick();
  const elapsed = formatElapsed(Date.now() - start);
  if (code === 0) {
    console.log(`⏱  Done in ${elapsed}`);
  } else {
    console.error(`⏱  Failed after ${elapsed}`);
  }
  process.exit(code ?? 1);
});
