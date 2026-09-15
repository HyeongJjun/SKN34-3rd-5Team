from rest_framework import serializers

from .models import CommunityPost, FREE_CATEGORIES, TEAM_CATEGORIES, TEAM_CODES


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

    def get_recommendations(self, obj):
        return self._count(obj, "upvote_count", "votes", "up")

    def get_downvotes(self, obj):
        return self._count(obj, "downvote_count", "votes", "down")

    def get_commentCount(self, obj):
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
