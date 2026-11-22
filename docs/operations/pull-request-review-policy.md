# Pull-request review policy

Marking a landed pull request merged requires at least one approval from an
active user who can currently read the repository. The author cannot approve
or merge their own pull request. Every reviewer marked required must also have
a current, eligible approval; only a repository administrator can remove a
required reviewer. A reviewer who is suspended or loses repository access no
longer contributes an approval or an outstanding change request. Change requests
from active users who still have access block merge.

Pull-request actions create audit records and, for explicitly subscribed active
webhooks, an entry in the delivery outbox in the same database transaction.
Pull-request events are delivered over HTTPS only. Delivery is **at least once**:
receivers should deduplicate with the `Idempotency-Key` header. Failed deliveries
are retried with bounded backoff and eventually moved to the dead-letter queue.
Payloads contain action identifiers and selected state attributes, not comment
bodies. Deactivated, deleted, or unsubscribed webhooks do not receive queued
events.
