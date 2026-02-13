# Design System - Customer Console

## Overview

Complete redesign of the customer console with a modern, minimal, and clean aesthetic inspired by contemporary UI/UX best practices.

---

## Design Principles

### 1. **Minimalism**
- Clean layouts with ample white space
- Remove unnecessary elements
- Focus on essential functionality
- Simple, uncluttered interfaces

### 2. **Clarity**
- Clear visual hierarchy
- Consistent typography
- Obvious interactive elements
- Intuitive navigation

### 3. **Modern Aesthetics**
- Subtle gradients and shadows
- Rounded corners (8-12px)
- Smooth transitions
- Contemporary color palette

### 4. **Consistency**
- Uniform spacing system
- Consistent component styles
- Predictable interactions
- Cohesive visual language

---

## Color Palette

### Primary Colors
```css
Blue (Primary):
- 50:  #eff6ff
- 100: #dbeafe
- 500: #3b82f6  /* Primary actions */
- 600: #2563eb  /* Hover states */
- 700: #1d4ed8

Gray (Neutral):
- 50:  #f9fafb  /* Backgrounds */
- 100: #f3f4f6  /* Hover states */
- 200: #e5e7eb  /* Borders */
- 300: #d1d5db  /* Disabled */
- 400: #9ca3af  /* Icons */
- 500: #6b7280  /* Labels */
- 600: #4b5563  /* Text secondary */
- 700: #374151  /* Text primary */
- 900: #111827  /* Headings */
```

### Semantic Colors
```css
Success (Green):
- 50:  #f0fdf4
- 100: #dcfce7
- 600: #16a34a
- 700: #15803d

Warning (Amber):
- 50:  #fffbeb
- 100: #fef3c7
- 600: #d97706

Error (Red):
- 50:  #fef2f2
- 100: #fee2e2
- 600: #dc2626

Purple (Accent):
- 50:  #faf5ff
- 100: #f3e8ff
- 600: #9333ea
```

---

## Typography

### Font Stack
```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 
             'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 
             sans-serif;
```

### Scale
```css
Headings:
- text-base (16px) - Section titles
- text-lg (18px)   - Page titles
- text-xl (20px)   - Modal titles

Body:
- text-xs (12px)   - Labels, captions
- text-sm (14px)   - Body text, buttons
- text-base (16px) - Important text

Numbers:
- text-lg (18px)   - Stats
- text-2xl (24px)  - Large numbers
```

### Weights
```css
- font-normal (400)    - Body text
- font-medium (500)    - Buttons, labels
- font-semibold (600)  - Headings, emphasis
- font-bold (700)      - Numbers, important
```

---

## Spacing System

### Scale (Tailwind)
```
0.5 = 2px    (tight spacing)
1   = 4px
2   = 8px    (default gap)
3   = 12px
4   = 16px   (section padding)
6   = 24px   (large padding)
8   = 32px
12  = 48px   (collapsed sidebar)
```

### Component Spacing
```
Padding:
- Cards: p-4 (16px)
- Sections: p-6 (24px)
- Modals: p-6 (24px)

Gaps:
- Items: gap-2 (8px)
- Sections: gap-4 (16px)
- Large: gap-6 (24px)
```

---

## Components

### Buttons

**Primary Button**
```tsx
className="h-9 px-4 text-sm font-medium bg-blue-600 text-white 
hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 
rounded-lg transition-all"
```

**Secondary Button**
```tsx
className="h-9 px-3 text-sm font-medium text-gray-700 
hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
```

**Icon Button**
```tsx
className="w-9 h-9 flex items-center justify-center text-gray-600 
hover:bg-gray-100 rounded-lg transition-colors"
```

### Inputs

**Text Input**
```tsx
className="h-9 px-3 text-sm border border-gray-300 rounded-lg 
focus:outline-none focus:ring-2 focus:ring-blue-500 
focus:border-transparent transition-all"
```

**Textarea**
```tsx
className="px-3 py-2 text-sm border border-gray-300 rounded-lg 
focus:outline-none focus:ring-2 focus:ring-blue-500 
focus:border-transparent resize-none"
```

**Select Dropdown**
```tsx
className="h-9 px-3 text-sm bg-white border border-gray-300 
rounded-lg text-gray-700 hover:border-gray-400 focus:outline-none 
focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
```

### Cards

**Standard Card**
```tsx
className="bg-white rounded-xl border border-gray-200 p-4"
```

**Gradient Card**
```tsx
className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl"
```

**Hover Card**
```tsx
className="bg-white p-4 rounded-lg hover:bg-gray-50 transition-colors"
```

### Badges

**Status Badge**
```tsx
className="px-2 py-0.5 text-xs font-medium rounded-full 
bg-green-100 text-green-700"
```

### Modals

**Modal Container**
```tsx
className="fixed inset-0 bg-black/50 backdrop-blur-sm flex 
items-center justify-center z-50 p-4"
```

**Modal Content**
```tsx
className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
```

---

## Layout

### Header (TopBar)
- Height: `h-14` (56px)
- Background: `bg-white`
- Border: `border-b border-gray-200`
- Padding: `px-6`

### Sidebars
**Expanded:**
- Left: `w-72` (288px)
- Right: `w-80` (320px)
- Background: `bg-white`
- Border: `border-r/l border-gray-200`

**Collapsed:**
- Width: `w-12` (48px)
- Icon size: `16px`
- Centered icon

### Content Area
- Background: `bg-gray-100`
- Fills remaining space

### Bottom Panel
- Max height: `h-52` (208px) when open
- Height: `h-0` when closed
- Smooth transition: `duration-300 ease-out`

---

## Icons

