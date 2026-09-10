from openai import OpenAIError
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import ChatMessage, ChatSession
from .chat_service import ChatService


class ChatSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatSession
        fields = ("id", "title", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ChatMessageSerializer(serializers.ModelSerializer):
    content = serializers.CharField(source="message")

    class Meta:
        model = ChatMessage
        fields = ("id", "sequence_no", "role", "content", "created_at", "updated_at")
        read_only_fields = ("id", "sequence_no", "role", "created_at", "updated_at")


class ChatRoomView(generics.ListCreateAPIView):
    """
    GET /chat/sessions/ - 내 채팅방 목록 조회
    POST /chat/sessions/ - 새 채팅방 생성
    """

    serializer_class = ChatSessionSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user).order_by("-updated_at")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ChatRoomDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    PATCH /chat/sessions/{session_id}/ - 채팅방 제목 수정
    DELETE /chat/sessions/{session_id}/ - 채팅방 삭제
    """

    serializer_class = ChatSessionSerializer
    permission_classes = (IsAuthenticated,)
    http_method_names = ("patch", "delete", "options")
    lookup_url_kwarg = "session_id"

    def get_queryset(self):
        return ChatSession.objects.filter(user=self.request.user)


class ChatMessageView(generics.ListCreateAPIView):
    """
    GET /chat/sessions/{session_id}/messages/ - 메시지 목록 조회
    POST /chat/sessions/{session_id}/messages/ - LLM 응답 생성 및 질문·답변 저장
    요청: {"content": "질문"}, 응답: session_id, user_message, assistant_message
    응답은 생성 완료 후 JSON으로 반환합니다.
    """

    serializer_class = ChatMessageSerializer
    permission_classes = (IsAuthenticated,)

    def get_queryset(self):
        return self.get_session().messages.order_by("sequence_no")

    def get_session(self):
        """URL의 채팅방이 로그인한 사용자의 것인지 확인합니다."""
        return generics.get_object_or_404(
            ChatSession,
            id=self.kwargs["session_id"],
            user=self.request.user,
        )

    def create(self, request, *args, **kwargs):
        """POST: 입력 검증 → ChatService 호출 → 질문과 AI 답변 반환."""
        session = self.get_session()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        question = serializer.validated_data["message"]
        try:
            answer = ChatService().invoke(request.user.pk, session.pk, question)
        except OpenAIError:
            return Response(
                {"detail": "LLM 응답 생성에 실패했습니다. 다시 시도해 주세요."},
                status=status.HTTP_502_BAD_GATEWAY,
            )
        return Response(
            {"session_id": session.pk, "user_message": question, "assistant_message": answer},
            status=status.HTTP_201_CREATED,
        )
