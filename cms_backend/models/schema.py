import re
from typing import Literal

from models.field_types import ALL_FIELD_TYPES
from pydantic import BaseModel, ConfigDict, Field, field_validator

# Build the Literal type dynamically from the registry so adding a new
# built-in type only requires updating field_types.py (and the frontend registry).
_FieldTypeLiteral = Literal[tuple(ALL_FIELD_TYPES)]  # type: ignore[valid-type]


class SchemaFieldIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    index: int = Field(alias="_index")
    name: str = Field(alias="_name")
    type: _FieldTypeLiteral = Field(default="String", alias="_type")  # type: ignore[valid-type]
    description: str = Field(default="", alias="_description")
    relation: Literal["OneToOne", "OneToMany"] = Field(default="OneToOne", alias="_relation")
    default_value: str = Field(default="", alias="_default_value")
    placeholder: str = Field(default="", alias="_placeholder")
    nested_schema: str = Field(default="", alias="_nested_schema")
    reference_schema: list[str] = Field(default_factory=lambda: [""], alias="_reference_schema")
    rich_text_wrapper: str = Field(default="", alias="_rich_text_wrapper")
    display_name: bool = Field(default=False, alias="_display_name")
    required: bool = Field(default=False, alias="_required")
    schema_name: str = Field(alias="_schema_name")

    @field_validator("schema_name", mode="before")
    @classmethod
    def validate_schema_name(cls, v):
        if not re.match(r"^[A-Z][a-zA-Z]*$", str(v)):
            raise ValueError("Must be PascalCase without numbers (e.g. 'BlogPost')")
        return v

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v):
        if not re.match(r"^[a-z]+(_[a-z]+)*$", str(v)):
            raise ValueError("Must be snake_case without numbers (e.g. 'post_title')")
        return v

    def to_storage(self) -> dict:
        return self.model_dump(by_alias=True)


def get_schema_field_ui_schema(
    schema_names: list[str],
    collection_names: list[str] | None = None,
    rich_text_component_choices: list[str] | None = None,
) -> dict:
    """Returns the UI form schema consumed by the frontend Schema page."""
    non_rich_text_types = [t for t in ALL_FIELD_TYPES if t != "RichText"]
    return {
        "_index": {
            "type": "index",
            "required": True,
            "default": None,
            "choices": None,
            "hide_field_for": {"_type": "all"},
        },
        "_name": {
            "type": "input",
            "required": True,
            "default": None,
            "choices": None,
            "hide_field_for": None,
        },
        "_type": {
            "type": "select",
            "required": True,
            "default": "String",
            "choices": ALL_FIELD_TYPES,
            "hide_field_for": None,
        },
        "_description": {
            "type": "textbox",
            "required": False,
            "default": "",
            "choices": None,
            "hide_field_for": None,
        },
        "_relation": {
            "type": "select",
            "required": True,
            "default": "OneToOne",
            "choices": ["OneToOne", "OneToMany"],
            "hide_field_for": {
                "_type": [
                    "String",
                    "Number",
                    "Boolean",
                    "Email",
                    "Date",
                    "DateTime",
                    "Color",
                    "RichText",
                    "Textarea",
                    "File",
                    "ReferenceDocument",
                ]
            },
        },
        "_default_value": {
            "type": "input",
            "required": False,
            "default": "",
            "choices": None,
            "hide_field_for": {
                "_type": [
                    "ReferenceDocument",
                    "NestedDocument",
                    "RichText",
                    "Textarea",
                    "Image",
                    "File",
                    "URL",
                ]
            },
        },
        "_placeholder": {
            "type": "input",
            "required": False,
            "default": "",
            "choices": None,
            "hide_field_for": {
                "_type": [
                    "Email",
                    "Image",
                    "File",
                    "Color",
                    "Boolean",
                    "NestedDocument",
                    "ReferenceDocument",
                    "RichText",
                ]
            },
        },
        "_nested_schema": {
            "type": "select",
            "required": False,
            "default": "",
            "choices": schema_names,
            "hide_field_for": {
                "_type": [
                    "String",
                    "Number",
                    "Boolean",
                    "Email",
                    "URL",
                    "Date",
                    "DateTime",
                    "Color",
                    "RichText",
                    "Textarea",
                    "Image",
                    "File",
                    "ReferenceDocument",
                ]
            },
        },
        "_reference_schema": {
            "type": "multi-select",
            "required": False,
            "default": "",
            "choices": collection_names or [],
            "hide_field_for": {
                "_type": [
                    "String",
                    "Number",
                    "Boolean",
                    "Email",
                    "URL",
                    "Date",
                    "DateTime",
                    "Color",
                    "RichText",
                    "Textarea",
                    "Image",
                    "File",
                    "NestedDocument",
                ]
            },
        },
        "_rich_text_wrapper": {
            "type": "select",
            "required": False,
            "default": "",
            "choices": rich_text_component_choices or [],
            "hide_field_for": {"_type": non_rich_text_types},
        },
        "_display_name": {
            "type": "radio",
            "required": False,
            "default": False,
            "choices": None,
            "hide_field_for": None,
        },
        "_required": {
            "type": "radio",
            "required": False,
            "default": False,
            "choices": None,
            "hide_field_for": None,
        },
        "_schema_name": {
            "type": "input",
            "required": True,
            "default": None,
            "choices": None,
            "hide_field_for": {"_type": "all"},
        },
    }
