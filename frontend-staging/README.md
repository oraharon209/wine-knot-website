# Runtime overlay (server only)

The redesign source is `frontend/new/`. On the EC2 host, `scripts/deploy-staging.sh` rsyncs that tree into `frontend/new/` (bind-mounted as nginx `html-new`).

Do not keep a second copy of the site in this folder in git.
