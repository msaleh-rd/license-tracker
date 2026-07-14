export interface User {
  id: number;
  email: string;
  role: 'admin' | 'ops' | 'viewer' | string;
  full_name: string;
}

export interface LicenseItem {
  id: number;
  client: string;
  region: string;
  category: string;
  item_type: string;
  vendor: string;
  product_service: string;
  asset_scope: string;
  environment: string;
  owner: string;
  technical_contact: string;
  email: string;
  license_reference: string;
  start_date: string | null;
  expiry_date: string;
  eol_date: string | null;
  renewal_cycle: string;
  auto_renew: boolean;
  quantity_purchased: number;
  quantity_in_use: number;
  quantity_available: number;
  utilization_percent: number;
  unit_cost: number;
  annual_cost: number;
  status: string;
  days_to_expiry: number | null;
  days_to_eol: number | null;
  priority: string;
  notes: string;
  source_url: string;
  renewal_owner: string;
  last_reviewed: string | null;
  normalized_vendor: string;
  normalized_product: string;
  predictive_cost: number;
  anomaly_score: number;
  risk_flags: string[];
  missing_fields: string[];
  is_certificate: boolean;
  custom_fields: Record<string, string | number | boolean>;
  created_at: string;
  updated_at: string;
}

export interface SummaryCard {
  label: string;
  value: string;
  tone: 'neutral' | 'danger' | 'warning' | 'success' | 'info';
}

export interface SeriesPoint {
  label: string;
  value: number;
}

export interface HeatmapCell {
  category: string;
  bucket: string;
  count: number;
}

export interface RiskItem {
  id: number;
  client: string;
  product_service: string;
  vendor: string;
  status: string;
  days_to_expiry: number | null;
  utilization_percent: number;
  anomaly_score: number;
  priority: string;
  risk_flags: string[];
}

export interface DashboardResponse {
  summary: SummaryCard[];
  expiry_timeline: SeriesPoint[];
  category_distribution: SeriesPoint[];
  utilization_heatmap: HeatmapCell[];
  risk_items: RiskItem[];
  alerts: RiskItem[];
  predictive_insights: {
    forecasted_renewal_cost: number;
    anomaly_count: number;
    missing_fields: number;
    at_risk_spend: number;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: string;
  email: string;
}

export interface AuditLog {
  id: number;
  item_id: number;
  actor: string;
  action: string;
  field_name: string;
  before_value: string;
  after_value: string;
  created_at: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export interface ControlSettings {
  urgent_days_threshold: number;
  review_days_threshold: number;
  eol_soon_threshold: number;
  default_reminder_lead_time: number;
  base_currency: string;
  template_version: string;
  category_options: string[];
  item_type_options: string[];
  environment_options: string[];
  renewal_cycle_options: string[];
  auto_renew_options: string[];
  priority_options: string[];
  currency_options: string[];
  custom_rules: CustomRule[];
  custom_field_definitions: CustomFieldDefinition[];
}

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options: string[];
  required: boolean;
}

export interface RuleCondition {
  field: string;
  operator: '<=' | '<' | '>=' | '>' | '==' | '!=' | 'contains' | 'in';
  value: string | number | boolean;
  logic: 'AND' | 'OR';
}

export interface RuleAction {
  type: 'status' | 'priority' | 'risk_flag' | 'anomaly_boost' | 'notify_owner';
  value: string | number | boolean | null;
}

export interface CustomRule {
  id?: string;
  name: string;
  enabled: boolean;
  scope: 'global' | 'category';
  category?: string | null;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export interface LicenseFormValues {
  client: string;
  region: string;
  category: string;
  item_type: string;
  vendor: string;
  product_service: string;
  asset_scope: string;
  environment: string;
  owner: string;
  technical_contact: string;
  email: string;
  license_reference: string;
  start_date: string;
  expiry_date: string;
  eol_date: string;
  renewal_cycle: string;
  auto_renew: boolean;
  quantity_purchased: number;
  quantity_in_use: number;
  quantity_available: number;
  unit_cost: number;
  annual_cost: number;
  notes: string;
  source_url: string;
  renewal_owner: string;
  last_reviewed: string;
  priority: string;
  is_certificate: boolean;
  custom_fields: Record<string, string | number | boolean>;
}

export const EMPTY_LICENSE_FORM: LicenseFormValues = {
  client: '',
  region: '',
  category: '',
  item_type: 'License',
  vendor: '',
  product_service: '',
  asset_scope: '',
  environment: '',
  owner: '',
  technical_contact: '',
  email: '',
  license_reference: '',
  start_date: '',
  expiry_date: '',
  eol_date: '',
  renewal_cycle: '',
  auto_renew: false,
  quantity_purchased: 0,
  quantity_in_use: 0,
  quantity_available: 0,
  unit_cost: 0,
  annual_cost: 0,
  notes: '',
  source_url: '',
  renewal_owner: '',
  last_reviewed: '',
  priority: 'Medium',
  is_certificate: false,
  custom_fields: {},
};