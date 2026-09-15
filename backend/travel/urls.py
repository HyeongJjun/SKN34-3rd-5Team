from django.urls import path

from .views import CourseDetailView, CourseListCreateView, CourseReactionView, CourseViewView

urlpatterns = [
    path("courses/", CourseListCreateView.as_view(), name="course-list"),
    path("courses/<uuid:pk>/", CourseDetailView.as_view(), name="course-detail"),
    path("courses/<uuid:pk>/reaction/", CourseReactionView.as_view(), name="course-reaction"),
    path("courses/<uuid:pk>/view/", CourseViewView.as_view(), name="course-view"),
]
