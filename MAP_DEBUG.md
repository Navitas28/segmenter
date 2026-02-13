# Map Loading Debug Guide

## Current Issue

Map shows "Loading Map... Please wait" and never loads.

---

## Debug Steps

### Step 1: Check Browser Console

Open browser console (F12) and look for:

1. **Google Maps API errors:**
   ```
   [CustomerMapView] Initializing map, API Key present: true
   [CustomerMapView] Loading Google Maps...
   ```

2. **API key errors:**
   ```
   Google Maps API error: InvalidKeyMapError
   Google Maps API error: ApiNotActivatedMapError
   ```

3. **JavaScript errors:**
   ```
   Uncaught ReferenceError: google is not defined
   Failed to load Google Maps: [error message]
   ```

### Step 2: Verify API Key

Check `.env` file has valid key:
```bash
cd src/ui
cat .env
```

Should show:
```
VITE_GOOGLE_MAPS_API_KEY=AIzaSy...
```

### Step 3: Test Google Maps API

Open this URL in browser (replace with your key):
```
https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY_HERE&libraries=visualization,marker
```

Should load JavaScript (not show error).

### Step 4: Check Network Tab

1. Open DevTools Network tab
2. Refresh page
3. Look for request to `maps.googleapis.com`
4. Check if it returns 200 OK or error

---

## Common Issues & Fixes

### Issue 1: API Key Not Valid

**Symptoms:**
- Console shows: `Google Maps API error: InvalidKeyMapError`
- Map never loads

**Fix:**
1. Go to Google Cloud Console
2. Navigate to APIs & Services > Credentials
3. Check API key restrictions
4. Ensure "Maps JavaScript API" is enabled
5. Update key in `src/ui/.env`

### Issue 2: Maps JavaScript API Not Enabled

**Symptoms:**
- Console shows: `ApiNotActivatedMapError`
- Request returns 403

**Fix:**
1. Go to Google Cloud Console
2. Navigate to APIs & Services > Library
3. Search for "Maps JavaScript API"
4. Click Enable

### Issue 3: Domain Restrictions

**Symptoms:**
- Works on some domains but not others
- 403 error in console

**Fix:**
1. Go to API key settings
2. Under "Application restrictions"
3. Either:
   - Set to "None" (for testing)
   - Add `localhost:5173` to allowed referrers

### Issue 4: Billing Not Enabled

**Symptoms:**
- Map loads but shows "For development purposes only" watermark
- Or fails to load entirely

**Fix:**
1. Enable billing on Google Cloud project
2. Maps API requires billing (even though free tier exists)

### Issue 5: Missing Libraries

**Symptoms:**
- Map loads but markers don't work
- Console error about missing library

**Fix:**
Already included in script URL:
```javascript
libraries=${['visualization', 'marker'].join(',')}
```

### Issue 6: React Re-rendering Issues

**Symptoms:**
- Map initializes multiple times
- Flickers or resets

**Fix:**
Added proper checks:
```javascript
if (!mapRef.current || googleMapRef.current) return;
```

---

## Quick Diagnostic Commands

### Check if Google Maps loads in browser console:

```javascript
// After page loads, in browser console:
console.log(typeof google);          // Should be "object"
console.log(typeof google.maps);     // Should be "object"
console.log(typeof google.maps.Map); // Should be "function"
```

### Check environment variable:

```javascript
// In browser console:
console.log(import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
```

### Force reload map:

```javascript
// In browser console:
location.reload();
```

---

## Temporary Workaround

If Google Maps still won't load, use a simple test map:

```tsx
// Replace CustomerMapView content with:
return (
  <div className="w-full h-full flex items-center justify-center bg-gray-100">
    <div className="text-center">
      <div className="text-lg font-semibold text-gray-900 mb-2">
        Map Placeholder
      </div>
      <div className="text-sm text-gray-600">
        Google Maps API key: {apiKey ? '✓ Present' : '✗ Missing'}
      </div>
      <div className="text-sm text-gray-600">
        Segments loaded: {segments.length}
      </div>
    </div>
  </div>
);
```

---

## Expected Console Output

When working correctly:
```
[CustomerMapView] Initializing map, API Key present: true
[CustomerMapView] Loading Google Maps...
[CustomerMapView] Google Maps loaded successfully
[CustomerMapView] Creating map instance...
[CustomerMapView] Map ready!
```

When there's an error:
```
[CustomerMapView] Initializing map, API Key present: false
[CustomerMapView] Missing API key
```

Or:
```
[CustomerMapView] Loading Google Maps...
[CustomerMapView] Failed to load Google Maps: [error details]
```

---

## Files Modified for Debugging

1. **`CustomerMapView.tsx`**
   - Added console.log statements
   - Simplified map initialization
   - Removed mapId requirement
   - Better error handling
   - Fallback geometry parsing

---

## Next Steps

1. **Open customer console:** http://localhost:5173/customer
2. **Open browser DevTools:** F12
3. **Check Console tab:** Look for `[CustomerMapView]` logs
4. **Check Network tab:** Look for Google Maps API request
5. **Report what you see:** Share any errors

---

## Alternative: Use Admin Map Component

If customer map continues having issues, we can temporarily use the working admin map component:

```tsx
// In CustomerConsole.tsx
import MapContainer from '../components/map/MapContainer';

// Replace CustomerMapView with:
<MapContainer
  segments={segments}
  baseSegments={segments}
  compareSegments={[]}
  booths={[]}
  scopeType="AC"
  selectedVersion={selectedVersion}
  baseVersion={null}
  compareVersion={null}
  versionOptions={[]}
  performanceMetrics={null}
/>
```

This is guaranteed to work since admin console works.

---

## Summary

Added extensive logging to diagnose map loading issue.

**Check browser console now and share what errors you see!**
