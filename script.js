document.addEventListener('DOMContentLoaded', () => {
    // --- DATABASE SETUP ---
    let db;
    let currentAccountId = localStorage.getItem('currentAccountId') || 'default';
    const request = indexedDB.open('checkbookDB', 2);

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
    purgeBtn.onclick = () => purgeModal.style.display = 'block';
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
        calculateBudgetSpending();
        budgetModal.style.display = 'block';
    }

    function loadBudgetList() {
        const transaction = db.transaction(['budget'], 'readonly');
        const budgetStore = transaction.objectStore('budget');
        const request = budgetStore.getAll();
        
        request.onsuccess = () => {
            const budgets = request.result;
            const budgetList = document.getElementById('budgetList');
            budgetList.innerHTML = `
                <tr>
                    <th>Category</th>
                    <th>$ Allowed</th>
                    <th>$ Spent</th>
                    <th>$ Remaining</th>
                    <th></th>
                </tr>
            `;
            
            budgets.forEach(budget => {
                const row = document.createElement('tr');
                const spent = budget.spent || 0;
                const remaining = budget.amount - spent;
                const remainingClass = remaining < 0 ? 'negative' : '';
                
                row.innerHTML = `
                    <td>${budget.category}</td>
                    <td>$${budget.amount.toFixed(2)}</td>
                    <td>$${spent.toFixed(2)}</td>
                    <td class="${remainingClass}">$${remaining.toFixed(2)}</td>
                    <td><button onclick="deleteBudget('${budget.category}')" class="delete-btn">X</button></td>
                `;
                budgetList.appendChild(row);
            });
            
            // Add helpful tip about unbudgeted transactions
            const tipRow = document.createElement('tr');
            tipRow.innerHTML = `
                <td colspan="5" style="padding-top: 15px; font-size: 0.9em; color: #666;">
                    💡 <strong>Tip:</strong> You can click any category in your transactions to change it. 
                    This lets you assign spending to your budget categories.
                </td>
            `;
            budgetList.appendChild(tipRow);
        };
    }

    function calculateBudgetSpending() {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
        
        const transaction = db.transaction(['transactions', 'budget'], 'readwrite');
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
                // Update budget with spending
                const budgetRequest = budgetStore.getAll();
                budgetRequest.onsuccess = () => {
                    budgetRequest.result.forEach(budget => {
                        budget.spent = spending[budget.category] || 0;
                        budgetStore.put(budget);
                    });
                    loadBudgetList();
                };
            }
        };
    }

    window.addBudget = function() {
        const category = document.getElementById('newBudgetCategory').value.trim();
        const amount = parseFloat(document.getElementById('newBudgetAmount').value);
        
        if (!category || isNaN(amount) || amount <= 0) {
            alert('Please enter a valid category and amount');
            return;
        }
        
        const transaction = db.transaction(['budget'], 'readwrite');
        const budgetStore = transaction.objectStore('budget');
        
        budgetStore.put({ category, amount, spent: 0 });
        
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
            addTransactionForm.reset();
            addModal.style.display = 'none';
            applyFilters();
            backupToLocalStorage();
            if (budgetModal.style.display === 'block') {
                calculateBudgetSpending();
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
                const balanceSpan = document.createElement('strong');
                balanceSpan.className = 'running-balance';
                balanceSpan.textContent = runningBalance.toFixed(2);
                if (runningBalance < 0) balanceSpan.classList.add('negative');
                cell3.innerHTML = `${tx.amount.toFixed(2)}<br>`;
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
        const request = objectStore.delete(id);
        request.onsuccess = () => {
            applyFilters();
            backupToLocalStorage();
            if (budgetModal.style.display === 'block') {
                calculateBudgetSpending();
            }
        };
    }

    function updateTransactionCategory(id, newCategory) {
        const transactionStore = db.transaction('transactions', 'readwrite').objectStore('transactions');
        const request = transactionStore.get(id);
        request.onsuccess = () => {
            const transaction = request.result;
            transaction.category = newCategory;
            const updateRequest = transactionStore.put(transaction);
            updateRequest.onsuccess = () => {
                backupToLocalStorage();
                if (budgetModal.style.display === 'block') {
                    calculateBudgetSpending();
                }
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
        if (!confirm(`Are you sure you want to permanently delete all RECONCILED transactions on or before ${purgeDateStr}?`)) return;
        const transactionStore = db.transaction('transactions', 'readwrite').objectStore('transactions');
        const index = transactionStore.index('accountId');
        const range = IDBKeyRange.only(currentAccountId);
        const request = index.openCursor(range);
        
        request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
                const transaction = cursor.value;
                if (transaction.reconciled && transaction.date <= purgeDateStr) {
                    cursor.delete();
                }
                cursor.continue();
            } else {
                applyFilters();
                backupToLocalStorage();
            }
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
            processAmount: (row) => -parseFloat(row[1]) // Already negative for charges
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
            if (budgetModal.style.display === 'block') {
                calculateBudgetSpending();
            }
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
        const transaction = db.transaction(['transactions'], 'readonly');
        const objectStore = transaction.objectStore('transactions');
        const request = objectStore.getAll();
        request.onsuccess = () => {
            localStorage.setItem('checkbookBackup', JSON.stringify(request.result));
        };
    }

    function syncLocalStorageToIndexedDB() {
        return new Promise((resolve) => {
            const backup = localStorage.getItem('checkbookBackup');
            if (backup) {
                try {
                    const transactions = JSON.parse(backup);
                    const transactionStore = db.transaction(['transactions'], 'readwrite').objectStore('transactions');
                    const clearRequest = transactionStore.clear();
                    clearRequest.onsuccess = () => {
                        transactions.forEach(t => {
                            if (!t.accountId) t.accountId = 'default';
                            transactionStore.put(t);
                        });
                        resolve();
                    };
                    clearRequest.onerror = () => resolve();
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
        const accountTransaction = db.transaction(['accounts', 'transactions', 'budget'], 'readonly');
        const accountStore = accountTransaction.objectStore('accounts');
        const transactionStore = accountTransaction.objectStore('transactions');
        const budgetStore = accountTransaction.objectStore('budget');
        
        const accountsRequest = accountStore.getAll();
        const transactionsRequest = transactionStore.getAll();
        const budgetRequest = budgetStore.getAll();
        
        Promise.all([
            new Promise(resolve => { accountsRequest.onsuccess = () => resolve(accountsRequest.result); }),
            new Promise(resolve => { transactionsRequest.onsuccess = () => resolve(transactionsRequest.result); }),
            new Promise(resolve => { budgetRequest.onsuccess = () => resolve(budgetRequest.result); })
        ]).then(([accounts, transactions, budget]) => {
            const data = JSON.stringify({ accounts, transactions, budget }, null, 2);
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
                        const transaction = db.transaction(['accounts', 'transactions', 'budget'], 'readwrite');
                        const accountStore = transaction.objectStore('accounts');
                        const transactionStore = transaction.objectStore('transactions');
                        const budgetStore = transaction.objectStore('budget');
                        
                        accountStore.clear();
                        transactionStore.clear();
                        budgetStore.clear();
                        
                        if (data.accounts) data.accounts.forEach(a => accountStore.put(a));
                        if (data.transactions) data.transactions.forEach(t => transactionStore.put(t));
                        if (data.budget) data.budget.forEach(b => budgetStore.put(b));
                        
                        transaction.oncomplete = () => {
                            loadAccounts();
                            applyFilters();
                            backupToLocalStorage();
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
