# Session Page Layout Guide

## Three-Column Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Left Sidebar   │    Main Content Area    │   Right TODO Panel  │
│    (240px)      │       (flex-1)          │      (384px)        │
│                 │                         │                     │
│  ┌───────────┐  │  ┌────────────────┐     │  ┌──────────────┐   │
│  │ Campaign  │  │  │  HEADER        │     │  │  DM Prep     │   │
│  │ Link      │  │  │  - Title       │     │  │  TODO        │   │
│  ├───────────┤  │  │  - Metadata    │     │  │  (Sticky)    │   │
│  │           │  │  │  - Status      │     │  ├──────────────┤   │
│  │ Recent    │  │  └────────────────┘     │  │              │   │
│  │ Sessions  │  │                         │  │  - Generate  │   │
│  │           │  │  ┌────────────────┐     │  │  - Edit      │   │
│  │  • Sess 1 │  │  │                │     │  │  - Markdown  │   │
│  │  • Sess 2 │  │  │  AI SUMMARY    │     │  │    Content   │   │
│  │  • Sess 3 │  │  │  (Prominent)   │     │  │              │   │
│  │  • Sess 4 │  │  │                │     │  │  [✓] Item 1  │   │
│  │  • Sess 5 │  │  │  Max 400px ht  │     │  │  [ ] Item 2  │   │
│  │  ...      │  │  │  Scrollable    │     │  │  [ ] Item 3  │   │
│  │           │  │  │                │     │  │              │   │
│  │           │  │  │  Edit/Regen    │     │  │              │   │
│  │           │  │  └────────────────┘     │  │              │   │
│  │           │  │                         │  │              │   │
│  │           │  │  ┌────────────────┐     │  │              │   │
│  │           │  │  │  TRANSCRIPT    │     │  │              │   │
│  │           │  │  │  (Collapsed)   │─────┤  │              │   │
│  │           │  │  │  Click to ↓    │     │  │              │   │
│  │           │  │  └────────────────┘     │  │              │   │
│  └───────────┘  │                         │  └──────────────┘   │
│                 │                         │                     │
└─────────────────────────────────────────────────────────────────┘
```

## Component Details

### Left Sidebar (240px, fixed)
**Purpose**: Session navigation within campaign
**Features**:
- Campaign name link at top
- Recent 10 sessions list
- Active session highlighted (blue border + background)
- Session titles with dates
- Scrollable if > 10 sessions

**Visual**:
- White background
- 3px left border on active item (blue)
- Hover state on all items
- Clean, minimal design

### Main Content Area (flex-1, scrollable)
**Purpose**: Primary content - Summary and Transcript
**Components**:

#### 1. Header (Gradient)
- Session title (32px, bold)
- Metadata chips:
  - 📅 Date
  - ⏰ Duration
  - 📖 Campaign
  - Status badge (colored)
- Gradient: slate-800 → slate-700
- White text with glassmorphism chips

#### 2. AI Summary Card (Prominent)
- Large "AI Summary" heading with sparkle icon
- Edit / Regenerate buttons in header
- Summary text:
  - Max height 400px
  - Scrollable with custom scrollbar (6px, rounded)
  - Clean typography, good line height (1.7)
- Edit mode: Textarea with save/cancel
- Empty state: "Generate Summary" button

#### 3. Transcript Section (Minimized)
- Expandable/collapsible design
- Shows "Full Transcript (N segments)" when collapsed
- ChevronRight → ChevronDown when expanded
- When expanded:
  - Shows all segments with timestamps
  - Max height 400px, scrollable
  - White cards for each segment
- Gray background when collapsed
- Hover effect for interactivity

### Right Panel (384px, fixed)
**Purpose**: DM Prep TODO List
**Features**:
- Warm amber/yellow theme (amber-50 background)
- Sticky header with:
  - "DM Prep TODO" title
  - Edit / Regenerate buttons
- Markdown-rendered content
- Checkable items (if markdown has checkboxes)
- Scrollable content area
- Empty state: "Generate TODO" button

**Visual**:
- `flex-shrink-0` ensures it never collapses
- Amber color scheme (#fefce8)
- Border left: amber-200
- Sticky header stays visible during scroll

## Responsive Behavior

### Desktop (> 1440px)
- All three columns visible
- Main content gets most space
- Comfortable reading width

### Laptop (1024px - 1440px)
- All three columns visible
- Main content adjusts (flex-1)
- Still fully functional

### Tablet/Mobile (< 1024px)
- ⚠️ Not optimized yet
- Consider:
  - Stack vertically
  - Tab navigation
  - Drawer for TODO list

## Key CSS Classes

```css
/* Layout Container */
.flex h-screen overflow-hidden bg-gray-50

