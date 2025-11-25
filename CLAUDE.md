# CLAUDE.md - Balance Buddy

## Project Overview

**Balance Buddy** is a Progressive Web App (PWA) checkbook register designed specifically for users with behavioral health challenges. It provides a simple, error-resistant interface for managing multiple financial accounts with budget tracking and reconciliation features.

**Target User:** Individuals who benefit from clear visual feedback, automatic calculations, and cognitive load reduction in financial management.

**Location:** `/mnt/d/Development/balance-buddy`

## Technology Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Storage:** IndexedDB for local persistence
- **Architecture:** PWA with offline capability
- **Backup:** LocalStorage for automatic backup, JSON export/import
- **Service Worker:** Offline-first caching strategy

## Key Features

### Multi-Account Management
- Track multiple accounts (checking, savings, credit cards) separately
- Quick switching between accounts with visual indicators
- Each account maintains independent transaction history
- Shared budget tracking across all accounts

### Budget Tracking System
- Monthly budget snapshots with historical preservation
- Category-based spending limits
- Automatic spending calculation from transactions
- Visual warnings for over-budget categories
- Budget history preserved even after transaction purging

### Smart CSV Import
- **Auto Reconciliation Mode:** Matches CSV transactions with existing entries and marks as reconciled
- **Sync Mode:** Imports only new transactions not already in the system
- Fuzzy matching (±1 day, ±$1 tolerance)
- Supports multiple bank formats:
  - Arvest Bank Checking
  - USAA Credit Card & Checking
  - Wells Fargo Card

### Transaction Purging
- Remove old reconciled transactions to reduce clutter
- Automatic opening balance creation
- **Critical:** Budget snapshots are preserved to maintain historical accuracy across multiple account purges

## File Structure

```
balance-buddy/
├── index.html              # Main application interface
├── script.js               # Application logic (1,472 lines)
├── style.css              # Lavender-themed styling
├── sw.js                  # Service worker for offline capability
├── manifest.json          # PWA configuration
├── icon-192.png           # PWA icon (small)
├── icon-512.png           # PWA icon (large)
└── docs/
    ├── README_START_HERE.txt      # Parent/user quick start
    ├── QUICK_START.md             # Simple user guide
    ├── PARENT_CHECKLIST.txt       # Deployment & support guide
    ├── ENHANCED_README.md         # Comprehensive manual
    ├── IMPLEMENTATION_NOTES.md    # Technical documentation
    ├── UI_LAYOUT.txt              # Visual interface guide
    ├── DELIVERY_SUMMARY.txt       # Feature overview
    └── csv_formats.txt            # Supported CSV formats
```

## Common Commands

### Local Development
```bash
# Navigate to project
cd /mnt/d/Development/balance-buddy

# Start local server (required for service worker)
python -m http.server 8000

# Access application
# Open browser to: http://localhost:8000
```

### Testing
- Manual browser testing (no automated tests)
- Test in Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Mobile testing recommended for PWA features

### Deployment
1. Update service worker cache version in `sw.js`
2. Copy all application files to web server
3. Must be served via HTTPS for PWA features
4. Clear browser cache after updates

## Data Models

### IndexedDB Stores

**transactions** (keyPath: `id`, autoIncrement)
```javascript
{
  id: number,           // Auto-generated
  date: string,         // YYYY-MM-DD format
  description: string,
  category: string,
  amount: number,       // Positive for credits, negative for debits
  reconciled: boolean,
  accountId: string     // Links to accounts store
}
```

**accounts** (keyPath: `id`)
```javascript
{
  id: string,      // 'default' or 'account_<timestamp>'
  name: string,    // Full account name
  label: string    // Button label (short)
}
```

**budget** (keyPath: `category`)
```javascript
{
  category: string,  // Budget category name (unique)
  amount: number,    // Monthly budget amount
  spent: number      // Current month spending (auto-calculated)
}
```

**budgetHistory** (keyPath: `month`)
```javascript
{
  month: string,     // YYYY-MM format
  budgets: [         // Array of budget snapshots
    {
      category: string,
      amount: number,
      spent: number
    }
  ]
}
```

