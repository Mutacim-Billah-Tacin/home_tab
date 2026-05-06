# Security Specification - Orbit Dashboard

## Data Invariants
1. A Task must belong to a verified User.
2. A Bookmark must have a valid URL and belong to a verified User.
3. A Note can only be modified by its owner.
4. User PII is restricted to the owner.

## The Dirty Dozen Payloads (Rejection Targets)
1. **Identity Spoofing**: Creating a task with `userId` of another user.
2. **PII Leak**: Reading a user's document without being that user.
3. **Ghost Field**: Adding `isVerified: true` to a Task document.
4. **Id Poisoning**: Using a 1MB string as a Bookmark ID.
5. **Type Poisoning**: Sending `completed: "not yet"` instead of `boolean`.
6. **Relational Sync**: Listing tasks without filtering by `userId` (Query Enforcer).
7. **Size Attack**: A Bookmark title exceeding 256 characters.
8. **Immutability Breach**: Changing `userId` on an existing Task.
9. **Timestamp Spoofing**: Sending a client-side date instead of `serverTimestamp()`.
10. **State Shortcut**: Forcing a note to be created with an extremely large content string (Denial of Wallet).
11. **Account Takeover**: Updating another user's email field in `users` collection.
12. **Orphaned Writes**: Creating a task without a valid `auth.uid`.

## Test Runner (Logic Verification)
The `firestore.rules` will strictly enforce validation helpers for every write operation and explicit `resource.data.userId` checks for list queries.
