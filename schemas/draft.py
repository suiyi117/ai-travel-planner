"""Pydantic v2 models for trip drafts, constraints, optimization, and driving routes."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class PlaceLocation(StrictModel):
    lat: float = Field(default=0, ge=-90, le=90)
    lng: float = Field(default=0, ge=-180, le=180)
    status: Literal["resolved", "unresolved"] = "unresolved"


class NodeSchedule(StrictModel):
    day_id: str | None = None
    time_window: str | None = None


class NodeConstraints(StrictModel):
    required: bool = False
    fixed_day: bool = False
    fixed_time: bool = False
    fixed_order: bool = False


class PlaceNode(StrictModel):
    id: str
    source: str = Field(max_length=50)
    provider_id: str | None = Field(default=None, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    city_id: str
    city: str = Field(max_length=200)
    location: PlaceLocation = Field(default_factory=PlaceLocation)
    status: Literal["wishlist", "scheduled", "removed"] = "wishlist"
    duration_minutes: int = Field(default=120, ge=0, le=1440)
    schedule: NodeSchedule = Field(default_factory=NodeSchedule)
    constraints: NodeConstraints = Field(default_factory=NodeConstraints)
    manual_rank: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict, max_length=30)


class CityStop(StrictModel):
    id: str
    name: str = Field(min_length=1, max_length=200)
    days: int = Field(default=1, ge=1, le=15)
    transport: str = "auto"
    fixed_order: bool = False


class DayDraft(StrictModel):
    id: str
    day: int = Field(ge=1, le=60)
    date: str | None = None
    primary_city_id: str
    node_ids: list[str] = Field(default_factory=list, max_length=200)
    max_driving_minutes: int | None = Field(default=None, ge=30, le=900)


class TripDraft(StrictModel):
    schema_version: Literal[2]
    id: str
    revision: int = Field(ge=0)
    mode: Literal["itinerary", "self_drive"]
    route_shape: Literal["one_way", "round_trip"]
    strategy: Literal["efficient", "balanced", "experience"]
    start_date: str = ""
    city_stops: list[CityStop] = Field(default_factory=list, max_length=20)
    nodes: list[PlaceNode] = Field(default_factory=list, max_length=200)
    days: list[DayDraft] = Field(default_factory=list, max_length=60)
    route: dict[str, Any] | None = Field(default=None, max_length=30)


class OptimizeScope(StrictModel):
    type: Literal["day", "city", "trip"]
    id: str | None = None


class OptimizeRequest(StrictModel):
    base_revision: int = Field(ge=0)
    scope: OptimizeScope
    draft: TripDraft


class DrivingRouteRequest(StrictModel):
    route_shape: Literal["one_way", "round_trip"]
    nodes: list[PlaceNode] = Field(min_length=2, max_length=20)


class DrivingRouteResponse(StrictModel):
    source: str
    status: Literal["provider", "estimate", "unavailable"]
    route_shape: Literal["one_way", "round_trip"]
    ordered_node_ids: list[str] = Field(default_factory=list)
    segments: list[dict[str, Any]] = Field(default_factory=list)
    totals: dict[str, Any] = Field(default_factory=dict)
    polyline: list[list[float]] = Field(default_factory=list)
    warnings: list[dict[str, Any]] = Field(default_factory=list)
    fetched_at: str = ""
    total_km: float | None = None
    total_driving_minutes: int | None = None
    toll_yuan: float | None = None


class ApiWarning(StrictModel):
    code: str
    message: str
    node_id: str | None = None



class ChangePosition(StrictModel):
    day_id: str | None = None
    index: int | None = None
    route_index: int | None = None


class CandidateDiff(StrictModel):
    type: Literal["add", "move", "remove", "update"]
    node_id: str
    node_name: str
    from_position: ChangePosition | None = None
    to_position: ChangePosition | None = None
    reason: str


class OptimizeResponse(StrictModel):
    base_revision: int
    candidate: TripDraft
    diff: list[CandidateDiff] = Field(default_factory=list)
    warnings: list[ApiWarning] = Field(default_factory=list)
