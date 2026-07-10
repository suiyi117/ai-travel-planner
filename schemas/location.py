"""Stable output contract for Amap reverse-geocoding responses."""

from typing import Optional

from pydantic import BaseModel


class PlaceResult(BaseModel):
    """Normalised place returned to the frontend after reverse geocoding."""

    provider_id: Optional[str] = None
    name: str
    city: str = ""
    lat: float
    lng: float
    address: str = ""


class ReverseGeocodeResponse(BaseModel):
    status: str  # "ok" | "error"
    place: Optional[PlaceResult] = None
    info: str = ""
