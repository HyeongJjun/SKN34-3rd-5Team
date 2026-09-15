from django.contrib import admin

from . import models
from .models import TvingSnapshot


@admin.register(TvingSnapshot)
class TvingSnapshotAdmin(admin.ModelAdmin):
    list_display = ("resource_kind", "resource_key", "source_fetched_at", "last_synced_at")
    list_filter = ("resource_kind",)
    search_fields = ("resource_key",)
    readonly_fields = ("created_at", "updated_at")


admin.site.register([
    models.TvingPlayer, models.TvingPlayerCareerRecord,
    models.TvingPlayerSeasonRecord, models.TvingScheduleDay, models.TvingTeamProfile,
    models.TvingTeamRoster, models.TvingTeamSeasonRecord,
    models.TvingTeamTopPlayer,
])
