// Browser working-set sampling, per host OS.
//
// Windows keeps the original measurement exactly (summed WorkingSet64 of the
// browser-server process tree). On macOS, the WebKit content/network/GPU
// processes are XPC services launched by launchd, not descendants of the
// browser, so a parent walk would silently undercount. They are attributed by
// executable path instead, and only one browser family runs at a time.
//
// Units: WorkingSet64 is bytes on every platform. On macOS/Linux it is ps RSS
// (KiB * 1024): resident pages, shared pages counted once per process, and NOT
// compressed memory -- macOS can compress a page out of RSS, so RSS is a lower
// bound on footprint there. It is the closest available analogue of the
// Windows working set the baseline used, not the same quantity.
import {execFileSync} from 'node:child_process';
import {basename} from 'node:path';

export const SAFARI = /\/Safari\.app\/|\/com\.apple\.WebKit\.(WebContent|Networking|GPU)\.xpc\/|\/com\.apple\.Safari\.[A-Za-z]+\.xpc\//;
const PLAYWRIGHT = /ms-playwright/;
const SIMULATOR = /CoreSimulator/;
export const SIMULATED_SAFARI = /\/MobileSafari\.app\/|\/com\.apple\.WebKit\.(WebContent|Networking|GPU)\.xpc\//;

export function parsePs(text) {
  return text.split('\n').filter(l => l.trim()).map(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) throw Error('unparseable ps row: ' + line);
    return {pid: +m[1], ppid: +m[2], rssBytes: +m[3] * 1024, command: m[4]};
  });
}

export function descendants(rows, root) {
  const ids = new Set([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of rows) if (ids.has(r.ppid) && !ids.has(r.pid)) { ids.add(r.pid); grew = true; }
  }
  return rows.filter(r => ids.has(r.pid));
}

/** Select one engine's processes from a ps snapshot. Pure, for tests. */
export function select(rows, engine, rootPid, self = -1) {
  let chosen;
  if (engine === 'safari') chosen = rows.filter(r => SAFARI.test(r.command) && !PLAYWRIGHT.test(r.command) && !SIMULATOR.test(r.command));
  else if (engine === 'ios-simulator') chosen = rows.filter(r => SIMULATOR.test(r.command) && SIMULATED_SAFARI.test(r.command));
  else {
    const tree = descendants(rows, rootPid);
    const ids = new Set(tree.map(r => r.pid));
    chosen = [...tree, ...rows.filter(r => PLAYWRIGHT.test(r.command) && !ids.has(r.pid))];
  }
  return chosen.filter(r => r.pid !== self && r.rssBytes > 0)
    .map(r => ({Id: r.pid, ProcessName: basename(r.command.split(' ')[0]), WorkingSet64: r.rssBytes, command: r.command.slice(0, 300)}));
}

export function browserProcesses(engine, rootPid) {
  try {
    if (process.platform === 'win32') {
      return JSON.parse(execFileSync('powershell', ['-NoProfile', '-Command', `$p = @(Get-CimInstance Win32_Process); $ids = @(${rootPid}); do { $more = @($p | Where-Object { $_.ParentProcessId -in $ids -and $_.ProcessId -notin $ids } | ForEach-Object ProcessId); $ids += $more } while ($more.Count); $rows = @(Get-Process -Id $ids -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,WorkingSet64); ConvertTo-Json -Compress -InputObject $rows`], {encoding: 'utf8'}));
    }
    const rows = parsePs(execFileSync('ps', ['-axww', '-o', 'pid=,ppid=,rss=,command='], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}));
    return select(rows, engine, rootPid, process.pid);
  } catch (e) { return {error: e.message}; }
}

export const workingSetMetric = process.platform === 'win32'
  ? 'Windows WorkingSet64 summed over the browser-server process tree'
  : `${process.platform} ps RSS (KiB*1024) summed over the engine's processes, attributed by executable path`;
