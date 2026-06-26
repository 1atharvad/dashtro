import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SchemaCollectionIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    index: int = Field(alias="_index")
    collection_name: str = Field(alias="_collection_name", max_length=50)
    schema_name: str = Field(alias="_schema_name")

    @field_validator("schema_name", mode="before")
    @classmethod
    def validate_schema_name(cls, v):
        if not re.match(r"^[A-Z][a-zA-Z]*$", str(v)):
            raise ValueError("Must be PascalCase without numbers (e.g. 'BlogPost')")
        return v

    def to_storage(self) -> dict:
        return self.model_dump(by_alias=True)


def get_collection_ui_schema(schema_names: list[str]) -> dict:
    """Returns the UI form schema consumed by the frontend Collections page."""
    return {
        "_index": {
            "type": "index",
            "required": True,
            "default": None,
            "choices": None,
            "hide_field_for": {"_type": "all"},
        },
        "_collection_name": {
            "type": "input",
            "required": True,
            "default": None,
            "choices": None,
            "hide_field_for": None,
        },
        "_schema_name": {
            "type": "select",
            "required": True,
            "default": None,
            "choices": schema_names,
            "hide_field_for": None,
        },
    }
