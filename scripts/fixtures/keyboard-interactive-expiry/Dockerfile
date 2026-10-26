FROM debian:bookworm-slim
COPY --chmod=644 ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN chmod 755 /etc/ssl /etc/ssl/certs && printf '%s\n' 'Acquire::https::CaInfo "/etc/ssl/certs/ca-certificates.crt";' > /etc/apt/apt.conf.d/99fixture-ca && sed -i 's|http://deb.debian.org|https://deb.debian.org|g' /etc/apt/sources.list.d/debian.sources && apt-get -o Acquire::Retries=0 -o Acquire::http::Timeout=15 -o Acquire::https::Timeout=15 update && apt-get install -y --no-install-recommends openssh-server passwd && rm -rf /var/lib/apt/lists/*
RUN useradd --create-home --shell /bin/bash fixtureki && mkdir -p /run/sshd && ssh-keygen -A
RUN printf '%s\n' 'Port 22' 'ListenAddress 0.0.0.0' 'UsePAM yes' 'PasswordAuthentication yes' 'KbdInteractiveAuthentication yes' 'PubkeyAuthentication no' 'PermitRootLogin no' 'PrintMotd no' 'LogLevel VERBOSE' > /etc/ssh/sshd_config
CMD ["/usr/sbin/sshd", "-D", "-e"]