### Size Guidelines
```
Small:  14px (size={14})
Medium: 16px (size={16})
Large:  18px (size={18})
XL:     20px (size={20})
```

### Usage
- **Navigation:** 16-18px
- **Buttons:** 14-16px
- **Headers:** 18-20px
- **Inline:** 14px

### Color
- Default: `text-gray-400`
- Hover: `text-gray-600`
- Active: `text-gray-900`

---

## Shadows

```css
sm:   0 1px 2px 0 rgb(0 0 0 / 0.05)
md:   0 4px 6px -1px rgb(0 0 0 / 0.1)
lg:   0 10px 15px -3px rgb(0 0 0 / 0.1)
xl:   0 20px 25px -5px rgb(0 0 0 / 0.1)
2xl:  0 25px 50px -12px rgb(0 0 0 / 0.25)
```

### Usage
- Cards: `shadow-sm` or border only
- Modals: `shadow-2xl`
- Dropdowns: `shadow-lg`
- Floating elements: `shadow-xl`

---

## Borders

### Radius
```css
sm:  4px  (rounded-sm)
md:  6px  (rounded-md)
lg:  8px  (rounded-lg)
xl:  12px (rounded-xl)
2xl: 16px (rounded-2xl)
```

### Usage
- Buttons: `rounded-lg` (8px)
- Inputs: `rounded-lg` (8px)
- Cards: `rounded-xl` (12px)
- Modals: `rounded-2xl` (16px)
- Icons/Avatars: `rounded-lg` (8px)

### Colors
- Default: `border-gray-200`
- Hover: `border-gray-400`
- Focus: `border-transparent` (use ring)
- Divider: `border-gray-100`

---

## Transitions

### Timing
```css
Fast:     100ms
Default:  200ms (transition-all)
Medium:   300ms (transition-colors)
Slow:     500ms
```

### Easing
```css
Default:  ease
In:       ease-in
Out:      ease-out
In-Out:   ease-in-out
```

### Usage
- Hover states: `transition-colors`
- All properties: `transition-all`
- Panel expand/collapse: `duration-300 ease-out`

---

## Interactions

### Hover States
- Buttons: Background color change
- Cards: Subtle background change
- Icons: Color change
- Links: Underline or color

### Active States
- Buttons: Slight scale or darker shade
- Toggle buttons: Background + shadow
- Selected items: Border or background

### Focus States
- Ring: `focus:ring-2 focus:ring-blue-500`
- Border: `focus:border-transparent`
- Outline: `focus:outline-none`

### Disabled States
- Background: `bg-gray-200`
- Text: `text-gray-400`
- Cursor: `cursor-not-allowed`
- Opacity: No change (use colors)

---

## Specific Components

### TopBar Design
```
┌─────────────────────────────────────────────────────────┐
│ [Icon] Title │ [Election▼] [AC|Booth] [Assembly▼]     │
│              │ [Booth▼] [Latest▼] │ History Run Export │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Logo icon in gradient circle
- Subtle dividers between sections
- Toggle buttons for AC/Booth
- Compact selectors
- Icon + text buttons

### Sidebar Collapse
```
Collapsed:              Expanded:
┌──┐                   ┌────────────┐
│ →│                   │ Title    ← │
│  │                   │            │
│  │                   │ Content    │
└──┘                   └────────────┘
```

**Features:**
- Small icon (16px) in collapsed state
- Icon in top corner when expanded
- Smooth transition (300ms)
- Header with title
- Centered collapse button

### Stat Cards
```tsx
<div className="bg-gradient-to-br from-blue-50 to-blue-100 
  p-4 rounded-xl">
  <div className="text-2xl font-bold text-blue-900">125</div>
  <div className="text-xs text-blue-700 mt-1">Voters</div>
</div>
```

**Variants:**
- Blue: Primary stats
- Green: Success metrics
- Purple: Secondary stats
- Amber: Warning/attention

---

## Best Practices

### DO ✅
- Use consistent spacing (4px, 8px, 16px, 24px)
- Round all corners (8px minimum)
- Add hover states to interactive elements
- Use subtle shadows on elevated elements
- Group related items visually
- Provide clear visual feedback
- Use icon + text for important actions
- Keep text hierarchy clear

### DON'T ❌
- Mix different corner radius sizes
- Use inconsistent spacing
- Forget hover/focus states
- Over-use shadows
- Use too many colors
- Make clickable areas too small
- Hide important actions
- Use unclear labels

---

## Accessibility

### Color Contrast
- Body text: 4.5:1 minimum
- Large text: 3:1 minimum
- Interactive elements: Clear indicators

### Focus Indicators
- Always visible
- High contrast
- Clear boundary

### Interactive Sizes
- Minimum: 44x44px touch target
- Buttons: 36px (h-9) minimum
- Checkboxes: 16px minimum

---

## Implementation

All components use:
- **Tailwind CSS** for styling
- **Lucide React** for icons
- **CSS transitions** for animations
- **Semantic HTML** for structure

### File Structure
```
components/customer/
├── TopBar.tsx           - Clean header
├── LeftSidebar.tsx      - Collapsible controls
├── RightPanel.tsx       - Segment details
├── BottomAuditPanel.tsx - Audit info
├── CustomerMapView.tsx  - Map container
```

---

## Summary

This design system provides a **modern, minimal, and clean** aesthetic with:

✅ Contemporary color palette (blue + gray)
✅ Consistent spacing and typography
✅ Smooth transitions and interactions
✅ Subtle shadows and gradients
✅ Small, elegant collapse icons
✅ Clear visual hierarchy
✅ Professional appearance
✅ Accessibility compliance

**Result:** A polished, production-ready interface that feels modern and intuitive.
