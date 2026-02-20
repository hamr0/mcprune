# Real Accessibility Tree: Amazon Product Page
## What an agent actually sees vs what you see

---

## 1. What YOU see (the visual page)

```
┌─────────────────────────────────────────────────────┐
│  [🔍 Search Amazon _______________] [🛒 Cart (3)]   │
│─────────────────────────────────────────────────────│
│                                                     │
│  📱 Apple iPhone 16 Pro Max                         │
│  ⭐⭐⭐⭐½ (12,847 ratings)                          │
│                                                     │
│  [image] [image] [image] [image]                    │
│                                                     │
│  Price: $1,199.00                                   │
│  Color: Desert Titanium ▼                           │
│  Storage: [256GB] [512GB] [1TB]                     │
│  Qty: [1 ▼]                                         │
│                                                     │
│  ✅ In Stock                                         │
│  📦 FREE delivery Monday, Feb 23                     │
│                                                     │
│  [ 🛒 Add to Cart          ]                        │
│  [ ⚡ Buy Now               ]                        │
│                                                     │
│  ── About this item ──────────────                  │
│  • A18 Pro chip...                                  │
│  • 48MP camera...                                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 2. What the ACCESSIBILITY TREE sees (same page)

This is the actual format from `page.accessibility.snapshot()` in Playwright
or Chrome DevTools Protocol's `Accessibility.getFullAXTree`.

**The roles and property names below are STANDARDIZED by the W3C ARIA spec.**
Every browser on every website uses the same vocabulary.

```yaml
- role: WebArea                          # The page itself
  name: "Amazon.com: Apple iPhone 16 Pro Max"
  children:

  # ═══════════════════════════════════════
  # NAVIGATION / HEADER
  # ═══════════════════════════════════════
  - role: banner                         # <header> or role="banner"
    children:
    - role: navigation                   # <nav>
      name: ""
      children:
      - role: link
        name: "Amazon"                   # Logo link → homepage
      - role: searchbox                  # <input type="search">
        name: "Search Amazon"
        value: ""
      - role: button
        name: "Go"                       # Search submit
      - role: link
        name: "Returns & Orders"
      - role: link
        name: "Cart 3 items"

  # ═══════════════════════════════════════
  # MAIN CONTENT
  # ═══════════════════════════════════════
  - role: main                           # <main>
    children:

    # ── Product Title ──
    - role: heading
      name: "Apple iPhone 16 Pro Max, 256GB, Desert Titanium - Unlocked"
      level: 1                           # h1

    # ── Rating ──
    - role: link
      name: "4.6 out of 5 stars"
    - role: link
      name: "12,847 ratings"

    # ── Images ──
    - role: region
      name: "Product images"
      children:
      - role: img
        name: "Apple iPhone 16 Pro Max front view"
      - role: img
        name: "Apple iPhone 16 Pro Max back view"
      - role: button
        name: "Show image 1 of 7"
      - role: button
        name: "Show image 2 of 7"

    # ── Price ──
    - role: group
      name: "Price"
      children:
      - role: text
        name: "$1,199.00"

    # ═══════════════════════════════════════
    # THIS IS WHERE IT GETS INTERESTING FOR AGENTS
    # ═══════════════════════════════════════

    # ── Color selector ──
    - role: radiogroup                   # ARIA role="radiogroup"
      name: "Color"                      # aria-label="Color"
      children:
      - role: radio                      # role="radio"
        name: "Black Titanium"
        checked: false
      - role: radio
        name: "Desert Titanium"
        checked: true                    # ← currently selected
      - role: radio
        name: "Natural Titanium"
        checked: false
      - role: radio
        name: "White Titanium"
        checked: false

    # ── Storage selector ──
    - role: radiogroup
      name: "Size"                       # (Amazon calls storage "Size")
      children:
      - role: radio
        name: "256GB - $1,199.00"
        checked: true
      - role: radio
        name: "512GB - $1,399.00"
        checked: false
      - role: radio
        name: "1TB - $1,599.00"
        checked: false

    # ── Quantity ──
    - role: combobox                     # <select> or custom dropdown
      name: "Quantity"                   # aria-label="Quantity"
      value: "1"
      expanded: false
      haspopup: "listbox"

    # ── Availability ──
    - role: text
      name: "In Stock"

    # ── Delivery info ──
    - role: group
      name: "Delivery"
      children:
      - role: text
        name: "FREE delivery Monday, February 23"
      - role: link
        name: "Details"

    # ══════════════════════════════════════════
    # THE ACTION BUTTONS - the money shot
    # ══════════════════════════════════════════

    - role: button                       # <button> or <input type="submit">
      name: "Add to Cart"               # THE accessible name
      # NO CSS class, NO id, NO selector
      # just: role=button, name="Add to Cart"
      # THIS IS WHAT AGENTS KEY ON

    - role: button
      name: "Buy Now"

    # ── Product details ──
    - role: heading
      name: "About this item"
      level: 2
    - role: list
      children:
      - role: listitem
        name: "A18 Pro chip delivers a massive leap in performance"
      - role: listitem
        name: "48MP Fusion camera with 5x Tetraprism telephoto"
      - role: listitem
        name: "6.9-inch Super Retina XDR display"

    # ── Reviews section ──
    - role: region
      name: "Customer reviews"
      children:
      - role: heading
        name: "Customer reviews"
        level: 2
      - role: link
        name: "See all reviews"
      - role: group
        name: "5 star 68%"
      - role: group
        name: "4 star 18%"
