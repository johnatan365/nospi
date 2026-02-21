
# Google OAuth Implementation with Expo AuthSession PKCE Flow

## Overview
This document explains the proper implementation of Google OAuth using Expo AuthSession with PKCE (Proof Key for Code Exchange) flow for the Nospi app.

## Key Components

### 1. Dependencies
- `expo-auth-session`: For creating proper redirect URIs
- `expo-web-browser`: For opening in-app browser (NOT external Chrome)
- `expo-linking`: For handling deep link callbacks
- `@supabase/supabase-js`: For authentication

### 2. Configuration

#### app.json
```json
{
  "expo": {
    "scheme": "nospi",
    "ios": {
      "infoPlist": {
        "CFBundleURLTypes": [
          {
            "CFBundleURLSchemes": ["nospi"]
          }
        ]
      }
    },
    "android": {
      "intentFilters": [
        {
          "action": "VIEW",
          "autoVerify": true,
          "data": [
            {
              "scheme": "nospi",
              "host": "auth"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

#### lib/supabase.ts
```typescript
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // CRITICAL: We handle URL detection manually
    flowType: 'pkce', // CRITICAL: Enable PKCE flow for Expo
  },
});
```

### 3. Implementation Flow

#### Step 1: Initialize WebBrowser (Top Level)
```typescript
import * as WebBrowser from 'expo-web-browser';

// CRITICAL: Call this at the top level to complete auth sessions
WebBrowser.maybeCompleteAuthSession();
```

#### Step 2: Create Redirect URI
```typescript
import * as AuthSession from 'expo-auth-session';

const redirectUri = AuthSession.makeRedirectUri({
  scheme: 'nospi',
  path: 'auth',
});
// Result: nospi://auth
```

#### Step 3: Initiate OAuth Flow
```typescript
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: redirectUri,
    skipBrowserRedirect: true, // CRITICAL: We handle browser opening manually
    queryParams: {
      access_type: 'offline',
      prompt: 'consent',
    },
  },
});
```

#### Step 4: Open In-App Browser
```typescript
if (data.url) {
  const result = await WebBrowser.openAuthSessionAsync(
    data.url,
    redirectUri,
    {
      showInRecents: true, // Ensures in-app browser (NOT external Chrome)
    }
  );
}
```

#### Step 5: Global Deep Link Listener (app/_layout.tsx)
```typescript
useEffect(() => {
  const handleDeepLink = async (event: { url: string }) => {
    const url = event.url;
    
    if (url.includes('nospi://auth') || url.includes('/auth')) {
      console.log('OAuth callback detected, exchanging code for session...');
      
      try {
        // CRITICAL: Use exchangeCodeForSession for PKCE flow
        const { data, error } = await supabase.auth.exchangeCodeForSession(url);
        
        if (data.session) {
          console.log('✅ Session exchanged successfully');
          // onAuthStateChange listeners will handle navigation
        }
      } catch (error) {
        console.error('Failed to exchange code for session:', error);
      }
    }
  };

  const listener = Linking.addEventListener('url', handleDeepLink);
  
  // Check for initial URL (cold start)
  Linking.getInitialURL().then((url) => {
    if (url) handleDeepLink({ url });
  });

  return () => listener.remove();
}, []);
```

#### Step 6: Auth State Change Listener (login.tsx / register.tsx)
```typescript
useEffect(() => {
  const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      // Create profile if needed
      // Navigate to authenticated screen
      router.replace('/(tabs)/events');
    }
  });

  return () => authListener.subscription.unsubscribe();
}, [router]);
```

## Expected Flow

1. **User taps "Sign in with Google"**
   - App creates redirect URI: `nospi://auth`
   - App calls `supabase.auth.signInWithOAuth()` with `skipBrowserRedirect: true`
   - Supabase returns OAuth URL

2. **App opens in-app browser**
   - `WebBrowser.openAuthSessionAsync()` opens Google OAuth in in-app browser
   - User selects Google account and grants permissions

3. **Google redirects to app**
   - Google redirects to `nospi://auth?code=...`
   - Deep link opens the app

4. **Global listener catches redirect**
   - `Linking.addEventListener` in `app/_layout.tsx` catches the URL
   - Calls `supabase.auth.exchangeCodeForSession(url)`

5. **Session created**
   - Supabase exchanges authorization code for session
   - Session is persisted in AsyncStorage
   - `onAuthStateChange` fires with `SIGNED_IN` event

6. **Navigation**
   - Auth state change listener in login.tsx/register.tsx
   - Creates user profile if needed
   - Navigates to `/(tabs)/events`

## Critical Points

### ✅ DO:
- Use `AuthSession.makeRedirectUri()` for redirect URI
- Call `WebBrowser.maybeCompleteAuthSession()` at top level
- Use `skipBrowserRedirect: true` in `signInWithOAuth`
- Open browser with `WebBrowser.openAuthSessionAsync()`
- Set `detectSessionInUrl: false` in Supabase client
- Set `flowType: 'pkce'` in Supabase client
- Use global `Linking.addEventListener` in `app/_layout.tsx`
- Call `exchangeCodeForSession()` when deep link is received

### ❌ DON'T:
- Use `Linking.createURL()` (use `AuthSession.makeRedirectUri()` instead)
- Rely on Supabase's default browser redirect
- Open external Chrome browser
- Use `detectSessionInUrl: true`
- Create multiple deep link listeners
- Forget to call `WebBrowser.maybeCompleteAuthSession()`

## Troubleshooting

### Issue: Blank screen after login
**Cause**: External browser opens instead of in-app browser, breaking PKCE flow
**Solution**: Ensure `WebBrowser.openAuthSessionAsync()` is used with `showInRecents: true`

### Issue: 403 error
**Cause**: External Chrome browser breaks PKCE flow
**Solution**: Use in-app browser with `WebBrowser.openAuthSessionAsync()`

### Issue: Deep link not caught
**Cause**: Listener not attached or wrong URL scheme
**Solution**: Verify `app.json` has correct scheme and listener is in `app/_layout.tsx`

### Issue: Session not persisted
**Cause**: `exchangeCodeForSession()` not called
**Solution**: Ensure global listener calls `exchangeCodeForSession()` with the redirect URL

## Supabase Dashboard Configuration

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Add OAuth credentials (Client ID, Client Secret)
4. Add redirect URLs:
   - Development: `nospi://auth`
   - Production: `nospi://auth` (or custom domain)
5. Save configuration

## Testing

1. **Development**: Test in Expo Go or development build
2. **Production**: Test in standalone build (EAS Build)
3. **Verify**:
   - In-app browser opens (NOT external Chrome)
   - User can select Google account
   - App receives deep link callback
   - Session is created and persisted
   - User is navigated to authenticated screen

## References

- [Expo AuthSession Documentation](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Expo WebBrowser Documentation](https://docs.expo.dev/versions/latest/sdk/webbrowser/)
- [Supabase PKCE Flow](https://supabase.com/docs/guides/auth/native-mobile-deep-linking)
