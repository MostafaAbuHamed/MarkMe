# MarkMe Project Brief

## Product

MarkMe lets users save web content—such as images, videos, posts, and articles—using a link. Each saved item includes a preview and can be organized with folders, tags, and search. A user's collection is available on every device where they sign in.

MarkMe is a portfolio project delivered incrementally:

1. Chrome extension
2. Web application
3. Mobile application

## Technology Decisions

| Area                 | Technology              | Purpose                                         |
| -------------------- | ----------------------- | ----------------------------------------------- |
| Monorepo             | pnpm and Turborepo      | Manage applications and shared packages         |
| Chrome extension     | React and WXT           | Build the Manifest V3 extension on Vite         |
| Web application      | Next.js                 | Provide browser-based collection management     |
| Mobile application   | React Native and Expo   | Provide iOS and Android clients                 |
| Preview backend      | Express.js in Docker    | Safely retrieve link metadata                   |
| Data platform        | Supabase                | PostgreSQL, authentication, and realtime events |
| Language             | TypeScript              | Use one language across the project             |
| Local infrastructure | Supabase CLI and Docker | Provide reproducible local development          |

## Architecture Guidelines

- Share generated database types, domain models, validation schemas, and client factories across applications.
- Do not share one initialized Supabase client. Each runtime needs its own client configuration and authentication-storage adapter.
- Treat Supabase Row Level Security as mandatory for every table containing user data.
- Use normal database queries and cache invalidation first. Add Realtime only where immediate updates create a clear user benefit.
- Keep extension, web, and mobile UI and platform-specific behavior inside their respective applications.
- Keep link-preview fetching behind the Express backend rather than fetching arbitrary pages directly from clients.

Suggested monorepo structure:

```text
apps/
  extension/
  web/
  mobile/
  preview-api/
packages/
  database/
  domain/
  config/
```

## Delivery Scope

### Version 1: Chrome Extension

- User registration, sign-in, and sign-out
- Save the current page or a pasted URL
- Generate and display a metadata preview
- List saved items
- Search saved items
- Organize items with folders and tags
- Keep user data protected with Row Level Security
- Include automated tests for critical domain and backend behavior

### Version 2: Web Application

- Provide full collection browsing and management
- Reuse the established domain model and database schema
- Support responsive desktop and mobile-browser layouts
- Add Realtime updates only where they materially improve the experience

### Version 3: Mobile Application

- Provide collection browsing, searching, and organization
- Support saving links through mobile sharing workflows
- Define caching and offline behavior explicitly rather than assuming Realtime provides offline synchronization

## Key Risks and Mitigations

### Unsafe URL fetching

The preview backend accepts user-provided URLs, which creates a Server-Side Request Forgery risk.

Mitigations:

- Accept only HTTP and HTTPS URLs
- Block private, loopback, link-local, and internal network addresses
- Protect against DNS rebinding
- Limit redirects, response size, and request duration
- Validate response content types
- Apply rate limits and cache preview results

### Unauthorized data access

Client-side filtering does not protect user data.

Mitigations:

- Enable Row Level Security on all user-owned tables
- Test policies with multiple users
- Derive ownership from the authenticated user instead of trusting submitted user IDs

### Cross-platform authentication

Browser extensions, Next.js, and React Native use different storage and runtime environments.

Mitigation:

- Provide a platform-specific Supabase adapter for each application while sharing types and domain logic.

### Sync expectations

Supabase Realtime broadcasts database changes but does not automatically provide offline queues, conflict resolution, or reliable local caching.

Mitigation:

- Define synchronization behavior separately for each version and defer offline editing until it is explicitly required.

### Excessive initial scope

Building three clients simultaneously would slow delivery and increase rework.

Mitigation:

- Complete and validate the extension before beginning the web application, then use the stable domain model for mobile.

## Initial Non-Goals

- Full offline editing and conflict resolution
- Browser support beyond Chrome
- Native mobile applications before the extension and web versions are stable
- Complex recommendation or content-classification features
- Microservices beyond the dedicated preview backend

## Decisions Still Required

- Whether one saved item can belong to one folder or multiple folders
- Which preview formats and websites receive first-class support
- Whether duplicate URLs are allowed per user
- Preview refresh and retention rules
- Search requirements: basic text search or PostgreSQL full-text search
- Exact Realtime behavior expected across active devices

## Overall Assessment

The stack is modern, coherent, and appropriate for a portfolio project. Its strongest feature is the ability to demonstrate several client platforms while sharing a TypeScript domain model. The main technical risks are unsafe metadata fetching, incorrect Supabase authorization, and underestimating cross-platform authentication and synchronization behavior.
