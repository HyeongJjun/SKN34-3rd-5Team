from django.db import transaction
from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CommunityComment, CommunityPost, CommunityReport, CommunityVote


class _CommentSerializer(serializers.ModelSerializer):
    postId = serializers.CharField(source="post_id", read_only=True)
    authorId = serializers.IntegerField(source="author_id", read_only=True)
    author = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at", read_only=True)
    updatedAt = serializers.DateTimeField(source="updated_at", read_only=True)

    class Meta:
        model = CommunityComment
        fields = ("id", "postId", "authorId", "author", "content", "createdAt", "updatedAt")
        read_only_fields = ("id",)

    def get_author(self, comment):
        return comment.author.nickname or comment.author.username


class _VoteSerializer(serializers.Serializer):
    vote = serializers.ChoiceField(choices=("up", "down"), allow_null=True)


class _ReportSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=("spam", "abuse", "inappropriate", "privacy", "other"))
    detail = serializers.CharField(max_length=50, allow_blank=True, trim_whitespace=True)


class _ContentSerializer(serializers.Serializer):
    content = serializers.CharField(max_length=2000, allow_blank=False, trim_whitespace=True)


def _vote_counts(post):
    return post.votes.aggregate(
        recommendations=Count("id", filter=Q(value="up")),
        downvotes=Count("id", filter=Q(value="down")),
    )


def _vote_response(post, user):
    counts = _vote_counts(post)
    return {
        "vote": post.votes.filter(user=user).values_list("value", flat=True).first(),
        **counts,
    }


class CommentListCreateView(APIView):
    def get_permissions(self):
        return [AllowAny()] if self.request.method == "GET" else [IsAuthenticated()]

    def get(self, request, source_id):
        post = get_object_or_404(CommunityPost, source_id=source_id)
        order = request.query_params.get("order", "oldest")
        if order not in {"oldest", "newest"}:
            raise serializers.ValidationError({"order": "oldest 또는 newest를 입력해 주세요."})
        ordering = ("created_at", "id") if order == "oldest" else ("-created_at", "-id")
        comments = post.comments.select_related("author").order_by(*ordering)
        return Response(_CommentSerializer(comments, many=True).data)

    @transaction.atomic
    def post(self, request, source_id):
        post = get_object_or_404(CommunityPost.objects.select_for_update(), source_id=source_id)
        serializer = _ContentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = CommunityComment.objects.create(
            post=post, author=request.user, **serializer.validated_data
        )
        CommunityPost.objects.filter(pk=post.pk).update(comment_count=post.comments.count())
        return Response(_CommentSerializer(comment).data, status=status.HTTP_201_CREATED)


class CommentDetailView(APIView):
    permission_classes = (IsAuthenticated,)

    @staticmethod
    def _locked_owned_comment(comment_id, user):
        post_id = get_object_or_404(
            CommunityComment.objects.only("post_id"), pk=comment_id
        ).post_id
        post = get_object_or_404(CommunityPost.objects.select_for_update(), pk=post_id)
        comment = get_object_or_404(
            CommunityComment.objects.select_for_update().select_related("author"),
            pk=comment_id,
            post=post,
        )
        if comment.author_id != user.id:
            raise PermissionDenied("본인 댓글만 수정하거나 삭제할 수 있습니다.")
        return post, comment

    @transaction.atomic
    def patch(self, request, comment_id):
        _, comment = self._locked_owned_comment(comment_id, request.user)
        serializer = _ContentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment.content = serializer.validated_data["content"]
        comment.save(update_fields=("content", "updated_at"))
        return Response(_CommentSerializer(comment).data)

    @transaction.atomic
    def delete(self, request, comment_id):
        post, comment = self._locked_owned_comment(comment_id, request.user)
        comment.delete()
        CommunityPost.objects.filter(pk=post.pk).update(comment_count=post.comments.count())
        return Response(status=status.HTTP_204_NO_CONTENT)


class VoteView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request, source_id):
        post = get_object_or_404(CommunityPost, source_id=source_id)
        return Response(_vote_response(post, request.user))

    @transaction.atomic
    def post(self, request, source_id):
        post = get_object_or_404(CommunityPost.objects.select_for_update(), source_id=source_id)
        serializer = _VoteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        desired = serializer.validated_data["vote"]
        current = CommunityVote.objects.filter(post=post, user=request.user).first()

        if desired is None:
            if current:
                current.delete()
        elif current:
            if current.value != desired:
                current.value = desired
                current.save(update_fields=("value",))
        else:
            CommunityVote.objects.create(post=post, user=request.user, value=desired)

        counts = _vote_counts(post)
        CommunityPost.objects.filter(pk=post.pk).update(recommendations=counts["recommendations"])
        return Response({"vote": desired, **counts})


class ReportCreateView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request, source_id):
        post = get_object_or_404(CommunityPost, source_id=source_id)
        serializer = _ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report, created = CommunityReport.objects.get_or_create(
            post=post,
            reporter=request.user,
            defaults=serializer.validated_data,
        )
        response_status = status.HTTP_201_CREATED if created else status.HTTP_200_OK
        return Response({"id": report.id, "created": created}, status=response_status)
