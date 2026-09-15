import builtins
import json
import sys
from datetime import date, time
from types import ModuleType
from unittest.mock import Mock, patch
from uuid import uuid4

from django.db import DatabaseError
from django.test import TestCase
from django.utils import timezone
from langchain_core.messages import AIMessage, ToolMessage
from langchain_core.runnables import RunnableLambda

from baseball import models as baseball
from community.models import CommunityPost, PredictionGame
from travel.models import Course, CourseStop

from .chat_service import ChatService
from .tools import DOMAIN_TOOL_NAMES, create_default_tools, create_domain_tools


EXPECTED_NAMES = (
    "get_standings", "get_games", "get_stadium", "get_seat_zones", "get_seat_views",
    "get_ticket_prices", "get_ticket_policies", "get_transport", "get_food_stores",
    "get_facilities", "get_stadium_contents", "get_seat_maps", "search_places",
    "search_courses", "get_course", "search_community_posts", "get_prediction_games",
)


class DomainToolsTest(TestCase):
    databases = {"default"}

    @classmethod
    def setUpTestData(cls):
        now = timezone.now()
        cls.lg, _ = baseball.Team.objects.get_or_create(team_code="LG", defaults={"id": 990001, "team_name_ko": "LG 트윈스"})
        cls.ob, _ = baseball.Team.objects.get_or_create(team_code="OB", defaults={"id": 990002, "team_name_ko": "두산 베어스"})
        cls.stadium = baseball.Stadium.objects.create(
            id=990001, stadium_code="TEST-JAMSIL", stadium_name_ko="테스트 잠실", address="서울",
            longitude="127.071", latitude="37.512", geocode_source="official", collected_at=now,
        )
        cls.lg_context = baseball.HomeContext.objects.create(id=990001, season=2099, team=cls.lg, stadium=cls.stadium)
        cls.ob_context = baseball.HomeContext.objects.create(id=990002, season=2099, team=cls.ob, stadium=cls.stadium)
        cls.game = baseball.Game.objects.create(
            id=990001, game_code="TEST-G1", home_team=cls.lg, away_team=cls.ob, stadium=cls.stadium,
            game_date=date(2099, 9, 15), game_time=time(18, 30), status_code="scheduled",
            game_type="regular", collected_at=now,
        )
        baseball.StandingHistory.objects.create(id=990001, team=cls.lg, snapshot_date=date(2099, 9, 14), rank=2, wins=70, losses=50, draws=2, games_behind="1.0", collected_at=now)
        baseball.StandingHistory.objects.create(id=990002, team=cls.lg, snapshot_date=date(2099, 9, 15), rank=1, wins=71, losses=50, draws=2, games_behind="0", collected_at=now)
        cls.zone = baseball.SeatZone.objects.create(id=990001, home_context=cls.lg_context, zone_code="LG-Z", zone_name_ko="LG석", level="1", side="home", seat_type="chair")
        baseball.SeatZone.objects.create(id=990002, home_context=cls.ob_context, zone_code="OB-Z", zone_name_ko="두산석", level="1", side="home", seat_type="chair")
        baseball.TicketPrice.objects.create(id=990001, seat_zone=cls.zone, price_tier="regular", day_type="weekday", customer_type="adult", price_krw=20000, valid_from=date(2099, 1, 1), valid_to=date(2099, 12, 31), discount_condition="", collected_at=now)
        baseball.TicketPrice.objects.create(id=990002, seat_zone=cls.zone, price_tier="old", day_type="weekday", customer_type="adult", price_krw=10000, valid_to=date(2098, 12, 31), discount_condition="", collected_at=now)
        baseball.TicketPolicy.objects.create(id=990001, policy_code="TEST-LG-GENERAL", team=cls.lg, policy_type="sale", subtype="general", channel_no=1, booking_channel="official", channel_condition="", collected_at=now)
        scope = baseball.SeatScope.objects.create(id=990001, home_context=cls.lg_context, scope_code="S1", scope_name="내야")
        baseball.SeatView.objects.create(id=990001, seat_scope=scope, view_characteristic="가까움", roof_coverage="일부", evidence_scope="공식")
        seat_map = baseball.SeatMap.objects.create(id=990001, home_context=cls.lg_context, map_title="좌석도", page_url="https://example.com/map")
        baseball.SeatMapAsset.objects.create(id=990001, seat_map=seat_map, asset_no=1, asset_url="https://example.com/map.png", asset_role="main")
        baseball.Transport.objects.create(id=990001, stadium=cls.stadium, access_code="SUB", mode="subway", title="지하철", details="2호선", collected_at=now)
        store = baseball.FoodStore.objects.create(id=990001, record_code="TEST-FOOD1", stadium=cls.stadium, store_facility="매점", location_qty=1, collected_at=now)
        baseball.FoodStoreLocation.objects.create(id=990001, food_store=store, location_no=1, floor="1", zone_location="내야")
        baseball.FoodStoreMenu.objects.create(id=990001, food_store=store, menu_category_official="치킨")
        baseball.Facility.objects.create(id=990001, record_code="TEST-FAC1", stadium=cls.stadium, facility_type="toilet", floor="1", side="home", nearby_section="101", gate="1", gender="all", indoor_outdoor="indoor", location_detail="게이트 옆", collected_at=now)
        baseball.StadiumContent.objects.create(id=990001, record_code="TEST-CONT1", stadium=cls.stadium, content_type="photo", name="포토존", floor="1", location="중앙", official_description="사진 장소", operating_condition="상시", collected_at=now)
        cls.course = Course.objects.create(id=uuid4(), route_number="900001", title="잠실 맛집 코스", stadium="잠실", description="경기 전", content="외부 문자열", duration="3시간", tags=["맛집"], author="공개 작성자", edit_token_hash="secret-hash")
        CourseStop.objects.create(course=cls.course, position=0, name="식당", lat=37.5, lng=127.0, category="식당", visit_id="private-provider-token")
        CommunityPost.objects.create(source_id="post-1", post_number="900001", board="teams", team_code="LG", owner=None, idempotency_key="private-key", author="작성자", title="잠실 질문", content="외부 문자열", category="질문")
        PredictionGame.objects.create(source_id="prediction-1", game_date=date(2026, 9, 15), starts_at=now, stadium="잠실", away_team_code="OB", away_team_name="두산", home_team_code="LG", home_team_name="LG", status="scheduled", source_fetched_at=now)

    def setUp(self):
        self.tools = {tool.name: tool for tool in create_domain_tools()}

    def test_registry_and_default_compatibility(self):
        self.assertEqual(DOMAIN_TOOL_NAMES, EXPECTED_NAMES)
        self.assertEqual(tuple(self.tools), EXPECTED_NAMES)
        default_names = tuple(tool.name for tool in create_default_tools())
        self.assertEqual(default_names[:17], EXPECTED_NAMES)
        self.assertEqual(default_names[-2:], ("get_baseball_schema", "execute_baseball_select"))
        model = RunnableLambda(lambda _: AIMessage(content="테스트"))
        self.assertEqual(tuple(tool.name for tool in ChatService(llm=model).tools), default_names)
        self.assertEqual(ChatService(llm=model, tools=()).tools, ())

    def test_all_orm_tools_return_public_stably_sorted_data(self):
        calls = {
            "get_standings": {"snapshot_date": "2099-09-15"},
            "get_games": {"start_date": "2099-09-15", "end_date": "2099-09-15", "team_code": "LG", "stadium_id": 990001},
            "get_stadium": {"stadium_code": "TEST-JAMSIL"},
            "get_seat_zones": {"season": 2099, "team_code": "LG", "stadium_id": 990001},
            "get_seat_views": {"season": 2099, "team_code": "LG", "stadium_id": 990001},
            "get_ticket_prices": {"season": 2099, "team_code": "LG", "stadium_id": 990001, "as_of": "2099-09-15"},
            "get_ticket_policies": {"team_code": "LG", "game_id": 990001},
            "get_transport": {"stadium_id": 990001},
            "get_food_stores": {"stadium_id": 990001},
            "get_facilities": {"stadium_id": 990001},
            "get_stadium_contents": {"stadium_id": 990001},
            "get_seat_maps": {"season": 2099, "team_code": "LG", "stadium_id": 990001},
            "search_courses": {"query": "맛집"},
            "get_course": {"course_id": str(self.course.pk)},
            "search_community_posts": {"query": "잠실", "team_code": "LG"},
            "get_prediction_games": {"game_date": "2026-09-15", "team_code": "LG"},
        }
        results = {name: self.tools[name].invoke(args) for name, args in calls.items()}
        self.assertEqual(results["get_standings"]["actual_date"], "2099-09-15")
        self.assertEqual(results["get_ticket_prices"]["count"], 1)
        self.assertEqual(results["get_seat_zones"]["items"][0]["zone_code"], "LG-Z")
        self.assertNotIn("edit_token_hash", results["get_course"]["item"])
        self.assertNotIn("owner", results["search_community_posts"]["items"][0])
        self.assertNotIn("votes", results["get_prediction_games"]["items"][0])
        self.assertNotIn("locked_at", results["get_prediction_games"]["items"][0])
        for name, result in results.items():
            with self.subTest(tool=name):
                self.assertNotIn("private-key", json.dumps(result, ensure_ascii=False))
                self.assertNotIn("secret-hash", json.dumps(result, ensure_ascii=False))
                self.assertNotIn("private-provider-token", json.dumps(result, ensure_ascii=False))

    def test_exact_date_empty_context_isolation_and_bad_input(self):
        exact = self.tools["get_standings"].invoke({"snapshot_date": "2098-09-13"})
        self.assertEqual(exact, {"requested_date": "2098-09-13", "actual_date": None, "count": 0, "items": []})
        self.assertEqual(self.tools["get_standings"].invoke({})["actual_date"], "2099-09-15")
        ob = self.tools["get_seat_zones"].invoke({"season": 2099, "team_code": "OB", "stadium_id": 990001})
        self.assertEqual([item["zone_code"] for item in ob["items"]], ["OB-Z"])
        for name, args in (
            ("get_games", {"start_date": "2026-09-16", "end_date": "2026-09-15"}),
            ("get_stadium", {"stadium_id": 1, "stadium_code": "JAMSIL"}),
            ("get_seat_zones", {"season": 2026, "team_code": "XX"}),
            ("search_courses", {}),
        ):
            with self.subTest(tool=name):
                self.assertEqual(self.tools[name].invoke(args), "도구 입력 형식이 올바르지 않습니다. 인자 설명을 확인하세요.")

    def test_database_errors_are_sanitized(self):
        with patch("llm.tools.domain.Stadium.objects.filter", side_effect=DatabaseError("password=private")):
            result = self.tools["get_stadium"].invoke({"stadium_id": 1})
        self.assertEqual(result, "저장된 정보를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.")
        self.assertNotIn("private", result)


