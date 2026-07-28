import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import { ThemeProvider, type PaletteMode, useTheme } from '@mui/material/styles';
import {
  Alert,
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControl,
  Grid,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DownloadIcon from '@mui/icons-material/Download';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import LogoutIcon from '@mui/icons-material/Logout';
import SearchIcon from '@mui/icons-material/Search';
import ShieldIcon from '@mui/icons-material/Shield';
import InsightsIcon from '@mui/icons-material/Insights';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import LightModeRoundedIcon from '@mui/icons-material/LightModeRounded';
import DarkModeRoundedIcon from '@mui/icons-material/DarkModeRounded';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis, CartesianGrid, BarChart, Bar, LineChart, Line } from 'recharts';

import { createAppTheme, getThemeColors, PALETTE, PALETTE_LIGHT } from './theme';

import GroupIcon from '@mui/icons-material/Group';
import { deleteLicense, exportWorkbook, getAuditLogs, getCategories, getControlSettings, getDashboard, getInsights, getLicenses, getMe, getKeycloakConfig, getUsers, hydrateAuthToken, login, saveLicense, setAuthToken, updateControlSettings, updateUserRole, uploadWorkbook } from './api';
import { initKeycloak, isKeycloakAuthenticated, loginWithKeycloak, logoutKeycloak } from './keycloak';
import { EMPTY_LICENSE_FORM, type AuditLog, type ControlSettings, type CustomFieldDefinition, type CustomRule, type DashboardResponse, type HeatmapCell, type LicenseFormValues, type LicenseItem, type RiskItem, type RuleAction, type RuleCondition, type SummaryCard, type User } from './types';

type SortKey = 'days_to_expiry' | 'utilization_percent' | 'annual_cost' | 'priority' | 'status';

const PRIORITY_ORDER = ['Critical', 'High', 'Medium', 'Low'];

const DEFAULT_CONTROL_OPTIONS = {
  category_options: ['SSL Certificate', 'Server Management', 'Endpoint Security', 'Virtualization', 'Operating System', 'Network Appliance', 'Backup', 'Monitoring', 'SaaS', 'Stack-X', 'Tickting Solution', 'Other'],
  item_type_options: ['License', 'Subscription', 'Certificate', 'Support Contract', 'Warranty', 'EOL/Lifecycle', 'Maintenance', 'Domian Subscription', 'Other'],
  environment_options: ['Production', 'DR', 'Test', 'UAT', 'Office', 'Cloud', 'Branch', 'Shared'],
  renewal_cycle_options: ['Monthly', 'Quarterly', 'Semi-Annual', 'Annual', 'Multi-Year', 'One-Time', 'N/A'],
  auto_renew_options: ['Yes', 'No'],
  priority_options: ['Low', 'Medium', 'High', 'Critical'],
  currency_options: ['USD', 'EUR', 'EGP', 'SAR', 'AED', 'GBP', 'Other'],
};

const RULE_FIELD_OPTIONS = [
  'days_to_expiry',
  'days_to_eol',
  'utilization_percent',
  'annual_cost',
  'unit_cost',
  'quantity_purchased',
  'quantity_in_use',
  'category',
  'vendor',
  'product_service',
  'environment',
  'renewal_cycle',
  'auto_renew',
  'status',
  'priority',
] as const;

const RULE_OPERATOR_OPTIONS: RuleCondition['operator'][] = ['<=', '<', '>=', '>', '==', '!=', 'contains', 'in'];
const RULE_ACTION_OPTIONS: RuleAction['type'][] = ['status', 'priority', 'risk_flag', 'anomaly_boost', 'notify_owner'];

