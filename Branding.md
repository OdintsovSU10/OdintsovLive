# Odintsov_Live Brand Guidelines

## Logo

- **Symbol**: Круг (O) + L внутри с акцентной точкой
- **Component**: `src/components/Logo.tsx`
- **Props**: `size` (default: 80), `showText` (default: true)
- **Usage**: `<Logo size={44} showText={false} />`

## Color Palette

### Light Theme
```
--bg:              #F8F6F3
--bg-secondary:    #FFFFFF
--text:            #1A1A1A
--text-secondary:  #6B6B6B
--accent:          #C4A77D
--accent-hover:    #B8956A
--border:          #E8E4DE
--surface:         #FFFFFF
--shadow:          rgba(0,0,0,0.06)
```

### Dark Theme
```
--bg:              #0F0F0F
--bg-secondary:    #1A1A1A
--text:            #F5F5F5
--text-secondary:  #8A8A8A
--accent:          #C4A77D
--accent-hover:    #D4B78D
--border:          #2A2A2A
--surface:         #1A1A1A
--shadow:          rgba(0,0,0,0.4)
```

## Typography

### Headlines
- **Font**: Cormorant Garamond
- **Weights**: 400, 500, 600
- **Letter-spacing**: -0.02em

### Body & UI
- **Font**: DM Sans
- **Weights**: 300, 400, 500, 600
- **Letter-spacing**: normal

### Monospace
- **Font**: DM Mono
- **Weight**: 400

### Font Import
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400&display=swap');
```

## Border Radius
- `--radius-sm`: 8px
- `--radius-md`: 12px
- `--radius-lg`: 16px
- `--radius-xl`: 24px

## Transitions
- `--transition`: 0.3s ease

## Buttons

### Primary
```css
background: var(--accent);
color: #1A1A1A;
padding: 14px 32px;
border-radius: 8px;
font-weight: 500;
```

### Secondary
```css
background: transparent;
color: var(--text);
border: 1px solid var(--border);
padding: 14px 32px;
border-radius: 8px;
```

### Text Link
```css
color: var(--accent);
text-decoration: underline;
text-underline-offset: 4px;
```

## Icons
- Style: Lucide (outline, 1.5px stroke)
- Size: 20px default, 24px large

## Cards
```css
background: var(--surface);
border: 1px solid var(--border);
border-radius: 16px;
padding: 32px;
```
