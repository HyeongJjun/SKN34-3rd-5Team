from rest_framework import serializers

from .chat_service import ChatService
from .models import ChatMessage, ChatSession


MAX_HISTORY_MESSAGES = 12
MAX_HISTORY_CHARS = 32_000


class ChatSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatSession
        fields = ("id", "title", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ChatMessageSerializer(serializers.ModelSerializer):
    content = serializers.CharField(source="message", max_length=2200)

    class Meta:
        model = ChatMessage
        fields = ("id", "sequence_no", "role", "content", "status", "created_at", "updated_at")
        read_only_fields = ("id", "sequence_no", "role", "status", "created_at", "updated_at")


class ChatFinalizeSerializer(serializers.Serializer):
    receipt = serializers.CharField(max_length=1000)
    prefix = serializers.CharField(
        max_length=ChatService.MAX_ANSWER_LENGTH, allow_blank=True, trim_whitespace=False
    )
    status = serializers.ChoiceField(choices=("completed", "stopped"))


class GuestChatMessageSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=("user", "assistant"))
    content = serializers.CharField(trim_whitespace=False)


class GuestChatSerializer(serializers.Serializer):
    messages = GuestChatMessageSerializer(many=True, min_length=1, max_length=MAX_HISTORY_MESSAGES)

    def validate_messages(self, messages):
        cleaned, total = [], 0
        for item in messages:
            if not isinstance(item, dict) or set(item) != {"role", "content"}:
                raise serializers.ValidationError("메시지 형식이 올바르지 않습니다.")
            role, content = item.get("role"), item.get("content")
            if role not in {"user", "assistant"} or not isinstance(content, str):
                raise serializers.ValidationError("user 또는 assistant 메시지만 보낼 수 있습니다.")
            content = content.strip()
            limit = 2000 if role == "user" else ChatService.MAX_ANSWER_LENGTH
            if not content or len(content) > limit:
                raise serializers.ValidationError("메시지가 비어 있거나 너무 깁니다.")
            total += len(content)
            if total > MAX_HISTORY_CHARS:
                raise serializers.ValidationError("대화 기록이 너무 깁니다.")
            cleaned.append({"role": role, "content": content})
        if cleaned[-1]["role"] != "user":
            raise serializers.ValidationError("마지막 메시지는 질문이어야 합니다.")
        return cleaned


class ChatCoursePlaceSerializer(serializers.Serializer):
    phase = serializers.ChoiceField(choices=("BEFORE", "GAME", "AFTER"))
    name = serializers.CharField()
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    category = serializers.CharField()
    placeId = serializers.CharField(allow_null=True)
    address = serializers.CharField(allow_blank=True)
    placeUrl = serializers.URLField(allow_blank=True)
    distance = serializers.FloatField()
    reason = serializers.CharField()
    time = serializers.CharField()
    stayMin = serializers.IntegerField()


class ChatCourseStopSerializer(serializers.Serializer):
    position = serializers.IntegerField(min_value=0)
    name = serializers.CharField()
    lat = serializers.FloatField()
    lng = serializers.FloatField()
    category = serializers.CharField()
    placeId = serializers.CharField(allow_null=True)
    address = serializers.CharField(allow_null=True)
    isMapPoint = serializers.BooleanField()


class ChatCoursePayloadSerializer(serializers.Serializer):
    title = serializers.CharField()
    stadium = serializers.CharField(allow_blank=True)
    content = serializers.CharField()
    contentFormat = serializers.ChoiceField(choices=("", "html"), allow_blank=True)
    duration = serializers.CharField()
    tags = serializers.ListField(child=serializers.CharField())
    startLat = serializers.FloatField(allow_null=True)
    startLng = serializers.FloatField(allow_null=True)
    stops = ChatCourseStopSerializer(many=True)


class ChatCourseMetadataSerializer(serializers.Serializer):
    places = ChatCoursePlaceSerializer(many=True, required=False)
    coursePayload = ChatCoursePayloadSerializer(required=False, allow_null=True)
    route = serializers.CharField(required=False, allow_blank=True)


class ChatCheckpointEventSerializer(serializers.Serializer):
    turn_id = serializers.UUIDField()
    receipt = serializers.CharField()


class ChatDeltaEventSerializer(ChatCheckpointEventSerializer):
    text = serializers.CharField()


class ChatDoneEventSerializer(ChatCourseMetadataSerializer, ChatCheckpointEventSerializer):
    pass


class GuestChatDeltaEventSerializer(serializers.Serializer):
    text = serializers.CharField()


class GuestChatDoneEventSerializer(ChatCourseMetadataSerializer):
    assistant_message = serializers.CharField()


class ChatErrorEventSerializer(serializers.Serializer):
    detail = serializers.CharField()


class ChatFinalizeResponseSerializer(serializers.Serializer):
    turn_id = serializers.UUIDField()
    session_id = serializers.IntegerField()
    status = serializers.ChoiceField(choices=("completed", "stopped"))
    user_message_id = serializers.IntegerField()
    assistant_message_id = serializers.IntegerField(allow_null=True)
    user_message = serializers.CharField()
    assistant_message = serializers.CharField(allow_blank=True)


class ChatNonStreamResponseSerializer(ChatCourseMetadataSerializer):
    session_id = serializers.IntegerField()
    user_message = serializers.CharField()
    assistant_message = serializers.CharField()
    status = serializers.ChoiceField(choices=("completed",))
    user_message_id = serializers.IntegerField()
    assistant_message_id = serializers.IntegerField()
