# License Lifecycle Hub — User Guide

Welcome to the **License Lifecycle Hub** user guide. This document provides a clear, step-by-step overview of how to use the application to track software licenses, cloud subscriptions, certificates, and renewal timelines.

---

## 📌 Table of Contents

1. [Getting Started & Sign In](#1-getting-started-sign-in)
2. [User Roles & Permissions](#2-user-roles-permissions)
3. [Dashboard & Analytics Overview](#3-dashboard-analytics-overview)
4. [Managing License & Subscription Records](#4-managing-license-subscription-records)
5. [Excel Import & Export](#5-excel-import-export)
6. [System Controls & Threshold Settings](#6-system-controls-threshold-settings)
7. [Custom Fields & Rules Engine](#7-custom-fields-rules-engine)
8. [Notification Email Service](#8-notification-email-service)
9. [User Access Management (Admins)](#9-user-access-management-admins)
10. [Account & Password Management](#10-account-password-management)
11. [Help & Support Contact](#11-help-support-contact)

---

## 1. Getting Started & Sign In

Access the application through your web browser at [https://licensehub-bedychavezbuh5cg.westeurope-01.azurewebsites.net](https://licensehub-bedychavezbuh5cg.westeurope-01.azurewebsites.net).

### Authentication Options
- **Microsoft Outlook SSO**: Click **"Sign in with Microsoft Outlook"** to log in seamlessly using your corporate Microsoft account.
- **User Credentials**: If you were provided a username/email and password by the system administrator, enter your **Username or Email** and **Password**, then click **Enter dashboard**.

---

## 2. User Roles & Permissions

Access level is determined by your assigned role:

| Feature / Action | Admin | Operations (`ops`) | Viewer (`viewer`) |
| :--- | :---: | :---: | :---: |
| **View Dashboard & Registers** | ✅ | ✅ | ✅ |
| **Search, Filter & Sort Records** | ✅ | ✅ | ✅ |
| **Export Register to Excel** | ✅ | ✅ | ✅ |
| **Create / Edit License Records** | ✅ | ✅ | ❌ |
| **Delete License Records** | ✅ | ❌ | ❌ |
| **Import Excel Workbooks** | ✅ | ✅ | ❌ |
| **Configure System Controls & Custom Fields** | ✅ | ✅ | ❌ |
| **User Access Management (Add/Delete/Roles)** | ✅ | ❌ | ❌ |

---

## 3. Dashboard & Analytics Overview

Upon logging in, the main dashboard presents a centralized view of your organization's software lifecycle:

### Key Performance Indicators (KPI Tiles)
- **Total Items**: Total count of tracked licenses and certificates.
- **Expired Items**: Licenses past their expiration date (marked in red).
- **Urgent Renewals**: Records expiring within the urgent threshold (default: 30 days).
- **Missing Expiry Info**: Records requiring expiration dates or audit reviews.
- **Active Items**: Healthy licenses currently in use.
- **In-Review Items**: Licenses approaching review threshold (default: 60 days).
- **Total Annual Cost**: Aggregated financial commitment across all active items.

### Interactive Visualizations
- **Expiry Timeline**: Line chart forecasting upcoming record expirations month-by-month.
- **Category Mix**: Donut chart displaying the distribution of items across categories (e.g., Cloud, Infrastructure, SaaS).
- **Risk Panel**: Highlights top-priority items needing immediate action or renewal.
- **Utilization Heatmap**: Identifies under-utilized (<20%) or over-utilized (>100%) licenses.
- **Predictive Insights**: Displays forecasted renewal costs, missing metadata counts, and spend at risk.
- **Audit Trail**: Real-time log showing recent updates, actors, and value changes.

---

## 4. Managing License & Subscription Records

### Viewing & Filtering the Register
- **Search Bar**: Search across client name, vendor, product, owner, email, or license reference.
- **Status Filter**: Filter by `Active`, `Review`, `Urgent`, `Expired`, or `Missing Expiry Info`.
- **Category Filter**: Filter by specific operational category.
- **Sorting**: Click any sort chip (`Sort by days to expiry`, `Sort by utilization %`, `Sort by annual cost`, `Sort by priority`, `Sort by status`) to toggle ascending/descending order.

### Adding a New Record (Admin & Ops)
1. Click **New Record** in the top navigation bar.
2. Fill in the required fields:
   - **Client**: Target client or organization unit.
   - **Vendor & Product/Service**: E.g., *Microsoft*, *Office 365 E5*.
   - **Category**: E.g., *SaaS*, *Security*, *Infrastructure*.
   - **Quantities & Costs**: Units purchased, units in use, unit cost, and annual cost.
   - **Dates**: Start date, expiry date, and End-of-Life (EOL) date.
   - **Ownership**: Primary owner, renewal owner, technical contact, and notification email.
3. Click **Save Record**.

### Editing or Deleting a Record
- **Edit**: Click the ✏️ **Edit** icon on any row to open the editing drawer.
- **Delete (Admin only)**: Click the 🗑️ **Delete** icon on a row and confirm deletion.

---

## 5. Excel Import & Export

### Exporting Data
Click **Export** in the top bar to instantly download the complete license register as a formatted Excel spreadsheet (`.xlsx`).

### Importing Data (Admin & Ops)
1. Click **Import** in the top bar and select an Excel file (`.xlsx`).
2. The system automatically processes rows, updating existing items and adding new entries.
3. Once completed, a summary banner will display the results (e.g., *Imported 5, updated 60, skipped 2*).
4. If warnings or validation defaults occurred, click **View Log** on the banner to open a detailed breakdown of all log entries.

---

## 6. System Controls & Threshold Settings

Admins and Operations users can click **Controls** in the top bar to configure global operational settings:

- **Urgent Days Threshold**: Days remaining before a record is flagged as Urgent (default: 30 days).
- **Review Days Threshold**: Days remaining before a record enters Review status (default: 60 days).
- **EOL Soon Threshold**: Lead time for End-of-Life warnings (default: 90 days).
- **Base Currency**: Select primary currency (e.g., `USD`, `EUR`, `GBP`, `AED`).
- **Options Lists**: Edit line-separated lists for Categories, Item Types, Environments, Renewal Cycles, and Priorities.

---

## 7. Custom Fields & Rules Engine

Located inside the **Controls** dialog:

### Custom Fields
Add custom metadata columns to your register (e.g., *PO Number*, *Business Unit*, *Compliance Audit Date*):
- Supported types: `Text`, `Number`, `Date`, `Yes/No (Boolean)`, and `Dropdown (Select)`.
- Custom fields automatically appear in the main data table and in record creation/edit forms.

### Custom Rules Engine
Create automated IF-THEN conditions:
- **IF**: Define conditions based on Expiry Days, Utilization %, Annual Cost, Category, or Status.
- **THEN**: Trigger automated actions such as setting priority to `Critical`, flagging risk labels, or boosting anomaly scores.

---

## 8. Notification Email Service

The **Notification Email Service** delivers real-time email alerts and status notifications to record owners and administrators to ensure renewal deadlines and risk flags are addressed proactively.

### System Configuration & Delivery
- **Backend Integration**: Automated email notifications are handled asynchronously by the backend service. Delivery runs in non-blocking background threads so user interactions and API response times remain fast.
- **SMTP Settings**: Email delivery requires SMTP configuration in environment variables (`SMTP_ENABLED=true`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`). If SMTP is disabled or misconfigured, notification errors are logged silently without interrupting system operations.
- **Recipient Targeting**: Notifications are dispatched to the addresses configured in the **Notification Email** field of each license record. Multiple recipient emails can be specified using comma or semicolon separation.

### Trigger Events (When Emails Are Sent)

The system automatically triggers email notifications under the following conditions:

1. **New Email Subscription Confirmation**
   - **Trigger**: When a **Notification Email** address is added to a license record for the first time.
   - **Content**: Welcome confirmation email detailing the tracked client, vendor, product/service, status, and expiration date.

2. **License Record Updates**
   - **Trigger**: When an existing license record with configured notification email(s) is modified by an Admin or Operations user.
   - **Content**: Notification specifying who updated the record (actor email), current status and expiration date, and a bulleted list of changed fields.

3. **Critical Status Transitions (`Urgent` or `Expired`)**
   - **Trigger**: When a record's status transitions to **Urgent** (e.g., within the 30-day renewal threshold) or **Expired** (upon record creation, manual update, or automated recalculation).
   - **Content**: High-priority alert highlighting previous status, new status, expiration date, and days remaining to renew.

4. **Risk Flags Raised**
   - **Trigger**: When system evaluation, custom rules, or updates detect new risk conditions (e.g., *under-utilized*, *approaching-eol*, *missing-expiry*, or *high-cost-risk*).
   - **Content**: Risk warning displaying all newly raised risk flags alongside record priority and expiration details.

5. **Automated Rules Engine Alerts (`notify_owner` Action)**
   - **Trigger**: When a custom rule in the Rules Engine executes a `notify_owner` action, or when records are imported via Excel containing `notify-owner` risk flags.
   - **Content**: Action-required email notification directing owners to review the flagged record.

---

## 9. User Access Management (Admins)

Admins can click **Users** in the top bar to manage user accounts:

- **View Registered Users**: Inspect full names, usernames/emails, registration dates, and assigned access levels.
- **Change Access Levels**: Use the dropdown next to any user to switch their role between `Admin`, `Operations`, or `Viewer`.
- **Add New User**: Click **Add User**, enter Full Name, Username/Email, Password, and Role, then click **Create User**.
- **Delete User**: Click the red 🗑️ trash icon next to a user to permanently remove their account (self-deletion is blocked for security).

---

## 10. Account & Password Management

- **Theme Toggle**: Click the ☀️ / 🌙 icon in the top navigation bar to switch between Light Mode and Dark Mode.
- **Change Password (Local Credentials)**: Click the 🔑 **Key** icon in the top bar, enter your current password and your new password, then click **Change Password**. *(Note: Microsoft SSO users manage their credentials directly through Microsoft).*
- **Sign Out**: Click the 🚪 **Logout** icon in the top right to end your session.

---

## 11. Help & Support Contact

If you encounter issues, require access level modifications, or need technical assistance with the License Lifecycle Hub, please reach out to:

- **System Administrator / Support Team**: `marwa.saleh@vertowave.com`
- **Application Portal**: [License Lifecycle Hub on Azure](https://licensehub-bedychavezbuh5cg.westeurope-01.azurewebsites.net)

---

*License Lifecycle Hub — Centralized license, certificate, and renewal tracking.*