```

---

## 3. What SCHEMA.ORG JSON-LD is on the same page

This is in `<script type="application/ld+json">` in the HTML `<head>`.
Already there on Amazon, eBay, Shopify stores, etc.

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Apple iPhone 16 Pro Max, 256GB, Desert Titanium - Unlocked",
  "image": "https://m.media-amazon.com/images/I/...",
  "brand": {
    "@type": "Brand",
    "name": "Apple"
  },
  "sku": "B0DGJ58DQB",
  "gtin13": "0195949996337",
  "description": "A18 Pro chip delivers...",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.6",
    "reviewCount": "12847"
  },
  "offers": {
    "@type": "Offer",
    "url": "https://www.amazon.com/dp/B0DGJ58DQB",
    "priceCurrency": "USD",
    "price": "1199.00",
    "availability": "https://schema.org/InStock",
    "seller": {
      "@type": "Organization",
      "name": "Amazon.com"
    }
  },
  "potentialAction": {
    "@type": "BuyAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://www.amazon.com/gp/aws/cart/add.html?ASIN=B0DGJ58DQB"
    }
  }
}
```

---

## 4. THE GAP: Nothing connects these two worlds

### What the Accessibility Tree knows:
```
button "Add to Cart"          ← I exist, I'm clickable, here's my label
radiogroup "Color"            ← I have options, one is selected
combobox "Quantity"           ← I have a value of "1"
```

### What Schema.org knows:
```
Product "iPhone 16 Pro Max"   ← I cost $1,199, I'm in stock
BuyAction                     ← You can buy me
Offer                         ← Here are the terms
```

### What NEITHER knows:
```
button "Add to Cart"  ──executes──▶  BuyAction  ──on──▶  Product "iPhone 16 Pro"
radiogroup "Color"    ──sets──────▶  Offer variant
combobox "Quantity"   ──configures─▶  BuyAction quantity
```

---

## 5. THE RESOLVER OUTPUT: Auto-generated action manifest

A resolver reads both → correlates → emits:

```json
{
  "page": "https://www.amazon.com/dp/B0DGJ58DQB",
  "entity": {
    "type": "schema:Product",
    "name": "Apple iPhone 16 Pro Max, 256GB, Desert Titanium",
    "price": "$1,199.00",
    "availability": "InStock",
    "sku": "B0DGJ58DQB"
  },
  "actions": [
    {
      "id": "search",
      "type": "schema:SearchAction",
      "description": "Search Amazon catalog",
      "target": { "role": "searchbox", "name": "Search Amazon" },
      "submit": { "role": "button", "name": "Go" },
      "parameters": [
        { "name": "query", "type": "string", "required": true }
      ]
    },
    {
      "id": "configure_color",
      "type": "PropertyValueSpecification",
      "description": "Select product color variant",
      "target": { "role": "radiogroup", "name": "Color" },
      "current_value": "Desert Titanium",
      "options": [
        "Black Titanium",
        "Desert Titanium",
        "Natural Titanium",
        "White Titanium"
      ]
    },
    {
      "id": "configure_storage",
      "type": "PropertyValueSpecification",
      "description": "Select storage capacity (affects price)",
      "target": { "role": "radiogroup", "name": "Size" },
      "current_value": "256GB - $1,199.00",
      "options": [
        "256GB - $1,199.00",
        "512GB - $1,399.00",
        "1TB - $1,599.00"
      ]
    },
    {
      "id": "set_quantity",
      "type": "QuantitySpecification",
      "description": "Set purchase quantity",
      "target": { "role": "combobox", "name": "Quantity" },
      "current_value": "1"
    },
    {
      "id": "add_to_cart",
      "type": "schema:BuyAction",
      "description": "Add iPhone 16 Pro Max ($1,199.00) to cart",
      "target": { "role": "button", "name": "Add to Cart" },
      "depends_on": ["configure_color", "configure_storage", "set_quantity"],
      "entity_ref": "schema:Product/B0DGJ58DQB"
    },
    {
      "id": "buy_now",
      "type": "schema:BuyAction",
      "description": "Immediately purchase iPhone 16 Pro Max",
      "target": { "role": "button", "name": "Buy Now" },
      "depends_on": ["configure_color", "configure_storage", "set_quantity"],
      "entity_ref": "schema:Product/B0DGJ58DQB",
      "note": "Initiates checkout flow"
    },
    {
      "id": "view_reviews",
      "type": "schema:ViewAction",
      "description": "View all 12,847 customer reviews",
      "target": { "role": "link", "name": "See all reviews" }
    }
  ],
  "navigation": [
    { "role": "link", "name": "Amazon", "description": "Homepage" },
    { "role": "link", "name": "Returns & Orders" },
    { "role": "link", "name": "Cart 3 items" }
  ]
}
```

