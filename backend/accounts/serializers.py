from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.serializers import TokenRefreshSerializer

User = get_user_model()


class PasswordAwareTokenRefreshSerializer(TokenRefreshSerializer):
    def validate(self, attrs):
        JWTAuthentication().get_user(self.token_class(attrs["refresh"]))
        return super().validate(attrs)


class PasswordValidationMixin:
    """공통 비밀번호 검증 로직"""

    # 비밀번호 검증
    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError("비밀번호는 8자 이상이어야 합니다.")

        if not any(char.isdigit() for char in value) or not any(
            char.isalpha() for char in value
        ):
            raise serializers.ValidationError(
                "비밀번호는 영문자와 숫자를 모두 포함해야 합니다."
            )

        if any(char.isspace() for char in value):
            raise serializers.ValidationError("비밀번호에는 공백을 포함할 수 없습니다.")

        return value


class SignupSerializer(PasswordValidationMixin, serializers.ModelSerializer):
    re_password = serializers.CharField(write_only=True, trim_whitespace=False)

    class Meta:
        model = User
        fields = ["username", "email", "password", "re_password"]
        extra_kwargs = {"password": {"write_only": True, "trim_whitespace": False}}

    # 비밀번호 일치 검증
    def validate(self, attrs):
        if attrs.get("password") != attrs.get("re_password"):
            raise serializers.ValidationError({"re_password": "비밀번호가 서로 다릅니다."})

        try:
            validate_password(attrs["password"], user=User(username=attrs["username"]))
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": error.messages})

        return attrs

    def create(self, validated_data):
        validated_data.pop("re_password")
        return User.objects.create_user(**validated_data)
class SendEmailSerializer(serializers.ModelSerializer):
    """
        이메일을 검증합니다.
    """
    email = serializers.EmailField()

    class Meta:
        model = User
        fields = ["email"]

    def is_valid(self, *, raise_exception=False):
        return super().is_valid(raise_exception=raise_exception)

class ResetPasswordSerializer(PasswordValidationMixin, serializers.ModelSerializer):
    """
        비밀번호 검증 로직
        1. 엑세스 토큰이 있으면 기존 비밀번호와 바꿀 비밀번호 검증 비밀번호를 받아서 검증한다.
        2. 엑세스 토큰이 없으면 parm 에서 토큰을 찾는다. 즉 이메일로 전송된 url을 통해서 비밀번호를 바꾸는 것이다.
    """
    old_password = serializers.CharField(write_only=True, required=False)
    password = serializers.CharField(write_only=True)
    re_password = serializers.CharField(write_only=True)
    token = serializers.CharField(write_only=True, required=False)

    class Meta:
        model = User
        fields = ["old_password", "password", "re_password", "token"]
        extra_kwargs = {"password": {"write_only": True}}

    def validate(self, attrs):
        # 새 비밀번호 일치 검증
        if attrs.get("password") != attrs.get("re_password"):
            raise serializers.ValidationError({"re_password": "비밀번호가 서로 다릅니다."})

        request = self.context.get("request")
        user = getattr(request, "user", None)

        if user and user.is_authenticated:
            old_password = attrs.get("old_password")
            if not old_password:
                raise serializers.ValidationError(
                    {"old_password": "기존 비밀번호를 입력해 주세요."}
                )

            if not user.check_password(old_password):
                raise serializers.ValidationError(
                    {"old_password": "기존 비밀번호가 일치하지 않습니다."}
                )

            attrs.pop("token", None)
            return attrs

        reset_token = self._get_reset_token()
        if not reset_token:
            raise serializers.ValidationError({"token": "비밀번호 재설정 토큰이 필요합니다."})

        attrs["token"] = reset_token
        return attrs

    def _get_reset_token(self):
        request = self.context.get("request")
        if not request:
            return None

        token = request.query_params.get("token") or request.query_params.get("parm")
        if token:
            return token

        view_kwargs = getattr(self.context.get("view"), "kwargs", {})
        return view_kwargs.get("token") or view_kwargs.get("parm")
