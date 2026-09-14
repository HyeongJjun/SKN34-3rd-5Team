from unittest.mock import patch

from django.contrib.auth.hashers import check_password
from django.core.cache import cache
from django.test import TestCase
from django.urls import Resolver404, resolve, reverse
from rest_framework.test import APIClient

from .models import Course, CourseStop
from .views import CourseWriteThrottle


def course_data(**changes):
    data = {
        "title": "잠실 직관 코스",
        "stadium": "잠실야구장",
        "content": "경기 전 산책",
        "contentFormat": "html",
        "duration": "반나절",
        "tags": ["첫 직관"],
        "startLat": 37.51,
        "startLng": 127.07,
        "stops": [
            {"position": 0, "name": "카페", "lat": 37.5, "lng": 127.1, "category": "카페", "placeId": "p1"},
            {"position": 1, "name": "야구장", "lat": 37.51, "lng": 127.07, "category": "경기 관람", "isMapPoint": True},
        ],
    }
    data.update(changes)
    return data


class CourseApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def create_course(self):
        response = self.client.post("/courses/", course_data(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        return response

    def test_nested_round_trip_ordering_and_token_omission(self):
        created = self.create_course()
        token = created.data["editToken"]
        course = Course.objects.get(pk=created.data["id"])
        self.assertTrue(check_password(token, course.edit_token_hash))
        self.assertEqual(list(course.stops.values_list("position", flat=True)), [0, 1])

        detail = self.client.get(f"/courses/{course.pk}/")
        listing = self.client.get("/courses/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["stops"], course_data()["stops"])
        self.assertNotIn("editToken", detail.data)
        self.assertNotIn("editToken", listing.data[0])
        self.assertNotIn("edit_token_hash", detail.data)

        reversed_stops = list(reversed(course_data()["stops"]))
        reordered = self.client.post("/courses/", course_data(stops=reversed_stops), format="json")
        self.assertEqual(reordered.status_code, 201, reordered.data)
        self.assertEqual([stop["position"] for stop in reordered.data["stops"]], [0, 1])

    def test_patch_and_delete_require_the_edit_token(self):
        created = self.create_course()
        url = f"/courses/{created.data['id']}/"
        self.assertEqual(self.client.patch(url, {"title": "변경"}, format="json").status_code, 403)
        self.assertEqual(self.client.patch(url, {"title": "변경"}, format="json", HTTP_X_COURSE_EDIT_TOKEN="wrong").status_code, 403)
        updated = self.client.patch(url, {"title": "변경"}, format="json", HTTP_X_COURSE_EDIT_TOKEN=created.data["editToken"])
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["title"], "변경")
        self.assertNotIn("editToken", updated.data)
        self.assertEqual(self.client.delete(url, HTTP_X_COURSE_EDIT_TOKEN="wrong").status_code, 403)
        self.assertEqual(self.client.delete(url, HTTP_X_COURSE_EDIT_TOKEN=created.data["editToken"]).status_code, 204)
        self.assertFalse(Course.objects.filter(pk=created.data["id"]).exists())

    def test_validation_rejects_invalid_course_shapes(self):
        invalid = (
            course_data(title=""),
            course_data(title="x" * 81),
            course_data(content="x" * 12001),
            course_data(startLng=None),
            course_data(startLat=91),
            course_data(stops=[]),
            course_data(stops=course_data()["stops"] * 7),
            course_data(stops=[{**course_data()["stops"][0], "lat": 91}]),
            course_data(stops=[{**course_data()["stops"][0], "lng": 181}]),
            course_data(stops=[{**course_data()["stops"][0], "position": 1}]),
            course_data(stops=[course_data()["stops"][0], {**course_data()["stops"][1], "position": 0}]),
        )
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/courses/", payload, format="json").status_code, 400)
        self.assertEqual(Course.objects.count(), 0)

    def test_non_finite_coordinates_never_persist(self):
        invalid = tuple(
            payload
            for value in ("NaN", "Infinity", "-Infinity")
            for payload in (course_data(**{field: value}) for field in ("startLat", "startLng"))
        ) + tuple(
            course_data(stops=[{**course_data()["stops"][0], field: value}])
            for value in ("NaN", "Infinity", "-Infinity")
            for field in ("lat", "lng")
        )
        for payload in invalid:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/courses/", payload, format="json").status_code, 400)
        self.assertEqual(Course.objects.count(), 0)
        self.assertEqual(CourseStop.objects.count(), 0)

        created = self.create_course()
        course = Course.objects.get(pk=created.data["id"])
        old_stops = list(course.stops.values("position", "name", "lat", "lng"))
        response = self.client.patch(
            f"/courses/{course.pk}/",
            {"title": "바뀌면 안 됨", "stops": [{**course_data()["stops"][0], "lng": "NaN"}]},
            format="json",
            HTTP_X_COURSE_EDIT_TOKEN=created.data["editToken"],
        )
        self.assertEqual(response.status_code, 400)
        course.refresh_from_db()
        self.assertEqual(course.title, course_data()["title"])
        self.assertEqual(list(course.stops.values("position", "name", "lat", "lng")), old_stops)

    def test_patch_replacement_requires_every_stop_field_before_mutation(self):
        created = self.create_course()
        course = Course.objects.get(pk=created.data["id"])
        url = f"/courses/{course.pk}/"
        old_stops = list(course.stops.values())

        for field in ("position", "name", "category", "lat", "lng"):
            stop = dict(course_data()["stops"][0])
            stop.pop(field)
            with self.subTest(field=field):
                response = self.client.patch(
                    url,
                    {"title": "바뀌면 안 됨", "stops": [stop]},
                    format="json",
                    HTTP_X_COURSE_EDIT_TOKEN=created.data["editToken"],
                )
                self.assertEqual(response.status_code, 400, response.data)
                course.refresh_from_db()
                self.assertEqual(course.title, course_data()["title"])
                self.assertEqual(list(course.stops.values()), old_stops)

        replacement = [{"position": 0, "name": "새 장소", "lat": 35.0, "lng": 128.0, "category": "식사"}]
        response = self.client.patch(
            url,
            {"stops": replacement},
            format="json",
            HTTP_X_COURSE_EDIT_TOKEN=created.data["editToken"],
        )
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["stops"], replacement)

    def test_failed_stop_replacement_rolls_back_course_and_stops(self):
        created = self.create_course()
        course = Course.objects.get(pk=created.data["id"])
        old_stops = list(course.stops.values("position", "name"))
        replacement = [{"position": 0, "name": "새 장소", "lat": 35.0, "lng": 128.0, "category": "식사"}]
        with patch.object(CourseStop.objects, "bulk_create", side_effect=RuntimeError("db failure")):
            with self.assertRaises(RuntimeError):
                self.client.patch(
                    f"/courses/{course.pk}/",
                    {"title": "저장되면 안 됨", "stops": replacement},
                    format="json",
                    HTTP_X_COURSE_EDIT_TOKEN=created.data["editToken"],
                )
        course.refresh_from_db()
        self.assertEqual(course.title, course_data()["title"])
        self.assertEqual(list(course.stops.values("position", "name")), old_stops)

    def test_anonymous_write_throttle_uses_the_last_trusted_proxy_address(self):
        created = self.create_course()
        url = f"/courses/{created.data['id']}/"
        cases = (
            (lambda address: self.client.post("/courses/", course_data(title=""), format="json", HTTP_X_FORWARDED_FOR=address), 400),
            (lambda address: self.client.patch(url, {"title": "변경"}, format="json", HTTP_X_FORWARDED_FOR=address), 403),
            (lambda address: self.client.delete(url, HTTP_X_FORWARDED_FOR=address), 403),
        )
        with patch.object(CourseWriteThrottle, "THROTTLE_RATES", {"course_write": "1/min"}):
            for index, (request, expected) in enumerate(cases, start=1):
                first = f"192.0.2.{index}"
                second = f"198.51.100.{index}"
                self.assertEqual(request(first).status_code, expected)
                self.assertEqual(request(first).status_code, 429)
                self.assertEqual(request(second).status_code, expected)
                self.assertEqual(request(f"203.0.113.99, {first}").status_code, 429)

    def test_course_routes_match_the_nginx_stripped_api_prefix(self):
        created = self.create_course()
        self.assertEqual(reverse("course-list"), "/courses/")
        self.assertEqual(reverse("course-detail", kwargs={"pk": created.data["id"]}), f"/courses/{created.data['id']}/")
        self.assertEqual(resolve("/courses/").url_name, "course-list")
        self.assertEqual(resolve(f"/courses/{created.data['id']}/").url_name, "course-detail")
        with self.assertRaises(Resolver404):
            resolve("/api/courses/")
