#!/usr/bin/env python3
"""Build the disposable fixture with this environment's existing CA trust."""
import os, socket, subprocess
from pathlib import Path
from urllib.parse import urlsplit
root=Path(__file__).resolve().parent
certs=[]
for value in ['/etc/ssl/certs/ca-certificates.crt',os.environ.get('NODE_EXTRA_CA_CERTS','')]:
 path=Path(value)
 if value and path.is_file(): certs.append(path.read_bytes())
(root/'ca-certificates.crt').write_bytes(b'\n'.join(certs))
(root/'ca-certificates.crt').chmod(0o644)
args=['docker','build']
seen=set()
for key in ['HTTP_PROXY','HTTPS_PROXY','http_proxy','https_proxy']:
 if os.environ.get(key):
  args += ['--build-arg',key]
  host=urlsplit(os.environ[key]).hostname
  if host and host not in seen:
   seen.add(host)
   args += ['--add-host',f'{host}:{socket.gethostbyname(host)}']
args += ['-t','netcatty-3982-pam-fixture',str(root)]
subprocess.run(args,env={**os.environ,'DOCKER_CONFIG':str(root/'docker-config')},check=True)
