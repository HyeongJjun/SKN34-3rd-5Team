from django.urls import path

from .views import CourseDetailView, CourseListCreateView, CourseReactionView, CourseViewView
from .place_views import PlaceDetailView, PlaceListCreateView, PlaceSearchView

urlpatterns = [
    path("places/search/", PlaceSearchView.as_view(), name="place-search"),
    path("places/", PlaceListCreateView.as_view(), name="place-list"),
    path("places/<int:pk>/", PlaceDetailView.as_view(), name="place-detail"),
    path("courses/", CourseListCreateView.as_view(), name="course-list"),
    path("courses/<uuid:pk>/", CourseDetailView.as_view(), name="course-detail"),
    path("courses/<uuid:pk>/reaction/", CourseReactionView.as_view(), name="course-reaction"),
    path("courses/<uuid:pk>/view/", CourseViewView.as_view(), name="course-view"),
]