/* Left Sidebar */
.w-60 bg-white border-r border-gray-200 flex flex-col

/* Main Content */
.flex-1 overflow-y-auto

/* Right Panel */
.w-96 bg-amber-50 border-l border-amber-200 overflow-y-auto flex-shrink-0

/* Active Session */
.bg-blue-50 border-l-blue-600 font-semibold text-blue-900

/* Summary Card */
.bg-white rounded-xl shadow-sm border border-gray-200 p-8

/* Transcript Collapsed */
.bg-gray-50 rounded-lg

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar { width: 6px; }
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
```

## Color Scheme

### Header
- Background: `linear-gradient(to right, #1e293b, #334155)` (slate-800 to slate-700)
- Text: White
- Chips: `bg-white/10` with backdrop blur

### Summary Section
- Background: White
- Border: `border-gray-200`
- Icons: Blue-600 (Sparkles)
- Text: Gray-900 (headings), Gray-700 (body)

### Transcript Section
- Background: Gray-50 (collapsed), White (expanded items)
- Border: Gray-100
- Icons: Gray-600

### TODO Panel
- Background: Amber-50 (#fefce8)
- Border: Amber-200 (#fde047)
- Heading: Amber-900 (#78350f)
- Buttons: Amber-600/700
- Text: Amber-700

## Spacing System

- Page padding: `p-8` (32px)
- Card padding: `p-8` (32px)
- Section gaps: `mb-6` (24px)
- Between elements: `gap-2` to `gap-8` (8px - 32px)
- Header chips: `gap-8` (32px)

## Typography

### Headers
- Page title: `text-3xl font-bold` (30px)
- Section headers: `text-2xl font-bold` (24px)
- Sub-headers: `text-xl font-bold` (20px)

### Body Text
- Summary: `text-base leading-relaxed` (16px, 1.7 line height)
- Metadata: `text-sm` (14px)
- Timestamps: `text-xs` (12px)

## Interactions

### Hover States
- Session nav items: `hover:bg-gray-50`
- Buttons: `hover:bg-gray-50` or `hover:bg-blue-700`
- Transcript section: `hover:bg-gray-100`

### Active States
- Current session: Blue highlight with left border
- Expanded sections: Show content with smooth transition

### Loading States
- Spinner for mutations (`animate-spin`)
- Disabled buttons during operations
- Loading skeleton on initial page load

## Best Practices

1. **Summary is hero content** - Largest, most prominent
2. **TODO always visible** - Fixed right panel, never hidden
3. **Transcript accessible but minimal** - Collapsed by default
4. **Navigation effortless** - Recent sessions always visible
5. **Actions clear** - Edit/Regenerate buttons where needed
6. **Visual hierarchy** - Size, color, spacing reinforce importance
7. **Scroll independently** - Each column scrolls on its own

## Future Enhancements

- [ ] Mobile responsive design
- [ ] Keyboard shortcuts
- [ ] Drag to resize panels
- [ ] Pin/unpin TODO panel
- [ ] Search within transcript
- [ ] Export summary/TODO
- [ ] Share session link
- [ ] Version history for edits
