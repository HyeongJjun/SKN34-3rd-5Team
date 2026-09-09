"""LangChain 기반 MVP 채팅 서비스."""

from pathlib import Path

from django.db import transaction
from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from .chat_message_histories import DjangoChatMessageHistory
from .models import ChatSession

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


class ChatService:
    def __init__(self):
        self.llm = ChatOpenAI(model="gpt-5.4-mini", timeout=30, max_retries=0)
        self.chain = self.get_chain()

    @staticmethod
    def get_chat_history(user_id: int, conversation_id: int) -> DjangoChatMessageHistory:
        return DjangoChatMessageHistory(
            user_id=user_id,
            session_id=conversation_id,
        )

    def get_chain(self):
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", "You are a helpful assistant."),
                MessagesPlaceholder(variable_name="chat_history"),
                ("human", "{question}"),
            ]
        )
        return prompt | self.llm | StrOutputParser()

    @transaction.atomic
    def invoke(self, user_id: int, conversation_id: int, question: str) -> str:
        """이전 대화로 답변을 생성하고 질문·답변을 함께 저장합니다."""
        # ponytail: 응답 대기 중 채팅방 행을 잠금. 처리량이 늘면 방별 작업 큐로 전환.
        session = ChatSession.objects.select_for_update().get(
            pk=conversation_id, user_id=user_id
        )
        history = self.get_chat_history(user_id, conversation_id)
        answer = self.chain.invoke({"question": question, "chat_history": history.messages})
        # 저장 실패도 호출자에게 전달되도록 콜백 대신 직접 저장합니다.
        history.add_messages([HumanMessage(content=question), AIMessage(content=answer)])
        session.save(update_fields=["updated_at"])
        return answer