function makeRuleId() {
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function slugifyKey(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || `field_${Date.now()}`;
}

function emptyFieldDef(): CustomFieldDefinition {
  return { key: `custom_field_${Date.now()}`, label: 'New field', type: 'text', options: [], required: false };
}

function emptyCondition(): RuleCondition {
  return {
    field: 'days_to_expiry',
    operator: '<=',
    value: 30,
    logic: 'AND',
  };
}

function emptyAction(): RuleAction {
  return {
    type: 'status',
    value: 'Urgent',
  };
}

function emptyRule(): CustomRule {
  return {
    id: makeRuleId(),
    name: 'New rule',
    enabled: true,
    scope: 'global',
    category: null,
    conditions: [emptyCondition()],
    actions: [emptyAction()],
  };
}

const REQUIRED_FIELDS: Array<{ key: keyof LicenseFormValues; label: string }> = [
  { key: 'client', label: 'Client' },
  { key: 'category', label: 'Category' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'product_service', label: 'Product / Service' },
  { key: 'expiry_date', label: 'Expiry Date' },
];

function normalizeOptions(options: string[] | undefined, fallback: string[]): string[] {
  const normalized = (options ?? [])
    .map((item) => String(item).trim())
    .filter((item, index, array) => item.length > 0 && array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
  return normalized.length > 0 ? normalized : fallback;
}

function parseOptionsInput(rawText: string): string[] {
  return rawText
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter((item, index, array) => item.length > 0 && array.findIndex((candidate) => candidate.toLowerCase() === item.toLowerCase()) === index);
}

/** Keeps raw text locally so Enter inserts newlines without being stripped by parseOptionsInput */
function OptionsTextField({ label, options, onOptionsChange, minRows = 3, maxRows = 10 }: {
  label: string;
  options: string[];
  onOptionsChange: (newOptions: string[]) => void;
  minRows?: number;
  maxRows?: number;
}) {
  const [rawText, setRawText] = useState(() => options.join('\n'));

  // Sync from parent when options array changes externally (e.g. after save/load)
  useEffect(() => {
    setRawText((prev) => {
      const parsed = parseOptionsInput(prev);
      if (JSON.stringify(parsed) !== JSON.stringify(options)) {
        return options.join('\n');
      }
      return prev;
    });
  }, [options]);

  return (
    <TextField
      label={label}
      multiline
      minRows={minRows}
      maxRows={maxRows}
      fullWidth
      value={rawText}
      onChange={(e) => setRawText(e.target.value)}
      onBlur={() => {
        const parsed = parseOptionsInput(rawText);
        onOptionsChange(parsed);
      }}
      onKeyDown={(e) => e.stopPropagation()}
    />
  );
}

function App() {
  const [tokenReady, setTokenReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [licenses, setLicenses] = useState<LicenseItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [insights, setInsights] = useState<Record<string, number>>({});
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('days_to_expiry');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LicenseItem | null>(null);
  const [draft, setDraft] = useState<LicenseFormValues>(EMPTY_LICENSE_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [deleteCandidate, setDeleteCandidate] = useState<LicenseItem | null>(null);
  const [importNotice, setImportNotice] = useState<string>('');
  const [importBusy, setImportBusy] = useState(false);
  const [currencyCode, setCurrencyCode] = useState(() => localStorage.getItem('license_tracker_currency') || 'USD');
  const [themeMode, setThemeMode] = useState<PaletteMode>(() => (localStorage.getItem('license_tracker_theme') as PaletteMode) || 'dark');
  const [controlSettings, setControlSettings] = useState<ControlSettings | null>(null);
  const [controlDialogOpen, setControlDialogOpen] = useState(false);
  const [controlDraft, setControlDraft] = useState<ControlSettings | null>(null);
  const [controlSaveBusy, setControlSaveBusy] = useState(false);
  const [controlError, setControlError] = useState('');
  const [usersList, setUsersList] = useState<User[]>([]);
  const [usersDialogOpen, setUsersDialogOpen] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');

  const appTheme = useMemo(() => createAppTheme(themeMode), [themeMode]);

  const themeColors = getThemeColors(themeMode);
  const formOptions = useMemo(() => ({
    category_options: normalizeOptions(controlSettings?.category_options, DEFAULT_CONTROL_OPTIONS.category_options),
    item_type_options: normalizeOptions(controlSettings?.item_type_options, DEFAULT_CONTROL_OPTIONS.item_type_options),
    environment_options: normalizeOptions(controlSettings?.environment_options, DEFAULT_CONTROL_OPTIONS.environment_options),
    renewal_cycle_options: normalizeOptions(controlSettings?.renewal_cycle_options, DEFAULT_CONTROL_OPTIONS.renewal_cycle_options),
    auto_renew_options: normalizeOptions(controlSettings?.auto_renew_options, DEFAULT_CONTROL_OPTIONS.auto_renew_options),
    priority_options: normalizeOptions(controlSettings?.priority_options, DEFAULT_CONTROL_OPTIONS.priority_options),
    currency_options: normalizeOptions(controlSettings?.currency_options, DEFAULT_CONTROL_OPTIONS.currency_options),
  }), [controlSettings]);

  const currencyOptions = useMemo(() => {
    const options = formOptions.currency_options;
    if (options.includes(currencyCode)) {
      return options;
    }
    return [currencyCode, ...options];
  }, [currencyCode, formOptions.currency_options]);

  useEffect(() => {
    async function init() {
      try {
        const config = await getKeycloakConfig();
        if (config.enabled) {
          const authenticated = await initKeycloak(config);
          if (authenticated) {
            setTokenReady(true);
            void bootstrap();
            return;
          }
        }
      } catch (err) {
        console.error('SSO Initialization Error:', err);
      }
      const token = hydrateAuthToken();
      setTokenReady(true);
      if (!token) {
        setLoading(false);
        return;
      }
      void bootstrap();
    }
    void init();
  }, []);

  useEffect(() => {
    localStorage.setItem('license_tracker_currency', currencyCode);
  }, [currencyCode]);

  useEffect(() => {
    localStorage.setItem('license_tracker_theme', themeMode);
  }, [themeMode]);

  async function bootstrap() {
    try {
      setLoading(true);
      const [me, dashboardData, licenseRows, logRows, categoryRows, insightsData] = await Promise.all([
        getMe(),
        getDashboard(),
        getLicenses(),
        getAuditLogs().catch(() => []),
        getCategories().catch(() => []),
        getInsights().catch(() => ({})),
      ]);
      const control = await getControlSettings().catch(() => null);
      setUser(me);
      setDashboard(dashboardData);
      setLicenses(licenseRows);
      setAuditLogs(logRows);
      setCategories(categoryRows);
      setInsights(insightsData);
      if (control) {
        const normalizedControl: ControlSettings = {
          ...control,
          custom_rules: Array.isArray(control.custom_rules) ? control.custom_rules : [],
          custom_field_definitions: Array.isArray(control.custom_field_definitions) ? control.custom_field_definitions : [],
        };
        setControlSettings(normalizedControl);
        setControlDraft(normalizedControl);
        setCurrencyCode((current) => current || normalizedControl.base_currency || 'USD');
      }
    } finally {
      setLoading(false);
    }
  }

  function openControlDialog() {
    if (!controlSettings) {
      return;
    }
    setControlDraft({
      ...controlSettings,
      custom_rules: Array.isArray(controlSettings.custom_rules) ? controlSettings.custom_rules : [],
      custom_field_definitions: Array.isArray(controlSettings.custom_field_definitions) ? controlSettings.custom_field_definitions : [],
    });
    setControlError('');
    setControlDialogOpen(true);
  }

  function updateRule(ruleIndex: number, updater: (rule: CustomRule) => CustomRule) {
    setControlDraft((current) => {
      if (!current) {
        return current;
      }
      const rules = [...(current.custom_rules ?? [])];
      rules[ruleIndex] = updater(rules[ruleIndex]);
      return { ...current, custom_rules: rules };
    });
  }

  function addRule() {
    setControlDraft((current) => {
      if (!current) {
        return current;
      }
      return { ...current, custom_rules: [...(current.custom_rules ?? []), emptyRule()] };
    });
  }

  function removeRule(ruleIndex: number) {
    setControlDraft((current) => {
      if (!current) {
        return current;
      }
      return { ...current, custom_rules: (current.custom_rules ?? []).filter((_, index) => index !== ruleIndex) };
    });
  }

  function addFieldDef() {
    setControlDraft((current) => {
      if (!current) {
        return current;
      }
      return { ...current, custom_field_definitions: [...(current.custom_field_definitions ?? []), emptyFieldDef()] };
    });
  }

  function updateFieldDef(fieldIndex: number, updater: (def: CustomFieldDefinition) => CustomFieldDefinition) {
    setControlDraft((current) => {
      if (!current) {
        return current;
      }
      const defs = [...(current.custom_field_definitions ?? [])];
      defs[fieldIndex] = updater(defs[fieldIndex]);
      return { ...current, custom_field_definitions: defs };
    });
  }

  function removeFieldDef(fieldIndex: number) {
    setControlDraft((current) => {
      if (!current) {
        return current;
      }
      return { ...current, custom_field_definitions: (current.custom_field_definitions ?? []).filter((_, index) => index !== fieldIndex) };
    });
  }

  async function openUsersDialog() {
    setUsersError('');
    setUsersDialogOpen(true);
    try {
      setUsersLoading(true);
      const list = await getUsers();
      setUsersList(list);
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setUsersError(typeof msg === 'string' ? msg : 'Failed to fetch user list.');
    } finally {
      setUsersLoading(false);
    }
  }

  async function handleRoleChange(targetUserId: number, newRole: string) {
    try {
      setUsersError('');
      const updated = await updateUserRole(targetUserId, newRole);
      setUsersList((current) => current.map((u) => (u.id === targetUserId ? updated : u)));
      if (user && user.id === targetUserId) {
        setUser(updated);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail;
      setUsersError(typeof msg === 'string' ? msg : 'Failed to update user role.');
    }
  }

  async function handleSaveControls() {
    if (!controlDraft) {
      return;
    }
    try {
      setControlSaveBusy(true);
      setControlError('');
      const updated = await updateControlSettings(controlDraft);
      setControlSettings(updated);
      setControlDraft(updated);
      setCurrencyCode(updated.base_currency);
      setControlDialogOpen(false);
      await bootstrap();
    } catch (error: any) {
      const apiMessage = error?.response?.data?.detail;
      setControlError(typeof apiMessage === 'string' ? apiMessage : 'Could not save control settings.');
    } finally {
      setControlSaveBusy(false);
    }
  }

  async function handleLoginSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    try {
      setLoginError('');
      await login({
        email: String(formData.get('email') || ''),
        password: String(formData.get('password') || ''),
      });
      await bootstrap();
    } catch (error) {
      setLoginError('Invalid credentials or unavailable backend.');
      console.error(error);
    }
  }

  function handleLogout() {
    setAuthToken(null);
    setUser(null);
    setDashboard(null);
    setLicenses([]);
    setAuditLogs([]);
    setCategories([]);
    if (isKeycloakAuthenticated()) {
      void logoutKeycloak();
    }
  }

  function openCreateDrawer() {
    setSelectedItem(null);
    setDraft(EMPTY_LICENSE_FORM);
    setSaveError('');
    setDrawerOpen(true);
  }

  function openEditDrawer(item: LicenseItem) {
    setSelectedItem(item);
    setDraft(licenseToDraft(item));
    setSaveError('');
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setSaveError('');
    setDrawerOpen(false);
  }

  function handleDraftChange(field: keyof LicenseFormValues, value: string | number | boolean) {
    if (field === 'custom_fields') {
      try {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        setDraft((current) => ({ ...current, custom_fields: parsed as Record<string, string | number | boolean> }));
      } catch {
        // ignore malformed JSON
      }
      return;
    }
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSave() {
    const missing = REQUIRED_FIELDS.filter(({ key }) => {
      const value = draft[key];
      return typeof value === 'string' ? value.trim() === '' : value === null || value === undefined;
    });

    if (missing.length > 0) {
      setSaveError(`Please fill required fields: ${missing.map((item) => item.label).join(', ')}`);
      return;
    }

    try {
      setSaving(true);
      setSaveError('');
      await saveLicense(selectedItem?.id ?? null, draft);
      setDrawerOpen(false);
      await bootstrap();
    } catch (error: any) {
      const apiMessage = error?.response?.data?.detail;
      setSaveError(typeof apiMessage === 'string' ? apiMessage : 'Saving failed. Please check required fields and date values.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteConfirmed() {
    if (!deleteCandidate) {
      return;
    }
    await deleteLicense(deleteCandidate.id);
    setDeleteCandidate(null);
    await bootstrap();
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setImportBusy(true);
    try {
      const result = await uploadWorkbook(file);
      setImportNotice(`Imported ${result.imported}, updated ${result.updated}, skipped ${result.skipped}. ${result.warnings.join(' ')}`.trim());
      await bootstrap();
    } finally {
      setImportBusy(false);
      event.target.value = '';
    }
  }

  const filteredLicenses = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = licenses.filter((item) => {
      const matchesQuery = !needle || [item.client, item.vendor, item.product_service, item.owner, item.renewal_owner, item.email, item.license_reference].some((value) => value.toLowerCase().includes(needle));
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });

    return rows.sort((left, right) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      switch (sortKey) {
        case 'priority':
          return direction * (PRIORITY_ORDER.indexOf(left.priority) - PRIORITY_ORDER.indexOf(right.priority));
        case 'status':
          return direction * left.status.localeCompare(right.status);
        default:
          return direction * ((left[sortKey] as number) - (right[sortKey] as number));
      }
    });
  }, [categoryFilter, licenses, query, sortDirection, sortKey, statusFilter]);

  if (!tokenReady || loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginScreen error={loginError} onSubmit={handleLoginSubmit} />;
  }

  return (
    <ThemeProvider theme={appTheme}>
      <Box
        className="app-shell"
        sx={{
          background:
            themeMode === 'dark'
              ? 'radial-gradient(circle at top left, rgba(59, 130, 246, 0.25), transparent 30%), radial-gradient(circle at right 20%, rgba(245, 158, 11, 0.18), transparent 24%), linear-gradient(180deg, #07111f 0%, #050b15 100%)'
              : 'radial-gradient(circle at top left, rgba(14, 165, 233, 0.12), transparent 34%), radial-gradient(circle at right 15%, rgba(249, 115, 22, 0.10), transparent 28%), linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)',
        }}
      >
      <Box className="orb orb-a" sx={{ opacity: themeMode === 'dark' ? 1 : 0.6 }} />
      <Box className="orb orb-b" sx={{ opacity: themeMode === 'dark' ? 1 : 0.5 }} />
      <AppBar
        position="sticky"
        elevation={0}
        color="transparent"
        sx={{
          backgroundColor: themeMode === 'dark' ? 'rgba(7, 17, 31, 0.72)' : 'rgba(248, 250, 252, 0.92)',
          color: themeMode === 'dark' ? 'text.primary' : '#0f172a',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Avatar sx={{ bgcolor: 'secondary.main', color: 'background.default', fontWeight: 900 }}>LH</Avatar>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <Typography variant="h6" fontWeight={800}>License Lifecycle Hub</Typography>
            <Typography variant="body2" color="text.secondary">Centralized license, certificate, and lifecycle tracking</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip icon={<ShieldIcon />} label={user.role} color={user.role === 'admin' ? 'success' : user.role === 'ops' ? 'warning' : 'default'} variant="outlined" />
            <Chip label={user.email} variant="outlined" />
            {user.role === 'admin' && (
              <Button startIcon={<GroupIcon />} onClick={openUsersDialog} variant="outlined">
                Users
              </Button>
            )}
            <Button startIcon={<TuneIcon />} onClick={openControlDialog} variant="outlined" disabled={user.role === 'viewer'}>
              Controls
            </Button>
            <Tooltip title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} mode`}>
              <IconButton
                onClick={() => setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'))}
                color="inherit"
                sx={{
                  border: '1px solid',
                  borderColor: themeMode === 'dark' ? 'rgba(148, 163, 184, 0.35)' : 'rgba(100, 116, 139, 0.35)',
                  bgcolor: themeMode === 'dark' ? 'rgba(15, 23, 42, 0.45)' : 'rgba(255, 255, 255, 0.85)',
                }}
              >
                {themeMode === 'dark' ? <LightModeRoundedIcon /> : <DarkModeRoundedIcon />}
              </IconButton>
            </Tooltip>
            <Button startIcon={<DownloadIcon />} onClick={() => { void exportWorkbook(); }} variant="outlined">Export</Button>
            <Button component="label" startIcon={importBusy ? <CircularProgress size={16} color="inherit" /> : <CloudUploadIcon />} variant="outlined">
              Import
              <input hidden type="file" accept=".xlsx" onChange={handleImport} />
            </Button>
            <Button startIcon={<AddIcon />} onClick={openCreateDrawer} variant="contained" disabled={user.role === 'viewer'}>
              New Record
            </Button>
            <IconButton onClick={handleLogout} color="inherit">
              <LogoutIcon />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ py: 4, position: 'relative', zIndex: 1 }}>
        <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3, borderRadius: 5, background: themeColors.gradientBg }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ xs: 'flex-start', md: 'center' }}>
            <Box>
              <Typography variant="h3" sx={{ mt: 0.5 }}>Track renewals, usage, and risk in one place.</Typography>
            </Box>
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Chip label={`${dashboard?.risk_items.length ?? 0} risky items`} color="warning" />
              <Chip label={`${dashboard?.alerts.length ?? 0} alerts`} color="error" />
            </Stack>
          </Stack>
          {importNotice ? <Alert severity="info" sx={{ mt: 2 }}>{importNotice}</Alert> : null}
        </Paper>

        <Box sx={{ display: 'flex', gap: 2.5, mb: 2, flexWrap: 'wrap' }}>
          {(dashboard?.summary ?? []).map((card, index) => (
            <Box key={card.label} sx={{ flex: '1 1 0', minWidth: 120 }}>
              <SummaryTile card={card} index={index} />
            </Box>
          ))}
        </Box>

        <Grid container spacing={2.5} sx={{ mb: 2 }}>
          <Grid item xs={12} lg={7}>
            <Paper sx={{ p: 2.5, height: '100%' }}>
              <SectionHeading title="Expiry timeline" subtitle="Monthly counts of records expiring over time" icon={<InsightsIcon />} />
              <Box sx={{ height: 420 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboard?.expiry_timeline ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke={themeMode === 'dark' ? 'rgba(148,163,184,0.15)' : 'rgba(148,163,184,0.25)'} />
                      <XAxis dataKey="label" stroke={themeMode === 'dark' ? '#94a3b8' : '#64748b'} tick={{ fontSize: 12 }} />
                      <YAxis stroke={themeMode === 'dark' ? '#94a3b8' : '#64748b'} tick={{ fontSize: 12 }} allowDecimals={false} />
                    <RechartsTooltip contentStyle={{ background: themeColors.tooltipBg, borderColor: themeColors.tooltipBorder, color: themeColors.tooltipText, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />
                      <Line type="monotone" dataKey="value" stroke={themeMode === 'dark' ? '#7dd3fc' : '#0284c7'} strokeWidth={3} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} lg={5}>
            <Paper sx={{ p: 2.5, height: '100%' }}>
              <SectionHeading title="Category mix" subtitle="Distribution of tracked items by category" icon={<WarningAmberIcon />} />
              <Box sx={{ height: 280 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={dashboard?.category_distribution ?? []} dataKey="value" nameKey="label" innerRadius={60} outerRadius={110} paddingAngle={4}>
                      {(dashboard?.category_distribution ?? []).map((entry, index) => (
                        <Cell key={entry.label} fill={(themeMode === 'dark' ? PALETTE : PALETTE_LIGHT)[index % (themeMode === 'dark' ? PALETTE.length : PALETTE_LIGHT.length)]} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ background: themeColors.tooltipBg, borderColor: themeColors.tooltipBorder, color: themeColors.tooltipText, borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1.2, mt: 2 }}>
                {(dashboard?.category_distribution ?? []).map((entry, index) => {
                  const color = (themeMode === 'dark' ? PALETTE : PALETTE_LIGHT)[index % (themeMode === 'dark' ? PALETTE.length : PALETTE_LIGHT.length)];
                  return (
                    <Stack key={entry.label} direction="row" spacing={1} alignItems="center">
                      <Box sx={{ width: 12, height: 12, borderRadius: '2px', bgcolor: color, flexShrink: 0 }} />
                      <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>{entry.label}</Typography>
                    </Stack>
                  );
                })}
              </Box>
            </Paper>
          </Grid>
        </Grid>

        <Grid container spacing={2.5} sx={{ mb: 2 }}>
          <Grid item xs={12} lg={8}>
            <Paper sx={{ p: 2.5 }}>
              <SectionHeading title="License register" subtitle="Search, sort, edit, and review tracked records" icon={<ShieldIcon />} />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
                <TextField fullWidth placeholder="Search client, vendor, product, owner, email..." value={query} onChange={(event) => setQuery(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> }} />
                <FormControl fullWidth>
                  <InputLabel>Status</InputLabel>
                  <Select label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    {['all', 'Active', 'Review', 'Urgent', 'Expired', 'Missing Expiry Info'].map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
                  </Select>
                </FormControl>
                <FormControl fullWidth>
                  <InputLabel>Category</InputLabel>
                  <Select label="Category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
                    <MenuItem value="all">All</MenuItem>
                    {categories.map((category) => <MenuItem key={category} value={category}>{category}</MenuItem>)}
                  </Select>
                </FormControl>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {(['days_to_expiry', 'utilization_percent', 'annual_cost', 'priority', 'status'] as SortKey[]).map((key) => (
                  <Chip key={key} label={`Sort by ${key.replace(/_/g, ' ')}`} color={sortKey === key ? 'primary' : 'default'} onClick={() => setSortKey((current) => current === key ? key : key)} onDelete={sortKey === key ? () => setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc') : undefined} />
                ))}
              </Stack>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: 2350 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Client</TableCell>
                      <TableCell>Site / Region</TableCell>
                      <TableCell>Item Type</TableCell>
                      <TableCell>Environment</TableCell>
                      <TableCell>Vendor / Product</TableCell>
                      <TableCell>Renewal Cycle</TableCell>
                      <TableCell>Auto Renew</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Expiry</TableCell>
                      <TableCell>Support / EOL</TableCell>
                      <TableCell>Last Reviewed</TableCell>
                      <TableCell>Utilization</TableCell>
                      <TableCell>Unit Cost</TableCell>
                      <TableCell>Annual Cost</TableCell>
                      <TableCell>Priority</TableCell>
                      <TableCell>Primary Owner</TableCell>
                      <TableCell>Renewal Owner</TableCell>
                      <TableCell>Technical Contact</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Notes</TableCell>
                      {(controlSettings?.custom_field_definitions ?? []).map((fieldDef) => (
                        <TableCell key={fieldDef.key}>{fieldDef.label}</TableCell>
                      ))}
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredLicenses.map((item) => (
                      <TableRow key={item.id} hover>
                        <TableCell>
                          <Typography fontWeight={700}>{item.client}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.category || '—'}</Typography>
                        </TableCell>
                        <TableCell>{item.region || '—'}</TableCell>
                        <TableCell>{item.item_type || '—'}</TableCell>
                        <TableCell>{item.environment || '—'}</TableCell>
                        <TableCell>
                          <Typography>{item.vendor || '—'}</Typography>
                          <Typography variant="caption" color="text.secondary">{item.product_service || '—'}</Typography>
                        </TableCell>
                        <TableCell>{item.renewal_cycle || '—'}</TableCell>
                        <TableCell>{item.auto_renew ? 'Yes' : 'No'}</TableCell>
                        <TableCell>
                          <StatusChip status={item.status} />
                        </TableCell>
                        <TableCell>
                          <Typography>{formatDate(item.expiry_date)}</Typography>
                          <Typography variant="caption" color={item.days_to_expiry != null && item.days_to_expiry < 0 ? 'error.main' : 'text.secondary'}>{item.days_to_expiry != null ? `${item.days_to_expiry} days` : '—'}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography>{item.eol_date ? formatDate(item.eol_date) : '—'}</Typography>
                          <Typography variant="caption" color={item.days_to_eol != null && item.days_to_eol < 0 ? 'error.main' : 'text.secondary'}>{item.days_to_eol != null ? `${item.days_to_eol} days` : '—'}</Typography>
                        </TableCell>
                        <TableCell>{formatDate(item.last_reviewed)}</TableCell>
                        <TableCell>
                          {(() => {
                            const utilization = item.quantity_purchased > 0
                              ? Number(((item.quantity_in_use / item.quantity_purchased) * 100).toFixed(1))
                              : 0;
                            return (
                              <>
                                <Typography>{utilization.toFixed(1)}%</Typography>
                                <Typography variant="caption" color={utilization > 100 ? 'error.main' : utilization < 20 ? 'warning.main' : 'text.secondary'}>{item.quantity_in_use}/{item.quantity_purchased}</Typography>
                              </>
                            );
                          })()}
                        </TableCell>
                        <TableCell>{formatCurrency(item.unit_cost, currencyCode)}</TableCell>
                        <TableCell>{formatCurrency(item.annual_cost, currencyCode)}</TableCell>
                        <TableCell>{item.priority}</TableCell>
                        <TableCell>{item.owner || '—'}</TableCell>
                        <TableCell>{item.renewal_owner || '—'}</TableCell>
                        <TableCell>{item.technical_contact || '—'}</TableCell>
                        <TableCell>{item.email || '—'}</TableCell>
                        <TableCell>
                          <Typography variant="body2" noWrap sx={{ maxWidth: 220 }} title={item.notes || '—'}>
                            {item.notes || '—'}
                          </Typography>
                        </TableCell>
                        {(controlSettings?.custom_field_definitions ?? []).map((fieldDef) => {
                          const customVal = (item.custom_fields as Record<string, unknown>)?.[fieldDef.key];
                          const display = customVal === undefined || customVal === null || customVal === '' ? '—' : String(customVal);
                          return (
                            <TableCell key={fieldDef.key}>
                              <Typography variant="body2" noWrap sx={{ maxWidth: 160 }} title={display}>
                                {display}
                              </Typography>
                            </TableCell>
                          );
                        })}
                        <TableCell align="right">
                          <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                            <Tooltip title="Edit"><span><IconButton size="small" disabled={user.role === 'viewer'} onClick={() => openEditDrawer(item)}><EditIcon fontSize="small" /></IconButton></span></Tooltip>
                            <Tooltip title="Delete"><span><IconButton size="small" disabled={user.role !== 'admin'} onClick={() => setDeleteCandidate(item)}><DeleteIcon fontSize="small" /></IconButton></span></Tooltip>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </Paper>
          </Grid>
          <Grid item xs={12} lg={4}>
            <Stack spacing={2.5}>
              <Paper sx={{ p: 2.5 }}>
                <SectionHeading title="Risk panel" subtitle="Top items that need action" icon={<WarningAmberIcon />} />
                <Stack spacing={1.5}>
                  {(dashboard?.risk_items ?? []).map((item) => <RiskRow key={item.id} item={item} />)}
                </Stack>
              </Paper>
              <Paper sx={{ p: 2.5 }}>
                <SectionHeading title="Utilization heatmap" subtitle="Quickly spot under- and over-used categories" icon={<InsightsIcon />} />
                <Heatmap data={dashboard?.utilization_heatmap ?? []} />
              </Paper>
              <Paper sx={{ p: 2.5 }}>
                <SectionHeading title="Predictive insights" subtitle="Forecasted renewal cost and anomaly signals" icon={<InsightsIcon />} />
                <Grid container spacing={1.5}>
                  <InsightChip label="Forecast renewal cost" value={formatCurrency(insights.forecasted_renewal_cost ?? dashboard?.predictive_insights.forecasted_renewal_cost ?? 0, currencyCode)} tone="info" />
                  <InsightChip label="Anomaly count" value={String(insights.anomaly_count ?? dashboard?.predictive_insights.anomaly_count ?? 0)} tone="warning" />
                  <InsightChip label="Missing fields" value={String(insights.missing_fields ?? dashboard?.predictive_insights.missing_fields ?? 0)} tone="danger" />
                  <InsightChip label="At risk spend" value={formatCurrency(insights.at_risk_spend ?? dashboard?.predictive_insights.at_risk_spend ?? 0, currencyCode)} tone="success" />
                </Grid>
              </Paper>
            </Stack>
          </Grid>
        </Grid>

        <Grid container spacing={2.5}>
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 2.5 }}>
              <SectionHeading title="Alerts & workflow" subtitle="Expired, urgent, and review queue" icon={<WarningAmberIcon />} />
              <Stack spacing={1.2}>
                {(dashboard?.alerts ?? []).map((item) => (
                  <Alert key={item.id} severity={item.status === 'Expired' ? 'error' : item.status === 'Urgent' || item.status === 'Missing Expiry Info' ? 'warning' : 'info'}>
                    {item.client} · {item.product_service} · {item.days_to_expiry != null ? `${item.days_to_expiry} days remaining` : 'no expiry date'} · {item.risk_flags.join(', ') || 'status review'}
                  </Alert>
                ))}
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 2.5 }}>
              <SectionHeading title="Audit trail" subtitle="Recent changes and actors" icon={<ShieldIcon />} />
              <Stack spacing={1.1}>
                {auditLogs.slice(0, 8).map((entry) => (
                  <Box key={entry.id} sx={{ p: 1.2, borderRadius: 2, bgcolor: themeColors.componentBg }}>
                    <Typography variant="body2" fontWeight={700}>{entry.actor} · {entry.action} · {entry.field_name}</Typography>
                    <Typography variant="caption" color="text.secondary">{entry.before_value || '—'} → {entry.after_value || '—'}</Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>

      <Drawer anchor="right" open={drawerOpen} onClose={closeDrawer} PaperProps={{ sx: { width: { xs: '100%', md: 920 }, p: 2 } }}>
        <Stack spacing={2} sx={{ height: '100%' }}>
          <Box>
            <Typography variant="h5" fontWeight={800}>{selectedItem ? 'Edit record' : 'Create record'}</Typography>
            <Typography variant="body2" color="text.secondary">Dashboard, lifecycle, ownership, and financial fields stay in sync.</Typography>
          </Box>
          <Divider />
          {saveError ? <Alert severity="error">{saveError}</Alert> : null}
          <Box sx={{ flex: 1, overflowY: 'auto', pr: 1 }}>
            <LicenseForm draft={draft} onChange={handleDraftChange} optionLists={formOptions} customFieldDefs={controlSettings?.custom_field_definitions ?? []} />
          </Box>
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Button onClick={closeDrawer}>Cancel</Button>
            <Button variant="contained" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save record'}</Button>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteCandidate)} onClose={() => setDeleteCandidate(null)}>
        <DialogTitle>Delete record</DialogTitle>
        <DialogContent>
          <Typography>Remove {deleteCandidate?.product_service} from the register?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteCandidate(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDeleteConfirmed}>Delete</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={controlDialogOpen} onClose={() => setControlDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Control / Threshold Settings</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {controlError ? <Alert severity="error">{controlError}</Alert> : null}
            <TextField
              type="number"
              label="Urgent days threshold"
              value={controlDraft?.urgent_days_threshold ?? 30}
              onChange={(event) => setControlDraft((current) => current ? { ...current, urgent_days_threshold: Number(event.target.value) } : current)}
              fullWidth
            />
            <TextField
              type="number"
              label="Review days threshold"
              value={controlDraft?.review_days_threshold ?? 60}
              onChange={(event) => setControlDraft((current) => current ? { ...current, review_days_threshold: Number(event.target.value) } : current)}
              fullWidth
            />
            <TextField
              type="number"
              label="EOL soon threshold"
              value={controlDraft?.eol_soon_threshold ?? 90}
              onChange={(event) => setControlDraft((current) => current ? { ...current, eol_soon_threshold: Number(event.target.value) } : current)}
              fullWidth
            />
            <TextField
              type="number"
              label="Default reminder lead time"
              value={controlDraft?.default_reminder_lead_time ?? 60}
              onChange={(event) => setControlDraft((current) => current ? { ...current, default_reminder_lead_time: Number(event.target.value) } : current)}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>Base currency</InputLabel>
              <Select
                label="Base currency"
                value={controlDraft?.base_currency ?? 'USD'}
                onChange={(event) => setControlDraft((current) => current ? { ...current, base_currency: event.target.value } : current)}
              >
                {formOptions.currency_options.map((code) => (
                  <MenuItem key={code} value={code}>{code}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Template version"
              value={controlDraft?.template_version ?? '1.0'}
              onChange={(event) => setControlDraft((current) => current ? { ...current, template_version: event.target.value } : current)}
              fullWidth
            />
            <OptionsTextField
              label="Category list"
              options={controlDraft?.category_options ?? []}
              onOptionsChange={(opts) => setControlDraft((current) => current ? { ...current, category_options: opts } : current)}
            />
            <OptionsTextField
              label="Item type list"
              options={controlDraft?.item_type_options ?? []}
              onOptionsChange={(opts) => setControlDraft((current) => current ? { ...current, item_type_options: opts } : current)}
            />
            <OptionsTextField
              label="Environment list"
              options={controlDraft?.environment_options ?? []}
              onOptionsChange={(opts) => setControlDraft((current) => current ? { ...current, environment_options: opts } : current)}
            />
            <OptionsTextField
              label="Renewal cycle list"
              options={controlDraft?.renewal_cycle_options ?? []}
              onOptionsChange={(opts) => setControlDraft((current) => current ? { ...current, renewal_cycle_options: opts } : current)}
            />
            <OptionsTextField
              label="Auto renew list"
              minRows={2}
              maxRows={8}
              options={controlDraft?.auto_renew_options ?? []}
              onOptionsChange={(opts) => setControlDraft((current) => current ? { ...current, auto_renew_options: opts } : current)}
            />
            <OptionsTextField
              label="Priority list"
              minRows={2}
              maxRows={8}
              options={controlDraft?.priority_options ?? []}
              onOptionsChange={(opts) => setControlDraft((current) => current ? { ...current, priority_options: opts } : current)}
            />
            <OptionsTextField
              label="Currency list"
              minRows={2}
              maxRows={8}
              options={controlDraft?.currency_options ?? []}
              onOptionsChange={(opts) => setControlDraft((current) => current ? { ...current, currency_options: opts } : current)}
            />

            <Divider />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>Custom Fields</Typography>
                <Typography variant="body2" color="text.secondary">Define extra columns that appear in the form and table. Changes take effect immediately after saving.</Typography>
              </Box>
              <Button variant="outlined" onClick={addFieldDef}>Add Field</Button>
            </Stack>

            {(controlDraft?.custom_field_definitions ?? []).map((fieldDef, fieldIndex) => (
              <Paper key={fieldDef.key || `field-${fieldIndex}`} sx={{ p: 1.5, bgcolor: themeColors.componentBg }}>
                <Stack spacing={1.2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                    <TextField
                      label="Label (display name)"
                      value={fieldDef.label}
                      fullWidth
                      onChange={(event) => {
                        const newLabel = event.target.value;
                        updateFieldDef(fieldIndex, (current) => ({
                          ...current,
                          label: newLabel,
                          // Auto-update key only if it still matches the old slug
                          key: current.key === slugifyKey(current.label) ? slugifyKey(newLabel) : current.key,
                        }));
                      }}
                    />
                    <TextField
                      label="Field key (internal)"
                      value={fieldDef.key}
                      fullWidth
                      inputProps={{ pattern: '[a-z0-9_]+' }}
                      helperText="Lowercase letters, numbers, underscores only"
                      onChange={(event) => updateFieldDef(fieldIndex, (current) => ({ ...current, key: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                    />
                    <FormControl fullWidth>
                      <InputLabel>Type</InputLabel>
                      <Select
                        label="Type"
                        value={fieldDef.type}
                        onChange={(event) => updateFieldDef(fieldIndex, (current) => ({ ...current, type: event.target.value as CustomFieldDefinition['type'] }))}
                      >
                        <MenuItem value="text">Text</MenuItem>
                        <MenuItem value="number">Number</MenuItem>
                        <MenuItem value="date">Date</MenuItem>
                        <MenuItem value="boolean">Yes / No</MenuItem>
                        <MenuItem value="select">Select (from list)</MenuItem>
                      </Select>
                    </FormControl>
                  </Stack>
                  {fieldDef.type === 'select' ? (
                    <OptionsTextField
                      label="Options (one per line)"
                      minRows={2}
                      maxRows={8}
                      options={fieldDef.options ?? []}
                      onOptionsChange={(opts) => updateFieldDef(fieldIndex, (current) => ({ ...current, options: opts }))}
                    />
                  ) : null}
                  <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                    <Chip label={fieldDef.required ? 'Required' : 'Optional'} color={fieldDef.required ? 'warning' : 'default'} size="small" />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => updateFieldDef(fieldIndex, (current) => ({ ...current, required: !current.required }))}>
                        Toggle required
                      </Button>
                      <Button size="small" color="error" onClick={() => removeFieldDef(fieldIndex)}>
                        Delete
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Paper>
            ))}

            <Divider />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Box>
                <Typography variant="subtitle1" fontWeight={800}>Custom Rules</Typography>
                <Typography variant="body2" color="text.secondary">Define IF conditions and THEN actions without changing backend code.</Typography>
              </Box>
              <Button variant="outlined" onClick={addRule}>Add Rule</Button>
            </Stack>

            {(controlDraft?.custom_rules ?? []).map((rule, ruleIndex) => (
              <Paper key={rule.id ?? `rule-${ruleIndex}`} sx={{ p: 1.5, bgcolor: themeColors.componentBg }}>
                <Stack spacing={1.2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
                    <TextField
                      label="Rule Name"
                      value={rule.name}
                      onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, name: event.target.value }))}
                      fullWidth
                    />
                    <FormControl fullWidth>
                      <InputLabel>Scope</InputLabel>
                      <Select
                        label="Scope"
                        value={rule.scope}
                        onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, scope: event.target.value as CustomRule['scope'] }))}
                      >
                        <MenuItem value="global">Global</MenuItem>
                        <MenuItem value="category">Per Category</MenuItem>
                      </Select>
                    </FormControl>
                    {rule.scope === 'category' ? (
                      <FormControl fullWidth>
                        <InputLabel>Category</InputLabel>
                        <Select
                          label="Category"
                          value={rule.category ?? ''}
                          onChange={(event) => updateRule(ruleIndex, (current) => ({ ...current, category: event.target.value || null }))}
                        >
                          <MenuItem value=""><em>Select</em></MenuItem>
                          {formOptions.category_options.map((category) => (
                            <MenuItem key={category} value={category}>{category}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    ) : null}
                  </Stack>

                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={700}>Conditions</Typography>
                    <Button
                      size="small"
                      onClick={() => updateRule(ruleIndex, (current) => ({ ...current, conditions: [...current.conditions, emptyCondition()] }))}
                    >
                      Add condition
                    </Button>
                  </Stack>
                  {rule.conditions.map((condition, conditionIndex) => (
                    <Stack key={`${rule.id ?? ruleIndex}-cond-${conditionIndex}`} direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      {conditionIndex > 0 ? (
                        <FormControl fullWidth>
                          <InputLabel>Join</InputLabel>
                          <Select
                            label="Join"
                            value={condition.logic}
                            onChange={(event) => updateRule(ruleIndex, (current) => ({
                              ...current,
                              conditions: current.conditions.map((entry, idx) => idx === conditionIndex ? { ...entry, logic: event.target.value as RuleCondition['logic'] } : entry),
                            }))}
                          >
                            <MenuItem value="AND">AND</MenuItem>
                            <MenuItem value="OR">OR</MenuItem>
                          </Select>
                        </FormControl>
                      ) : null}
                      <FormControl fullWidth>
                        <InputLabel>Field</InputLabel>
                        <Select
                          label="Field"
                          value={condition.field}
                          onChange={(event) => updateRule(ruleIndex, (current) => ({
                            ...current,
                            conditions: current.conditions.map((entry, idx) => idx === conditionIndex ? { ...entry, field: event.target.value } : entry),
                          }))}
                        >
                          {RULE_FIELD_OPTIONS.map((fieldName) => (
                            <MenuItem key={fieldName} value={fieldName}>{fieldName}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <FormControl fullWidth>
                        <InputLabel>Operator</InputLabel>
                        <Select
                          label="Operator"
                          value={condition.operator}
                          onChange={(event) => updateRule(ruleIndex, (current) => ({
                            ...current,
                            conditions: current.conditions.map((entry, idx) => idx === conditionIndex ? { ...entry, operator: event.target.value as RuleCondition['operator'] } : entry),
                          }))}
                        >
                          {RULE_OPERATOR_OPTIONS.map((operator) => (
                            <MenuItem key={operator} value={operator}>{operator}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <TextField
                        fullWidth
                        label="Value"
                        value={String(condition.value ?? '')}
                        onChange={(event) => updateRule(ruleIndex, (current) => ({
                          ...current,
                          conditions: current.conditions.map((entry, idx) => idx === conditionIndex ? { ...entry, value: event.target.value } : entry),
                        }))}
                      />
                      <Button
                        color="error"
                        onClick={() => updateRule(ruleIndex, (current) => ({
                          ...current,
                          conditions: current.conditions.filter((_, idx) => idx !== conditionIndex),
                        }))}
                        disabled={rule.conditions.length <= 1}
                      >
                        Remove
                      </Button>
                    </Stack>
                  ))}

                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="body2" fontWeight={700}>Actions</Typography>
                    <Button
                      size="small"
                      onClick={() => updateRule(ruleIndex, (current) => ({ ...current, actions: [...current.actions, emptyAction()] }))}
                    >
                      Add action
                    </Button>
                  </Stack>
                  {rule.actions.map((action, actionIndex) => (
                    <Stack key={`${rule.id ?? ruleIndex}-action-${actionIndex}`} direction={{ xs: 'column', md: 'row' }} spacing={1}>
                      <FormControl fullWidth>
                        <InputLabel>Action Type</InputLabel>
                        <Select
                          label="Action Type"
                          value={action.type}
                          onChange={(event) => updateRule(ruleIndex, (current) => ({
                            ...current,
                            actions: current.actions.map((entry, idx) => idx === actionIndex ? { ...entry, type: event.target.value as RuleAction['type'] } : entry),
                          }))}
                        >
                          {RULE_ACTION_OPTIONS.map((actionType) => (
                            <MenuItem key={actionType} value={actionType}>{actionType}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
            {action.type === 'notify_owner' ? (
            <TextField fullWidth label="Action Value" value="" disabled helperText="No value needed." />
            ) : action.type === 'status' ? (
            <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                label="Status"
                value={String(action.value ?? '')}
                onChange={(event) => updateRule(ruleIndex, (current) => ({
                    ...current,
                    actions: current.actions.map((entry, idx) => idx === actionIndex ? { ...entry, value: event.target.value } : entry),
                }))}
                >
                {['Active', 'Review', 'Urgent', 'Expired', 'Missing Expiry Info'].map((s) => (
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
                </Select>
            </FormControl>
            ) : action.type === 'priority' ? (
            <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                label="Priority"
                value={String(action.value ?? '')}
                onChange={(event) => updateRule(ruleIndex, (current) => ({
                    ...current,
                    actions: current.actions.map((entry, idx) => idx === actionIndex ? { ...entry, value: event.target.value } : entry),
                }))}
                >
                {formOptions.priority_options.map((p) => (
                    <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
                </Select>
            </FormControl>
            ) : action.type === 'anomaly_boost' ? (
            <TextField
                fullWidth
                label="Boost amount"
                type="number"
                inputProps={{ min: 0, step: 1 }}
                value={action.value === null ? '' : String(action.value)}
                helperText="Added to anomaly score (e.g. 25)"
                onChange={(event) => updateRule(ruleIndex, (current) => ({
                ...current,
                actions: current.actions.map((entry, idx) => idx === actionIndex ? { ...entry, value: Number(event.target.value) } : entry),
                }))}
            />
            ) : (
            <TextField
                fullWidth
                label="Flag label"
                value={action.value === null ? '' : String(action.value)}
                helperText="Text shown as a risk flag"
                onChange={(event) => updateRule(ruleIndex, (current) => ({
                ...current,
                actions: current.actions.map((entry, idx) => idx === actionIndex ? { ...entry, value: event.target.value } : entry),
                }))}
            />
            )}
                      <Button
                        color="error"
                        onClick={() => updateRule(ruleIndex, (current) => ({
                          ...current,
                          actions: current.actions.filter((_, idx) => idx !== actionIndex),
                        }))}
                        disabled={rule.actions.length <= 1}
                      >
                        Remove
                      </Button>
                    </Stack>
                  ))}

                  <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                    <Chip label={rule.enabled ? 'Enabled' : 'Disabled'} color={rule.enabled ? 'success' : 'default'} size="small" />
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => updateRule(ruleIndex, (current) => ({ ...current, enabled: !current.enabled }))}>
                        {rule.enabled ? 'Disable' : 'Enable'}
                      </Button>
                      <Button size="small" color="error" onClick={() => removeRule(ruleIndex)}>
                        Delete Rule
                      </Button>
                    </Stack>
                  </Stack>
                </Stack>
              </Paper>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setControlDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSaveControls} disabled={controlSaveBusy || !controlDraft}>
            {controlSaveBusy ? 'Saving...' : 'Save controls'}
          </Button>
        </DialogActions>
      </Dialog>
      <UserManagementDialog
        open={usersDialogOpen}
        onClose={() => setUsersDialogOpen(false)}
        users={usersList}
        loading={usersLoading}
        error={usersError}
        currentUserId={user.id}
        onRoleChange={handleRoleChange}
      />
    </Box>
    </ThemeProvider>
  );
}

function LoadingScreen() {
  return (
    <Box className="loading-screen">
      <Paper sx={{ p: 4, textAlign: 'center', minWidth: 340 }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ mt: 2 }}>Starting lifecycle hub</Typography>
        <Typography variant="body2" color="text.secondary">Loading the API-driven dashboard and automation layers.</Typography>
      </Paper>
    </Box>
  );
}

function LoginScreen({ error, onSubmit }: { error: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void }) {
  const [kcLoading, setKcLoading] = useState(false);

  const handleKeycloakLogin = async (idpHint?: string) => {
    try {
      setKcLoading(true);
      await loginWithKeycloak(idpHint);
    } catch (err) {
      console.error(err);
      setKcLoading(false);
    }
  };

  return (
    <Box className="login-screen">
      <Paper className="login-card" sx={{ p: 4, maxWidth: 440, width: '100%' }}>
        <Stack spacing={2.5} component="form" onSubmit={onSubmit}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Avatar sx={{ bgcolor: 'secondary.main', color: 'background.default' }}><LockOutlinedIcon /></Avatar>
            <Box>
              <Typography variant="h5" fontWeight={800}>License Lifecycle Hub</Typography>
              <Typography variant="body2" color="text.secondary">Sign in via Microsoft Single Sign-On or Demo credentials.</Typography>
            </Box>
          </Stack>

          <Stack spacing={1.5}>
            <Button
              variant="contained"
              color="primary"
              size="large"
              disabled={kcLoading}
              onClick={() => handleKeycloakLogin('microsoft')}
              startIcon={
                <svg width="18" height="18" viewBox="0 0 23 23">
                  <path fill="#f35325" d="M1 1h10v10H1z"/>
                  <path fill="#81bc06" d="M12 1h10v10H12z"/>
                  <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                  <path fill="#ffba08" d="M12 12h10v10H12z"/>
                </svg>
              }
              sx={{ py: 1.2, fontWeight: 700, textTransform: 'none' }}
            >
              Sign in with Microsoft Outlook
            </Button>
          </Stack>

          <Divider sx={{ my: 1 }}>
            <Typography variant="caption" color="text.secondary">OR DEMO CREDENTIALS</Typography>
          </Divider>

          <TextField name="email" label="Username or Email" defaultValue="admin" fullWidth size="small" />
          <TextField name="password" label="Password" type="password" defaultValue="admin" fullWidth size="small" />
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Button type="submit" variant="contained" size="large" color="secondary">Enter dashboard</Button>
        </Stack>
      </Paper>
    </Box>
  );
}

const TILE_PALETTE_DARK = [
  { bg: 'rgba(99, 179, 237, 0.15)',  fg: '#93c5fd' }, // Total — blue
  { bg: 'rgba(248, 113, 113, 0.15)', fg: '#fca5a5' }, // Expired — red
  { bg: 'rgba(251, 146, 60, 0.15)',  fg: '#fdba74' }, // Urgent — orange
  { bg: 'rgba(250, 204, 21, 0.15)',  fg: '#fde047' }, // Missing — yellow
  { bg: 'rgba(74, 222, 128, 0.15)',  fg: '#86efac' }, // Active — green
  { bg: 'rgba(167, 139, 250, 0.15)', fg: '#c4b5fd' }, // Review — purple
  { bg: 'rgba(56, 189, 248, 0.15)',  fg: '#7dd3fc' }, // Annual cost — sky
];

const TILE_PALETTE_LIGHT = [
  { bg: 'rgba(59, 130, 246, 0.10)',  fg: '#1d4ed8' }, // Total — blue
  { bg: 'rgba(220, 38, 38, 0.10)',   fg: '#b91c1c' }, // Expired — red
  { bg: 'rgba(234, 88, 12, 0.10)',   fg: '#c2410c' }, // Urgent — orange
  { bg: 'rgba(202, 138, 4, 0.10)',   fg: '#a16207' }, // Missing — yellow
  { bg: 'rgba(22, 163, 74, 0.10)',   fg: '#15803d' }, // Active — green
  { bg: 'rgba(109, 40, 217, 0.10)',  fg: '#7c3aed' }, // Review — purple
  { bg: 'rgba(2, 132, 199, 0.10)',   fg: '#0369a1' }, // Annual cost — sky
];

function SummaryTile({ card, index = 0 }: { card: SummaryCard; index?: number }) {
  const muiTheme = useTheme();
  const palette = muiTheme.palette.mode === 'dark' ? TILE_PALETTE_DARK : TILE_PALETTE_LIGHT;
  const tone = palette[index % palette.length];
  return (
    <Paper sx={{ p: 2.2, height: '100%', background: tone.bg }}>
      <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 1.6, textTransform: 'uppercase' }}>{card.label}</Typography>
      <Typography variant="h4" sx={{ mt: 1, color: tone.fg }}>{card.value}</Typography>
    </Paper>
  );
}

function SectionHeading({ title, subtitle, icon }: { title: string; subtitle: string; icon: React.ReactNode }) {
  const muiTheme = useTheme();
  return (
    <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ mb: 2 }}>
      <Avatar sx={{ bgcolor: muiTheme.palette.mode === 'dark' ? 'rgba(125, 211, 252, 0.14)' : 'rgba(14, 165, 233, 0.12)', color: 'primary.main' }}>{icon}</Avatar>
      <Box>
        <Typography variant="h6" fontWeight={800}>{title}</Typography>
        <Typography variant="body2" color="text.secondary">{subtitle}</Typography>
      </Box>
    </Stack>
  );
}

function StatusChip({ status }: { status: string }) {
  const muiTheme = useTheme();
  const themeColors = getThemeColors(muiTheme.palette.mode as PaletteMode);
  const statusColor = themeColors.statusColors[status as keyof typeof themeColors.statusColors] ?? (muiTheme.palette.mode === 'dark' ? '#94a3b8' : '#475569');
  return <Chip size="small" label={status} sx={{ bgcolor: `${statusColor}22`, color: statusColor, fontWeight: 800 }} />;
}

function RiskRow({ item }: { item: RiskItem }) {
  const muiTheme = useTheme();
  const themeColors = getThemeColors(muiTheme.palette.mode as PaletteMode);
  return (
    <Paper sx={{ p: 1.5, bgcolor: themeColors.componentBgDark }}>
      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
        <Box>
          <Typography fontWeight={800}>{item.client}</Typography>
          <Typography variant="body2" color="text.secondary">{item.vendor} · {item.product_service}</Typography>
        </Box>
        <Chip size="small" label={`${item.anomaly_score.toFixed(0)} risk`} color={item.anomaly_score >= 40 ? 'error' : item.anomaly_score >= 20 ? 'warning' : 'info'} />
      </Stack>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 1 }}>
        <Chip size="small" label={item.status} variant="outlined" />
        <Chip size="small" label={item.days_to_expiry != null ? `${item.days_to_expiry} days` : '—'} variant="outlined" />
        {item.risk_flags.filter((flag) => !(flag === 'missing-expiry-info' && item.status === 'Missing Expiry Info')).map((flag) => <Chip key={flag} size="small" label={flag} />)}
      </Stack>
    </Paper>
  );
}

function Heatmap({ data }: { data: HeatmapCell[] }) {
  const muiTheme = useTheme();
  const categories = Array.from(new Set(data.map((entry) => entry.category)));
  const buckets = ['>100%', '90-100%', '75-89%', '50-74%', '20-49%', '0-19%'];

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: `140px repeat(${buckets.length}, minmax(0, 1fr))`, gap: 0.75, alignItems: 'center' }}>
        <Box />
        {buckets.map((bucket) => <Typography key={bucket} variant="caption" color="text.secondary" textAlign="center">{bucket}</Typography>)}
      </Box>
      {categories.map((category) => (
        <Box key={category} sx={{ display: 'grid', gridTemplateColumns: `140px repeat(${buckets.length}, minmax(0, 1fr))`, gap: 0.75, alignItems: 'center' }}>
          <Typography variant="body2" fontWeight={700}>{category}</Typography>
          {buckets.map((bucket) => {
            const cell = data.find((entry) => entry.category === category && entry.bucket === bucket);
            const count = cell?.count ?? 0;
            const intensity = Math.min(1, count / 6);
            return (
              <Paper key={`${category}-${bucket}`} sx={{ p: 1.1, textAlign: 'center', bgcolor: muiTheme.palette.mode === 'dark' ? `rgba(125, 211, 252, ${0.08 + intensity * 0.35})` : `rgba(2, 132, 199, ${0.08 + intensity * 0.35})` }}>
                <Typography variant="body2" fontWeight={800}>{count}</Typography>
              </Paper>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}

function InsightChip({ label, value, tone }: { label: string; value: string; tone: 'info' | 'warning' | 'danger' | 'success' }) {
  const muiTheme = useTheme();
  const mode = muiTheme.palette.mode as PaletteMode;
  const palettes = {
    info: mode === 'dark'
      ? { bg: 'rgba(14, 165, 233, 0.18)', fg: '#bae6fd' }
      : { bg: 'rgba(14, 165, 233, 0.12)', fg: '#0c4a6e' },
    warning: mode === 'dark'
      ? { bg: 'rgba(245, 158, 11, 0.18)', fg: '#fde68a' }
      : { bg: 'rgba(245, 158, 11, 0.12)', fg: '#92400e' },
    danger: mode === 'dark'
      ? { bg: 'rgba(239, 68, 68, 0.18)', fg: '#fecaca' }
      : { bg: 'rgba(239, 68, 68, 0.12)', fg: '#991b1b' },
    success: mode === 'dark'
      ? { bg: 'rgba(34, 197, 94, 0.18)', fg: '#bbf7d0' }
      : { bg: 'rgba(34, 197, 94, 0.12)', fg: '#15803d' },
  };
  const palette = palettes[tone];

  return (
    <Grid item xs={12} sm={6}>
      <Paper sx={{ p: 1.5, background: palette.bg }}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h6" sx={{ color: palette.fg }}>{value}</Typography>
      </Paper>
    </Grid>
  );
}

function LicenseForm({
  draft,
  onChange,
  optionLists,
  customFieldDefs,
}: {
  draft: LicenseFormValues;
  onChange: (field: keyof LicenseFormValues, value: string | number | boolean) => void;
  optionLists: {
    category_options: string[];
    item_type_options: string[];
    environment_options: string[];
    renewal_cycle_options: string[];
    auto_renew_options: string[];
    priority_options: string[];
  };
  customFieldDefs: import('./types').CustomFieldDefinition[];
}) {
  const autoRenewYesLabel = optionLists.auto_renew_options[0] || 'Yes';
  const autoRenewNoLabel = optionLists.auto_renew_options[1] || 'No';

  return (
    <Stack spacing={2}>
      <FormSection title="Identity">
        <Grid container spacing={1.5}>
          <LicenseField xs={6} label="Client" value={draft.client} onChange={onChange} name="client" required />
          <LicenseField xs={6} label="Region" value={draft.region} onChange={onChange} name="region" />
          <Grid item xs={6}>
            <FormControl fullWidth required>
              <InputLabel>Category</InputLabel>
              <Select label="Category" value={draft.category} onChange={(event) => onChange('category', event.target.value)}>
                <MenuItem value=""><em>Select</em></MenuItem>
                {optionLists.category_options.map((value) => (
                  <MenuItem key={value} value={value}>{value}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Item Type</InputLabel>
              <Select label="Item Type" value={draft.item_type} onChange={(event) => onChange('item_type', event.target.value)}>
                <MenuItem value=""><em>Select</em></MenuItem>
                {optionLists.item_type_options.map((value) => (
                  <MenuItem key={value} value={value}>{value}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <LicenseField xs={6} label="Vendor" value={draft.vendor} onChange={onChange} name="vendor" required />
          <LicenseField xs={6} label="Product / Service" value={draft.product_service} onChange={onChange} name="product_service" required />
          <LicenseField xs={12} label="Asset / Scope" value={draft.asset_scope} onChange={onChange} name="asset_scope" />
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Environment</InputLabel>
              <Select label="Environment" value={draft.environment} onChange={(event) => onChange('environment', event.target.value)}>
                <MenuItem value=""><em>Select</em></MenuItem>
                {optionLists.environment_options.map((value) => (
                  <MenuItem key={value} value={value}>{value}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <LicenseField xs={6} label="License Reference" value={draft.license_reference} onChange={onChange} name="license_reference" />
        </Grid>
      </FormSection>

      <FormSection title="Ownership & lifecycle">
        <Grid container spacing={1.5}>
          <LicenseField xs={6} label="Owner" value={draft.owner} onChange={onChange} name="owner" />
          <LicenseField xs={6} label="Technical Contact" value={draft.technical_contact} onChange={onChange} name="technical_contact" />
          <LicenseField xs={6} label="Renewal Owner" value={draft.renewal_owner} onChange={onChange} name="renewal_owner" />
          <LicenseField xs={6} label="Notification Email" value={draft.email} onChange={onChange} name="email" />
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Renewal Cycle</InputLabel>
              <Select label="Renewal Cycle" value={draft.renewal_cycle} onChange={(event) => onChange('renewal_cycle', event.target.value)}>
                <MenuItem value=""><em>Select</em></MenuItem>
                {optionLists.renewal_cycle_options.map((value) => (
                  <MenuItem key={value} value={value}>{value}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <LicenseField xs={4} label="Start Date" type="date" value={draft.start_date} onChange={onChange} name="start_date" />
          <LicenseField xs={4} label="Expiry Date" type="date" value={draft.expiry_date} onChange={onChange} name="expiry_date" required />
          <LicenseField xs={4} label="EOL Date" type="date" value={draft.eol_date} onChange={onChange} name="eol_date" />
          <LicenseField xs={4} label="Last Reviewed" type="date" value={draft.last_reviewed} onChange={onChange} name="last_reviewed" />
          <Grid item xs={4}>
            <FormControl fullWidth>
              <InputLabel>Priority</InputLabel>
              <Select label="Priority" value={draft.priority} onChange={(event) => onChange('priority', event.target.value)}>
                <MenuItem value=""><em>Select</em></MenuItem>
                {optionLists.priority_options.map((value) => (
                  <MenuItem key={value} value={value}>{value}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <LicenseField xs={4} label="Source URL" value={draft.source_url} onChange={onChange} name="source_url" />
        </Grid>
      </FormSection>

      <FormSection title="Commercials">
        <Grid container spacing={1.5}>
          <LicenseField xs={4} label="Quantity Purchased" type="number" value={draft.quantity_purchased} onChange={onChange} name="quantity_purchased" />
          <LicenseField xs={4} label="Quantity In Use" type="number" value={draft.quantity_in_use} onChange={onChange} name="quantity_in_use" />
          <LicenseField xs={4} label="Quantity Available" type="number" value={draft.quantity_available} onChange={onChange} name="quantity_available" />
          <LicenseField xs={6} label="Unit Cost" type="number" value={draft.unit_cost} onChange={onChange} name="unit_cost" />
          <LicenseField xs={6} label="Annual Cost" type="number" value={draft.annual_cost} onChange={onChange} name="annual_cost" />
        </Grid>
      </FormSection>

      <FormSection title="Notes and flags">
        <Grid container spacing={1.5}>
          <LicenseField xs={12} label="Notes" value={draft.notes} onChange={onChange} name="notes" multiline minRows={3} />
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Auto Renew</InputLabel>
              <Select label="Auto Renew" value={String(draft.auto_renew)} onChange={(event) => onChange('auto_renew', event.target.value === 'true')}>
                <MenuItem value="true">{autoRenewYesLabel}</MenuItem>
                <MenuItem value="false">{autoRenewNoLabel}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <FormControl fullWidth>
              <InputLabel>Certificate</InputLabel>
              <Select label="Certificate" value={String(draft.is_certificate)} onChange={(event) => onChange('is_certificate', event.target.value === 'true')}>
                <MenuItem value="true">Yes</MenuItem>
                <MenuItem value="false">No</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </FormSection>

      {customFieldDefs.length > 0 && (
        <FormSection title="Custom fields">
          <Grid container spacing={1.5}>
            {customFieldDefs.map((fieldDef) => {
              const rawValue = (draft.custom_fields ?? {})[fieldDef.key];
              const strValue = rawValue === undefined || rawValue === null ? '' : String(rawValue);

              if (fieldDef.type === 'boolean') {
                return (
                  <Grid item xs={6} key={fieldDef.key}>
                    <FormControl fullWidth required={fieldDef.required}>
                      <InputLabel>{fieldDef.label}</InputLabel>
                      <Select
                        label={fieldDef.label}
                        value={strValue || 'false'}
                        onChange={(event) => {
                          const next = { ...(draft.custom_fields ?? {}), [fieldDef.key]: event.target.value };
                          onChange('custom_fields' as keyof LicenseFormValues, JSON.stringify(next));
                        }}
                      >
                        <MenuItem value="true">Yes</MenuItem>
                        <MenuItem value="false">No</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                );
              }

              if (fieldDef.type === 'select') {
                return (
                  <Grid item xs={6} key={fieldDef.key}>
                    <FormControl fullWidth required={fieldDef.required}>
                      <InputLabel>{fieldDef.label}</InputLabel>
                      <Select
                        label={fieldDef.label}
                        value={strValue}
                        onChange={(event) => {
                          const next = { ...(draft.custom_fields ?? {}), [fieldDef.key]: event.target.value };
                          onChange('custom_fields' as keyof LicenseFormValues, JSON.stringify(next));
                        }}
                      >
                        <MenuItem value=""><em>Select</em></MenuItem>
                        {(fieldDef.options ?? []).map((opt) => (
                          <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                );
              }

              return (
                <Grid item xs={6} key={fieldDef.key}>
                  <TextField
                    fullWidth
                    required={fieldDef.required}
                    label={fieldDef.label}
                    type={fieldDef.type === 'number' ? 'number' : fieldDef.type === 'date' ? 'date' : 'text'}
                    value={strValue}
                    InputLabelProps={fieldDef.type === 'date' ? { shrink: true } : undefined}
                    onChange={(event) => {
                      const next = {
                        ...(draft.custom_fields ?? {}),
                        [fieldDef.key]: fieldDef.type === 'number' ? Number(event.target.value) : event.target.value,
                      };
                      onChange('custom_fields' as keyof LicenseFormValues, JSON.stringify(next));
                    }}
                  />
                </Grid>
              );
            })}
          </Grid>
        </FormSection>
      )}
    </Stack>
  );
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>{title}</Typography>
      {children}
    </Paper>
  );
}

function LicenseField({ name, label, value, onChange, type = 'text', multiline = false, minRows, xs = 12, required = false }: { name: keyof LicenseFormValues; label: string; value: string | number; onChange: (field: keyof LicenseFormValues, value: string | number | boolean) => void; type?: string; multiline?: boolean; minRows?: number; xs?: number; required?: boolean; }) {
  return (
    <Grid item xs={xs}>
      <TextField
        fullWidth
        required={required}
        type={type}
        label={label}
        value={value}
        multiline={multiline}
        minRows={minRows}
        onChange={(event) => {
          const nextValue = type === 'number' ? Number(event.target.value) : event.target.value;
          onChange(name, nextValue);
        }}
        InputLabelProps={type === 'date' ? { shrink: true } : undefined}
      />
    </Grid>
  );
}

function licenseToDraft(item: LicenseItem): LicenseFormValues {
  return {
    client: item.client,
    region: item.region,
    category: item.category,
    item_type: item.item_type,
    vendor: item.vendor,
    product_service: item.product_service,
    asset_scope: item.asset_scope,
    environment: item.environment,
    owner: item.owner,
    technical_contact: item.technical_contact,
    email: item.email,
    license_reference: item.license_reference,
    start_date: item.start_date ?? '',
    expiry_date: item.expiry_date,
    eol_date: item.eol_date ?? '',
    renewal_cycle: item.renewal_cycle,
    auto_renew: item.auto_renew,
    quantity_purchased: item.quantity_purchased,
    quantity_in_use: item.quantity_in_use,
    quantity_available: item.quantity_available,
    unit_cost: item.unit_cost,
    annual_cost: item.annual_cost,
    notes: item.notes,
    source_url: item.source_url,
    renewal_owner: item.renewal_owner,
    last_reviewed: item.last_reviewed ?? '',
    priority: item.priority,
    is_certificate: item.is_certificate,
    custom_fields: (item.custom_fields as Record<string, string | number | boolean>) ?? {},
  };
}

function formatDate(value: string | null) {
  if (!value) {
    return '—';
  }
  return new Date(value).toLocaleDateString();
}

function formatCurrency(value: number, currencyCode: string) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currencyCode, maximumFractionDigits: 0 }).format(value || 0);
  } catch {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value || 0);
  }
}


export default App;


function UserManagementDialog({
  open,
  onClose,
  users,
  loading,
  error,
  currentUserId,
  onRoleChange,
}: {
  open: boolean;
  onClose: () => void;
  users: User[];
  loading: boolean;
  error: string;
  currentUserId: number;
  onRoleChange: (userId: number, role: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ pb: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Avatar sx={{ bgcolor: 'primary.main', color: 'background.default' }}><GroupIcon /></Avatar>
          <Box>
            <Typography variant="h6" fontWeight={800}>User Access Management</Typography>
            <Typography variant="body2" color="text.secondary">View registered users and modify their access levels.</Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {loading ? (
            <Stack alignItems="center" py={4}><CircularProgress /></Stack>
          ) : (
            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 800 }}>User</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Email</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Registered</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>Access Level</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id} hover>
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar sx={{ width: 32, height: 32, fontSize: '0.85rem', bgcolor: u.role === 'admin' ? 'success.dark' : u.role === 'ops' ? 'warning.dark' : 'action.selected' }}>
                            {(u.full_name || u.email).substring(0, 2).toUpperCase()}
                          </Avatar>
                          <Box>
                            <Typography fontWeight={700} variant="body2">
                              {u.full_name || '—'} {u.id === currentUserId ? ' (You)' : ''}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell><Typography variant="body2" color="text.secondary">{u.email}</Typography></TableCell>
                      <TableCell><Typography variant="caption" color="text.secondary">{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</Typography></TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ minWidth: 130 }}>
                          <Select
                            value={u.role}
                            onChange={(e) => onRoleChange(u.id, e.target.value)}
                            sx={{ fontWeight: 700, fontSize: '0.85rem' }}
                          >
                            <MenuItem value="admin">Admin</MenuItem>
                            <MenuItem value="ops">Operations</MenuItem>
                            <MenuItem value="viewer">Viewer</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>
    </Dialog>
  );
}