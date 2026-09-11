import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


SETTINGS_PATH = Path(__file__).resolve().parents[1] / "config" / "settings.py"


class SettingsRegressionTest(unittest.TestCase):
    def run_settings(self, environment=None):
        env = {"PATH": os.environ.get("PATH", ""), "PYTHONPATH": str(SETTINGS_PATH.parent.parent)}
        env.update(environment or {})
        return subprocess.run(
            [
                sys.executable,
                "-B",
                "-c",
                """
import json
from unittest.mock import patch
from django.conf import Settings

with patch("dotenv.load_dotenv") as load_dotenv:
    settings = Settings("config.settings")
    load_dotenv.assert_called_once_with(settings.BASE_DIR.parent / ".env", override=False)
print(json.dumps({
    "mailers": settings.MAILERS,
    "default_from_email": settings.DEFAULT_FROM_EMAIL,
    "db_host": settings.DATABASES["default"]["HOST"],
    "explicit_settings": sorted(settings._explicit_settings),
    "jwt_uses_secret_key": settings.SIMPLE_JWT["SIGNING_KEY"] == settings.SECRET_KEY,
}))
""",
            ],
            cwd=SETTINGS_PATH.parent.parent,
            env=env,
            capture_output=True,
            text=True,
            timeout=15,
        )

    def load_settings(self, environment=None):
        result = self.run_settings(environment)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_smtp_settings_map_environment_variables(self):
        settings = self.load_settings(
            {
                "EMAIL_HOST": "smtp.example.test",
                "EMAIL_PORT": "2525",
                "EMAIL_HOST_USER": "mailer@example.test",
                "EMAIL_HOST_PASSWORD": "app-password",
                "EMAIL_USE_TLS": " TrUe ",
                "DEFAULT_FROM_EMAIL": "noreply@example.test",
            }
        )

        options = settings["mailers"]["default"]["OPTIONS"]
        self.assertEqual(options["host"], "smtp.example.test")
        self.assertEqual(options["port"], 2525)
        self.assertEqual(options["username"], "mailer@example.test")
        self.assertEqual(options["password"], "app-password")
        self.assertTrue(options["use_tls"])
        self.assertEqual(settings["default_from_email"], "noreply@example.test")

    def test_mailers_do_not_define_deprecated_email_settings(self):
        settings = self.load_settings()

        deprecated = {
            "EMAIL_BACKEND",
            "EMAIL_HOST",
            "EMAIL_PORT",
            "EMAIL_HOST_USER",
            "EMAIL_HOST_PASSWORD",
            "EMAIL_USE_TLS",
        }
        self.assertTrue(deprecated.isdisjoint(settings["explicit_settings"]))

    def test_tls_accepts_true_and_false_values(self):
        for value, expected in (("true", True), (" false ", False), ("TRUE", True)):
            with self.subTest(value=value):
                settings = self.load_settings({"EMAIL_USE_TLS": value})
                self.assertEqual(
                    settings["mailers"]["default"]["OPTIONS"]["use_tls"], expected
                )

    def test_tls_rejects_unknown_values(self):
        result = self.run_settings({"EMAIL_USE_TLS": "yes"})

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("EMAIL_USE_TLS", result.stderr)

    def test_mailpit_is_the_local_default(self):
        settings = self.load_settings()

        options = settings["mailers"]["default"]["OPTIONS"]
        self.assertEqual(options["host"], "mailpit")
        self.assertEqual(options["port"], 1025)
        self.assertFalse(options["use_tls"])

    def test_default_from_email_fallbacks(self):
        cases = (
            ({"EMAIL_HOST_USER": "mailer@example.test"}, "mailer@example.test"),
            ({}, "webmaster@localhost"),
        )
        for environment, expected in cases:
            with self.subTest(environment=environment):
                settings = self.load_settings(environment)
                self.assertEqual(settings["default_from_email"], expected)

    def test_database_host_uses_environment_or_local_default(self):
        self.assertEqual(self.load_settings()["db_host"], "127.0.0.1")
        self.assertEqual(
            self.load_settings({"DB_HOST": "db.example.test"})["db_host"],
            "db.example.test",
        )

    def test_jwt_signing_key_uses_module_secret_key(self):
        self.assertTrue(self.load_settings()["jwt_uses_secret_key"])


if __name__ == "__main__":
    unittest.main()
