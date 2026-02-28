# Beta Feedback System Design Document (SDD)

## 1. Overview
The Beta Feedback System allows users to report bugs, suggest ideas, or provide general feedback directly from within the application. It also provides a clear "BETA" indicator globally to set expectations for the users. 

## 2. Core Components

### `lib/domain/feedback.ts`
Defines the `Feedback` model and the `FeedbackType` enum ('bug', 'idea', 'other').
- **Properties**: `id`, `userId`, `userName`, `type`, `message`, `urlContext`, `createdAt`, `status`.

### `lib/feedback.ts`
API layer that exports `submitFeedback` to write new feedback entries into the `feedback` collection in Firestore.

### `components/Header.tsx` (Beta Badge)
A "BETA" badge has been added next to the application logo in the top Navigation Header.
- **Tooltip**: Implements a CSS-driven hover/focus tooltip that explains: "¡Estamos en Beta!... tu feedback es vital para ayudarnos a mejorar".

### `components/BetaFeedbackWidget.tsx` (Floating FAB)
A floating action button (FAB) positioned in the bottom right corner (above the bottom navigation bar on mobile).
- Opens a sliding modal/drawer with a pre-formatted form asking for the type of feedback (Idea, Bug, Other) and a message.
- Context-Aware: The widget automatically captures the `urlContext` (the current path and query params) where the user submitted the feedback to assist developers in debugging contextual issues.

### `app/layout.tsx`
The `<BetaFeedbackWidget />` is injected at the root layout level, meaning it persists across all pages unless explicitly hidden or if the user is not authenticated.

## 3. Database Schema

Collection: `feedback`
```typescript
{
  "userId": "string",
  "userName": "string",
  "type": "bug" | "idea" | "other",
  "message": "string",
  "urlContext": "string",
  "status": "new" | "reviewed" | "resolved",
  "createdAt": "ISOString",
  "_serverCreatedAt": "Firestore Timestamp"
}
```

## 4. Acceptance Criteria
- [x] Beta badge appears in the Header on all screen sizes.
- [x] Hovering/tapping the Beta badge displays an informative tooltip.
- [x] Floating action button is visible to authenticated users.
- [x] Feedback form successfully captures and saves data to Firestore.
- [x] Toast notification confirms successful submission.
- [x] Application builds successfully without missing components.

## 5. Feedback Resolution (Admin → User Notification)

### Flow
1. Admin clicks "Marcar Solucionado/Aplicado/Atendido" on a feedback card
2. Client calls `resolveFeedback(feedbackId)` → Cloud Function `notifyFeedbackResolved`
3. Cloud Function:
   - Validates admin auth
   - Writes **in-app notification** to `notifications/{userId}/items` (always)
   - Attempts **push notification** via FCM (best-effort)
   - Updates feedback status to `"resolved"` with `resolvedAt` timestamp
4. Toast tells admin if push was sent or only in-app

### Contextual Messages
| Type | Title | Body |
|------|-------|------|
| Bug | 🔧 ¡Tu reporte fue solucionado! | El bug que reportaste fue corregido: "..." |
| Idea | 💡 ¡Tu idea fue implementada! | La idea que propusiste fue aplicada: "..." |
| Other | ✅ ¡Tu feedback fue atendido! | Tu feedback fue revisado y atendido: "..." |

### Files
- Cloud Function: `functions/src/reminders.ts` (`notifyFeedbackResolved`)
- Client caller: `lib/admin-feedback.ts` (`resolveFeedback`)
- Admin UI: `app/admin/feedback/page.tsx`
- Domain: `lib/domain/feedback.ts` (added `resolvedAt`)
