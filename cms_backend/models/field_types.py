"""
Central registry of all CMS field types.

To add a new built-in compound type (e.g. "BadgeLink"):
  1. Add an entry to COMPOUND_FIELD_TYPES with subfields and defaults.
  2. Done — validation, schema dropdown, and the frontend generic renderer
     all pick it up via GET /api/cms/field-types/.
"""

COMPOUND_FIELD_TYPES: dict[str, dict] = {
    "Image": {
        "dedicated_component": True,
        "default": {"url": "", "alt": "", "width": "", "height": "", "classes": ""},
        "subfields": [
            {"name": "url",     "label": "URL",         "input_type": "text"    },
            {"name": "alt",     "label": "Alt Text",    "input_type": "text"    },
            {"name": "width",   "label": "Width",       "input_type": "number"  },
            {"name": "height",  "label": "Height",      "input_type": "number"  },
            {"name": "classes", "label": "CSS Classes", "input_type": "text"    },
        ],
    },
    "URL": {
        "dedicated_component": True,
        "default": {"url": "", "name": "", "is_external_link": False, "classes": "", "icon_id": ""},
        "subfields": [
            {"name": "url",              "label": "URL",           "input_type": "text"    },
            {"name": "name",             "label": "Name",          "input_type": "text"    },
            {"name": "classes",          "label": "CSS Classes",   "input_type": "text"    },
            {"name": "icon_id",          "label": "Icon ID",       "input_type": "text"    },
            {"name": "is_external_link", "label": "External link", "input_type": "checkbox"},
        ],
    },
    "ScrollLink": {
        "dedicated_component": False,
        "default": {"text": "", "classes": "", "data_section_id": ""},
        "subfields": [
            {"name": "text",            "label": "Button Text", "input_type": "text"},
            {"name": "classes",         "label": "CSS Classes", "input_type": "text"},
            {"name": "data_section_id", "label": "Section ID",  "input_type": "text"},
        ],
    },
}

SCALAR_FIELD_TYPES: list[str] = [
    "String", "Number", "Boolean",
    "Email", "Date", "DateTime",
    "Color", "RichText", "Textarea", "File",
]

RELATIONAL_FIELD_TYPES: list[str] = ["NestedDocument", "ReferenceDocument"]

ALL_FIELD_TYPES: list[str] = (
    SCALAR_FIELD_TYPES
    + list(COMPOUND_FIELD_TYPES.keys())
    + RELATIONAL_FIELD_TYPES
)
