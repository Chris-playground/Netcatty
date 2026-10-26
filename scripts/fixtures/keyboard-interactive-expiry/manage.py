#!/usr/bin/env python3
"""Manage only this kit's disposable, loopback-bound SSH containers."""
import json, os, secrets, subprocess, sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
CONFIG=ROOT/'private-fixture.json'
def run(*args, input=None):
 return subprocess.check_output(['docker',*args],input=input,text=True).strip()
def reset(config):
 for name, host in config['hosts'].items():
  run('exec','-i',host['container'],'chpasswd',input=f"{config['username']}:{config['currentPassword']}\n")
  run('exec',host['container'],'chage','-d','0' if name=='target' else '1',config['username'])
if sys.argv[1]=='start':
 if CONFIG.exists(): raise SystemExit('Existing fixture config: use reset or stop first.')
 config={'username':'fixtureki','currentPassword':secrets.token_urlsafe(18)+'aA1!','newPassword':secrets.token_urlsafe(18)+'bB2!','hosts':{}}
 try:
  for name in ['target','control']:
   container='netcatty-3982-'+name+'-'+secrets.token_hex(4)
   run('run','--rm','-d','--name',container,'-p','127.0.0.1::22','netcatty-3982-pam-fixture')
   port=int(run('port',container,'22/tcp').rsplit(':',1)[1])
   config['hosts'][name]={'container':container,'hostname':'127.0.0.1','port':port}
  reset(config)
 except BaseException:
  for host in config['hosts'].values(): subprocess.run(['docker','rm','-f',host['container']],stdout=subprocess.DEVNULL)
  raise
 fd=os.open(CONFIG,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
 with os.fdopen(fd,'w') as f: json.dump(config,f,indent=2)
 print('Disposable fixture ready. Private connection details:',CONFIG)
elif sys.argv[1]=='reset':
 reset(json.loads(CONFIG.read_text()))
 print('Reset target expiry and control account; retained the synthetic fixture secrets.')
elif sys.argv[1]=='stop':
 config=json.loads(CONFIG.read_text())
 for host in config['hosts'].values(): run('rm','-f',host['container'])
 CONFIG.unlink()
 print('Removed this fixture containers and private connection details.')
else: raise SystemExit('Use start, reset, or stop')
