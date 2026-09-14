import base64
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password
from django.core.management import CommandError, call_command
from django.test import TestCase


class BootstrapAdminCommandTests(TestCase):
    def settings(self, username="master-test", password="AdminPass9!"):
        encoded = make_password(password)
        return {
            "DJANGO_BOOTSTRAP_ADMIN_USERNAME": username,
            "DJANGO_BOOTSTRAP_ADMIN_PASSWORD_HASH_B64": base64.b64encode(encoded.encode()).decode(),
        }

    def test_creates_master_with_hashed_password(self):
        with patch.dict("os.environ", self.settings(), clear=False):
            call_command("bootstrap_admin")

        user = get_user_model().objects.get(username="master-test")
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password("AdminPass9!"))

    def test_existing_user_gets_permissions_without_password_reset(self):
        User = get_user_model()
        user = User.objects.create_user(username="master-test", password="ChangedPass8!")

        with patch.dict("os.environ", self.settings(), clear=False):
            call_command("bootstrap_admin")

        user.refresh_from_db()
        self.assertTrue(user.is_active)
        self.assertTrue(user.is_staff)
        self.assertTrue(user.is_superuser)
        self.assertTrue(user.check_password("ChangedPass8!"))

    def test_rejects_partial_or_invalid_configuration(self):
        cases = (
            {"DJANGO_BOOTSTRAP_ADMIN_USERNAME": "master-test", "DJANGO_BOOTSTRAP_ADMIN_PASSWORD_HASH_B64": ""},
            {"DJANGO_BOOTSTRAP_ADMIN_USERNAME": "master-test", "DJANGO_BOOTSTRAP_ADMIN_PASSWORD_HASH_B64": "not-base64"},
        )
        for settings in cases:
            with self.subTest(settings=settings):
                with patch.dict("os.environ", settings, clear=False):
                    with self.assertRaises(CommandError):
                        call_command("bootstrap_admin")
