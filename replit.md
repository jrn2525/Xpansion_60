# Xpansion Console — Franchise Command Center

## Overview
Xpansion Console is a multi-tenant franchise management platform designed to empower franchise organizations with advanced tools for performance monitoring, strategic planning, and operational excellence. It offers robust features such as role-based access control, a comprehensive metrics engine with scorecards and trend analysis, CSV data import capabilities, and a sophisticated alert rules engine. The platform automates reporting, notifications, and workflow processes, providing an executive portfolio dashboard for high-level oversight, forecasting, and anomaly detection. Its core vision is to serve as a Growth Operating System, integrating weekly command center functionalities, action management, goal setting, benchmarking, playbooks, and executive digests. Ultimately, Xpansion Console aims to deliver Intelligence + Automation at Scale through predictive risk engines, autonomous weekly planning, playbook effectiveness analytics, and executive narrative reports, enabling franchises to achieve sustainable growth and operational efficiency.

## User Preferences
I want to prioritize a clear and consistent architecture. Avoid introducing new patterns unless absolutely necessary. Focus on delivering high-quality, maintainable code. I prefer detailed explanations for complex logic. Do not make changes to files within the `server/replit_integrations/` folder.

## System Architecture
The platform is built with a modern web stack, featuring a React, TypeScript, Vite, Tailwind, and shadcn frontend, and a Node, Express, TypeScript, Drizzle ORM, and PostgreSQL backend. Authentication supports both Replit Auth (OpenID Connect) for regular users and email/password for superadmins, with robust security measures including session fixation prevention, rate limiting, and brute-force lockout. Data validation is handled via Zod. Notifications leverage Resend for email and Slack webhooks, with built-in retry mechanisms. A `setInterval`-based execution engine manages scheduled tasks with job locking for reliability.

The UI/UX adheres to a strong brand identity, "Xpansion Console," with a primary red color palette, supporting light and dark modes, and using Inter and JetBrains Mono fonts. A semantic color system ensures WCAG AA compliance for accessibility, with all text/background pairs meeting contrast ratios. Accessibility features include global `:focus-visible` rings and mobile-friendly table scrolling.

The database schema is organized across several phases, supporting features from basic user and tenant management to advanced capabilities like predictive risk scoring, automated weekly planning, playbook effectiveness analysis, and a superadmin command tower. Key architectural patterns include tenant scoping enforced at the service layer, a global tenant selector, and consistent API response formats. Core functionalities include a score run calculation system, trend analysis, alert evaluation with cooldowns and escalations, and idempotent notification and scheduler processes. Data quality guardrails, including duplicate detection, outlier detection, and period continuity checks, are integrated into the CSV import pipeline.

## External Dependencies
- **Authentication**: Replit Auth (OpenID Connect)
- **Email Notifications**: Resend
- **Team Notifications**: Slack webhooks
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Frontend Framework**: React
- **Build Tool**: Vite
- **Styling**: Tailwind CSS, shadcn
- **State Management/Data Fetching**: TanStack Query
- **Routing**: wouter
- **Charting**: Recharts
- **Validation**: Zod (with `zod-validation-error`)
- **Password Hashing**: bcryptjs