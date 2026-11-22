# Pull-request number migration

Migration `0010_pr_number_unique` makes pull-request numbers unique within a
repository. It does not renumber existing records: numbers are part of review
URLs and changing them silently could redirect a link to a different review.

Before upgrading an existing installation, back up the database and check for
duplicates:

```sql
SELECT repository_id, number, count(*)
FROM pull_requests
GROUP BY repository_id, number
HAVING count(*) > 1;
```

If any rows are returned, the migration stops without changing those numbers.
An administrator must identify each affected review by its UUID, decide which
URL retains the old number, and reconcile the other numbers and any external
links before retrying. Preserve a mapping of old and new identifiers. Do not
delete a review as a shortcut. Downgrading `0010` removes the constraint but
does not alter existing numbers; restore the backup if reconciliation must be
reversed.

Migration `0009` widens Alembic's version column on PostgreSQL before recording
its long revision identifier. The wider column is retained on downgrade.