## Development Patterns

### Budget Snapshot System

**Purpose:** Preserve historical budget data when transactions are purged

**How It Works:**
1. When purging transactions, identify all affected months
2. For each month, check if a budget snapshot already exists
3. **If snapshot exists:** Preserve it unchanged (contains historical data from all accounts)
4. **If snapshot doesn't exist:** Create new snapshot from current transaction data
5. After snapshots are secured, proceed with purge

**Critical Implementation Detail (script.js:877-940):**
```javascript
// Check if snapshot already exists
const existingSnapshotRequest = budgetHistoryStore.get(month);
existingSnapshotRequest.onsuccess = () => {
  if (existingSnapshotRequest.result) {
    // Don't modify existing snapshots!
    // This preserves data from previously purged accounts
    resolve();
    return;
  }
  // Create new snapshot...
};
```

**Why This Matters:**
- Multiple accounts may have transactions in the same month
- Purging Account A creates snapshot with Account A + Account B data
- Purging Account B later must NOT recalculate snapshot (Account A data is gone)
- Solution: Never overwrite existing snapshots

### Multi-Account Architecture

**Account Switching:**
- Current account stored in `localStorage` (`currentAccountId`)
- All transaction queries filtered by `accountId` index
- Account buttons show active state visually
- Budget tracking aggregates across all accounts

**Purge Behavior:**
- Purge operates on current account only
- Opening balance created per-account
- Budget snapshots consider ALL accounts (shared budget)

### LocalStorage Backup

**Auto-Backup Triggers:**
- After adding transaction
- After deleting transaction
- After updating category
- After reconciling
- After purge
- After CSV import

**Backup Format:**
```javascript
{
  accounts: [...],      // All accounts
  transactions: [...]   // All transactions
  // Note: budget and budgetHistory NOT backed up to localStorage
}
```

**Restore on Load:**
- `syncLocalStorageToIndexedDB()` runs on page load
- Migrates old format (array) to new format (object)
- Ensures all transactions have `accountId`

## User Interface Design Principles

### Cognitive Load Reduction
- Two-row navigation (accounts vs actions)
- Active account always highlighted
- Auto-population of fields from history
- Automatic running balance calculations
- Consistent color language (lavender theme)

### Error Resistance
- Fuzzy matching for CSV import (tolerates small differences)
- Confirmation dialogs for destructive actions
- Duplicate prevention in CSV sync mode
- Cannot purge current month (protects budget accuracy)
- Multiple backup mechanisms

### Visual Feedback
- Negative balances in red
- Reconciled checkboxes
- Active account highlighted
- Budget overruns highlighted
- Real-time balance updates

## Troubleshooting

### Budget Snapshot Issues

**Problem:** Budget showing incorrect spending after purging multiple accounts

**Cause:** Existing snapshots being recalculated with incomplete data

**Solution:** Fixed in script.js:883-891 - existing snapshots are now preserved

**Verification:**
1. Open browser console (F12)
2. Purge transactions
3. Look for console messages:
   - "Budget snapshot for YYYY-MM already exists, preserving it."
   - "Created new budget snapshot for YYYY-MM"

### Service Worker Not Loading

**Symptoms:** Offline mode doesn't work, updates not applying

**Solutions:**
1. Must serve via HTTP/HTTPS (not `file://`)
2. Use `python -m http.server` for local testing
3. Clear browser cache and unregister old service workers
4. Update cache version in `sw.js` after changes

### Data Not Persisting

**Check:**
1. IndexedDB is enabled in browser
2. Not in private/incognito mode
3. Browser storage quota not exceeded
4. Check browser console for errors

### CSV Import Not Working

**Common Issues:**
1. Header format not recognized (see `docs/csv_formats.txt`)
2. Date format incompatible (must be parseable by `new Date()`)
3. Amount column not numeric
4. Check browser console for "Skipped a row" warnings

### Running Balance Incorrect

**Cause:** Balance calculated on sorted transactions

**Fix:**
1. Balance always calculated chronologically (script.js:633-639)
2. Display order (asc/desc) doesn't affect calculation
3. If incorrect, try export/import to rebuild database

