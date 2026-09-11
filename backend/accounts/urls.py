from django.urls import path
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from .views import change_password, set_password, signup

# /api/auth/
urlpatterns = [
    path("signin", TokenObtainPairView.as_view(), name="login"),
    path("token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("signup", signup, name="signup"),
    path("password/request", change_password, name="password_request"),
    path("password", set_password, name="password_reset"),
]
