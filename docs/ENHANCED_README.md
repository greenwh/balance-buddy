# Enhanced Checkbook PWA - User Guide

## Overview
This enhanced version of the Checkbook PWA includes powerful new features designed specifically for users with behavioral health challenges. The interface maintains simplicity while adding robust money management capabilities.

## What's New

### 🏦 Multiple Accounts
- **Manage unlimited accounts** (checking, savings, credit cards, etc.)
- Each account has its own transaction register
- Quick switching between accounts via buttons
- All data stays organized and separate

### 💰 Monthly Budget Tracking
- **Set budget limits by category** (groceries, utilities, entertainment, etc.)
- **Automatic tracking** of spending across ALL accounts
- Real-time display of:
  - $ Allowed (your budget)
  - $ Spent (actual spending this month)
  - $ Remaining (what's left)
- Visual warnings when over budget (red text)
- Budget categories automatically populate transaction categories

### 📊 Smart CSV Import/Export
Two powerful import modes:

#### Auto Reconciliation Mode
- Matches imported transactions with existing ones
- Automatically marks matches as reconciled
- Adds any new transactions not already in the register
- Perfect for monthly bank statement reconciliation

#### Sync Mode
- Only adds missing transactions
- Skips any duplicates
- Ideal for keeping your register up-to-date with bank data

**Smart Matching:**
- Tolerates date differences (±1 day)
- Tolerates amount differences (±$1.00)
- Handles different CSV formats automatically
- Works with credit cards (where payments are negative)

### 🎯 Simplified Interface
- **Two-row navigation** for clarity
- Top row: Account management (Accts, Bdgt, account buttons)
- Bottom row: Transaction actions (Add, Purge, Save, Load, CSV, Filter)
- Active account is highlighted
- All original features preserved

## How to Use

### Setting Up Accounts

1. Click **"Accts"** button
2. Enter account name (e.g., "Wells Fargo Checking")
3. Enter short button label (e.g., "WF Chk")
4. Click "Add Account"
5. New button appears in top row
6. Click any account button to switch to that register

**Note:** The "Chking" account is the default and cannot be deleted.

### Creating Your Budget

1. Click **"Bdgt"** button
2. In the "Add Budget Category" section:
   - Enter category name (e.g., "Groceries")
   - Enter monthly budget amount (e.g., "400")
   - Click "Add Budget"
3. Repeat for all spending categories
4. Budget automatically tracks spending from ALL accounts

**Tip:** Budget categories will appear in the category dropdown when adding transactions, making data entry faster and more consistent.

### Importing Bank Statements (CSV)

1. Download CSV from your bank
2. Click **"CSV"** button
3. Choose import mode:
   - **Auto Reconciliation:** For monthly statement matching
   - **Sync Mode:** For regular updates
4. Click "Import CSV File"
5. Select your downloaded CSV
6. Review the preview showing new transactions
7. Optionally check "Mark imported transactions as reconciled"
8. Click "Confirm Import"

**Supported Banks:**
- Arvest Bank (checking accounts)
- USAA (credit cards and checking)
- Wells Fargo (credit cards)
- Other formats may work if headers match known patterns

### Exporting Data

**CSV Export (Single Account):**
1. Switch to the account you want to export
2. Click "CSV" button
3. Click "Export to CSV"
4. File downloads with account name and date

**JSON Export (All Data):**
1. Click "Save" button
2. All accounts, transactions, and budgets saved
3. Use for complete backups

### Daily Use Tips

**Adding Transactions:**
- Categories from your budget appear in the dropdown
- Select the correct account before adding
- Transaction automatically counts toward budget

**Checking Budget:**
- Click "Bdgt" anytime to see current spending
- Red numbers mean you're over budget in that category
- Budget resets automatically each month

**Reconciling:**
1. Download bank statement CSV
2. Use "Auto Reconciliation" mode
3. Let the app match and mark transactions
4. Review any unmatched items manually

## Design for Behavioral Health Support

### Error Prevention
- **Duplicate detection:** Won't import the same transaction twice
- **Confirmation prompts:** All destructive actions require confirmation
- **Visual feedback:** Active account highlighted, negative balances in red
- **Fuzzy matching:** Tolerates small differences in dates/amounts

### Cognitive Load Reduction
- **Two-row layout:** Clear separation of navigation and actions
- **Minimal buttons:** Only essential functions visible
- **Autocomplete:** Budget categories auto-populate
- **Automatic calculations:** Balance and budget math done for you

### Consistency & Routine
- **Budget categories:** Enforce consistent categorization
- **Auto-reconciliation:** Same process every month
- **Visual patterns:** Color coding for status (negative = red, active = purple)

### Data Safety
- **Multiple backups:** IndexedDB + LocalStorage + JSON export
- **No deletion:** Reconciled transactions preserved until purge
- **Offline-first:** Works without internet after first load
- **Local only:** All data stays on your device

## Technical Details

### Database Structure
- **Transactions:** Include accountId for multi-account support
- **Accounts:** Store id, name, and button label
- **Budget:** Category-based with amount and spending

### CSV Format Detection
Automatically recognizes:
- Arvest Bank: Credit/Debit columns
- USAA: Single amount column (negative for credit cards)
- Wells Fargo: Amount with asterisks
- Other: Headers determine parsing strategy

### Matching Algorithm
```
Match if:
- Date within ±1 day
- Amount within ±$1.00 (using absolute values)
```

## Troubleshooting

**CSV won't import:**
- Check that file has header row
- Verify it's from a supported bank
- Try opening in Excel to verify format

**Budget not updating:**
- Ensure transactions have correct category
- Category names must match exactly
- Check that amounts are negative (expenses)

**Account button missing:**
- Reload the page
- Check "Accts" modal to verify account exists
- Try switching to another account first

**Data not saving:**
- Browser storage may be full
- Export to JSON as backup
- Clear old reconciled transactions using Purge

## File Structure

- `index.html` - User interface
- `script.js` - Application logic
- `style.css` - Visual styling
- `sw.js` - Offline support
- `manifest.json` - PWA configuration

## Privacy & Security

✅ **All data stored locally on your device**
✅ **No internet connection required after first load**
✅ **No data sent to any servers**
✅ **No tracking or analytics**
✅ **Complete control of your financial data**

## Support

For issues or questions:
1. Check the original project README
2. Verify browser compatibility (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
3. Clear browser cache and reload
4. Export data before troubleshooting
5. Check browser console (F12) for error messages

## Recent Updates

**Version 3.0 (November 2024):**
- Fixed multi-account purge issue with budget snapshots
- Budget history now properly preserved across multiple account purges
- Enhanced data integrity for long-term use

---

**Version:** 3.0 (Enhanced Multi-Account with Budget Tracking)
**Database Version:** 3
**Original Project:** Simple Checkbook PWA
**Enhancements:** Multi-account support, budget tracking, advanced CSV import/export, budget history snapshots
