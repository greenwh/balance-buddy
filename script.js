document.addEventListener('DOMContentLoaded', () => {
    // --- DATABASE SETUP ---
    let db;
    let currentAccountId = localStorage.getItem('currentAccountId') || 'default';
    let currentBudgetMonth = new Date().toISOString().slice(0, 7); // YYYY-MM format
    const request = indexedDB.open('checkbookDB', 3);

    request.onerror = event => console.error('Database error:', event.target.errorCode);
    request.onupgradeneeded = event => {
        db = event.target.result;
        
        // Create or upgrade transactions store
        if (!db.objectStoreNames.contains('transactions')) {
            const objectStore = db.createObjectStore('transactions', {
                keyPath: 'id',
                autoIncrement: true
            });
            objectStore.createIndex('date', 'date', { unique: false });
            objectStore.createIndex('reconciled', 'reconciled', { unique: false });
            objectStore.createIndex('accountId', 'accountId', { unique: false });
            objectStore.createIndex('category', 'category', { unique: false });
        } else if (event.oldVersion < 2) {
            const transaction = event.target.transaction;
            const objectStore = transaction.objectStore('transactions');
            if (!objectStore.indexNames.contains('accountId')) {
                objectStore.createIndex('accountId', 'accountId', { unique: false });
            }
            if (!objectStore.indexNames.contains('category')) {
                objectStore.createIndex('category', 'category', { unique: false });
            }
        }
        
        // Create accounts store
        if (!db.objectStoreNames.contains('accounts')) {
            db.createObjectStore('accounts', { keyPath: 'id' });
        }
        
        // Create budget store
        if (!db.objectStoreNames.contains('budget')) {
            db.createObjectStore('budget', { keyPath: 'category' });
        }

        // Create budgetHistory store for monthly budget tracking
        if (!db.objectStoreNames.contains('budgetHistory')) {
            db.createObjectStore('budgetHistory', { keyPath: 'month' });
        }
    };
    
    request.onsuccess = event => {
        db = event.target.result;
        initializeDefaultAccount().then(() => {
            syncLocalStorageToIndexedDB().then(() => {
                loadAccounts();
                const savedSortOrder = localStorage.getItem('checkbookSortOrder') || 'asc';
                document.getElementById('sortOrder').value = savedSortOrder;
                displayTransactions(null, savedSortOrder);
                updateAccountButton();
            });
        });
    };

    // --- DOM ELEMENTS ---
    const addTransactionBtn = document.getElementById('addTransactionBtn');
    const addModal = document.getElementById('addTransactionModal');
    const addModalCloseBtn = addModal.querySelector('.close-button');
    const addTransactionForm = document.getElementById('addTransactionForm');
    const purgeBtn = document.getElementById('purgeBtn');
    const purgeModal = document.getElementById('purgeModal');
    const purgeModalCloseBtn = purgeModal.querySelector('.close-button');
    const purgeForm = document.getElementById('purgeForm');
    const cancelPurgeBtn = purgeModal.querySelector('.cancel-btn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFile = document.getElementById('importFile');
    const sortOrderSelect = document.getElementById('sortOrder');
    const filterBtn = document.getElementById('filterBtn');
    const filterModal = document.getElementById('filterModal');
    const filterModalCloseBtn = filterModal.querySelector('.close-button');
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    const csvBtn = document.getElementById('csvBtn');
    const csvModal = document.getElementById('csvModal');
    const csvModalCloseBtn = csvModal.querySelector('.close-button');
    const csvImportBtn = document.getElementById('csvImportBtn');
    const csvExportBtn = document.getElementById('csvExportBtn');
    const csvImportFile = document.getElementById('csvImportFile');
    const importPreviewModal = document.getElementById('importPreviewModal');
    const confirmImportBtn = document.getElementById('confirmImportBtn');
    const cancelImportBtn = document.getElementById('cancelImportBtn');
    const importPreviewList = document.getElementById('import-preview-list');
    const importCount = document.getElementById('import-count');
    const accountsBtn = document.getElementById('accountsBtn');
    const budgetBtn = document.getElementById('budgetBtn');
    const accountsModal = document.getElementById('accountsModal');
    const budgetModal = document.getElementById('budgetModal');

    // --- EVENT LISTENERS ---
    addTransactionBtn.onclick = () => addModal.style.display = 'block';
    addModalCloseBtn.onclick = () => addModal.style.display = 'none';
    purgeBtn.onclick = () => {
        // Set max date to last day of previous month
        const today = new Date();
        const lastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
        const maxDate = lastMonth.toISOString().slice(0, 10);
        document.getElementById('purgeDate').max = maxDate;
        purgeModal.style.display = 'block';
    };
    purgeModalCloseBtn.onclick = () => purgeModal.style.display = 'none';
    cancelPurgeBtn.onclick = () => purgeModal.style.display = 'none';
    filterBtn.onclick = () => filterModal.style.display = 'block';
    filterModalCloseBtn.onclick = () => filterModal.style.display = 'none';
    csvBtn.onclick = () => csvModal.style.display = 'block';
    csvModalCloseBtn.onclick = () => csvModal.style.display = 'none';
    accountsBtn.onclick = () => showAccountsModal();
    budgetBtn.onclick = () => showBudgetModal();
    if (accountsModal) accountsModal.querySelector('.close-button').onclick = () => accountsModal.style.display = 'none';
    if (budgetModal) budgetModal.querySelector('.close-button').onclick = () => budgetModal.style.display = 'none';

    window.onclick = event => {
        if (event.target == addModal) addModal.style.display = 'none';
        if (event.target == purgeModal) purgeModal.style.display = 'none';
        if (event.target == importPreviewModal) importPreviewModal.style.display = 'none';
        if (event.target == filterModal) filterModal.style.display = 'none';
        if (event.target == csvModal) csvModal.style.display = 'none';
        if (event.target == accountsModal) accountsModal.style.display = 'none';
        if (event.target == budgetModal) budgetModal.style.display = 'none';
    };

    addTransactionForm.addEventListener('submit', addTransaction);
    purgeForm.addEventListener('submit', handlePurge);
    exportBtn.addEventListener('click', exportToJson);
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', importFromJson);
    applyFilterBtn.addEventListener('click', () => {
        applyFilters();
        filterModal.style.display = 'none';
    });
    clearFilterBtn.addEventListener('click', clearFilters);
    sortOrderSelect.addEventListener('change', applyFilters);
    csvImportBtn.addEventListener('click', () => csvImportFile.click());
    csvExportBtn.addEventListener('click', exportToCsv);
    csvImportFile.addEventListener('change', handleCsvImport);
    cancelImportBtn.onclick = () => importPreviewModal.style.display = 'none';
    importPreviewModal.querySelector('.close-button').onclick = () => importPreviewModal.style.display = 'none';

    // --- ACCOUNT MANAGEMENT ---
    function initializeDefaultAccount() {
        return new Promise((resolve) => {
            const transaction = db.transaction(['accounts'], 'readwrite');
            const accountStore = transaction.objectStore('accounts');
            const getRequest = accountStore.get('default');
            
            getRequest.onsuccess = () => {
                if (!getRequest.result) {
                    accountStore.add({
                        id: 'default',
                        name: 'Chking',
                        label: 'Chking'
                    });
                }
                resolve();
            };
        });
    }

    function loadAccounts() {
        const transaction = db.transaction(['accounts'], 'readonly');
        const accountStore = transaction.objectStore('accounts');
        const request = accountStore.getAll();
        
        request.onsuccess = () => {
            const accounts = request.result;
            const accountButtonsContainer = document.getElementById('accountButtons');
            accountButtonsContainer.innerHTML = '';
            
            accounts.forEach(account => {
                const btn = document.createElement('button');
                btn.textContent = account.label;
                btn.id = `account-${account.id}`;
                btn.className = 'account-btn';
                if (account.id === currentAccountId) {
                    btn.classList.add('active');
                }
                btn.onclick = () => switchAccount(account.id);
                accountButtonsContainer.appendChild(btn);
            });
        };
    }

    function switchAccount(accountId) {
        currentAccountId = accountId;
        localStorage.setItem('currentAccountId', accountId);
        loadAccounts();
        applyFilters();
        updateAccountButton();
    }

    function updateAccountButton() {
        const transaction = db.transaction(['accounts'], 'readonly');
        const accountStore = transaction.objectStore('accounts');
        const request = accountStore.get(currentAccountId);
        
        request.onsuccess = () => {
            const account = request.result;
            if (account) {
                document.querySelectorAll('.account-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                const activeBtn = document.getElementById(`account-${account.id}`);
                if (activeBtn) {
                    activeBtn.classList.add('active');
                }
            }
        };
    }

    function showAccountsModal() {
        const accountsModal = document.getElementById('accountsModal');
        loadAccountsList();
        accountsModal.style.display = 'block';
    }

    function loadAccountsList() {
        const transaction = db.transaction(['accounts'], 'readonly');
        const accountStore = transaction.objectStore('accounts');
        const request = accountStore.getAll();
        
        request.onsuccess = () => {
            const accounts = request.result;
            const accountsList = document.getElementById('accountsList');
            accountsList.innerHTML = '';
            
            accounts.forEach(account => {
                const div = document.createElement('div');
                div.className = 'account-item';
                div.innerHTML = `
                    <span>${account.name} (${account.label})</span>
                    <button onclick="deleteAccount('${account.id}')" class="delete-btn" ${account.id === 'default' ? 'disabled' : ''}>X</button>
                `;
                accountsList.appendChild(div);
            });
        };
    }

    window.deleteAccount = function(accountId) {
        if (accountId === 'default') {
            alert('Cannot delete the default account');
            return;
        }
        if (!confirm('Delete this account and all its transactions?')) return;
        
        const transaction = db.transaction(['accounts', 'transactions'], 'readwrite');
        const accountStore = transaction.objectStore('accounts');
        const transactionStore = transaction.objectStore('transactions');
        
        accountStore.delete(accountId);
        
        const index = transactionStore.index('accountId');
        const range = IDBKeyRange.only(accountId);
        const cursorRequest = index.openCursor(range);
        
        cursorRequest.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        
        transaction.oncomplete = () => {
            if (currentAccountId === accountId) {
                switchAccount('default');
            }
            loadAccounts();
            loadAccountsList();
        };
    };

    window.addAccount = function() {
        const name = document.getElementById('newAccountName').value.trim();
        const label = document.getElementById('newAccountLabel').value.trim();
        
        if (!name || !label) {
            alert('Please enter both account name and button label');
            return;
        }
        
        const id = 'account_' + Date.now();
        const transaction = db.transaction(['accounts'], 'readwrite');
        const accountStore = transaction.objectStore('accounts');
        
        accountStore.add({ id, name, label });
        
        transaction.oncomplete = () => {
            document.getElementById('newAccountName').value = '';
            document.getElementById('newAccountLabel').value = '';
            loadAccounts();
            loadAccountsList();
        };
    };

    // --- BUDGET MANAGEMENT ---
    function showBudgetModal() {
        loadBudgetList();
        // Only recalculate for current month to preserve historical snapshots
        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7);
        if (currentBudgetMonth === currentMonth) {
            calculateBudgetSpending();
        }
        budgetModal.style.display = 'block';
    }

    function loadBudgetList() {
        const transaction = db.transaction(['budgetHistory', 'budget'], 'readonly');
        const budgetHistoryStore = transaction.objectStore('budgetHistory');
        const budgetStore = transaction.objectStore('budget');
        const request = budgetHistoryStore.get(currentBudgetMonth);

        request.onsuccess = () => {
            let monthlyBudget = request.result;
            const budgetList = document.getElementById('budgetList');

            // Format month for display
            const [year, month] = currentBudgetMonth.split('-');
            const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

            budgetList.innerHTML = `
                <tr>
                    <th colspan="5" style="text-align: center; background: #f0f0f0; padding: 10px;">
                        <button onclick="changeBudgetMonth(-1)" style="float: left;">◀ Prev</button>
                        ${monthName}
                        <button onclick="changeBudgetMonth(1)" style="float: right;">Next ▶</button>
                    </th>
                </tr>
                <tr>
                    <th>Category</th>
                    <th>$ Allowed</th>
                    <th>$ Spent</th>
                    <th>$ Remaining</th>
                    <th></th>
                </tr>
            `;

            if (!monthlyBudget) {
                // No budget for this month yet, show master template
                const masterRequest = budgetStore.getAll();
                masterRequest.onsuccess = () => {
                    const budgets = masterRequest.result;
                    displayBudgetRows(budgets, budgetList, true);
                };
            } else {
                displayBudgetRows(monthlyBudget.budgets, budgetList, false);
            }
        };
    }

    function displayBudgetRows(budgets, budgetList, isTemplate) {
        budgets.forEach(budget => {
            const row = document.createElement('tr');
            const spent = budget.spent || 0;
            const remaining = budget.amount - spent;
            const remainingClass = remaining < 0 ? 'negative' : '';

            row.innerHTML = `
                <td>${budget.category}</td>
                <td><input type="number" value="${budget.amount}" onchange="updateMonthlyBudgetAmount('${budget.category}', this.value)" style="width: 80px;" step="0.01" min="0"></td>
                <td>$${spent.toFixed(2)}</td>
                <td class="${remainingClass}">$${remaining.toFixed(2)}</td>
                <td><button onclick="deleteMonthlyBudgetCategory('${budget.category}')" class="delete-btn">X</button></td>
            `;
            budgetList.appendChild(row);
        });

        if (isTemplate) {
            const noteRow = document.createElement('tr');
            noteRow.innerHTML = `
                <td colspan="5" style="padding: 10px; font-style: italic; color: #999;">
                    No budget set for this month yet. Showing template. Add a transaction or adjust amounts to create this month's budget.
                </td>
            `;
            budgetList.appendChild(noteRow);
        }

        // Add helpful tip
        const tipRow = document.createElement('tr');
        tipRow.innerHTML = `
            <td colspan="5" style="padding-top: 15px; font-size: 0.9em; color: #666;">
                💡 <strong>Tip:</strong> You can click any category in your transactions to change it.
                Budget amounts can be adjusted per month.
            </td>
        `;
        budgetList.appendChild(tipRow);
    }

    function calculateBudgetSpending(monthStr = null) {
        // If no month specified, use the transaction's month or current viewing month
        const targetMonth = monthStr || currentBudgetMonth;
        const [year, month] = targetMonth.split('-').map(Number);
        const startOfMonth = new Date(year, month - 1, 1).toISOString().slice(0, 10);
        const endOfMonth = new Date(year, month, 0).toISOString().slice(0, 10);

        const transaction = db.transaction(['transactions', 'budget', 'budgetHistory'], 'readwrite');
        const transactionStore = transaction.objectStore('transactions');
        const budgetStore = transaction.objectStore('budget');
        const budgetHistoryStore = transaction.objectStore('budgetHistory');

        const index = transactionStore.index('date');
        const range = IDBKeyRange.bound(startOfMonth, endOfMonth);
        const request = index.openCursor(range);

        const spending = {};

        request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                const tx = cursor.value;
                if (tx.amount < 0) { // Only count expenses
                    const category = tx.category || 'Uncategorized';
                    spending[category] = (spending[category] || 0) + Math.abs(tx.amount);
                }
                cursor.continue();
            } else {
                // Get or create monthly budget snapshot
                const monthlyBudgetRequest = budgetHistoryStore.get(targetMonth);
                monthlyBudgetRequest.onsuccess = () => {
                    let monthlyBudget = monthlyBudgetRequest.result;

                    if (!monthlyBudget) {
                        // Create from master budget template
                        const masterBudgetRequest = budgetStore.getAll();
                        masterBudgetRequest.onsuccess = () => {
                            const budgets = masterBudgetRequest.result.map(b => ({
                                category: b.category,
                                amount: b.amount,
                                spent: spending[b.category] || 0
                            }));
                            budgetHistoryStore.put({ month: targetMonth, budgets });
                            if (targetMonth === currentBudgetMonth) {
                                loadBudgetList();
                            }
                        };
                    } else {
                        // Update existing monthly budget with new spending
                        monthlyBudget.budgets.forEach(budget => {
                            budget.spent = spending[budget.category] || 0;
                        });
                        budgetHistoryStore.put(monthlyBudget);
                        if (targetMonth === currentBudgetMonth) {
                            loadBudgetList();
                        }
                    }
                };
            }
        };
    }

    window.changeBudgetMonth = function(direction) {
        const [year, month] = currentBudgetMonth.split('-').map(Number);
        const date = new Date(year, month - 1 + direction, 1);
        currentBudgetMonth = date.toISOString().slice(0, 7);
        loadBudgetList();
        // Only recalculate for current month to preserve historical snapshots
        const today = new Date();
        const currentMonth = today.toISOString().slice(0, 7);
        if (currentBudgetMonth === currentMonth) {
            calculateBudgetSpending();
        }
    };

    window.updateMonthlyBudgetAmount = function(category, newAmount) {
        const amount = parseFloat(newAmount);
        if (isNaN(amount) || amount < 0) {
            alert('Please enter a valid amount');
            loadBudgetList();
            return;
        }

        const transaction = db.transaction(['budgetHistory', 'budget'], 'readwrite');
        const budgetHistoryStore = transaction.objectStore('budgetHistory');
        const budgetStore = transaction.objectStore('budget');

        const request = budgetHistoryStore.get(currentBudgetMonth);
        request.onsuccess = () => {
            let monthlyBudget = request.result;

            if (!monthlyBudget) {
                // Create new monthly budget from master template
                const masterRequest = budgetStore.getAll();
                masterRequest.onsuccess = () => {
                    const budgets = masterRequest.result.map(b => ({
                        category: b.category,
                        amount: b.category === category ? amount : b.amount,
                        spent: 0
                    }));
                    budgetHistoryStore.put({ month: currentBudgetMonth, budgets });
                    calculateBudgetSpending(currentBudgetMonth);
                };
            } else {
                // Update existing monthly budget
                const budgetItem = monthlyBudget.budgets.find(b => b.category === category);
                if (budgetItem) {
                    budgetItem.amount = amount;
                    budgetHistoryStore.put(monthlyBudget);
                    loadBudgetList();
                }
            }
        };
    };

    window.deleteMonthlyBudgetCategory = function(category) {
        if (!confirm(`Remove ${category} from this month's budget?`)) return;

        const transaction = db.transaction(['budgetHistory'], 'readwrite');
        const budgetHistoryStore = transaction.objectStore('budgetHistory');

        const request = budgetHistoryStore.get(currentBudgetMonth);
        request.onsuccess = () => {
            const monthlyBudget = request.result;
            if (monthlyBudget) {
                monthlyBudget.budgets = monthlyBudget.budgets.filter(b => b.category !== category);
                budgetHistoryStore.put(monthlyBudget);
                loadBudgetList();
            }
        };
    };

    window.addBudget = function() {
        const category = document.getElementById('newBudgetCategory').value.trim();
        const amount = parseFloat(document.getElementById('newBudgetAmount').value);

        if (!category || isNaN(amount) || amount <= 0) {
            alert('Please enter a valid category and amount');
            return;
        }

        const transaction = db.transaction(['budget', 'budgetHistory'], 'readwrite');
        const budgetStore = transaction.objectStore('budget');
        const budgetHistoryStore = transaction.objectStore('budgetHistory');

        // Add to master template
        budgetStore.put({ category, amount, spent: 0 });

        // Also add to current month if it exists
        const monthRequest = budgetHistoryStore.get(currentBudgetMonth);
        monthRequest.onsuccess = () => {
            const monthlyBudget = monthRequest.result;
            if (monthlyBudget) {
                monthlyBudget.budgets.push({ category, amount, spent: 0 });
                budgetHistoryStore.put(monthlyBudget);
            }
        };

        transaction.oncomplete = () => {
            document.getElementById('newBudgetCategory').value = '';
            document.getElementById('newBudgetAmount').value = '';
            loadBudgetList();
            // Refresh datalists with new budget category
            refreshDatalists();
        };
    };

    window.deleteBudget = function(category) {
        if (!confirm(`Delete budget for ${category}?`)) return;
        
        const transaction = db.transaction(['budget'], 'readwrite');
        const budgetStore = transaction.objectStore('budget');
        
        budgetStore.delete(category);
        
        transaction.oncomplete = () => {
            loadBudgetList();
        };
    };

    // --- CORE TRANSACTION FUNCTIONS ---
    function addTransaction(e) {
        e.preventDefault();
        const type = document.getElementById('transactionType').value;
        let amount = parseFloat(document.getElementById('transactionAmount').value);
        if (type === 'debit') {
            amount = -Math.abs(amount);
        }
        const newTransaction = {
            date: document.getElementById('transactionDate').value,
            description: document.getElementById('transactionDescription').value,
            category: document.getElementById('transactionCategory').value,
            amount: amount,
            reconciled: false,
            accountId: currentAccountId
        };
        const transaction = db.transaction(['transactions'], 'readwrite');
        const objectStore = transaction.objectStore('transactions');
        const request = objectStore.add(newTransaction);
        request.onsuccess = () => {
            const transactionMonth = newTransaction.date.slice(0, 7); // YYYY-MM
            addTransactionForm.reset();
            addModal.style.display = 'none';
            applyFilters();
            backupToLocalStorage();
            // Only recalculate budget for current month
            const today = new Date();
            const currentMonth = today.toISOString().slice(0, 7);
            if (transactionMonth === currentMonth) {
                calculateBudgetSpending(transactionMonth);
            }
        };
        request.onerror = (err) => console.error('Error adding transaction:', err);
    }

    function displayTransactions(filters = null, sortOrder = 'asc') {
        const transactionList = document.getElementById('transaction-list');
        transactionList.innerHTML = '';
        const transactionStore = db.transaction('transactions', 'readonly').objectStore('transactions');
        const index = transactionStore.index('accountId');
        const range = IDBKeyRange.only(currentAccountId);
        const request = index.getAll(range);
        
        request.onsuccess = () => {
            let allTransactions = request.result;
            let filteredTransactions = filters ? allTransactions.filter(tx => {
                const txDate = new Date(tx.date);
                if (filters.startDate && txDate < filters.startDate) return false;
                if (filters.endDate && txDate > filters.endDate) return false;
                if (filters.description && !tx.description.toLowerCase().includes(filters.description)) return false;
                if (filters.category && !tx.category.toLowerCase().includes(filters.category)) return false;
                if (filters.reconciledStatus !== 'all') {
                    const requiredStatus = filters.reconciledStatus === 'true';
                    if (tx.reconciled !== requiredStatus) return false;
                }
                return true;
            }) : allTransactions;
            filteredTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));
            const balanceMap = new Map();
            let currentBalance = 0;
            for (const tx of filteredTransactions) {
                currentBalance += tx.amount;
                balanceMap.set(tx.id, currentBalance);
            }
            if (sortOrder === 'desc') {
                filteredTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));
            }
            filteredTransactions.forEach(tx => {
                const row = document.createElement('tr');
                const cell1 = document.createElement('td');
                const actionContainer = document.createElement('div');
                actionContainer.className = 'action-container';
                const reconcileCheck = document.createElement('input');
                reconcileCheck.type = 'checkbox';
                reconcileCheck.checked = tx.reconciled;
                reconcileCheck.onchange = () => toggleReconcile(tx.id, reconcileCheck.checked);
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = 'X';
                deleteBtn.className = 'delete-btn';
                deleteBtn.onclick = () => deleteTransaction(tx.id);
                actionContainer.appendChild(reconcileCheck);
                actionContainer.appendChild(deleteBtn);
                const dateDiv = document.createElement('div');
                const dateParts = tx.date.split('-').map(part => parseInt(part, 10));
                const displayDate = new Date(Date.UTC(dateParts[0], dateParts[1] - 1, dateParts[2]));
                dateDiv.textContent = displayDate.toLocaleDateString('en-US', {
                    year: '2-digit',
                    month: '2-digit',
                    day: '2-digit',
                    timeZone: 'UTC'
                });
                cell1.appendChild(actionContainer);
                cell1.appendChild(dateDiv);
                row.appendChild(cell1);
                const cell2 = document.createElement('td');
                const descDiv = document.createElement('div');
                descDiv.textContent = tx.description;
                
                const categoryContainer = document.createElement('div');
                categoryContainer.style.marginTop = '4px';
                
                const categoryInput = document.createElement('input');
                categoryInput.type = 'text';
                categoryInput.value = tx.category;
                categoryInput.setAttribute('list', 'category-list');
                categoryInput.className = 'inline-category-edit';
                categoryInput.style.fontSize = '0.85em';
                categoryInput.style.fontStyle = 'italic';
                categoryInput.style.border = '1px solid transparent';
                categoryInput.style.background = 'transparent';
                categoryInput.style.padding = '2px 4px';
                categoryInput.style.width = '100%';
                categoryInput.style.boxSizing = 'border-box';
                categoryInput.style.cursor = 'text';
                categoryInput.placeholder = 'Click to edit category';
                
                // Highlight on focus
                categoryInput.onfocus = function() {
                    this.style.border = '1px solid #9370DB';
                    this.style.background = '#F5F5FF';
                    this.select(); // Select text for easy replacement
                };
                
                // Save on blur or enter
                const saveCategory = function() {
                    categoryInput.style.border = '1px solid transparent';
                    categoryInput.style.background = 'transparent';
                    const newCategory = categoryInput.value.trim();
                    if (newCategory && newCategory !== tx.category) {
                        updateTransactionCategory(tx.id, newCategory);
                    } else if (!newCategory) {
                        categoryInput.value = tx.category; // Restore if empty
                    }
                };
                
                categoryInput.onblur = saveCategory;
                categoryInput.onkeydown = function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.blur();
                    } else if (e.key === 'Escape') {
                        categoryInput.value = tx.category;
                        this.blur();
                    }
                };
                
                categoryContainer.appendChild(categoryInput);
                cell2.appendChild(descDiv);
                cell2.appendChild(categoryContainer);
                row.appendChild(cell2);
                const cell3 = document.createElement('td');
                const runningBalance = balanceMap.get(tx.id);

                // Create editable amount input
                const amountInput = document.createElement('input');
                amountInput.type = 'text';
                amountInput.value = tx.amount.toFixed(2);
                amountInput.className = 'inline-amount-edit';
                amountInput.style.fontSize = '1em';
                amountInput.style.border = '1px solid transparent';
                amountInput.style.background = 'transparent';
                amountInput.style.padding = '2px 4px';
                amountInput.style.width = '80px';
                amountInput.style.textAlign = 'right';
                amountInput.style.cursor = 'text';
                amountInput.placeholder = 'Amount';

                // Highlight on focus
                amountInput.onfocus = function() {
                    this.style.border = '1px solid #9370DB';
                    this.style.background = '#F5F5FF';
                    this.select(); // Select text for easy replacement
                };

                // Save on blur or enter
                const saveAmount = function() {
                    amountInput.style.border = '1px solid transparent';
                    amountInput.style.background = 'transparent';
                    const newAmount = parseFloat(amountInput.value);
                    if (!isNaN(newAmount) && newAmount !== tx.amount) {
                        updateTransactionAmount(tx.id, newAmount, tx.amount);
                    } else if (isNaN(newAmount)) {
                        amountInput.value = tx.amount.toFixed(2); // Restore if invalid
                    }
                };

                amountInput.onblur = saveAmount;
                amountInput.onkeydown = function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.blur();
                    } else if (e.key === 'Escape') {
                        amountInput.value = tx.amount.toFixed(2);
                        this.blur();
                    }
                };

                cell3.appendChild(amountInput);
                cell3.appendChild(document.createElement('br'));

                const balanceSpan = document.createElement('strong');
                balanceSpan.className = 'running-balance';
                balanceSpan.textContent = runningBalance.toFixed(2);
                if (runningBalance < 0) balanceSpan.classList.add('negative');
                cell3.appendChild(balanceSpan);
                row.appendChild(cell3);
                transactionList.appendChild(row);
            });
            if (!filters) {
                updateDatalists(allTransactions);
            }
        };
        request.onerror = (err) => console.error('Error fetching transactions:', err);
    }

    function deleteTransaction(id) {
        if (!confirm('Are you sure you want to delete this transaction?')) return;
        const transaction = db.transaction(['transactions'], 'readwrite');
        const objectStore = transaction.objectStore('transactions');

        // Get transaction first to determine its month
        const getRequest = objectStore.get(id);
        getRequest.onsuccess = () => {
            const tx = getRequest.result;
            const transactionMonth = tx ? tx.date.slice(0, 7) : null;

            const deleteRequest = objectStore.delete(id);
            deleteRequest.onsuccess = () => {
                applyFilters();
                backupToLocalStorage();
                // Only recalculate budget for current month
                if (transactionMonth) {
                    const today = new Date();
                    const currentMonth = today.toISOString().slice(0, 7);
                    if (transactionMonth === currentMonth) {
                        calculateBudgetSpending(transactionMonth);
                    }
                }
            };
        };
    }

    function updateTransactionCategory(id, newCategory) {
        const transactionStore = db.transaction('transactions', 'readwrite').objectStore('transactions');
        const request = transactionStore.get(id);
        request.onsuccess = () => {
            const transaction = request.result;
            const transactionMonth = transaction.date.slice(0, 7); // YYYY-MM
            transaction.category = newCategory;
            const updateRequest = transactionStore.put(transaction);
            updateRequest.onsuccess = () => {
                backupToLocalStorage();
                // Only recalculate budget for current month
                const today = new Date();
                const currentMonth = today.toISOString().slice(0, 7);
                if (transactionMonth === currentMonth) {
                    calculateBudgetSpending(transactionMonth);
                }
                // Also refresh the display to show the updated category
                refreshDatalists();
            };
        };
    }

    function updateTransactionAmount(id, newAmount, oldAmount) {
        const transactionStore = db.transaction('transactions', 'readwrite').objectStore('transactions');
        const request = transactionStore.get(id);
        request.onsuccess = () => {
            const transaction = request.result;
            const transactionMonth = transaction.date.slice(0, 7); // YYYY-MM
            transaction.amount = newAmount;
            const updateRequest = transactionStore.put(transaction);
            updateRequest.onsuccess = () => {
                backupToLocalStorage();
                // Recalculate budget for current month if transaction has a category
                const today = new Date();
                const currentMonth = today.toISOString().slice(0, 7);
                if (transactionMonth === currentMonth) {
                    calculateBudgetSpending(transactionMonth);
                }
                // Refresh display to recalculate running balances
                applyFilters();
            };
        };
    }

    function toggleReconcile(id, newReconciledState) {
        const transactionStore = db.transaction('transactions', 'readwrite').objectStore('transactions');
        const request = transactionStore.get(id);
        request.onsuccess = () => {
            const transaction = request.result;
            transaction.reconciled = newReconciledState;
            const updateRequest = transactionStore.put(transaction);
            updateRequest.onsuccess = () => {
                applyFilters();
                backupToLocalStorage();
            };
        };
    }

    // --- FILTER, SORT, AND PURGE LOGIC ---
    function applyFilters() {
        const startDateValue = document.getElementById('startDateFilter').value;
        const endDateValue = document.getElementById('endDateFilter').value;
        const filters = {
            startDate: startDateValue ? new Date(startDateValue) : null,
            endDate: endDateValue ? new Date(endDateValue) : null,
            description: document.getElementById('descriptionFilter').value.toLowerCase(),
            category: document.getElementById('categoryFilter').value.toLowerCase(),
            reconciledStatus: document.getElementById('reconciledFilter').value
        };
        const sortOrder = document.getElementById('sortOrder').value;
        localStorage.setItem('checkbookSortOrder', sortOrder);
        if (filters.startDate) filters.startDate.setUTCHours(0, 0, 0, 0);
        if (filters.endDate) filters.endDate.setUTCHours(23, 59, 59, 999);
        displayTransactions(filters, sortOrder);
    }

    function clearFilters() {
        document.getElementById('startDateFilter').value = '';
        document.getElementById('endDateFilter').value = '';
        document.getElementById('descriptionFilter').value = '';
        document.getElementById('categoryFilter').value = '';
        document.getElementById('reconciledFilter').value = 'all';
        document.getElementById('sortOrder').value = 'asc';
        localStorage.setItem('checkbookSortOrder', 'asc');
        displayTransactions();
    }

    function handlePurge(e) {
        e.preventDefault();
        const purgeDateStr = document.getElementById('purgeDate').value;
        if (!purgeDateStr) return alert('Please select a date.');
        purgeModal.style.display = 'none';
        purgeReconciled(purgeDateStr);
    }

    function purgeReconciled(purgeDateStr) {
        // Validate purge date is not in current month
        const today = new Date();
        const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

        if (purgeDateStr >= currentMonthStart) {
            alert('Cannot purge transactions from the current month. This protects budget tracking accuracy.\n\nPlease select a date from last month or earlier.');
            return;
        }

        if (!confirm(`Are you sure you want to permanently delete all RECONCILED transactions on or before ${purgeDateStr}?\n\nBudget data will be preserved in monthly snapshots.`)) return;

        // Step 1: Get ALL transactions (from all accounts) to identify affected budget months
        const allTransactionStore = db.transaction('transactions', 'readonly').objectStore('transactions');
        const allTxRequest = allTransactionStore.getAll();

        allTxRequest.onsuccess = event => {
            const allTransactions = event.target.result;

            // Find all unique PAST months that have transactions being purged (across all accounts)
            const affectedMonths = new Set();
            const purgeMonth = purgeDateStr.slice(0, 7); // YYYY-MM of purge date

            allTransactions.forEach(tx => {
                if (tx.reconciled && tx.date <= purgeDateStr && tx.amount < 0) { // Only expenses affect budget
                    const month = tx.date.slice(0, 7); // YYYY-MM
                    // Only snapshot complete past months (not current month)
                    if (month < currentMonthStart.slice(0, 7)) {
                        affectedMonths.add(month);
                    }
                }
            });

            // Step 2: Snapshot budget data for all affected PAST months
            const snapshotPromises = Array.from(affectedMonths).map(month => {
                return new Promise((resolve, reject) => {
                    const transaction = db.transaction(['transactions', 'budget', 'budgetHistory'], 'readwrite');
                    const budgetHistoryStore = transaction.objectStore('budgetHistory');

                    // Check if snapshot already exists for this month
                    const existingSnapshotRequest = budgetHistoryStore.get(month);
                    existingSnapshotRequest.onsuccess = () => {
                        if (existingSnapshotRequest.result) {
                            // Snapshot already exists - don't modify it!
                            // This preserves historical data from previously purged accounts
                            console.log(`Budget snapshot for ${month} already exists, preserving it.`);
                            resolve();
                            return;
                        }

                        // No snapshot exists yet, create one
                        const [year, monthNum] = month.split('-').map(Number);
                        const startOfMonth = new Date(year, monthNum - 1, 1).toISOString().slice(0, 10);
                        const endOfMonth = new Date(year, monthNum, 0).toISOString().slice(0, 10);

                        const transactionStore = transaction.objectStore('transactions');
                        const budgetStore = transaction.objectStore('budget');

                        const index = transactionStore.index('date');
                        const range = IDBKeyRange.bound(startOfMonth, endOfMonth);
                        const request = index.openCursor(range);

                        const spending = {};

                        request.onsuccess = event => {
                            const cursor = event.target.result;
                            if (cursor) {
                                const tx = cursor.value;
                                if (tx.amount < 0) { // Only count expenses
                                    const category = tx.category || 'Uncategorized';
                                    spending[category] = (spending[category] || 0) + Math.abs(tx.amount);
                                }
                                cursor.continue();
                            } else {
                                // Save the snapshot
                                const masterRequest = budgetStore.getAll();
                                masterRequest.onsuccess = () => {
                                    const masterBudgets = masterRequest.result;
                                    const budgets = masterBudgets.map(b => ({
                                        category: b.category,
                                        amount: b.amount,
                                        spent: spending[b.category] || 0
                                    }));
                                    budgetHistoryStore.put({ month, budgets });
                                    console.log(`Created new budget snapshot for ${month}`);
                                    resolve();
                                };
                                masterRequest.onerror = () => reject(masterRequest.error);
                            }
                        };

                        request.onerror = () => reject(request.error);
                    };

                    existingSnapshotRequest.onerror = () => reject(existingSnapshotRequest.error);
                });
            });

            // Step 3: After all snapshots are saved, proceed with purge
            Promise.all(snapshotPromises)
                .then(() => {
                    // Now get transactions for current account only
                    const transactionStore = db.transaction('transactions', 'readonly').objectStore('transactions');
                    const index = transactionStore.index('accountId');
                    const range = IDBKeyRange.only(currentAccountId);
                    const request = index.getAll(range);

                    request.onsuccess = event => {
                        const accountTransactions = event.target.result;

                        // Sort chronologically
                        accountTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

                        // Find transactions to purge
                        const txsToPurge = accountTransactions.filter(tx =>
                            tx.reconciled && tx.date <= purgeDateStr
                        );

                        if (txsToPurge.length === 0) {
                            alert('No reconciled transactions found on or before the selected date.');
                            return;
                        }

                        // Calculate running balance up through and including purge date
                        let openingBalance = 0;
                        for (const tx of accountTransactions) {
                            if (tx.date <= purgeDateStr) {
                                openingBalance += tx.amount;
                            } else {
                                break;
                            }
                        }

                        // Calculate date for opening balance (one day after purge date)
                        const openingBalanceDate = new Date(purgeDateStr);
                        openingBalanceDate.setDate(openingBalanceDate.getDate() + 1);
                        const openingBalanceDateStr = openingBalanceDate.toISOString().slice(0, 10);

                        // Perform the purge with opening balance
                        const writeTransaction = db.transaction(['transactions'], 'readwrite');
                        const writeStore = writeTransaction.objectStore('transactions');

                        // Add opening balance transaction (only if non-zero)
                        if (openingBalance !== 0) {
                            const openingBalanceTx = {
                                date: openingBalanceDateStr,
                                description: 'Opening Balance',
                                category: 'Opening Balance',
                                amount: openingBalance,
                                reconciled: true,
                                accountId: currentAccountId
                            };
                            writeStore.add(openingBalanceTx);
                        }

                        // Delete old reconciled transactions
                        txsToPurge.forEach(tx => {
                            writeStore.delete(tx.id);
                        });

                        writeTransaction.oncomplete = () => {
                            const monthCount = affectedMonths.size;
                            const budgetMsg = monthCount > 0 ? `\n\nBudget snapshots saved for ${monthCount} month(s).` : '';
                            const message = openingBalance !== 0
                                ? `Purged ${txsToPurge.length} reconciled transactions. Opening balance of $${openingBalance.toFixed(2)} created.${budgetMsg}`
                                : `Purged ${txsToPurge.length} reconciled transactions.${budgetMsg}`;
                            alert(message);
                            applyFilters();
                            backupToLocalStorage();
                        };

                        writeTransaction.onerror = (err) => {
                            console.error('Error during purge:', err);
                            alert('An error occurred during purge. Please try again.');
                        };
                    };

                    request.onerror = (err) => {
                        console.error('Error reading transactions for purge:', err);
                        alert('An error occurred while preparing to purge. Please try again.');
                    };
                })
                .catch(err => {
                    console.error('Error creating budget snapshots:', err);
                    alert('An error occurred while saving budget snapshots. Purge cancelled to protect budget data.');
                });
        };

        allTxRequest.onerror = (err) => {
            console.error('Error reading transactions for budget snapshot:', err);
            alert('An error occurred while preparing to purge. Please try again.');
        };
    }

    // --- CSV IMPORT/EXPORT SYSTEM ---
    function robustSplit(line) {
        const columns = [];
        let currentColumn = '';
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];
            if (char === '"' && (i === 0 || line[i - 1] === ',')) {
                if (!inQuote) {
                    inQuote = true;
                    continue;
                }
            }
            if (char === '"' && (nextChar === ',' || nextChar === undefined || nextChar === '\r')) {
                if (inQuote) {
                    inQuote = false;
                    continue;
                }
            }
            if (char === ',' && !inQuote) {
                columns.push(currentColumn);
                currentColumn = '';
            } else {
                currentColumn += char;
            }
        }
        columns.push(currentColumn.trim());
        return columns;
    }

    const csvParserProfiles = [
        {
            name: 'Arvest Bank Checking',
            header_signature: 'Account,Date,Pending?,Description,Category,Check,Credit,Debit',
            columns: { date: 1, description: 3, category: 4, credit: 6, debit: 7 },
            processAmount: (row) => {
                const credit = parseFloat(row[6]) || 0;
                const debit = parseFloat(row[7]) || 0;
                return credit + debit;
            }
        },
        {
            name: 'USAA Credit Card',
            header_signature: 'Date,Description,Original Description,Category,Amount,Status',
            columns: { date: 0, description: 1, category: 3, amount: 4 },
            processAmount: (row) => -parseFloat(row[4]) // Invert for credit cards
        },
        {
            name: 'Wells Fargo Card',
            header_signature: 'Date,Amount,,,Description',
            columns: { date: 0, amount: 1, description: 4 },
            processAmount: (row) => parseFloat(row[1]) 
        },
        {
            name: 'USAA Checking',
            header_signature: 'Date,Description,Original Description,Category,Amount,Status',
            columns: { date: 0, description: 1, category: 3, amount: 4 },
            processAmount: (row) => parseFloat(row[4])
        }
    ];

    function handleCsvImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            const mode = document.querySelector('input[name="csvMode"]:checked').value;
            parseBankCsv(e.target.result, mode);
        };
        reader.readAsText(file);
        event.target.value = null;
    }

    function parseBankCsv(csvText, mode) {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return alert('CSV file is empty or invalid.');
        const header = lines[0];
        const dataRows = lines.slice(1);
        const profile = csvParserProfiles.find(p => p.header_signature.split(',').every(col => header.includes(col)));
        
        if (!profile) {
            return alert('Could not recognize this CSV format. Please ensure the header row matches a known format.');
        }
        
        const transactionStore = db.transaction('transactions', 'readonly').objectStore('transactions');
        const index = transactionStore.index('accountId');
        const range = IDBKeyRange.only(currentAccountId);
        const request = index.getAll(range);
        
        request.onsuccess = () => {
            const existingTransactions = request.result;
            const newTransactions = [];
            const matchedTransactions = [];
            
            dataRows.forEach(line => {
                const columns = robustSplit(line);
                if (!columns || columns.length < 3) return;
                try {
                    const date = new Date(columns[profile.columns.date]).toISOString().slice(0, 10);
                    const description = columns[profile.columns.description].trim();
                    const amount = profile.processAmount(columns);
                    const category = columns[profile.columns.category] || 'Uncategorized';
                    if (isNaN(amount)) return;
                    
                    const match = findMatchingTransaction(existingTransactions, date, description, amount);
                    
                    if (mode === 'reconcile' && match) {
                        matchedTransactions.push(match.id);
                    } else if (mode === 'sync' && !match) {
                        newTransactions.push({ date, description, category, amount, reconciled: false, accountId: currentAccountId });
                    } else if (mode === 'reconcile' && !match) {
                        newTransactions.push({ date, description, category, amount, reconciled: false, accountId: currentAccountId });
                    }
                } catch (error) {
                    console.warn("Skipped a row due to parsing error:", error, line);
                }
            });
            
            if (mode === 'reconcile' && matchedTransactions.length > 0) {
                reconcileMatchedTransactions(matchedTransactions);
            }
            
            if (newTransactions.length > 0) {
                displayImportPreview(newTransactions, mode);
            } else {
                alert(mode === 'reconcile' ? 
                    `Reconciled ${matchedTransactions.length} transactions. No new transactions to import.` :
                    'No new transactions found to import.');
                csvModal.style.display = 'none';
            }
        };
    }

    function findMatchingTransaction(transactions, date, description, amount) {
        const searchDate = new Date(date);
        const absAmount = Math.abs(amount);
        
        return transactions.find(tx => {
            const txDate = new Date(tx.date);
            const daysDiff = Math.abs((txDate - searchDate) / (1000 * 60 * 60 * 24));
            const amountDiff = Math.abs(Math.abs(tx.amount) - absAmount);
            
            return daysDiff <= 1 && amountDiff <= 1;
        });
    }

    function reconcileMatchedTransactions(transactionIds) {
        const transaction = db.transaction(['transactions'], 'readwrite');
        const objectStore = transaction.objectStore('transactions');
        
        transactionIds.forEach(id => {
            const request = objectStore.get(id);
            request.onsuccess = () => {
                const tx = request.result;
                if (tx) {
                    tx.reconciled = true;
                    objectStore.put(tx);
                }
            };
        });
        
        transaction.oncomplete = () => {
            applyFilters();
            backupToLocalStorage();
        };
    }

    function displayImportPreview(transactions, mode) {
        importPreviewList.innerHTML = '';
        importCount.textContent = transactions.length;
        document.getElementById('markAsReconciled').checked = mode === 'reconcile';

        transactions.forEach(tx => {
            const row = document.createElement('tr');
            row.innerHTML = `<td>${tx.date}</td><td>${tx.description}</td><td class="${tx.amount < 0 ? 'negative' : ''}">${tx.amount.toFixed(2)}</td>`;
            importPreviewList.appendChild(row);
        });

        confirmImportBtn.onclick = () => {
            const shouldMarkAsReconciled = document.getElementById('markAsReconciled').checked;
            saveImportedTransactions(transactions, shouldMarkAsReconciled);
        };
        importPreviewModal.style.display = 'block';
        csvModal.style.display = 'none';
    }

    function saveImportedTransactions(transactionsToSave, markAsReconciled) {
        // Collect unique months from imported transactions
        const affectedMonths = [...new Set(transactionsToSave.map(tx => tx.date.slice(0, 7)))];

        const transaction = db.transaction(['transactions'], 'readwrite');
        const objectStore = transaction.objectStore('transactions');
        transactionsToSave.forEach(tx => {
            tx.reconciled = markAsReconciled;
            objectStore.add(tx);
        });
        transaction.oncomplete = () => {
            importPreviewModal.style.display = 'none';
            alert(`${transactionsToSave.length} transactions imported successfully!`);
            applyFilters();
            backupToLocalStorage();
            // Only recalculate budget for current month
            const today = new Date();
            const currentMonth = today.toISOString().slice(0, 7);
            affectedMonths.forEach(month => {
                if (month === currentMonth) {
                    calculateBudgetSpending(month);
                }
            });
        };
        transaction.onerror = (err) => {
            console.error("Error saving imported transactions:", err);
            alert("An error occurred while saving the transactions.");
        };
    }

    function exportToCsv() {
        const transactionStore = db.transaction('transactions', 'readonly').objectStore('transactions');
        const index = transactionStore.index('accountId');
        const range = IDBKeyRange.only(currentAccountId);
        const request = index.getAll(range);
        
        request.onsuccess = () => {
            const transactions = request.result;
            transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            let csv = 'Date,Description,Category,Amount,Reconciled\n';
            transactions.forEach(tx => {
                csv += `"${tx.date}","${tx.description}","${tx.category}",${tx.amount},${tx.reconciled}\n`;
            });
            
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `checkbook_export_${currentAccountId}_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            csvModal.style.display = 'none';
        };
    }

    // --- DATA UTILITIES & SERVICE WORKER ---
    function refreshDatalists() {
        // Get current account transactions for descriptions
        const transactionStore = db.transaction('transactions', 'readonly').objectStore('transactions');
        const index = transactionStore.index('accountId');
        const range = IDBKeyRange.only(currentAccountId);
        const request = index.getAll(range);
        
        request.onsuccess = () => {
            updateDatalists(request.result);
        };
    }
    
    function updateDatalists(transactions) {
        const descriptionList = document.getElementById('description-list');
        const categoryList = document.getElementById('category-list');
        
        if (!descriptionList || !categoryList) {
            console.error('Datalists not found in DOM');
            return;
        }
        
        // Get categories from budget
        const budgetTransaction = db.transaction(['budget'], 'readonly');
        const budgetStore = budgetTransaction.objectStore('budget');
        const budgetRequest = budgetStore.getAll();
        
        budgetRequest.onsuccess = () => {
            const budgets = budgetRequest.result;
            const budgetCategories = budgets.map(b => b.category);
            const uniqueDescriptions = [...new Set(transactions.map(tx => tx.description))];
            const transactionCategories = [...new Set(transactions.map(tx => tx.category))];
            const allCategories = [...new Set([...budgetCategories, ...transactionCategories])].filter(c => c);
            
            descriptionList.innerHTML = uniqueDescriptions.map(d => `<option value="${d}"></option>`).join('');
            categoryList.innerHTML = allCategories.map(c => `<option value="${c}"></option>`).join('');
            
            console.log('Updated datalist with', allCategories.length, 'categories:', allCategories);
        };
    }

    function backupToLocalStorage() {
        const transaction = db.transaction(['accounts', 'transactions'], 'readonly');
        const accountStore = transaction.objectStore('accounts');
        const transactionStore = transaction.objectStore('transactions');

        const accountsRequest = accountStore.getAll();
        const transactionsRequest = transactionStore.getAll();

        Promise.all([
            new Promise(resolve => { accountsRequest.onsuccess = () => resolve(accountsRequest.result); }),
            new Promise(resolve => { transactionsRequest.onsuccess = () => resolve(transactionsRequest.result); })
        ]).then(([accounts, transactions]) => {
            localStorage.setItem('checkbookBackup', JSON.stringify({ accounts, transactions }));
        });
    }

    function syncLocalStorageToIndexedDB() {
        return new Promise((resolve) => {
            const backup = localStorage.getItem('checkbookBackup');
            if (backup) {
                try {
                    const data = JSON.parse(backup);

                    // Handle both old format (array of transactions) and new format (object with accounts & transactions)
                    const isOldFormat = Array.isArray(data);
                    const transactions = isOldFormat ? data : (data.transactions || []);
                    const accounts = isOldFormat ? [] : (data.accounts || []);

                    const transaction = db.transaction(['accounts', 'transactions'], 'readwrite');
                    const accountStore = transaction.objectStore('accounts');
                    const transactionStore = transaction.objectStore('transactions');

                    // Clear existing data
                    const clearTransactionsRequest = transactionStore.clear();

                    clearTransactionsRequest.onsuccess = () => {
                        // Restore transactions
                        transactions.forEach(t => {
                            if (!t.accountId) t.accountId = 'default';
                            transactionStore.put(t);
                        });

                        // Restore accounts if available (only in new format)
                        if (accounts.length > 0) {
                            const clearAccountsRequest = accountStore.clear();
                            clearAccountsRequest.onsuccess = () => {
                                accounts.forEach(a => accountStore.put(a));
                            };
                        }
                        resolve();
                    };
                    clearTransactionsRequest.onerror = () => resolve();
                } catch (e) {
                    console.error("Error parsing or syncing from localStorage", e);
                    resolve();
                }
            } else {
                resolve();
            }
        });
    }

    function exportToJson() {
        const accountTransaction = db.transaction(['accounts', 'transactions', 'budget', 'budgetHistory'], 'readonly');
        const accountStore = accountTransaction.objectStore('accounts');
        const transactionStore = accountTransaction.objectStore('transactions');
        const budgetStore = accountTransaction.objectStore('budget');
        const budgetHistoryStore = accountTransaction.objectStore('budgetHistory');

        const accountsRequest = accountStore.getAll();
        const transactionsRequest = transactionStore.getAll();
        const budgetRequest = budgetStore.getAll();
        const budgetHistoryRequest = budgetHistoryStore.getAll();

        Promise.all([
            new Promise(resolve => { accountsRequest.onsuccess = () => resolve(accountsRequest.result); }),
            new Promise(resolve => { transactionsRequest.onsuccess = () => resolve(transactionsRequest.result); }),
            new Promise(resolve => { budgetRequest.onsuccess = () => resolve(budgetRequest.result); }),
            new Promise(resolve => { budgetHistoryRequest.onsuccess = () => resolve(budgetHistoryRequest.result); })
        ]).then(([accounts, transactions, budget, budgetHistory]) => {
            const data = JSON.stringify({ accounts, transactions, budget, budgetHistory }, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `checkbook_export_${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    function importFromJson(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = e => {
                if (confirm('This will overwrite all current data. Are you sure you want to import this file?')) {
                    try {
                        const data = JSON.parse(e.target.result);
                        const transaction = db.transaction(['accounts', 'transactions', 'budget', 'budgetHistory'], 'readwrite');
                        const accountStore = transaction.objectStore('accounts');
                        const transactionStore = transaction.objectStore('transactions');
                        const budgetStore = transaction.objectStore('budget');
                        const budgetHistoryStore = transaction.objectStore('budgetHistory');

                        accountStore.clear();
                        transactionStore.clear();
                        budgetStore.clear();
                        budgetHistoryStore.clear();

                        if (data.accounts) data.accounts.forEach(a => accountStore.put(a));
                        if (data.transactions) data.transactions.forEach(t => transactionStore.put(t));
                        if (data.budget) data.budget.forEach(b => budgetStore.put(b));
                        if (data.budgetHistory) data.budgetHistory.forEach(bh => budgetHistoryStore.put(bh));

                        transaction.oncomplete = () => {
                            // Validate that currentAccountId exists in restored accounts
                            const checkTransaction = db.transaction(['accounts'], 'readonly');
                            const checkAccountStore = checkTransaction.objectStore('accounts');
                            const accountCheck = checkAccountStore.get(currentAccountId);

                            accountCheck.onsuccess = () => {
                                if (!accountCheck.result) {
                                    // Current account doesn't exist in restored data
                                    const getAllAccounts = checkAccountStore.getAll();
                                    getAllAccounts.onsuccess = () => {
                                        const accounts = getAllAccounts.result;
                                        if (accounts.length > 0) {
                                            // Prefer 'default' account, or use first available
                                            const defaultAccount = accounts.find(a => a.id === 'default');
                                            currentAccountId = defaultAccount ? 'default' : accounts[0].id;
                                        } else {
                                            currentAccountId = 'default';
                                        }
                                        localStorage.setItem('currentAccountId', currentAccountId);
                                        loadAccounts();
                                        applyFilters();
                                        backupToLocalStorage();
                                    };
                                } else {
                                    // Current account exists, proceed normally
                                    loadAccounts();
                                    applyFilters();
                                    backupToLocalStorage();
                                }
                            };
                        };
                    } catch (error) {
                        alert('Error parsing JSON file. Please ensure it is a valid export.');
                        console.error('JSON Import Error:', error);
                    }
                }
            };
            reader.readAsText(file);
        }
        event.target.value = null;
    }

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => console.log('ServiceWorker registration successful with scope: ', registration.scope))
                .catch(err => console.log('ServiceWorker registration failed: ', err));
        });
    }
});
