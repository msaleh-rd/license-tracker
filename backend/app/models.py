from __future__ import annotations

from sqlalchemy import Boolean, Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="viewer")
    full_name = Column(String(255), nullable=False, default="")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)


class LicenseItem(Base):
    __tablename__ = "license_items"

    id = Column(Integer, primary_key=True, index=True)
    client = Column(String(255), nullable=False, index=True)
    region = Column(String(120), nullable=False, default="")
    category = Column(String(120), nullable=False, index=True)
    item_type = Column(String(120), nullable=False, default="License")
    vendor = Column(String(255), nullable=False, index=True)
    product_service = Column(String(255), nullable=False, index=True)
    asset_scope = Column(String(255), nullable=False, default="")
    environment = Column(String(120), nullable=False, default="")
    owner = Column(String(255), nullable=False, default="")
    technical_contact = Column(String(255), nullable=False, default="")
    license_reference = Column(String(255), nullable=False, default="", index=True)
    start_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=False, index=True)
    eol_date = Column(Date, nullable=True, index=True)
    renewal_cycle = Column(String(120), nullable=False, default="")
    auto_renew = Column(Boolean, default=False, nullable=False)
    quantity_purchased = Column(Integer, default=0, nullable=False)
    quantity_in_use = Column(Integer, default=0, nullable=False)
    quantity_available = Column(Integer, default=0, nullable=False)
    utilization_percent = Column(Float, default=0.0, nullable=False)
    unit_cost = Column(Float, default=0.0, nullable=False)
    annual_cost = Column(Float, default=0.0, nullable=False)
    status = Column(String(32), default="Review", nullable=False, index=True)
    days_to_expiry = Column(Integer, default=None, nullable=True)
    days_to_eol = Column(Integer, default=None, nullable=True)
    priority = Column(String(32), default="Medium", nullable=False, index=True)
    notes = Column(Text, nullable=False, default="")
    source_url = Column(Text, nullable=False, default="")
    renewal_owner = Column(String(255), nullable=False, default="")
    email = Column(String(255), nullable=False, default="")
    last_reviewed = Column(Date, nullable=True)
    normalized_vendor = Column(String(255), nullable=False, default="", index=True)
    normalized_product = Column(String(255), nullable=False, default="", index=True)
    predictive_cost = Column(Float, default=0.0, nullable=False)
    anomaly_score = Column(Float, default=0.0, nullable=False)
    risk_flags = Column(JSON, nullable=False, default=list)
    missing_fields = Column(JSON, nullable=False, default=list)
    is_certificate = Column(Boolean, default=False, nullable=False)
    custom_fields = Column(JSON, nullable=False, default=dict)
    created_at = Column(DateTime, server_default=func.now(), nullable=False)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    audit_logs = relationship("AuditLog", back_populates="item", cascade="all, delete-orphan")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("license_items.id", ondelete="CASCADE"), nullable=False, index=True)
    actor = Column(String(255), nullable=False, default="system")
    action = Column(String(64), nullable=False)
    field_name = Column(String(255), nullable=False, default="")
    before_value = Column(Text, nullable=False, default="")
    after_value = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, server_default=func.now(), nullable=False)

    item = relationship("LicenseItem", back_populates="audit_logs")


class ControlSettings(Base):
    __tablename__ = "control_settings"

    id = Column(Integer, primary_key=True, index=True)
    urgent_days_threshold = Column(Integer, nullable=False, default=30)
    review_days_threshold = Column(Integer, nullable=False, default=60)
    eol_soon_threshold = Column(Integer, nullable=False, default=90)
    default_reminder_lead_time = Column(Integer, nullable=False, default=60)
    base_currency = Column(String(8), nullable=False, default="USD")
    template_version = Column(String(16), nullable=False, default="1.0")
    category_options = Column(Text, nullable=False, default="SSL Certificate\nServer Management\nEndpoint Security\nVirtualization\nOperating System\nNetwork Appliance\nBackup\nMonitoring\nSaaS\nStack-X\nTickting Solution\nOther")
    item_type_options = Column(Text, nullable=False, default="License\nSubscription\nCertificate\nSupport Contract\nWarranty\nEOL/Lifecycle\nMaintenance\nDomian Subscription\nOther")
    environment_options = Column(Text, nullable=False, default="Production\nDR\nTest\nUAT\nOffice\nCloud\nBranch\nShared")
    renewal_cycle_options = Column(Text, nullable=False, default="Monthly\nQuarterly\nSemi-Annual\nAnnual\nMulti-Year\nOne-Time\nN/A")
    auto_renew_options = Column(Text, nullable=False, default="Yes\nNo")
    priority_options = Column(Text, nullable=False, default="Low\nMedium\nHigh\nCritical")
    currency_options = Column(Text, nullable=False, default="USD\nEUR\nEGP\nSAR\nAED\nGBP\nOther")
    custom_rules = Column(Text, nullable=False, default="[]")
    custom_field_definitions = Column(Text, nullable=False, default="[]")
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)