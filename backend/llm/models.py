from django.conf import settings
from django.db import models
from pgvector.django import VectorField, HnswIndex


class Document(models.Model):
    title = models.CharField(max_length=255)
    source = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)


class DocumentChunk(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="chunks")
    content = models.TextField()
    chunk_index = models.IntegerField()
    metadata = models.JSONField(default=dict)
    embedding = VectorField(dimensions=1536)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            HnswIndex(
                name="chunk_embedding_hnsw",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]


# 채팅방 테이블
class ChatSession(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="chat_sessions",
    )
    title = models.CharField(max_length=255, blank=True, default="메세지 제목")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)


# 채팅 메세지 테이블
class ChatMessage(models.Model):
    session = models.ForeignKey(
        ChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    sequence_no = models.IntegerField()
    role = models.CharField(
        max_length=10, choices=[("human", "사용자"), ("ai", "AI")], default="human"
    )
    message = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
