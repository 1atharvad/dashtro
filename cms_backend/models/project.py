import re

from pydantic import BaseModel, Field, field_validator


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=500)


class WorkspaceIn(BaseModel):
    workspace_name: str = Field(min_length=1, max_length=50)

    @field_validator("workspace_name", mode="before")
    @classmethod
    def validate_workspace_name(cls, v):
        if not re.match(r"^[a-z][a-z0-9_-]*$", str(v)):
            raise ValueError(
                "Must be lowercase, start with a letter, and contain only letters, numbers, hyphens, or underscores."
            )
        if v == "production":
            raise ValueError("'production' is reserved and cannot be used as a workspace name.")
        return v
