from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.db import DatabaseError
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableLambda
from openai import OpenAIError
from rest_framework.test import APITestCase

from .models import ChatMessage, ChatSession, Document, DocumentChunk


class DocumentChatCoexistenceTest(APITestCase):
    def test_chat_deletion_preserves_document_and_embedding(self):
        from django.urls import resolve

        self.assertEqual(resolve("/admin/").url_name, "index")
        self.client.force_authenticate(
            user=get_user_model().objects.create_user(username="coexist")
        )
        document = Document.objects.create(title="문서", source="test")
        chunk = DocumentChunk.objects.create(
            document=document, content="원문", chunk_index=0, embedding=[1.0] * 1536
        )
        session = self.client.post("/chat/sessions/", {"title": "채팅"}, format="json")
        self.assertEqual(session.status_code, 201)
        self.assertEqual(
            self.client.delete(f"/chat/sessions/{session.json()['id']}/").status_code, 204
        )
        chunk.refresh_from_db()
        self.assertEqual(chunk.content, "원문")
        self.assertEqual(len(chunk.embedding), 1536)
        self.assertTrue(Document.objects.filter(pk=document.pk).exists())


class ChatApiTest(APITestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="tester")
        self.client.force_authenticate(user=self.user)
        self.prompts = []

        def respond(prompt):
            self.prompts.append(prompt.to_messages())
            return AIMessage(content="테스트 답변")

        # 모델만 대체하고 View, ChatService, 히스토리 저장은 실제 실행합니다.
        patcher = patch("llm.chat_service.ChatOpenAI", return_value=RunnableLambda(respond))
        self.model = patcher.start()
        self.addCleanup(patcher.stop)

    def test_session_and_message_crud(self):
        room = self.client.post("/chat/sessions/", {"title": "test"}, format="json")
        self.assertEqual(room.status_code, 201)
        session_id = room.json()["id"]

        updated = self.client.patch(
            f"/chat/sessions/{session_id}/",
            {"title": "updated"},
            format="json",
        )
        self.assertEqual(updated.json()["title"], "updated")

        message = self.client.post(
            f"/chat/sessions/{session_id}/messages/",
            {"content": "hello"},
            format="json",
        )
        self.assertEqual(message.status_code, 201)
        self.assertEqual(message.json()["assistant_message"], "테스트 답변")
        self.assertEqual(
            self.client.get(f"/chat/sessions/{session_id}/messages/").json()[0]["content"],
            "hello",
        )

        second = self.client.post(
            f"/chat/sessions/{session_id}/messages/", {"content": "두 번째 질문"}, format="json"
        )
        self.assertEqual(second.status_code, 201)
        self.assertEqual(
            [(m.type, m.content) for m in self.prompts[1][1:]],
            [("human", "hello"), ("ai", "테스트 답변"), ("human", "두 번째 질문")],
        )
        messages = self.client.get(f"/chat/sessions/{session_id}/messages/").json()
        self.assertEqual([m["role"] for m in messages], ["human", "ai", "human", "ai"])
        self.assertEqual([m["sequence_no"] for m in messages], [1, 2, 3, 4])

        self.assertEqual(self.client.delete(f"/chat/sessions/{session_id}/").status_code, 204)
        self.assertFalse(ChatMessage.objects.exists())

    def test_invalid_input_and_other_users_session_do_not_call_llm(self):
        session = ChatSession.objects.create(user=self.user)
        url = f"/chat/sessions/{session.pk}/messages/"
        self.assertEqual(self.client.post(url, {"content": " "}, format="json").status_code, 400)
        self.client.force_authenticate(user=get_user_model().objects.create_user(username="other"))
        self.assertEqual(self.client.get(url).status_code, 404)
        self.assertEqual(self.client.post(url, {"content": "hello"}, format="json").status_code, 404)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.post(url, {"content": "hello"}).status_code, (401, 403))
        self.model.assert_not_called()

    def test_llm_failure_returns_502_without_saving_messages(self):
        def fail(prompt):
            raise OpenAIError("upstream private error")

        self.model.return_value = RunnableLambda(fail)
        session = ChatSession.objects.create(user=self.user)
        response = self.client.post(
            f"/chat/sessions/{session.pk}/messages/", {"content": "hello"}, format="json"
        )
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("upstream private error", response.content.decode())
        self.assertFalse(session.messages.exists())

    def test_storage_failure_is_not_reported_as_success(self):
        session = ChatSession.objects.create(user=self.user)
        with patch("llm.chat_message_histories.ChatMessage.objects.bulk_create", side_effect=DatabaseError):
            with self.assertRaises(DatabaseError):
                self.client.post(
                    f"/chat/sessions/{session.pk}/messages/", {"content": "hello"}, format="json"
                )
        self.assertFalse(session.messages.exists())
