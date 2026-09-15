from drf_spectacular.utils import extend_schema_serializer
from rest_framework import serializers

from .models import CommunityComment, CommunityPost, FREE_CATEGORIES, TEAM_CATEGORIES, TEAM_CODES


@extend_schema_serializer(component_name="CommunityPost")
class CommunityPostSerializer(serializers.ModelSerializer):
    id = serializers.CharField(source="source_id", read_only=True)
    sourceId = serializers.CharField(source="source_id", read_only=True)
    postNumber = serializers.CharField(source="post_number", read_only=True)
    teamCode = serializers.CharField(source="team_code", allow_blank=True)
    authorId = serializers.IntegerField(source="owner_id", read_only=True, allow_null=True)
    createdAt = serializers.DateTimeField(source="created_at", read_only=True, allow_null=True)
    views = serializers.IntegerField(read_only=True)
    recommendations = serializers.SerializerMethodField()
    downvotes = serializers.SerializerMethodField()
    commentCount = serializers.SerializerMethodField()
    isSample = serializers.BooleanField(source="is_sample", read_only=True)
    category = serializers.ChoiceField(choices=TEAM_CATEGORIES)
    content = serializers.CharField(max_length=20000, allow_blank=False, trim_whitespace=True)

    class Meta:
        model = CommunityPost
        fields = (
            "id", "sourceId", "postNumber", "board", "teamCode", "authorId", "author", "title", "content",
            "category", "createdAt", "views", "recommendations", "downvotes", "commentCount", "isSample",
        )
        read_only_fields = ("author",)

    @staticmethod
    def _count(obj, annotation, relation, value=None):
        if hasattr(obj, annotation):
            return getattr(obj, annotation)
        queryset = getattr(obj, relation)
        return queryset.filter(value=value).count() if value else queryset.count()

    def get_recommendations(self, obj) -> int:
        return self._count(obj, "upvote_count", "votes", "up")

    def get_downvotes(self, obj) -> int:
        return self._count(obj, "downvote_count", "votes", "down")

    def get_commentCount(self, obj) -> int:
        return self._count(obj, "actual_comment_count", "comments")

    def validate(self, attrs):
        board = attrs.get("board", getattr(self.instance, "board", None))
        team_code = attrs.get("team_code", getattr(self.instance, "team_code", "")).upper()
        category = attrs.get("category", getattr(self.instance, "category", None))

        if board == "free" and team_code:
            raise serializers.ValidationError({"teamCode": "자유게시판은 팀 코드를 사용할 수 없습니다."})
        if board == "teams" and team_code not in TEAM_CODES:
            raise serializers.ValidationError({"teamCode": "올바른 팀 코드를 입력해 주세요."})
        allowed_categories = FREE_CATEGORIES if board == "free" else TEAM_CATEGORIES
        if category not in allowed_categories:
            raise serializers.ValidationError({"category": "올바른 카테고리를 입력해 주세요."})
        attrs["team_code"] = team_code
        return attrs


@extend_schema_serializer(component_name="CommunityPostWrite")
class CommunityPostWriteSerializer(serializers.Serializer):
    board = serializers.ChoiceField(choices=("free", "teams"))
    teamCode = serializers.CharField(max_length=2, allow_blank=True)
    category = serializers.ChoiceField(choices=TEAM_CATEGORIES)
    title = serializers.CharField(max_length=200)
    content = serializers.CharField(max_length=20000)


@extend_schema_serializer(component_name="CommunityPostPatch")
class CommunityPostPatchSerializer(CommunityPostWriteSerializer):
    board = serializers.ChoiceField(choices=("free", "teams"), required=False)
    teamCode = serializers.CharField(max_length=2, allow_blank=True, required=False)
    category = serializers.ChoiceField(choices=TEAM_CATEGORIES, required=False)
    title = serializers.CharField(max_length=200, required=False)
    content = serializers.CharField(max_length=20000, required=False)


@extend_schema_serializer(component_name="CommunityCommentWrite")
class CommunityCommentWriteSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)


@extend_schema_serializer(component_name="CommunityComment")
class CommunityCommentSerializer(serializers.ModelSerializer):
    postId = serializers.CharField(source="post_id", read_only=True)
    authorId = serializers.IntegerField(source="author_id", read_only=True)
    author = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = CommunityComment
        fields = ("id", "postId", "authorId", "author", "content", "createdAt", "updatedAt")
        read_only_fields = ("id",)

    def get_author(self, comment) -> str:
        return comment.author.nickname or comment.author.username


@extend_schema_serializer(component_name="CommunityVoteWrite")
class CommunityVoteWriteSerializer(serializers.Serializer):
    vote = serializers.ChoiceField(choices=("up", "down"), allow_null=True)


@extend_schema_serializer(component_name="CommunityVoteState")
class CommunityVoteStateSerializer(serializers.Serializer):
    vote = serializers.ChoiceField(choices=("up", "down"), allow_null=True)
    recommendations = serializers.IntegerField(min_value=0)
    downvotes = serializers.IntegerField(min_value=0)


@extend_schema_serializer(component_name="CommunityReportWrite")
class CommunityReportWriteSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=("spam", "abuse", "inappropriate", "privacy", "other"))
    detail = serializers.CharField(max_length=50, allow_blank=True, trim_whitespace=True)


@extend_schema_serializer(component_name="CommunityReportResult")
class CommunityReportResultSerializer(serializers.Serializer):
    id = serializers.IntegerField(min_value=1)
    created = serializers.BooleanField()


@extend_schema_serializer(component_name="PredictionChoiceWrite")
class PredictionChoiceWriteSerializer(serializers.Serializer):
    choice = serializers.RegexField(r"^(home|away)$", allow_null=True)


@extend_schema_serializer(component_name="PredictionTeam")
class PredictionTeamSerializer(serializers.Serializer):
    code = serializers.ChoiceField(choices=TEAM_CODES)
    name = serializers.CharField()
    score = serializers.IntegerField(min_value=0, allow_null=True)


@extend_schema_serializer(component_name="PredictionVotes")
class PredictionVotesSerializer(serializers.Serializer):
    home = serializers.IntegerField(min_value=0)
    away = serializers.IntegerField(min_value=0)
    total = serializers.IntegerField(min_value=0)
    homePercent = serializers.IntegerField(min_value=0, max_value=100)
    awayPercent = serializers.IntegerField(min_value=0, max_value=100)


@extend_schema_serializer(component_name="PredictionGame")
class PredictionGameSerializer(serializers.Serializer):
    gameId = serializers.CharField()
    date = serializers.DateField()
    startsAt = serializers.DateTimeField(allow_null=True)
    stadium = serializers.CharField(allow_blank=True)
    away = PredictionTeamSerializer()
    home = PredictionTeamSerializer()
    status = serializers.ChoiceField(choices=("scheduled", "live", "final", "cancelled", "postponed", "suspended", "unknown"))
    result = serializers.ChoiceField(choices=("home", "away", "draw"), allow_null=True)
    locked = serializers.BooleanField()
    voided = serializers.BooleanField()
    stale = serializers.BooleanField()
    sourceFetchedAt = serializers.DateTimeField()
    votes = PredictionVotesSerializer()
    myChoice = serializers.RegexField(r"^(home|away)$", allow_null=True)
