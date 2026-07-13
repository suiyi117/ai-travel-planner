from typing import Optional

from pydantic import BaseModel


class CityInfo(BaseModel):
    name: str
    days: Optional[int] = None
    transport: Optional[str] = None
    plan_stay: Optional[bool] = None


class PlanRequest(BaseModel):
    destinations: list[CityInfo]
    days: int = 3
    departure: str = ""
    pace: str = "休闲轻松"
    budget: str = "舒适型"
    interests: str = ""
    city_data: list[dict] = []
    global_transport: str = "auto"
    start_date: str = ""
    route_shape: str = "one_way"
