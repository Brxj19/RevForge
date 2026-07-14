#!/bin/sh
set -eu

mkdir -p /var/run/sshd /srv/revforge-ssh /data/repositories /data/event-spool
touch /srv/revforge-ssh/authorized_keys
mkdir -p /srv/revforge-ssh/host_keys

# Local dev bind mounts come from the host user, so keep the shared paths writable
# for the forced-command user rather than depending on host UID/GID alignment.
chmod 600 /srv/revforge-ssh/authorized_keys
chmod -R a+rwX /srv/revforge-ssh /data/repositories /data/event-spool
chmod 700 /srv/revforge-ssh/host_keys

python - <<'PY'
import os
import pathlib
import pwd
import shlex

runtime_env_path = pathlib.Path("/etc/revforge-ssh-gateway.env")
lines = ["#!/bin/sh", "set -eu"]

for key in sorted(name for name in os.environ if name.startswith("REVFORGE_")):
    lines.append(f"export {key}={shlex.quote(os.environ[key])}")

gateway_user = pwd.getpwnam("revforge-hg")
runtime_env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
os.chown(runtime_env_path, gateway_user.pw_uid, gateway_user.pw_gid)
runtime_env_path.chmod(0o600)
PY

if [ ! -f /srv/revforge-ssh/host_keys/ssh_host_ed25519_key ]; then
  ssh-keygen -t ed25519 -f /srv/revforge-ssh/host_keys/ssh_host_ed25519_key -N ''
fi

if [ ! -f /srv/revforge-ssh/host_keys/ssh_host_rsa_key ]; then
  ssh-keygen -t rsa -b 4096 -f /srv/revforge-ssh/host_keys/ssh_host_rsa_key -N ''
fi

chmod 600 /srv/revforge-ssh/host_keys/ssh_host_ed25519_key /srv/revforge-ssh/host_keys/ssh_host_rsa_key
chmod 644 /srv/revforge-ssh/host_keys/ssh_host_ed25519_key.pub /srv/revforge-ssh/host_keys/ssh_host_rsa_key.pub

exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config_revforge
