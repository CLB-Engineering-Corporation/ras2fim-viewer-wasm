// Real Safari (desktop, or Mobile Safari in an iOS Simulator) through Apple's
// safaridriver, exposing exactly the subset of the Playwright surface that
// driver.mjs and driver-probes.mjs use. Nothing measured changes: timings are
// still in-page performance.now() stamps taken by the same instrumentation, and
// the session design (fresh context per trial, cold then warm navigation, 80
// switches, three sliders per switch, stress/recovery) is the driver's own.
//
// What WebDriver cannot do, and how each gap is closed:
//
// * No init scripts. The page-side Worker counter and error capture are
//   injected into served HTML by the acceptance server instead (`inject`).
//   They run before any page script, as addInitScript would.
// * No console/pageerror events. An injected capture records console.error,
//   uncaught errors and unhandled rejections; every command drains it. Engine
//   console messages the page cannot observe (Playwright would report them)
//   are not captured -- a recorded limitation, not silence.
// * No network events. The acceptance server records every >= 400 response and
//   every response the client abandoned; those become `response` and
//   `requestfailed` events. That sees every request the page and its workers
//   make, because they all go to that one server.
// * One session at a time. A context is one WebDriver session; closing it ends
//   the session, so each trial is a fresh Safari automation session.
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import assert from 'node:assert/strict';

export const CAPTURE = `(function(){if(window.__pageErrors)return;var E=window.__pageErrors=[];
var text=function(x){try{return typeof x==='string'?x:(x&&x.stack)||JSON.stringify(x);}catch(e){return String(x);}};
var ce=console.error.bind(console);console.error=function(){E.push({type:'console',text:Array.prototype.map.call(arguments,text).join(' ')});return ce.apply(null,arguments);};
addEventListener('error',function(e){if(e.target&&e.target!==window){E.push({type:'console',text:'resource error: '+(e.target.src||e.target.href||e.target.tagName)});return;}E.push({type:'pageerror',message:String(e.message)});},true);
addEventListener('unhandledrejection',function(e){E.push({type:'pageerror',message:text(e.reason)});});})();`;

const ELEMENT = 'element-6066-11e4-a52e-4f735466cecf';

