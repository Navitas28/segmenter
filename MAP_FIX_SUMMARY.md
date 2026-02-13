# Map Loading Issue - Fix Summary

## Problem

The customer console map was stuck in "Loading Map... Initializing Google Maps..." state indefinitely and never rendered.

## Root Cause

**Catch-22 Logic Error:**
1. Component initialized with `loading = true` state
2. Early return in render when `loading === true` prevented map container `<div>` from rendering
3. Callback ref `mapRefCallback` was never invoked (no div = no callback)
4. Map initialization never ran (callback never called)
5. `loading` state never updated to `false` (initialization never ran)
6. **Infinite loading state**

## Solution

**Changed rendering strategy** from conditional rendering to always-render-with-overlay:

### Before (Broken):
```typescript
if (loading) {
  return <LoadingUI />; // Early return prevents map div from rendering
}
return <div ref={mapRef} />; // Never reached when loading
```

### After (Fixed):
```typescript
return (
  <div className="relative">
    <div ref={mapRefCallback} /> {/* ALWAYS rendered */}
    {loading && <LoadingOverlay />} {/* Overlay on top */}
  </div>
);
```

## Key Changes

### 1. Callback Ref Pattern
- **Changed from:** `useRef` + `useEffect` (ref wasn't ready when effect ran)
- **Changed to:** Callback ref function invoked exactly when div mounts to DOM

### 2. Always-Render Strategy
- Map container `<div>` now always rendered
- Loading/error states shown as absolute-positioned overlays
- Callback ref guaranteed to be invoked

### 3. Initialization Guard
- Added `initializingRef` to prevent double initialization from React StrictMode
- Proper cleanup on errors

### 4. Default India View
- Shows India center (20.5937°N, 78.9629°E) at zoom 5 when no data selected
- Zooms to Delhi/segments area when data loaded
- Users see map immediately without needing selections

## Files Modified

1. **`src/ui/src/components/customer/CustomerMapView.tsx`**
   - Converted to callback ref pattern
   - Always-render strategy with overlays
   - Default India map view
   - Added double-initialization guard

2. **`src/ui/src/services/maps.ts`**
   - No logic changes (only instrumentation added/removed)

## Technical Details

**Map Configuration:**
- Map ID: `62304de93ee45a67` (WebGL-enabled)
- API Key: From `VITE_GOOGLE_MAPS_API_KEY` env variable
- Libraries: `visualization`, `marker` (Advanced Marker API)
- Default zoom: 5 (India view) or 12 (segments view)

**Initialization Flow:**
1. Component renders → `<div ref={mapRefCallback}>` exists in DOM
2. React invokes `mapRefCallback(element)` with the div element
3. Callback checks guards (already initialized? already initializing?)
4. Calls `loadGoogleMaps(apiKey)` to load Google Maps API script
5. Script loads → `google.maps` available
6. Creates `new google.maps.Map(element, config)`
7. Updates state: `setMapReady(true)`, `setLoading(false)`
8. Loading overlay disappears, map visible

## Testing Performed

✅ Map loads without election/assembly selection (India view)
✅ Map loads with selection (segments view with data)
✅ No infinite loading state
✅ No console errors
✅ WebGL rendering active
✅ All interactive features working (hover, click, tooltips)

## Prevention

To prevent similar issues in the future:

1. **Never use early returns with refs** - Refs need the DOM element to exist
2. **Use callback refs for initialization** - Guarantees element exists
3. **Prefer overlays over conditional rendering** - For loading/error states
4. **Add initialization guards** - Prevent double initialization in StrictMode
5. **Test without data** - Ensure UI works in empty states

---

**Fixed:** 2026-02-06
**Debug Mode:** Systematic hypothesis-driven debugging with runtime evidence
**Result:** Map loads successfully in all scenarios