## Key Functions Reference

### Transaction Management
- `addTransaction(e)` - Add new transaction (script.js:577-609)
- `deleteTransaction(id)` - Delete with budget recalc (script.js:744-769)
- `updateTransactionCategory(id, category)` - Update category (script.js:818-838)
- `updateTransactionAmount(id, newAmount, oldAmount)` - Update amount with balance/budget recalc (script.js:840-860)
- `toggleReconcile(id, state)` - Toggle reconciled flag (script.js:862-874)

### Purge System
- `handlePurge(e)` - Purge form handler (script.js:836-842)
- `purgeReconciled(date)` - Main purge logic (script.js:844-1020)
  - Step 1: Identify affected months (lines 856-875)
  - Step 2: Create/preserve snapshots (lines 877-940)
  - Step 3: Purge and create opening balance (lines 942-1014)

### Budget Management
- `showBudgetModal()` - Display budget interface (script.js:303-312)
- `loadBudgetList()` - Load budget for current month (script.js:314-356)
- `calculateBudgetSpending(month)` - Recalculate spending (script.js:396-456)
- `updateMonthlyBudgetAmount(category, amount)` - Update budget (script.js:471-509)

### CSV Import
- `handleCsvImport(event)` - File handler (script.js:1084-1094)
- `parseBankCsv(csvText, mode)` - Parse and match (script.js:1096-1154)
- `findMatchingTransaction()` - Fuzzy matching (script.js:1156-1167)

### Account Management
- `switchAccount(accountId)` - Change current account (script.js:190-196)
- `addAccount()` - Create new account (script.js:279-300)
- `deleteAccount(accountId)` - Remove account and transactions (script.js:245-277)

## Important Constants

```javascript
// Database version (increment to trigger upgrades)
indexedDB.open('checkbookDB', 3)

// Current month check (used in multiple places)
const currentMonth = new Date().toISOString().slice(0, 7);

// Fuzzy matching tolerance (CSV import)
daysDiff <= 1        // ±1 day tolerance
amountDiff <= 1      // ±$1 tolerance

// Service worker cache version
const CACHE_NAME = 'checkbook-cache-v5';  // Update this on changes
```

## Testing Checklist

Before deployment:
- [ ] Add transactions to multiple accounts
- [ ] Set up budget categories
- [ ] Add transactions with budget categories
- [ ] Import CSV from bank (both reconcile and sync modes)
- [ ] Purge transactions from Account A
- [ ] View budget snapshots (should show Account A data)
- [ ] Purge transactions from Account B (same months)
- [ ] Verify budget snapshots still correct (Account A + B data preserved)
- [ ] Export to JSON
- [ ] Clear all data
- [ ] Import from JSON
- [ ] Test offline mode (disconnect network)
- [ ] Test on mobile device

## Recent Changes

**2024-11-24: Added Inline Editable Transaction Amounts**
- Feature: Transaction amounts can now be edited directly in the register
- Use case: Adjusting transactions when tips change the final posted amount
- Implementation: Click amount to edit, Enter to save, Esc to cancel
- Location: script.js:729-781 (display), script.js:840-860 (update function)
- Impact: Running balances and budget spending automatically recalculated when amounts change
- Service worker: Updated to v15

**2024-11-24: Fixed Multi-Account Purge Bug**
- Issue: Purging second account would recalculate budget snapshots, losing data from first purged account
- Fix: Check if snapshot exists before creating; preserve existing snapshots
- Location: script.js:883-891
- Impact: Budget history now correctly preserved across multiple account purges

## Future Enhancements (Potential)

- Export/import individual accounts
- Budget templates for different months
- Recurring transaction templates
- Reports and charts
- Cloud sync option (optional, maintaining local-first)
- Bulk transaction editing
- Advanced filtering (amount ranges, etc.)

## Notes for Maintenance

- Keep service worker cache version updated
- Test PWA install on both Android and iOS
- IndexedDB schema changes require version bump
- Document any new CSV format profiles added
- Always test purge with multiple accounts
- Budget snapshots are immutable once created (by design)
