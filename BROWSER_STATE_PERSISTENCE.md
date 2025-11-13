# Browser State Persistence

This feature allows the API to save and restore browser state (cookies, localStorage, sessionStorage) to avoid repeated logins and CAPTCHA challenges when connecting to LinkedIn.

## Overview

The browser state persistence system automatically:
- **Saves** all cookies, localStorage, and sessionStorage after successful login
- **Restores** the saved state when initializing a new browser session
- **Verifies** that the restored session is still valid
- **Cleans up** expired sessions automatically

## Benefits

1. **Skip Login**: Once logged in, you can reuse the session without entering credentials again
2. **Avoid CAPTCHAs**: Saved sessions bypass CAPTCHA challenges since LinkedIn recognizes the browser
3. **Faster Initialization**: Restored sessions load instantly without authentication flow
4. **Persistent Sessions**: Sessions remain valid for days/weeks (depending on LinkedIn's session timeout)

## How It Works

### 1. First Login (Save State)

When you login for the first time:

```bash
# Step 1: Initialize browser with email
POST /api/auth/init
{
  "email": "your.email@example.com"
}

# Step 2: Login (this will save browser state automatically)
POST /api/auth/login
{
  "sessionId": "...",
  "email": "your.email@example.com",
  "password": "your_password"
}
```

After successful login, the system automatically:
- Saves all cookies from the browser
- Saves localStorage data
- Saves sessionStorage data
- Stores the user agent
- Associates everything with your email address

### 2. Subsequent Sessions (Restore State)

On your next connection:

```bash
# Just initialize with your email - no login needed!
POST /api/auth/init
{
  "email": "your.email@example.com"
}

# Response will indicate session was restored
{
  "success": true,
  "sessionId": "...",
  "sessionRestored": true,
  "message": "Browser initialized with saved session"
}
```

The system will:
- Load your saved cookies
- Restore localStorage and sessionStorage
- Navigate to LinkedIn
- Verify the session is still valid
- Mark you as authenticated automatically
- Start message monitoring if enabled

### 3. Session Verification

The system automatically verifies restored sessions by:
- Navigating to LinkedIn feed
- Checking if redirected to login page
- If valid: marks session as authenticated
- If expired: deletes old state and requires fresh login

## Database Schema

Browser state is stored in PostgreSQL:

```sql
CREATE TABLE browser_state (
  id SERIAL PRIMARY KEY,
  user_identifier VARCHAR(255) UNIQUE NOT NULL,  -- Usually email
  cookies JSONB NOT NULL,                         -- All browser cookies
  local_storage JSONB,                            -- localStorage data
  session_storage JSONB,                          -- sessionStorage data
  user_agent VARCHAR(500),                        -- Browser user agent
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## API Reference

### Initialize Browser with State Restoration

**Endpoint**: `POST /api/auth/init`

**Request Body**:
```json
{
  "email": "your.email@example.com"  // Optional: provide to restore saved state
}
```

**Response** (New Session):
```json
{
  "success": true,
  "sessionId": "uuid-here",
  "sessionRestored": false,
  "message": "Browser initialized"
}
```

**Response** (Restored Session):
```json
{
  "success": true,
  "sessionId": "uuid-here",
  "sessionRestored": true,
  "message": "Browser initialized with saved session"
}
```

### Login (Automatically Saves State)

**Endpoint**: `POST /api/auth/login`

**Request Body**:
```json
{
  "sessionId": "uuid-here",
  "email": "your.email@example.com",
  "password": "your_password"
}
```

After successful login, browser state is automatically saved.

## Usage Examples

### Example 1: First-Time Login

```bash
# Initialize browser
curl -X POST http://localhost:3000/api/auth/init \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}'

# Login (saves state automatically)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "your-session-id",
    "email": "john@example.com",
    "password": "your_password"
  }'
```

### Example 2: Reusing Saved Session

```bash
# Just initialize with email - no login needed!
curl -X POST http://localhost:3000/api/auth/init \
  -H "Content-Type: application/json" \
  -d '{"email": "john@example.com"}'

# Response will show sessionRestored: true
# You can now use the API without logging in again
```

### Example 3: Using with n8n Workflow

In your n8n workflow:

1. **First Run**: 
   - Call `/api/auth/init` with email
   - Call `/api/auth/login` with credentials
   - State is saved automatically

2. **Subsequent Runs**:
   - Call `/api/auth/init` with email only
   - Check `sessionRestored` in response
   - If `true`, skip login step entirely

## Configuration

### Environment Variables

The browser state service uses the same database configuration as the cache service:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=linkedin
```