async function call(base, method, path, body) {
  const res = await fetch(base + path, {method, headers: {'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.value?.error) throw Error(`WebDriver ${method} ${path}: ${res.status} ${JSON.stringify(json.value ?? json).slice(0, 2000)}`);
  return json.value;
}

// Runs in the page. arguments: [functionSource, argJSON, callback].
const EXECUTE = `var src=arguments[0],arg=JSON.parse(arguments[1]),done=arguments[arguments.length-1];
var take=function(){return (window.__pageErrors||[]).splice(0);};
var fn;try{fn=(0,eval)('('+src+')');}catch(e){done({ok:false,error:'compile: '+e,errors:take()});return;}
Promise.resolve().then(function(){return fn(arg);}).then(function(v){done({ok:true,value:JSON.stringify(v===undefined?null:v),errors:take()});},function(e){done({ok:false,error:String(e&&e.stack||e),errors:take()});});`;

// Polls a predicate in the page for up to `slice` ms, as waitForFunction does.
const POLL = `var src=arguments[0],arg=JSON.parse(arguments[1]),slice=arguments[2],done=arguments[arguments.length-1];
var take=function(){return (window.__pageErrors||[]).splice(0);};
var fn=(0,eval)('('+src+')'),end=performance.now()+slice;
(function poll(){Promise.resolve().then(function(){return fn(arg);}).then(function(v){
 if(v){done({ok:true,met:true,errors:take()});}else if(performance.now()>=end){done({ok:true,met:false,errors:take()});}else setTimeout(poll,10);
},function(e){done({ok:false,error:String(e&&e.stack||e),errors:take()});});})();`;

class Page {
  constructor(context, session) {
    this.context = context; this.session = session; this.handlers = {};
    this.base = context.browser.endpoint + '/session/' + session;
  }
  on(event, handler) { (this.handlers[event] ||= []).push(handler); }
  dispatch(errors) {
    for (const e of errors || []) {
      if (e.type === 'console') for (const h of this.handlers.console || []) h({type: () => 'error', text: () => e.text});
      if (e.type === 'pageerror') for (const h of this.handlers.pageerror || []) h({message: e.message});
    }
    const server = this.context.browser.server;
    for (; this.serverCursor < server.events.length; this.serverCursor++) {
      const e = server.events[this.serverCursor];
      if (e.type === 'response') for (const h of this.handlers.response || []) h({status: () => e.status, url: () => e.url});
      if (e.type === 'requestfailed') for (const h of this.handlers.requestfailed || []) h({url: () => e.url, failure: () => ({errorText: e.errorText})});
    }
  }
  async goto(url) {
    await call(this.base, 'POST', '/url', {url});
    await this.evaluate(() => null);
  }
  async evaluate(fn, arg) {
    const r = await call(this.base, 'POST', '/execute/async', {script: EXECUTE, args: [fn.toString(), JSON.stringify(arg ?? null)]});
    this.dispatch(r.errors);
    if (!r.ok) throw Error('evaluate: ' + r.error);
    return JSON.parse(r.value);
  }
  async waitForFunction(fn, arg, options = {}) {
    const timeout = options?.timeout ?? 30000, end = Date.now() + timeout;
    for (;;) {
      const slice = Math.max(1, Math.min(1000, end - Date.now()));
      const r = await call(this.base, 'POST', '/execute/async', {script: POLL, args: [fn.toString(), JSON.stringify(arg ?? null), slice]});
      this.dispatch(r.errors);
      if (!r.ok) throw Error('waitForFunction: ' + r.error);
      if (r.met) return true;
      if (Date.now() >= end) throw Error(`waitForFunction: timeout ${timeout}ms exceeded`);
    }
  }
  locator(selector) {
    return {
      getAttribute: name => this.evaluate(([s, n]) => document.querySelector(s)?.getAttribute(n) ?? null, [selector, name]),
      evaluateAll: fn => this.evaluate(([s, src]) => (0, eval)('(' + src + ')')(Array.from(document.querySelectorAll(s))), [selector, fn.toString()]),
    };
  }
  async addScriptTag({url}) {
    await this.evaluate(url => new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = url; s.onload = () => resolve(null); s.onerror = () => reject(Error('script load ' + url));
      document.head.append(s);
    }), url);
  }
  waitForTimeout(ms) { return sleep(ms); }
}

class Context {
  constructor(browser, options) { this.browser = browser; this.options = options || {}; this.inits = []; this.pages = []; }
  async addInitScript(fn) { this.inits.push(`(${fn.toString()})();`); }
  async newPage() {
    assert.equal(this.session, undefined, 'one page per Safari session');
    this.browser.server.inject([CAPTURE, ...this.inits].join('\n'));
    const value = await call(this.browser.endpoint, 'POST', '/session', {capabilities: {alwaysMatch: this.browser.capabilities}});
    this.session = value.sessionId; this.browser.lastCapabilities = value.capabilities;
    const page = new Page(this, this.session);
    page.serverCursor = this.browser.server.events.length;
    await call(page.base, 'POST', '/timeouts', {script: 180000, pageLoad: 120000});
    const size = this.options.viewport;
    if (size && this.browser.capabilities.platformName !== 'iOS') {
      await call(page.base, 'POST', '/window/rect', {width: size.width, height: size.height});
    }
    this.pages.push(page);
    return page;
  }
  async close() {
    try { if (this.session) await call(this.browser.endpoint, 'DELETE', '/session/' + this.session); }
    finally { this.session = undefined; this.browser.server.inject(''); }
  }
}

class Browser {
  constructor(endpoint, capabilities, server) { this.endpoint = endpoint; this.capabilities = capabilities; this.server = server; this.versionString = 'unknown'; }
  version() { return this.versionString; }
  async newContext(options) { return new Context(this, options); }
  async close() {}
}

/**
 * A Playwright-shaped launcher. `server` is the acceptance server's hook:
 * {events: [...], inject(htmlScript)}.
 */
export function safariEngine({server, capabilities = {browserName: 'safari'}, port = 4444}) {
  let child;
  return {
    async launchServer() {
      child = spawn('safaridriver', ['-p', String(port)], {stdio: ['ignore', 'inherit', 'inherit']});
      const endpoint = `http://127.0.0.1:${port}`;
      for (let i = 0; ; i++) {
        try { if ((await call(endpoint, 'GET', '/status')).ready !== undefined) break; } catch (e) { if (i > 100) throw e; }
        await sleep(100);
      }
      return {wsEndpoint: () => endpoint, process: () => child, close: async () => { child.kill(); await sleep(500); }};
    },
    async connect(endpoint) {
      const browser = new Browser(endpoint, capabilities, server);
      // A short probe session records the real version before measurement.
      const context = await browser.newContext();
      await context.newPage();
      const caps = browser.lastCapabilities || {};
      browser.versionString = [caps.browserName, caps.browserVersion, caps.platformName, caps['safari:platformVersion'], caps['safari:deviceName']].filter(Boolean).join(' ');
      await context.close();
      return browser;
    },
  };
}
