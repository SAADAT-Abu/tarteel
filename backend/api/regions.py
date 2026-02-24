from fastapi import APIRouter
from utils.regions import get_regions_map

router = APIRouter(prefix="/regions", tags=["regions"])


@router.get("", response_model=dict[str, list[str]])
async def list_regions():
    """Public endpoint — returns {country: [city, ...]} for the registration dropdowns."""
    return get_regions_map()
