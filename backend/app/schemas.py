from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ALLOWED_FIELD_TYPES = {"text", "number", "date", "boolean", "select"}


class CustomFieldDefinition(BaseModel):
    """A user-defined custom field definition stored in control settings."""

    key: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=120)
    type: str = "text"
    options: list[str] = Field(default_factory=list)
    required: bool = False

    @field_validator("key")
    @classmethod
    def normalize_key(cls, value: str) -> str:
        normalized = re.sub(r"[^a-z0-9_]", "", value.strip().lower().replace(" ", "_").replace("-", "_"))
        if not normalized:
            raise ValueError("Field key must contain at least one valid alphanumeric character")
        return normalized[:64]

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        lowered = value.strip().lower()
        if lowered not in ALLOWED_FIELD_TYPES:
            raise ValueError(f"Field type must be one of: {sorted(ALLOWED_FIELD_TYPES)}")
        return lowered


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str


class LoginRequest(BaseModel):
    email: str
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    full_name: str


class LicenseBase(BaseModel):
    client: str = Field(min_length=1)
    region: str = ""
    category: str = Field(min_length=1)
    item_type: str = "License"
    vendor: str = Field(min_length=1)
    product_service: str = Field(min_length=1)
    asset_scope: str = ""
    environment: str = ""
    owner: str = ""
    technical_contact: str = ""
    license_reference: str = ""
    start_date: date | None = None
    expiry_date: date
    eol_date: date | None = None
    renewal_cycle: str = ""
    auto_renew: bool = False
    quantity_purchased: int = 0
    quantity_in_use: int = 0
    quantity_available: int = 0
    unit_cost: float = 0.0
    annual_cost: float = 0.0
    notes: str = ""
    source_url: str = ""
    renewal_owner: str = ""
    email: str = ""
    last_reviewed: date | None = None
    is_certificate: bool = False
    priority: str = "Medium"
    custom_fields: dict[str, Any] = Field(default_factory=dict)

    @field_validator("priority")
    @classmethod
    def normalize_priority(cls, value: str) -> str:
        normalized = value.strip().capitalize()
        return normalized or "Medium"

    @model_validator(mode="after")
    def validate_numeric_fields(self):
        if self.quantity_purchased < 0 or self.quantity_in_use < 0 or self.quantity_available < 0:
            raise ValueError("Quantities cannot be negative")
        if self.unit_cost < 0 or self.annual_cost < 0:
            raise ValueError("Costs cannot be negative")
        return self


class LicenseCreate(LicenseBase):
    pass


class LicenseUpdate(BaseModel):
    client: str | None = None
    region: str | None = None
    category: str | None = None
    item_type: str | None = None
    vendor: str | None = None
    product_service: str | None = None
    asset_scope: str | None = None
    environment: str | None = None
    owner: str | None = None
    technical_contact: str | None = None
    license_reference: str | None = None
    start_date: date | None = None
    expiry_date: date | None = None
    eol_date: date | None = None
    renewal_cycle: str | None = None
    auto_renew: bool | None = None
    quantity_purchased: int | None = None
    quantity_in_use: int | None = None
    quantity_available: int | None = None
    unit_cost: float | None = None
    annual_cost: float | None = None
    notes: str | None = None
    source_url: str | None = None
    renewal_owner: str | None = None
    email: str | None = None
    last_reviewed: date | None = None
    is_certificate: bool | None = None
    priority: str | None = None
    custom_fields: dict[str, Any] | None = None


