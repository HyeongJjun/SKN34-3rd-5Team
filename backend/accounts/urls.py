from django.urls import path
from rest_framework_simplejwt.views import (
    TokenBlacklistView,
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import change_password, set_password, signup, get_user

"""
    Django 직접 호출은 /auth/, Nginx 경유는 /api/auth/입니다.
    
    POST /api/auth/signin
    POST /api/auth/token/refresh/
    POST /api/auth/signup/
    POST /api/auth/password/request
    POST /api/auth/password
    GET  /api/auth/user
    POST /api/auth/logout
"""
urlpatterns = [
    path("signin", TokenObtainPairView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("signup/", signup, name="signup"),
    path("password/request", change_password, name="password_request"),
    path("password", set_password, name="password_reset"),
    path("user", get_user, name="auth_user"),
    path("logout", TokenBlacklistView.as_view(), name="auth_logout"),
]
