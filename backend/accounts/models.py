from django.db import models
from django.contrib.auth.models import AbstractUser

class CustomUser(AbstractUser):
    """
    User 모델은 아래와 같은 필드들을 포함한다.

        username: 유저 고유 이름 (id)(unique)
        password: 유저 패스워드
        email: 이메일
        first_name: 유저 이름
        last_name: 유저 성
        is_staff: 관리자 사이트 접근 여부
        is_active: 계정 활성화 여부
        is_superuser: 슈퍼유저 여부
        last_login: 마지막 로그인 시간
        date_joined: 계정 생성 시간
    """
    birth_date = models.DateField(blank=True, null=True)
    gender = models.CharField(
		max_length=1,
		choices=[("M", "남성"), ("F", "여성")],
		null=True,
		blank=True,
	)