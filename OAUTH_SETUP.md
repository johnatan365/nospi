
# OAuth Provider Configuration for Nospi

## Issue: "Unsupported provider: provider is not enabled"

This error occurs when trying to sign in with Google or Apple because the OAuth providers are not yet configured in your Supabase project.

## How to Fix

### 1. Enable Google OAuth Provider

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/wjdiraurfbawotlcndmk
2. Navigate to **Authentication** → **Providers**
3. Find **Google** in the list and click to configure
4. Enable the provider
5. Add your Google OAuth credentials:
   - **Client ID**: Get from Google Cloud Console
   - **Client Secret**: Get from Google Cloud Console
6. Add the redirect URL: `nospi://auth/callback`
7. Save the configuration

#### Getting Google OAuth Credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API
4. Go to **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Configure OAuth consent screen
6. Create credentials for:
   - **iOS** (if you have iOS app)
   - **Android** (if you have Android app)
   - **Web** (for web version)
7. Add authorized redirect URIs:
   - `https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback`
   - `nospi://auth/callback`

### 2. Enable Apple OAuth Provider

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/wjdiraurfbawotlcndmk
2. Navigate to **Authentication** → **Providers**
3. Find **Apple** in the list and click to configure
4. Enable the provider
5. Add your Apple OAuth credentials:
   - **Services ID**: Get from Apple Developer Portal
   - **Team ID**: Get from Apple Developer Portal
   - **Key ID**: Get from Apple Developer Portal
   - **Private Key**: Get from Apple Developer Portal
6. Add the redirect URL: `nospi://auth/callback`
7. Save the configuration

#### Getting Apple OAuth Credentials:

1. Go to [Apple Developer Portal](https://developer.apple.com/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Create a new **Services ID** for Sign in with Apple
4. Configure the Services ID:
   - Add your domain
   - Add return URLs: `https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback`
5. Create a **Key** for Sign in with Apple
6. Download the private key (you can only download it once!)
7. Note your Team ID from the membership page

### 3. Update app.json (if needed)

Make sure your `app.json` has the correct scheme configured:

```json
{
  "expo": {
    "scheme": "nospi",
    "ios": {
      "bundleIdentifier": "com.yourcompany.nospi"
    },
    "android": {
      "package": "com.yourcompany.nospi"
    }
  }
}
```

### 4. Test the OAuth Flow

After configuring the providers:

1. Restart your Expo development server
2. Try signing in with Google or Apple
3. You should be redirected to the OAuth provider's login page
4. After successful authentication, you'll be redirected back to the app

## Important Notes

- **Deep Linking**: The redirect URL `nospi://auth/callback` uses the app's custom URL scheme for deep linking
- **Web vs Native**: OAuth flows work differently on web (popup) vs native (browser redirect)
- **Testing**: You may need to test on a real device for native OAuth flows to work properly
- **Expo Go**: Some OAuth providers may not work in Expo Go. You may need to create a development build.

## Troubleshooting

### "Invalid redirect URI"
- Make sure the redirect URI in your OAuth provider settings matches exactly: `https://wjdiraurfbawotlcndmk.supabase.co/auth/v1/callback`
- Also add the deep link: `nospi://auth/callback`

### "OAuth provider not responding"
- Check that your OAuth credentials are correct
- Verify that the OAuth provider is enabled in Supabase
- Check the Supabase logs for more details

### "Deep link not working"
- Make sure your app.json has the correct scheme
- Restart the Expo development server
- On iOS, you may need to rebuild the app

## Current Status

✅ Email/Password authentication is working
❌ Google OAuth - **Needs configuration in Supabase Dashboard**
❌ Apple OAuth - **Needs configuration in Supabase Dashboard**

Once you configure the OAuth providers in the Supabase Dashboard, the authentication buttons in the app will work correctly.