class LicenseRead(LicenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    utilization_percent: float
    status: str
    days_to_expiry: int | None
    days_to_eol: int | None
    normalized_vendor: str
    normalized_product: str
    predictive_cost: float
    anomaly_score: float
    risk_flags: list[str]
    missing_fields: list[str]
    created_at: datetime
    updated_at: datetime


class AuditLogRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_id: int
    actor: str
    action: str
    field_name: str
    before_value: str
    after_value: str
    created_at: datetime


class SummaryCard(BaseModel):
    label: str
    value: str
    tone: str = "neutral"


class SeriesPoint(BaseModel):
    label: str
    value: float


class HeatmapCell(BaseModel):
    category: str
    bucket: str
    count: int


class RiskItem(BaseModel):
    id: int
    client: str
    product_service: str
    vendor: str
    status: str
    days_to_expiry: int | None
    utilization_percent: float
    anomaly_score: float
    priority: str
    risk_flags: list[str]


class DashboardResponse(BaseModel):
    summary: list[SummaryCard]
    expiry_timeline: list[SeriesPoint]
    category_distribution: list[SeriesPoint]
    utilization_heatmap: list[HeatmapCell]
    risk_items: list[RiskItem]
    alerts: list[RiskItem]
    predictive_insights: dict[str, Any]


class ImportResult(BaseModel):
    imported: int
    updated: int
    skipped: int
    warnings: list[str]


class HealthResponse(BaseModel):
    status: str


ALLOWED_RULE_FIELDS = {
    "client",
    "category",
    "item_type",
    "vendor",
    "product_service",
    "environment",
    "renewal_cycle",
    "auto_renew",
    "status",
    "priority",
    "days_to_expiry",
    "days_to_eol",
    "utilization_percent",
    "annual_cost",
    "unit_cost",
    "quantity_purchased",
    "quantity_in_use",
}

ALLOWED_RULE_OPERATORS = {"<=", "<", ">=", ">", "==", "!=", "contains", "in"}
ALLOWED_RULE_LOGIC = {"AND", "OR"}
ALLOWED_RULE_SCOPES = {"global", "category"}
ALLOWED_RULE_ACTIONS = {"status", "priority", "risk_flag", "anomaly_boost", "notify_owner"}


class RuleCondition(BaseModel):
    field: str
    operator: str
    value: Any
    logic: str = "AND"

    @field_validator("field")
    @classmethod
    def validate_field(cls, value: str) -> str:
        normalized = value.strip()
        if normalized not in ALLOWED_RULE_FIELDS:
            raise ValueError(f"Unsupported rule field: {normalized}")
        return normalized

    @field_validator("operator")
    @classmethod
    def validate_operator(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_RULE_OPERATORS:
            raise ValueError(f"Unsupported rule operator: {value}")
        return normalized

    @field_validator("logic")
    @classmethod
    def validate_logic(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in ALLOWED_RULE_LOGIC:
            raise ValueError(f"Unsupported condition logic: {value}")
        return normalized


class RuleAction(BaseModel):
    type: str
    value: Any = None

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_RULE_ACTIONS:
            raise ValueError(f"Unsupported action type: {value}")
        return normalized


class CustomRule(BaseModel):
    id: str | None = None
    name: str = Field(min_length=1, max_length=120)
    enabled: bool = True
    scope: str = "global"
    category: str | None = None
    conditions: list[RuleCondition] = Field(min_length=1)
    actions: list[RuleAction] = Field(min_length=1)

    @field_validator("scope")
    @classmethod
    def validate_scope(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in ALLOWED_RULE_SCOPES:
            raise ValueError(f"Unsupported rule scope: {value}")
        return normalized

    @model_validator(mode="after")
    def validate_category_scope(self):
        if self.scope == "category" and not (self.category or "").strip():
            raise ValueError("Category-scoped rules require a category value")
        return self


class ControlSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    urgent_days_threshold: int
    review_days_threshold: int
    eol_soon_threshold: int
    default_reminder_lead_time: int
    base_currency: str
    template_version: str
    category_options: list[str]
    item_type_options: list[str]
    environment_options: list[str]
    renewal_cycle_options: list[str]
    auto_renew_options: list[str]
    priority_options: list[str]
    currency_options: list[str]
    custom_rules: list[CustomRule]
    custom_field_definitions: list[CustomFieldDefinition]


class ControlSettingsUpdate(BaseModel):
    urgent_days_threshold: int = Field(ge=0, le=3650)
    review_days_threshold: int = Field(ge=0, le=3650)
    eol_soon_threshold: int = Field(ge=0, le=3650)
    default_reminder_lead_time: int = Field(ge=0, le=3650)
    base_currency: str = Field(min_length=3, max_length=8)
    template_version: str = Field(min_length=1, max_length=16)
    category_options: list[str]
    item_type_options: list[str]
    environment_options: list[str]
    renewal_cycle_options: list[str]
    auto_renew_options: list[str]
    priority_options: list[str]
    currency_options: list[str]
    custom_rules: list[CustomRule] = Field(default_factory=list)
    custom_field_definitions: list[CustomFieldDefinition] = Field(default_factory=list)