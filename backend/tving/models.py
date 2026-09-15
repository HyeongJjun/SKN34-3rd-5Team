from django.db import models

from baseball.models import Team


class SyncedModel(models.Model):
    source_fetched_at = models.DateTimeField()
    last_synced_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class TvingTeamProfile(SyncedModel):
    team = models.OneToOneField(Team, on_delete=models.PROTECT, related_name="tving_profile")
    external_code = models.CharField(max_length=2, unique=True)
    short_name = models.CharField(max_length=30)
    image_url = models.URLField(max_length=1000, null=True, blank=True)
    background_image_url = models.URLField(max_length=1000, null=True, blank=True)
    season_title = models.CharField(max_length=80)
    roster_codes = models.JSONField(default=dict)
    top_keys = models.JSONField(default=dict)


class TvingScheduleDay(SyncedModel):
    date = models.DateField(unique=True)
    status = models.CharField(max_length=8, choices=(("ready", "Ready"), ("empty", "Empty"), ("pending", "Pending"), ("error", "Error")))
    game_count = models.PositiveSmallIntegerField()
    game_codes = models.JSONField(default=list)


class TvingTeamSeasonRecord(SyncedModel):
    team = models.ForeignKey(Team, on_delete=models.PROTECT, related_name="tving_season_records")
    season = models.PositiveSmallIntegerField()
    category = models.CharField(max_length=8, choices=(("main", "Main"), ("box", "Box")))
    title = models.CharField(max_length=40)
    value = models.CharField(max_length=60)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("team", "season", "category", "title"), name="uq_tving_team_season_record")]


class TvingPlayer(models.Model):
    external_code = models.CharField(max_length=40, primary_key=True)
    team = models.ForeignKey(Team, on_delete=models.PROTECT, related_name="tving_players")
    name = models.CharField(max_length=80)
    image_url = models.URLField(max_length=1000, null=True, blank=True)
    positions = models.JSONField(default=list)
    back_number = models.CharField(max_length=20, blank=True)
    join_date = models.CharField(max_length=40, blank=True)
    birth_date = models.CharField(max_length=40, blank=True)
    body = models.JSONField(default=list)
    education = models.CharField(max_length=200, blank=True)
    draft_order = models.CharField(max_length=100, blank=True)
    team_color = models.CharField(max_length=20, blank=True)
    team_logo_url = models.URLField(max_length=1000, null=True, blank=True)
    season_title = models.CharField(max_length=80, blank=True)
    career_title = models.CharField(max_length=80, blank=True)
    profile_source_fetched_at = models.DateTimeField(null=True, blank=True)
    profile_last_synced_at = models.DateTimeField(null=True, blank=True)
    identity_source_fetched_at = models.DateTimeField(null=True, blank=True)
    identity_last_synced_at = models.DateTimeField(null=True, blank=True)
    detail_source_fetched_at = models.DateTimeField(null=True, blank=True)
    detail_last_synced_at = models.DateTimeField(null=True, blank=True)
    detail_record_keys = models.JSONField(default=list)
    career_positions = models.JSONField(default=list)
    updated_at = models.DateTimeField(auto_now=True)


class TvingPlayerSeasonRecord(SyncedModel):
    player = models.ForeignKey(TvingPlayer, on_delete=models.CASCADE, related_name="season_records")
    season = models.PositiveSmallIntegerField()
    record_kind = models.CharField(max_length=16, choices=(("pitcher", "Pitcher ranking"), ("hitter", "Hitter ranking"), ("detail", "Player detail")))
    record_key = models.CharField(max_length=60)
    rank = models.PositiveSmallIntegerField(null=True, blank=True)
    title = models.CharField(max_length=60, blank=True)
    value = models.CharField(max_length=60, blank=True)
    rank_label = models.CharField(max_length=40, null=True, blank=True)
    is_first_rank = models.BooleanField(default=False)
    metrics = models.JSONField(default=dict)
    graphs = models.JSONField(default=list)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("player", "season", "record_kind", "record_key"), name="uq_tving_player_season_record")]


class TvingPlayerCareerRecord(SyncedModel):
    player = models.ForeignKey(TvingPlayer, on_delete=models.CASCADE, related_name="career_records")
    position = models.PositiveSmallIntegerField()
    season_label = models.CharField(max_length=60)
    title = models.CharField(max_length=80)
    columns = models.JSONField(default=list)
    metrics = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("player", "position"), name="uq_tving_player_career_record")]


class TvingTeamRoster(SyncedModel):
    team = models.ForeignKey(Team, on_delete=models.PROTECT, related_name="tving_roster")
    player = models.ForeignKey(TvingPlayer, on_delete=models.CASCADE, related_name="roster_memberships")
    position = models.CharField(max_length=16, choices=(("pitcher", "Pitcher"), ("infielder", "Infielder"), ("outfielder", "Outfielder"), ("catcher", "Catcher")))
    back_number = models.CharField(max_length=20, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("team", "player"), name="uq_tving_team_roster")]


class TvingTeamTopPlayer(SyncedModel):
    team = models.ForeignKey(Team, on_delete=models.PROTECT, related_name="tving_top_players")
    player = models.ForeignKey(TvingPlayer, on_delete=models.CASCADE, related_name="team_top_records")
    athlete_type = models.CharField(max_length=8, choices=(("pitcher", "Pitcher"), ("hitter", "Hitter")))
    category = models.CharField(max_length=40)
    rank = models.PositiveSmallIntegerField()
    value = models.CharField(max_length=40, blank=True)
    image_url = models.URLField(max_length=1000, null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=("team", "player", "athlete_type", "category"), name="uq_tving_team_top_player")]




class TvingSnapshot(models.Model):
    DAILY = "daily"
    MONTH = "month"
    TEAM = "team"
    ATHLETE = "athlete"
    KINDS = ((DAILY, "Daily"), (MONTH, "Month"), (TEAM, "Team"), (ATHLETE, "Athlete"))

    resource_kind = models.CharField(max_length=16, choices=KINDS)
    resource_key = models.CharField(max_length=16)
    payload = models.JSONField()
    source_fetched_at = models.DateTimeField()
    last_synced_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=("resource_kind", "resource_key"), name="uq_tving_snapshot_resource"),
            models.CheckConstraint(
                condition=(
                    models.Q(resource_kind="daily", resource_key__regex=r"^\d{4}-\d{2}-\d{2}$")
                    | models.Q(resource_kind="month", resource_key__regex=r"^\d{4}-\d{2}$")
                    | models.Q(resource_kind="team", resource_key__regex=r"^(SS|KT|LG|HT|OB|NC|HH|LT|SK|WO)$")
                    | models.Q(resource_kind="athlete", resource_key__regex=r"^\d{4,12}$")
                ),
                name="ck_tving_snapshot_identity",
            ),
        ]
        indexes = [models.Index(fields=("resource_kind", "resource_key"), name="tving_resource_idx")]