class PlaceAdapterTest(TestCase):
    args = {"method": "keyword", "query": "야구장 맛집", "category": "FD6", "latitude": 37.5, "longitude": 127.1, "radius": 1000}

    @staticmethod
    def module(search):
        module = ModuleType("travel.place_service")

        class PlaceError(Exception):
            message = "안전한 장소 오류"

        module.PlaceError = PlaceError
        module.search_and_sync_places = search
        return module, PlaceError

    def test_adapter_delegates_exact_contract_and_result(self):
        seen = []
        expected = {"places": [{"id": "1", "place_name": "식당", "x": "127.1", "y": "37.5"}], "hasNextPage": False, "syncedAt": "2026-09-15T10:00:00+00:00"}
        module, _ = self.module(lambda query: seen.append(query) or expected)
        with patch.dict(sys.modules, {"travel.place_service": module}):
            result = create_domain_tools()[12].invoke(self.args)
        self.assertEqual(result, expected)
        self.assertEqual(seen, [{"method": "keyword", "keyword": "야구장 맛집", "category": "FD6", "lat": 37.5, "lng": 127.1, "page": 1, "size": 15, "sort": "distance", "radius": 1000}])

    def test_missing_service_and_service_error_are_safe(self):
        original_import = builtins.__import__

        def missing(name, *args, **kwargs):
            if name == "travel.place_service":
                raise ModuleNotFoundError(name=name)
            return original_import(name, *args, **kwargs)

        with patch("builtins.__import__", side_effect=missing):
            self.assertEqual(create_domain_tools()[12].invoke(self.args), "장소 검색 서비스 통합이 필요합니다.")

        module, error = self.module(None)
        module.search_and_sync_places = lambda _: (_ for _ in ()).throw(error("private detail"))
        with patch.dict(sys.modules, {"travel.place_service": module}):
            self.assertEqual(create_domain_tools()[12].invoke(self.args), "안전한 장소 오류")


