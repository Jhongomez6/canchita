# Error Handling System Design Document (SDD)

## 1. Overview
The **Error Handling System** provides a centralized, consistent, and user-friendly way to manage and display errors across the entire La Canchita application. It replaces disparate `console.error` and blocking `alert()` calls with unified logging and non-blocking Toast notifications, offering advanced features for PWA troubleshooting.

## 2. Core Components

### `lib/utils/error.tsx`
This file contains the core `handleError` utility.

- **Developer Logging**: Automatically logs the full error context to the console using `console.error("[App Error]:", error)`.
- **User-Friendly Extraction**: Formats Firebase and Domain specific errors (e.g., `"MATCH_FULL"`, `"permission-denied"`) into human-readable Spanish text.
- **PWA Troubleshooting (Custom Toast)**: Uses a custom JSX rendering over `react-hot-toast` to provide a "📋 Copiar detalles técnicos" button. This allows mobile and PWA users (who lack access to the developer console) to copy the exact stack trace and error message to their clipboard for support purposes.

## 3. Global Integration

### `app/layout.tsx`
The `<Toaster />` component from `react-hot-toast` is mounted globally at the application root `layout.tsx`. This ensures that every page, client component, or utility function can trigger notifications without needing localized state management for errors or success states.

## 4. Usage Rules & Best Practices

1. **No Alerts**: Do not use `window.alert()` for error reporting. It blocks the UI thread and provides a poor user experience.
2. **Always Use `handleError` in Catch Blocks**: Any `catch (error)` block that interacts with UI state or external asynchronous calls MUST use `handleError(error, "Mensaje de contexto de fallback")`.
3. **Success Feedback**: Use `toast.success("Mensaje")` directly when a user action completes successfully (e.g., joining a match, creating a location).
4. **Throwing Semantic Errors**: Domain and API functions should throw standard `Error` instances with clear semantic messages (e.g., `throw new Error("MATCH_FULL")`). The `handleError` utility intercepts these specific strings to show localized, friendly messages.

## 5. Affected Views
The error handling utility is natively integrated into critical paths:
- **Matches**: `app/match/[id]`, `app/new-match`, `app/join/[id]`, `app/explore`
- **Users**: `app/onboarding`, `app/profile`, `app/admin/users`, `components/AddGuestForm`
- **Infrastructure**: `lib/push.ts`, `app/locations/new`

## 6. Acceptance Criteria
- [x] Catch blocks properly delegate to `handleError`.
- [x] Errors print to console with standard `[App Error]:` prefix.
- [x] PWA Custom Toast renders when `handleError` fires.
- [x] "Copiar detalles técnicos" button successfully copies the structured error object or string into the system clipboard.
- [x] Application builds successfully with the custom TSX utility in the `lib` directory.
