from django.core.management.base import BaseCommand

from tving.models import TvingSnapshot
from tving.relational import persist_athlete, persist_daily, persist_month, persist_team


PERSISTERS = {
    TvingSnapshot.DAILY: persist_daily,
    TvingSnapshot.MONTH: persist_month,
    TvingSnapshot.TEAM: persist_team,
    TvingSnapshot.ATHLETE: persist_athlete,
}


class Command(BaseCommand):
    help = "Non-destructively backfill relational TVING entities from legacy snapshots"

    def handle(self, *args, **options):
        migrated = skipped = 0
        for snapshot in TvingSnapshot.objects.order_by("pk").iterator():
            try:
                PERSISTERS[snapshot.resource_kind](snapshot.payload, snapshot.source_fetched_at)
            except Exception as error:
                skipped += 1
                self.stderr.write(f"skip snapshot {snapshot.pk} ({snapshot.resource_kind}:{snapshot.resource_key}): {type(error).__name__}")
            else:
                migrated += 1
        self.stdout.write(f"migrated={migrated} skipped={skipped} preserved={migrated + skipped}")