### User Identifier

The system uses the email address as the user identifier by default. You can also use a custom identifier:

```javascript
// In LinkedInService
await BrowserStateService.saveBrowserState('custom-user-id', page);
await BrowserStateService.restoreBrowserState('custom-user-id', page);
```

## Security Considerations

1. **Sensitive Data**: Browser state includes authentication cookies. Ensure your database is secure.
2. **Encryption**: Consider encrypting the `cookies` JSONB column for additional security.
3. **Access Control**: Restrict database access to authorized services only.
4. **Session Expiration**: LinkedIn sessions expire after inactivity. The system handles this automatically.

## Troubleshooting

### Session Not Restoring

**Problem**: `sessionRestored` is always `false`

**Solutions**:
1. Check if email matches exactly (case-sensitive)
2. Verify database connection
3. Check if state was saved after login
4. Look for errors in console logs

### Session Expired After Restoration

**Problem**: Session restores but immediately expires

**Solutions**:
1. LinkedIn may have invalidated the session
2. Try logging in again to create a fresh session
3. Check if cookies are being saved correctly
4. Verify user agent matches

### Database Errors

**Problem**: Errors when saving/restoring state

**Solutions**:
1. Ensure PostgreSQL is running
2. Verify database credentials in `.env`
3. Check if `browser_state` table exists
4. Review database logs for errors

## Advanced Usage

### Manual State Management

You can manually manage browser state using the `BrowserStateService`:

```typescript
import BrowserStateService from './services/BrowserStateService';

// Check if state exists
const hasState = await BrowserStateService.hasBrowserState('user@example.com');

// Save state manually
await BrowserStateService.saveBrowserState('user@example.com', page);

// Restore state manually
const restored = await BrowserStateService.restoreBrowserState('user@example.com', page);

// Verify session validity
const isValid = await BrowserStateService.verifySession(page);

// Delete state
await BrowserStateService.deleteBrowserState('user@example.com');
```

### Integration with Custom Authentication

If you have custom authentication logic:

```typescript
// After your custom login logic
const userIdentifier = 'custom-id-or-email';
await BrowserStateService.saveBrowserState(userIdentifier, page);

// On next initialization
const { browser, page } = await LinkedInService.initializeBrowser(userIdentifier);
```

## Monitoring and Maintenance

### Check Saved Sessions

Query the database to see saved sessions:

```sql
SELECT 
  user_identifier,
  created_at,
  updated_at,
  jsonb_array_length(cookies) as cookie_count
FROM browser_state
ORDER BY updated_at DESC;
```

### Clean Up Old Sessions

Remove sessions older than 30 days:

```sql
DELETE FROM browser_state
WHERE updated_at < NOW() - INTERVAL '30 days';
```

### Monitor Session Usage

Track how often sessions are restored vs. new logins:

```sql
-- Add a usage counter column
ALTER TABLE browser_state ADD COLUMN usage_count INTEGER DEFAULT 0;

-- Increment on each restore
UPDATE browser_state 
SET usage_count = usage_count + 1, updated_at = NOW()
WHERE user_identifier = 'user@example.com';
```

## Performance Impact

- **Save Operation**: ~100-200ms (includes database write)
- **Restore Operation**: ~500-1000ms (includes page navigation and verification)
- **Storage**: ~50-100KB per user (varies based on cookies and storage data)

## Best Practices

1. **Use Email as Identifier**: Consistent and easy to remember
2. **Handle Expired Sessions**: Always check `sessionRestored` flag
3. **Periodic Cleanup**: Remove old sessions from database
4. **Error Handling**: Gracefully handle restoration failures
5. **Logging**: Monitor restoration success/failure rates
6. **Testing**: Test with multiple users to ensure isolation

## Future Enhancements

Potential improvements for the browser state persistence system:

1. **Encryption**: Encrypt sensitive cookie data at rest
2. **Compression**: Compress JSONB data to reduce storage
3. **Multi-Account**: Support multiple LinkedIn accounts per user
4. **Session Pooling**: Maintain a pool of pre-authenticated sessions
5. **Automatic Refresh**: Periodically refresh sessions before expiration
6. **Session Sharing**: Share sessions across multiple API instances
7. **Audit Trail**: Track session usage and access patterns

## Support

For issues or questions:
1. Check console logs for detailed error messages
2. Verify database connectivity and schema
3. Review this documentation for troubleshooting steps
4. Check the main README.md for general setup instructions