class ChatDomainRoutingTest(TestCase):
    @staticmethod
    def service(stream=False):
        seen = []

        def respond(prompt):
            messages = prompt.to_messages()
            seen.append(messages)
            if not any(isinstance(message, ToolMessage) for message in messages):
                return AIMessage(content="", tool_calls=[{"name": "get_stadium", "args": {"stadium_id": 999}, "id": "stadium-1"}])
            return AIMessage(content="조회 결과가 없습니다.")

        model = RunnableLambda(respond)
        model.bind_tools = Mock(return_value=model)
        if stream:
            model.stream = lambda prompt: iter((AIMessage(content="조회 "), AIMessage(content="결과가 없습니다.")))
        return ChatService(llm=model, tools=(create_domain_tools()[2],)), seen

    def test_invoke_and_stream_route_through_typed_tool_with_fake_llm(self):
        invoke_service, invoke_seen = self.service()
        self.assertEqual(invoke_service._run({"question": "구장", "chat_history": []}), "조회 결과가 없습니다.")
        self.assertTrue(any(isinstance(message, ToolMessage) and message.name == "get_stadium" for message in invoke_seen[-1]))

        stream_service, stream_seen = self.service(stream=True)
        self.assertEqual("".join(stream_service.stream_with_history([], "구장")), "조회 결과가 없습니다.")
        self.assertTrue(any(isinstance(message, ToolMessage) and message.name == "get_stadium" for message in stream_seen[-1]))
