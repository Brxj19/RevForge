#!/bin/sh
set -eu

if [ -f /etc/revforge-ssh-gateway.env ]; then
    # shellcheck disable=SC1091
    . /etc/revforge-ssh-gateway.env
fi

cd /tmp/revforge-backend
exec python -m app.mercurial.ssh_gateway "$@"
