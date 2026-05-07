# GiftMatch User Manual

GiftMatch is an AI-assisted gift discovery app for finding, saving, and reviewing gift recommendations. It supports two user types:

- Individual users: create an account, run gift searches, save gift ideas, and review personal history.
- Admin users: review all recommendation runs and manage user access.

## Pages

| Page | Route | Who can use it | Purpose |
| --- | --- | --- | --- |
| Login | `/login` | Everyone | Sign in or create an account. |
| Find Gifts | `/quiz` | Signed-in users | Complete the gift quiz and generate recommendations. |
| My History | `/history` | Signed-in users | Review previous gift searches, newest first. |
| Saved Gifts | `/catalog` | Signed-in users | View gift ideas saved from recommendation results. |
| Admin | `/admin` | Admin users only | Review all history and manage users. |

## Getting Started

1. Open the app and go to `/login`.
2. Sign in with an existing username or email, or choose **Sign up** to create an account.
3. After signing in, the app opens the gift quiz at `/quiz`.

Usernames are normalized into internal email-style accounts. Real email addresses can also be used directly.

## Individual User Guide

### Find Gifts

Use `/quiz` to generate recommendations.

1. Choose a budget.
2. Choose who the gift is for.
3. Choose the recipient personality.
4. Optionally add extra context, such as hobbies, interests, occasions, or constraints.
5. Select **Find Perfect Gifts**.

The loading screen shows elapsed time and an ideal wait of around 15 seconds. The recommendation results include:

- A short AI-generated summary.
- Up to five gift recommendations.
- A best-match badge for the top result.
- Price, category, subcategory, gift angle, confidence, and match score.
- A **Save** button for each gift.

If no exact catalog matches are found, the app shows alternative catalog items that may still work.

### Save Gifts

On the recommendations page, select **Save** on any gift card. Saved gifts are stored to your account with the recommendation reason as notes.

### View Saved Gifts

Use `/catalog` or the **Saved gifts** navigation link.

This page shows only the gifts you saved, newest first. Each saved gift includes:

- Gift name and price.
- Saved date.
- Recommendation notes or catalog description.
- Category, subcategory, and brand.

Use **Find more gifts** to return to the quiz.

### View My History

Use `/history` or the **My history** navigation link.

This page shows your completed searches in descending order, with the latest 10 shown first. Use **Previous** and **Next** to move between pages.

Each history entry includes:

- Search date and time.
- Recipient.
- Personality.
- Budget.
- Optional free-text notes.
- Recommendation summary.
- Top ranked recommendation details when available.

### Log Off

Use **Log off** in the navigation menu to end your session and return to the login page.

## Admin User Guide

Admin users see an **Admin** navigation link. Non-admin users are redirected away from `/admin`.

The Admin page has two tabs:

- **All history**
- **User management**

### All History

Use `/admin` and select **All history**.

This page shows recommendation runs across all users in descending order, with the latest 10 shown first. Use **Previous** and **Next** to move through older or newer pages.

The grid includes:

- Date.
- User email.
- Recipient.
- Personality.
- Budget.
- Free-text input.
- Model used.
- Recommendation summary.

Select a row to expand it and view the stored ranked output JSON for that recommendation run.

### User Management

Use `/admin` and select **User management**.

The user grid includes:

- Email.
- Role.
- Access status.
- Created date.
- Last sign-in date.
- Access action.

Use the search bar to filter users by email.

### Change a User Role

In the **Role** column, use the dropdown to switch a user between:

- `User`
- `Admin`

Admins cannot remove their own admin access from the grid.

### Revoke or Restore Access

Use the action button in the user row:

- **Revoke access** prevents that user from signing in.
- **Restore access** allows the user to sign in again.

Revoking access does not delete the user account or user history.

Admins cannot revoke their own access from the grid.

## Navigation

Signed-in users see:

- **Find gifts**
- **My history**
- **Saved gifts**
- **Log off**

Admin users also see:

- **Admin**

On mobile, these links are available from the menu button.

## Data and History

GiftMatch stores:

- User profiles and roles.
- Quiz runs.
- Recommendation runs.
- Saved gifts.
- Catalog items.

Individual users can read their own history and saved gifts. Admin users can review all recommendation history and manage user access through server-side admin APIs.

## Admin API Behavior

The admin tools use authenticated API routes:

- `/api/admin-runs`: returns paginated recommendation history for admins.
- `/api/admin-users`: lists users, updates roles, and revokes or restores access.
- `/api/admin-status`: checks whether the current signed-in user is an admin.

Requests require a valid signed-in session. Non-admin users receive a forbidden response.

## Troubleshooting

### I cannot see the Admin link

Your account role is probably `user`. An existing admin must change your role to `admin`.

### I was redirected from `/admin`

The app redirects non-admin users to the quiz page.

### My saved gift did not appear

Make sure you are signed in, then refresh `/catalog`. If saving failed, the gift card will show an error message.

### My recommendations failed

Try again with a broader budget or more context. If the live model is unavailable, GiftMatch may use a catalog fallback so the flow remains usable.

## Local Development

Common commands:

```bash
npm install
npm run dev
npm test -- --run
npm run build
```

The app expects Supabase and OpenAI-related environment variables in `.env` for full local functionality.
