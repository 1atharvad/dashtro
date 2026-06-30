import re

from pydantic import BaseModel, ConfigDict, Field, field_validator


class RichTextComponentIn(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(alias="name")
    source: str = Field(default="", alias="source")
    css: str = Field(default="", alias="css")
    sample_html: str = Field(default="", alias="sampleHtml")

    @field_validator("name", mode="before")
    @classmethod
    def validate_name(cls, v):
        if not re.match(r"^[A-Z][a-zA-Z]*$", str(v)):
            raise ValueError("Must be PascalCase without numbers (e.g. 'CalloutBox')")
        return v

    def to_storage(self) -> dict:
        return self.model_dump(by_alias=True)
