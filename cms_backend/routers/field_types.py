from fastapi import APIRouter
from models.field_types import ALL_FIELD_TYPES, COMPOUND_FIELD_TYPES

router = APIRouter()


@router.get("/field-types/")
def get_field_types():
    """Returns the full field type registry for the frontend to consume."""
    return {
        "all_types": ALL_FIELD_TYPES,
        "compound_types": COMPOUND_FIELD_TYPES,
    }
