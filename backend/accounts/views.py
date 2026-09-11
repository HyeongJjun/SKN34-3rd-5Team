from collections.abc import Mapping
from types import SimpleNamespace

from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework import status
from django.db import transaction
from .auth_service import AuthService
from .serializers import SignupSerializer, ResetPasswordSerializer, SendEmailSerializer


@api_view(["POST"])
def signup(request):
    """
        회원가입하는 함수입니다.
        Url : /api/auth/signup/
        Args:
            - username
            - email (선택)
            - password
            - re_password
        Return:
            - HTTP_201_CREATED
    """
    serializer = SignupSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()

    return Response(
        status=status.HTTP_201_CREATED,
    )

@api_view(['POST'])
def change_password(request):
    """
        사용자 비밀번호 재설정 url 을 이메일로 전송합니다.
        Url: /api/auth/password/request
        Args:
            - email
        Return:
            - HTTP_200_OK
        1. 검증
        2. 비밀번호 재설정용 토큰 발급
        3. 이메일 전송
    """
    # 1. 검증
    serializer = SendEmailSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    # 2. 재설정 토큰 발급 및 이메일 전송
    AuthService.send_reset_email(serializer.validated_data['email'])
    return Response(
        status=status.HTTP_200_OK
    )

@api_view(['POST'])
@transaction.atomic
def set_password(request):
    """
        사용자 비밀번호를 변경합니다.
        Url: POST /auth/password
        Query (이메일 재설정): uid, token
        Headers (로그인 상태): Authorization: Bearer <access_token>
        Args:
            - current_password: 기존 비밀번호 (로그인 상태에서 필수)
            - new_password: 새 비밀번호
            - new_password_confirm: 새 비밀번호 확인
        기존 old_password, password, re_password 필드명도 지원합니다.
        Return: HTTP_200_OK
    """
    # 1. 이메일 재설정 토큰 또는 로그인 사용자 확인
    uid = request.query_params.get('uid')
    token = request.query_params.get('token') or request.query_params.get('parm')
    is_reset = uid is not None or token is not None
    user = AuthService.get_password_user(request.user, uid=uid, token=token)

    # 2. 요청 필드명을 기존 serializer에 맞추고 비밀번호 검증
    if not isinstance(request.data, Mapping):
        raise ValidationError({'detail': '객체 형태의 요청 본문이 필요합니다.'})
    data = request.data.copy()
    for source, target in (
        ('current_password', 'old_password'),
        ('new_password', 'password'),
        ('new_password_confirm', 're_password'),
    ):
        if source in data:
            data[target] = data[source]

    # 이메일 토큰 방식은 로그인 여부와 관계없이 기존 비밀번호를 요구하지 않습니다.
    serializer = ResetPasswordSerializer(
        data=data,
        context={'request': SimpleNamespace(
            user=None if is_reset else user,
            query_params=request.query_params,
        )},
    )
    for field in ('old_password', 'password', 're_password'):
        serializer.fields[field].trim_whitespace = False
    serializer.is_valid(raise_exception=True)
    # 3. 비밀번호 정책 검증 및 저장
    AuthService.set_password(user, serializer.validated_data['password'])
    return Response(status=status.HTTP_200_OK)
