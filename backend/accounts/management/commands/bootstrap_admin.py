import base64
import binascii
import os

from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import identify_hasher
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Create the environment-configured master administrator once."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_BOOTSTRAP_ADMIN_USERNAME", "").strip()
        encoded_b64 = os.getenv("DJANGO_BOOTSTRAP_ADMIN_PASSWORD_HASH_B64", "").strip()

        if not username and not encoded_b64:
            self.stdout.write("Bootstrap administrator is not configured; skipping.")
            return
        if not username or not encoded_b64:
            raise CommandError("Both bootstrap administrator environment variables are required.")

        try:
            encoded_password = base64.b64decode(encoded_b64, validate=True).decode("ascii")
            identify_hasher(encoded_password)
        except (binascii.Error, UnicodeDecodeError, ValueError) as error:
            raise CommandError("Bootstrap administrator password hash is invalid.") from error

        User = get_user_model()
        username_field = User._meta.get_field(User.USERNAME_FIELD)
        try:
            username = username_field.clean(username, None)
        except ValidationError as error:
            raise CommandError("Bootstrap administrator username is invalid.") from error

        with transaction.atomic():
            user, created = User._default_manager.select_for_update().get_or_create(
                **{User.USERNAME_FIELD: username},
                defaults={
                    "password": encoded_password,
                    "is_active": True,
                    "is_staff": True,
                    "is_superuser": True,
                },
            )

            changed_fields = []
            for field in ("is_active", "is_staff", "is_superuser"):
                if not getattr(user, field):
                    setattr(user, field, True)
                    changed_fields.append(field)
            if changed_fields:
                user.save(update_fields=changed_fields)

        state = "created" if created else "already exists"
        self.stdout.write(self.style.SUCCESS(f"Bootstrap administrator {state}: {username}"))
