const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const appRequire = createRequire(path.resolve(process.argv[2], 'package.json'));
const { Client } = appRequire('ssh2');
const { buildAuthHandler, createKeyboardInteractiveHandler } = appRequire('./electron/bridges/sshAuthHelper.cjs');
const keyboard = appRequire('./electron/bridges/keyboardInteractiveHandler.cjs');
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'private-fixture.json')));
const mode = process.argv[3] || 'correct';
const host = config.hosts.target;
const events = [];
const originalLog = console.log;
console.log = () => {}; // Main-process debug output includes server instructions; report only bounded event labels.
(async () => {
 const result = await new Promise((resolve, reject) => {
  const client = new Client();
  let settled = false;
  let sawNew = false;
  let sawCurrent = false;
  const timer = setTimeout(() => done(new Error('fixture probe timed out')), 20000);
  function done(error) {
   if (settled) return;
   settled=true;
   clearTimeout(timer);
   keyboard.cancelRequestsForSession('fixture-probe');
   client.end();
   error ? reject(error) : resolve({events,sawNew,sawCurrent});
  }
  const sender = { id: 3982, isDestroyed: () => false, send(channel, data) {
   if(channel !== 'netcatty:keyboard-interactive') return;
   const prompts = data.prompts.map(p=>p.prompt.toLowerCase());
   const answers = prompts.map(prompt=>{
    if(prompt.includes('current')) { sawCurrent=true; events.push('ki-current'); return mode==='wrong'?'intentionally-wrong-fixture-response':config.currentPassword; }
    if(prompt.includes('new') || prompt.includes('retype')) { sawNew=true; events.push(prompt.includes('retype')?'ki-confirm':'ki-new'); return config.newPassword; }
    events.push('ki-password'); return config.currentPassword;
   });
   queueMicrotask(()=>keyboard.handleResponse({sender:{id:3982}},{requestId:data.requestId,responses:answers,cancelled:false}));
  }};
  const auth = buildAuthHandler({authMethod:'password',username:config.username,password:config.currentPassword,requiresMfa:true,onAuthAttempt:m=>events.push('auth-'+m)});
  client.on('keyboard-interactive', createKeyboardInteractiveHandler({sender,sessionId:'fixture-probe',hostname:'127.0.0.1',password:config.currentPassword,scope:'terminal'}));
  client.on('error',done);
  client.on('ready',()=>{
   events.push('ssh-ready');
   client.shell({term:'xterm',cols:80,rows:24},(error,stream)=>{
    if(error) return done(error);
    events.push('shell-open');
    let text='';
    stream.on('data',chunk=>{
     text+=chunk.toString();
     if(mode==='wrong' && /Current password:/i.test(text)) {events.push('shell-current-password');done();}
     if(mode==='correct' && /fixtureki@/.test(text)) {events.push('shell-prompt');done();}
    });
   });
  });
  client.connect({host:'127.0.0.1',port:host.port,username:config.username,password:config.currentPassword,authHandler:auth.authHandler,tryKeyboard:true,readyTimeout:15000,hostVerifier:()=>true});
 });
 assert.equal(result.sawCurrent,true);
 if(mode==='correct') assert.equal(result.sawNew,true);
 else { assert.equal(result.sawNew,false); assert.ok(events.includes('shell-current-password')); }
 originalLog(JSON.stringify({mode,...result},null,2));
})().catch(error=>{originalLog(error.message);process.exitCode=1;});