---

## 6. KEY POINT: The naming IS standardized

### ARIA Roles (W3C standard - same on every website)

| Role          | What it means              | Agent can...          |
|---------------|----------------------------|-----------------------|
| `button`      | Clickable action trigger   | Click it              |
| `link`        | Navigation to URL          | Follow it             |
| `searchbox`   | Text search input          | Type query            |
| `textbox`     | Text input field           | Enter text            |
| `combobox`    | Dropdown selector          | Select value          |
| `radio`       | One-of-many choice         | Select option         |
| `checkbox`    | On/off toggle              | Toggle it             |
| `slider`      | Range value                | Set value             |
| `spinbutton`  | Numeric up/down            | Increment/decrement   |
| `tab`         | Tab in tablist             | Switch view           |
| `menuitem`    | Item in menu               | Activate              |
| `dialog`      | Modal overlay              | Interact or dismiss   |
| `alertdialog` | Urgent modal               | Must respond          |
| `navigation`  | Nav section                | Contains links        |
| `main`        | Primary content            | Core page content     |
| `form`        | Form container             | Contains inputs       |
| `table`       | Data table                 | Read structured data  |

### ARIA States (also standardized)

| State          | Meaning                           |
|----------------|-----------------------------------|
| `checked`      | Radio/checkbox is selected        |
| `expanded`     | Dropdown/accordion is open        |
| `disabled`     | Element can't be interacted with  |
| `pressed`      | Toggle button is active           |
| `selected`     | Tab/option is current             |
| `required`     | Form field must be filled         |
| `invalid`      | Input has validation error        |
| `busy`         | Content is loading                |
| `hidden`       | Not visible to user               |

### Accessible Names (derived, not arbitrary)

Names come from a **priority cascade** (also standardized in the
"Accessible Name and Description Computation" spec):

1. `aria-labelledby` → text of referenced element
2. `aria-label` → explicit label string  
3. `<label for="id">` → associated label element
4. Element content → text inside the element
5. `title` attribute → tooltip text
6. `placeholder` → input placeholder

So `button "Add to Cart"` isn't a random CSS class —
it's computed from the button's visible text content,
and it's the SAME string a screen reader announces.

**This means: if the button says "Add to Cart" to a blind user,
it says "Add to Cart" to your agent. Same API. Same string.**

---

## 7. What this means for the resolver approach

The resolver doesn't need ML or guessing for most correlations:

```
Heuristic 1: LABEL MATCHING
  schema.org "BuyAction" + button named "Add to Cart" / "Buy" / "Purchase"
  → confidence: 0.95

Heuristic 2: PROXIMITY
  radiogroup "Color" is inside <main> near Product heading
  → it configures the Product entity

Heuristic 3: FORM STRUCTURE
  Elements inside same <form> or ARIA group relate to same action
  
Heuristic 4: STATE CORRELATION
  schema.org says availability="InStock"
  button "Add to Cart" is NOT disabled
  → action is available

LLM FALLBACK (rare):
  When labels are ambiguous or site-specific
  "Add to List" → WishlistAction vs BookmarkAction?
  → Small LLM call to disambiguate
```

**Bottom line: ~80% of correlations are deterministic string matching.
The remaining 20% need a cheap LLM call.**
