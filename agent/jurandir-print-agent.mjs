import net from "node:net";
import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const API = process.env.JURANDIR_API_URL;
const TOKEN = process.env.PRINT_AGENT_TOKEN;
const TRANSPORT = (process.env.PRINTER_TRANSPORT || "windows").toLowerCase();
const POLL = Number(process.env.POLL_MS || 3000);

// network (impressora com IP)
const IP = process.env.PRINTER_IP;
const PORT = Number(process.env.PRINTER_PORT || 9100);
// windows (USB/serial: impressora instalada e COMPARTILHADA no Windows)
const SHARE = process.env.PRINTER_SHARE;

function configError() {
  if (!API || !TOKEN) return "Configure JURANDIR_API_URL e PRINT_AGENT_TOKEN.";
  if (TRANSPORT === "network" && !IP) return "PRINTER_TRANSPORT=network exige PRINTER_IP.";
  if (TRANSPORT === "windows" && !SHARE)
    return "PRINTER_TRANSPORT=windows exige PRINTER_SHARE (nome da impressora compartilhada no Windows).";
  return null;
}
const cfgErr = configError();
if (cfgErr) {
  console.error(cfgErr, "\nVeja .env.example.");
  process.exit(1);
}

/** Impressora de rede: envia os bytes ESC/POS via TCP (porta 9100). */
function printNetwork(buf) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, IP, () => sock.write(buf, () => sock.end()));
    sock.on("close", resolve);
    sock.on("error", reject);
    sock.setTimeout(10000, () => {
      sock.destroy();
      reject(new Error("timeout"));
    });
  });
}

/** USB/serial no Windows: envia os bytes raw para a impressora compartilhada (bypassa o driver). */
async function printWindows(buf) {
  const tmp = join(tmpdir(), `jur-${Date.now()}-${process.pid}.bin`);
  await writeFile(tmp, buf);
  try {
    await new Promise((resolve, reject) => {
      execFile("cmd", ["/c", `copy /b "${tmp}" "\\\\localhost\\${SHARE}"`], (e, _o, stderr) => {
        if (e) reject(new Error((stderr || e.message).trim()));
        else resolve();
      });
    });
  } finally {
    await unlink(tmp).catch(() => {});
  }
}

const printBytes = TRANSPORT === "windows" ? printWindows : printNetwork;

async function ack(jobId, ok, error) {
  await fetch(`${API}/api/print/ack`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-print-token": TOKEN },
    body: JSON.stringify({ jobId, ok, error }),
  }).catch(() => {});
}

async function tick() {
  let jobs = [];
  try {
    const res = await fetch(`${API}/api/print/jobs`, { headers: { "x-print-token": TOKEN } });
    if (!res.ok) {
      console.error("poll", res.status);
      return;
    }
    jobs = (await res.json()).jobs ?? [];
  } catch (e) {
    console.error("poll erro:", e.message);
    return;
  }
  for (const job of jobs) {
    try {
      await printBytes(Buffer.from(job.payloadB64, "base64"));
      await ack(job.id, true);
      console.log("impresso:", job.id);
    } catch (e) {
      await ack(job.id, false, e.message);
      console.error("falha ao imprimir", job.id, "-", e.message);
    }
  }
}

console.log(`Jurandir print agent [${TRANSPORT}] · poll ${POLL}ms`);
setInterval(tick, POLL);
tick();
